/**
 * The processing steps (spec 3.5 step 3). One message is one item.
 *
 * Every step reports to the API, which is the only writer of item state. A step
 * goes on only while the API answers `applied`. Writes use fixed keys, so a retry
 * overwrites the same objects, and the API applies each step idempotently. The
 * ORIGINAL asset moves off incoming/ only with the `done` report, so a retry
 * before `done` still reads the upload.
 *
 * R2 items (audio, image, document, file):
 *   hash -> malware (documents, files, downloads) -> normalize -> csam (images,
 *   documents) -> blur -> classifier (images) -> done -> delete incoming/
 * Video items (after Stream reports ready):
 *   poster -> normalize (COVER) -> csam (keyframes) -> blur -> classifier -> done
 *
 * Thrown errors are transient: the Queue retries the message (3 times), then the
 * dead letter queue fails the item. A problem with the file itself is reported as
 * a failed step and the message is acknowledged.
 */
import {
  CONTENT_OUTPUT_KEYS,
  type ContentJob,
  type ContentQueueMessage,
} from "@repo/constants/src/contentJob";
import type { Classifier, CsamMatcher, Frame } from "./adapters";
import type { Api, CallbackResult, ProcessedAsset, ProcessedCallback } from "./api";
import { signGrant } from "./grant";
import { copyObject, deletePrefix, sha256Object } from "./storage";
import type { Toolbox, ToolboxRequest } from "./toolbox";

export interface Deps {
  bucket: R2Bucket;
  api: Api;
  toolbox: Toolbox;
  csam: CsamMatcher;
  classifier: Classifier;
  classifierRequired: boolean;
  secret: string;
  /** Fetches a signed Stream thumbnail. Replaced in tests. */
  fetchImage: (url: string) => Promise<Response>;
}

/** What happened, for logs and tests. */
export type Outcome = string;

const FINAL_STATUSES = new Set(["ready", "failed", "blocked", "deleted"]);
const CLASSIFIER_FRAMES = 5;

const incomingPrefix = (publicId: string) => `incoming/${publicId}/`;
const outputPrefixes = (publicId: string) => [
  `derived/${publicId}/`,
  `audio/${publicId}/`,
  `originals/${publicId}/`,
];

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: `processor.${event}`, ...fields }));
}

/** Stops the run when the API answers anything but `applied`. */
class Stop extends Error {
  constructor(readonly outcome: Outcome) {
    super(outcome);
    this.name = "Stop";
  }
}

class Run {
  constructor(
    readonly job: ContentJob,
    readonly deps: Deps
  ) {}

  get id(): string {
    return this.job.publicId;
  }

  async report(
    step: ProcessedCallback["step"],
    outcome: ProcessedCallback["outcome"],
    extra: Partial<ProcessedCallback> = {}
  ): Promise<CallbackResult> {
    const result = await this.deps.api.report({ publicId: this.id, step, outcome, ...extra });
    log("step", { publicId: this.id, step, outcome, result });
    return result;
  }

  /** Reports an ok step and stops unless the API applied it. */
  async ok(step: ProcessedCallback["step"], extra: Partial<ProcessedCallback> = {}): Promise<void> {
    const result = await this.report(step, "ok", extra);
    if (result !== "applied") throw new Stop(`stopped:${step}:${result}`);
  }

  /**
   * Fails or blocks the item. When the API applied it, the item is final and its
   * upload and outputs are removed. When it did not (a parallel run finished
   * first, or the creator deleted the item), nothing is touched.
   */
  async end(
    step: ProcessedCallback["step"],
    outcome: "failed" | "blocked",
    reason: string,
    extra: Partial<ProcessedCallback> = {}
  ): Promise<never> {
    const result = await this.report(step, outcome, { reason: reason.slice(0, 255), ...extra });
    if (result === "applied") await this.cleanup(true);
    throw new Stop(`${outcome}:${reason}`);
  }

  async cleanup(outputs: boolean): Promise<void> {
    const prefixes = [incomingPrefix(this.id), ...(outputs ? outputPrefixes(this.id) : [])];
    for (const prefix of prefixes) await deletePrefix(this.deps.bucket, prefix);
  }

  async request(source: string, extra: Partial<ToolboxRequest> = {}): Promise<ToolboxRequest> {
    return {
      publicId: this.id,
      grant: await signGrant(this.id, this.deps.secret),
      source,
      ext: this.job.ext ?? "",
      mimeType: this.job.mimeType ?? "",
      derivedPrefix: `derived/${this.id}/`,
      audioPrefix: `audio/${this.id}/`,
      originalKey: CONTENT_OUTPUT_KEYS.original(this.id, this.job.ext ?? "bin"),
      previewSeconds: this.job.previewSeconds,
      ...extra,
    };
  }

  async csam(frames: Frame[], quarantineSource: string | null): Promise<void> {
    const result = await this.deps.csam.match(this.job, frames);
    if (!result.match) {
      await this.ok("csam");
      return;
    }
    // Preserve the upload until the evidence path (spec 3.11, PR 7) takes it over.
    // Never added to the hash blocklist; the API keeps CSAM out of those tables.
    if (quarantineSource) {
      await copyObject(
        this.deps.bucket,
        quarantineSource,
        CONTENT_OUTPUT_KEYS.quarantine(this.id, this.job.ext ?? "bin")
      );
    }
    log("csam_match", { publicId: this.id, matcher: this.deps.csam.name });
    await this.end("csam", "blocked", "csam_match");
  }

  async classify(frames: Frame[]): Promise<void> {
    const result = await this.deps.classifier.classify(this.job, frames);
    if (result.verdict === "explicit" && !this.job.adult) {
      const held = await this.report("classifier", "held", { reason: result.label });
      if (held !== "applied") throw new Stop(`stopped:classifier:${held}`);
      return;
    }
    if (result.verdict === "unavailable" && this.deps.classifierRequired) {
      const held = await this.report("classifier", "held", { reason: "classifier_unavailable" });
      if (held !== "applied") throw new Stop(`stopped:classifier:${held}`);
      return;
    }
    await this.ok("classifier");
  }
}

function originalFrom(
  asset: ProcessedAsset,
  scanStatus: ProcessedAsset["scanStatus"]
): ProcessedAsset {
  // ORIGINAL rows have no variant: the API matches them on role alone
  const original: ProcessedAsset = { ...asset, role: "ORIGINAL", scanStatus };
  delete original.variant;
  return original;
}

async function runFile(run: Run): Promise<Outcome> {
  const { job, deps, id } = run;
  const source = job.incomingKey;
  if (!source || !source.startsWith(incomingPrefix(id))) {
    return run.end("hash", "failed", "source_missing");
  }

  // 1. Hash, and the blocklist check on the API side
  const sha256 = await sha256Object(deps.bucket, source);
  if (!sha256) return run.end("hash", "failed", "source_missing");
  const hashed = await run.report("hash", "ok", { sha256 });
  if (hashed === "blocked") {
    await run.cleanup(true);
    throw new Stop("blocked:blocklist");
  }
  if (hashed !== "applied") throw new Stop(`stopped:hash:${hashed}`);

  // 2. Malware scan: documents, files, and anything fans can download
  const scanned = job.kind === "document" || job.kind === "file" || job.allowDownload;
  if (scanned) {
    const scan = await deps.toolbox.call("/scan", await run.request(source));
    if (!scan.ok) return run.end("malware", "failed", scan.reason);
    if (scan.verdict === "infected") {
      await copyObject(deps.bucket, source, CONTENT_OUTPUT_KEYS.quarantine(id, job.ext ?? "bin"));
      return run.end("malware", "blocked", String(scan.signature ?? "malware"), { sha256 });
    }
    await run.ok("malware");
  }
  const scanStatus = scanned ? "CLEAN" : "SKIPPED";

  // 3. Normalize
  let original: ProcessedAsset;
  let blur: ProcessedAsset | null = null;
  let frames: Frame[] = [];
  if (job.kind === "image") {
    const image = await deps.toolbox.call("/image", await run.request(source, { mode: "item" }));
    if (!image.ok) return run.end("normalize", "failed", image.reason);
    const assets = image.assets as ProcessedAsset[];
    await run.ok("normalize", { assets, width: image.width, height: image.height });
    blur = image.blur as ProcessedAsset;
    frames = (image.frames as string[]).map(key => ({ key }));
    // The upload is not kept (spec 3.5 step 3.4). The original is the clean full JPEG.
    const full = assets.find(asset => asset.variant === "full.jpg");
    if (!full) throw new Error("toolbox returned no full.jpg");
    original = originalFrom(full, scanStatus);
  } else if (job.kind === "audio") {
    const audio = await deps.toolbox.call("/audio", await run.request(source));
    if (!audio.ok) return run.end("normalize", "failed", audio.reason);
    const assets = audio.assets as ProcessedAsset[];
    await run.ok("normalize", { assets, durationMs: audio.durationMs });
    if (job.allowDownload) {
      // Downloads give fans the file as uploaded, after the scan
      const key = CONTENT_OUTPUT_KEYS.original(id, job.ext ?? "bin");
      const size = await copyObject(deps.bucket, source, key, job.mimeType ?? undefined);
      if (size === null) return run.end("normalize", "failed", "source_missing");
      original = {
        role: "ORIGINAL",
        storage: "R2",
        r2Key: key,
        mimeType: job.mimeType ?? undefined,
        size,
        durationMs: audio.durationMs,
        scanStatus,
      };
    } else {
      const full = assets.find(asset => asset.role === "RENDITION");
      if (!full) throw new Error("toolbox returned no audio rendition");
      original = originalFrom(full, scanStatus);
    }
  } else if (job.kind === "document") {
    const document = await deps.toolbox.call("/document", await run.request(source));
    if (!document.ok) return run.end("normalize", "failed", document.reason);
    await run.ok("normalize", {
      assets: document.assets as ProcessedAsset[],
      ...(typeof document.pageCount === "number" ? { pageCount: document.pageCount } : {}),
    });
    blur = (document.blur as ProcessedAsset | null) ?? null;
    frames = (document.frames as string[]).map(key => ({ key }));
    original = { ...(document.original as ProcessedAsset), scanStatus };
  } else if (job.kind === "file") {
    const key = CONTENT_OUTPUT_KEYS.original(id, job.ext ?? "bin");
    const size = await copyObject(deps.bucket, source, key, job.mimeType ?? undefined);
    if (size === null) return run.end("normalize", "failed", "source_missing");
    original = {
      role: "ORIGINAL",
      storage: "R2",
      r2Key: key,
      mimeType: job.mimeType ?? undefined,
      size,
      scanStatus,
    };
  } else {
    return run.end("normalize", "failed", `unsupported_kind:${job.kind}`);
  }

  // 4. CSAM match on what a viewer would see
  if (job.kind === "image" || job.kind === "document") await run.csam(frames, source);

  // 5. Blur cover for locked cards
  if (blur) await run.ok("blur", { assets: [blur] });

  // 6. Adult classifier
  if (job.kind === "image") await run.classify(frames);

  // 7. Ready. The ORIGINAL row moves off incoming/ with this report.
  await run.ok("done", { assets: [original] });
  await run.cleanup(false);
  return "ready";
}

/** Five frames spread over the keyframes, for the classifier. */
export function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, i) => items[Math.floor((i * items.length) / count)]!);
}

async function runVideo(run: Run): Promise<Outcome> {
  const { job, deps, id } = run;
  if (!job.video) return run.end("normalize", "failed", "stream_unavailable");

  // Poster: Stream's thumbnail at 5 seconds, through the image tools
  const poster = await deps.fetchImage(job.video.posterUrl);
  if (!poster.ok || !poster.body) throw new Error(`poster ${poster.status}`);
  const stagedKey = CONTENT_OUTPUT_KEYS.stagedPoster(id);
  await deps.bucket.put(stagedKey, await poster.arrayBuffer(), {
    httpMetadata: { contentType: "image/jpeg" },
  });
  const image = await deps.toolbox.call(
    "/image",
    await run.request(stagedKey, { ext: "jpg", mimeType: "image/jpeg", mode: "poster" })
  );
  let blur: ProcessedAsset | null = null;
  if (image.ok) {
    await run.ok("normalize", { assets: image.assets as ProcessedAsset[] });
    blur = image.blur as ProcessedAsset;
  } else {
    // A poster problem never fails a video Stream encoded; the card shows no cover
    log("poster_refused", { publicId: id, reason: image.reason });
    await run.ok("normalize");
  }

  const keyframes: Frame[] = job.video.keyframeUrls.map(url => ({ url }));
  await run.csam(keyframes, null);
  if (blur) await run.ok("blur", { assets: [blur] });
  await run.classify(spread(keyframes, CLASSIFIER_FRAMES));
  await run.ok("done");
  await run.cleanup(false);
  return "ready";
}

/** Runs one queue message to the end. Throws on a transient error. */
export async function processMessage(message: ContentQueueMessage, deps: Deps): Promise<Outcome> {
  const job = await deps.api.job(message.publicId);
  if (!job) return "not_found";
  if (job.status !== "processing") {
    // A repeat message after the item finished: only the upload is left to remove
    if (FINAL_STATUSES.has(job.status))
      await deletePrefix(deps.bucket, incomingPrefix(job.publicId));
    return `skipped:${job.status}`;
  }
  const run = new Run(job, deps);
  try {
    return message.type === "video" || job.kind === "video"
      ? await runVideo(run)
      : await runFile(run);
  } catch (error) {
    if (error instanceof Stop) return error.outcome;
    throw error;
  }
}

/**
 * Dead letter queue: the message failed every retry. Fail the item so the
 * creator sees it and the reserved bytes come back, then remove what we wrote.
 */
export async function failDeadLetter(message: ContentQueueMessage, deps: Deps): Promise<Outcome> {
  const result = await deps.api.report({
    publicId: message.publicId,
    step: "done",
    outcome: "failed",
    reason: "processing_error",
  });
  if (result === "applied") {
    for (const prefix of [incomingPrefix(message.publicId), ...outputPrefixes(message.publicId)]) {
      await deletePrefix(deps.bucket, prefix);
    }
  }
  return `dead_letter:${result}`;
}
