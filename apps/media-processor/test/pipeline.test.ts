/**
 * The processing steps (spec 3.5 step 3) with the local R2 binding, a fake API and
 * a fake toolbox. Checks the order of the reports, what each carries, what lands
 * in R2, and what is removed. The toolbox itself is tested under container/test.
 */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:workers";
import type { ContentJob } from "@repo/constants/src/contentJob";
import { createClassifier, createCsamMatcher, type CsamMatcher, type Frame } from "../src/adapters";
import type { Api, CallbackResult, ProcessedCallback } from "../src/api";
import { failDeadLetter, processMessage, spread, type Deps } from "../src/pipeline";
import type { Toolbox, ToolboxPath, ToolboxRequest, ToolboxResult } from "../src/toolbox";

let counter = 0;
function newId(): string {
  counter += 1;
  return `p${String(counter).padStart(3, "0")}${Math.random().toString(36).slice(2, 14).padEnd(12, "0")}`;
}

function makeJob(publicId: string, overrides: Partial<ContentJob> = {}): ContentJob {
  return {
    publicId,
    kind: "audio",
    status: "processing",
    title: "Low Tide",
    adult: false,
    allowDownload: false,
    previewSeconds: 30,
    incomingKey: `incoming/${publicId}/original.${overrides.ext ?? "mp3"}`,
    mimeType: "audio/mpeg",
    ext: "mp3",
    video: null,
    ...overrides,
  };
}

class FakeApi implements Api {
  reports: ProcessedCallback[] = [];
  answers: Partial<Record<ProcessedCallback["step"], CallbackResult>> = {};
  constructor(public current: ContentJob | null) {}
  async job() {
    return this.current;
  }
  async report(callback: ProcessedCallback) {
    this.reports.push(callback);
    return this.answers[callback.step] ?? "applied";
  }
  steps() {
    return this.reports.map(report => `${report.step}:${report.outcome}`);
  }
  step(name: string) {
    return this.reports.find(report => report.step === name);
  }
}

class FakeToolbox implements Toolbox {
  calls: Array<{ path: ToolboxPath; request: ToolboxRequest }> = [];
  results: Partial<Record<ToolboxPath, ToolboxResult | Error>> = {};
  async call(path: ToolboxPath, request: ToolboxRequest): Promise<ToolboxResult> {
    this.calls.push({ path, request });
    const result = this.results[path];
    if (result instanceof Error) throw result;
    if (!result) throw new Error(`unexpected toolbox call ${path}`);
    return result;
  }
}

const r2Asset = (role: string, r2Key: string, extra: Record<string, unknown> = {}) => ({
  role,
  storage: "R2" as const,
  r2Key,
  scanStatus: "SKIPPED" as const,
  ...extra,
});

function imageResult(id: string, folder = "rendition", role = "RENDITION"): ToolboxResult {
  return {
    ok: true,
    width: 1200,
    height: 800,
    assets: ["640.webp", "640.jpg", "full.webp", "full.jpg"].map(variant =>
      r2Asset(role, `derived/${id}/${folder}/${variant}`, {
        variant,
        mimeType: variant.endsWith("webp") ? "image/webp" : "image/jpeg",
        size: 100,
      })
    ),
    blur: r2Asset("BLUR", `derived/${id}/blur/32.webp`, { variant: "32.webp" }),
    frames: [`derived/${id}/${folder}/640.jpg`],
  };
}

function audioResult(id: string): ToolboxResult {
  return {
    ok: true,
    durationMs: 30_000,
    assets: [
      r2Asset("RENDITION", `audio/${id}/full.m4a`, {
        variant: "m4a",
        mimeType: "audio/mp4",
        size: 600_000,
        durationMs: 30_000,
      }),
      r2Asset("AUDIO_PREVIEW", `audio/${id}/preview.m4a`, { mimeType: "audio/mp4" }),
      r2Asset("WAVEFORM", `derived/${id}/waveform/peaks.json`, { mimeType: "application/json" }),
    ],
  };
}

interface Setup {
  id: string;
  api: FakeApi;
  toolbox: FakeToolbox;
  deps: Deps;
  frames: Frame[][];
  fetched: string[];
}

async function setup(overrides: Partial<ContentJob> = {}, upload = "upload bytes"): Promise<Setup> {
  const id = newId();
  const job = makeJob(id, overrides);
  if (job.incomingKey) {
    await env.CONTENT.put(job.incomingKey, upload, {
      httpMetadata: { contentType: job.mimeType ?? "application/octet-stream" },
    });
  }
  const api = new FakeApi(job);
  const toolbox = new FakeToolbox();
  const frames: Frame[][] = [];
  const fetched: string[] = [];
  const csam = createCsamMatcher("none");
  const watchedCsam: CsamMatcher = {
    name: "none",
    match: (j, f) => {
      frames.push(f);
      return csam.match(j, f);
    },
  };
  const deps: Deps = {
    bucket: env.CONTENT,
    api,
    toolbox,
    csam: watchedCsam,
    classifier: createClassifier("mock"),
    classifierRequired: false,
    secret: "processor-test-secret",
    fetchImage: async url => {
      fetched.push(url);
      return new Response("jpeg bytes", { headers: { "content-type": "image/jpeg" } });
    },
  };
  return { id, api, toolbox, deps, frames, fetched };
}

async function keys(prefix: string): Promise<string[]> {
  return (await env.CONTENT.list({ prefix })).objects.map(object => object.key);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

describe("audio", () => {
  it("hashes, normalizes and finishes, keeping no upload when downloads are off", async () => {
    const { id, api, toolbox, deps } = await setup();
    toolbox.results["/audio"] = audioResult(id);
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe("ready");

    expect(api.steps()).toEqual(["hash:ok", "normalize:ok", "done:ok"]);
    expect(api.step("hash")?.sha256).toBe(await sha256Hex("upload bytes"));
    expect(api.step("normalize")).toMatchObject({ durationMs: 30_000 });
    expect(api.step("normalize")?.assets).toHaveLength(3);
    // No scan: downloads are off. The ORIGINAL row points at the clean m4a.
    expect(toolbox.calls.map(call => call.path)).toEqual(["/audio"]);
    expect(api.step("done")?.assets).toEqual([
      expect.objectContaining({
        role: "ORIGINAL",
        r2Key: `audio/${id}/full.m4a`,
        scanStatus: "SKIPPED",
      }),
    ]);
    expect(api.step("done")?.assets?.[0]).not.toHaveProperty("variant");
    expect(await keys(`incoming/${id}/`)).toEqual([]);

    const request = toolbox.calls[0]!.request;
    expect(request).toMatchObject({
      publicId: id,
      source: `incoming/${id}/original.mp3`,
      audioPrefix: `audio/${id}/`,
      derivedPrefix: `derived/${id}/`,
      previewSeconds: 30,
    });
    expect(request.grant.startsWith(`${id}.`)).toBe(true);
  });

  it("scans and keeps the upload in originals/ when downloads are on", async () => {
    const { id, api, toolbox, deps } = await setup({ allowDownload: true });
    toolbox.results["/scan"] = { ok: true, verdict: "clean" };
    toolbox.results["/audio"] = audioResult(id);
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe("ready");

    expect(api.steps()).toEqual(["hash:ok", "malware:ok", "normalize:ok", "done:ok"]);
    expect(api.step("done")?.assets?.[0]).toMatchObject({
      role: "ORIGINAL",
      r2Key: `originals/${id}/original.mp3`,
      mimeType: "audio/mpeg",
      size: 12,
      scanStatus: "CLEAN",
    });
    const kept = await env.CONTENT.get(`originals/${id}/original.mp3`);
    expect(await kept?.text()).toBe("upload bytes");
    expect(kept?.httpMetadata?.contentType).toBe("audio/mpeg");
    expect(await keys(`incoming/${id}/`)).toEqual([]);
  });
});

describe("image", () => {
  it("runs every step and makes the clean full JPEG the original", async () => {
    const { id, api, toolbox, deps, frames } = await setup({
      kind: "image",
      ext: "png",
      mimeType: "image/png",
    });
    toolbox.results["/image"] = imageResult(id);
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe("ready");

    expect(api.steps()).toEqual([
      "hash:ok",
      "normalize:ok",
      "csam:ok",
      "blur:ok",
      "classifier:ok",
      "done:ok",
    ]);
    expect(api.step("normalize")).toMatchObject({ width: 1200, height: 800 });
    expect(api.step("blur")?.assets).toEqual([expect.objectContaining({ role: "BLUR" })]);
    expect(frames[0]).toEqual([{ key: `derived/${id}/rendition/640.jpg` }]);
    expect(api.step("done")?.assets?.[0]).toMatchObject({
      role: "ORIGINAL",
      r2Key: `derived/${id}/rendition/full.jpg`,
      mimeType: "image/jpeg",
    });
    expect(toolbox.calls[0]!.request.mode).toBe("item");
  });

  it("holds an explicit image that is not labeled 18+, and passes one that is", async () => {
    for (const adult of [false, true]) {
      const { id, api, toolbox, deps } = await setup({
        kind: "image",
        title: "qa-explicit test",
        adult,
        ext: "jpg",
      });
      toolbox.results["/image"] = imageResult(id);
      expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe("ready");
      expect(api.step("classifier")).toMatchObject(
        adult ? { outcome: "ok" } : { outcome: "held", reason: "mock:explicit" }
      );
      expect(api.steps().at(-1)).toBe("done:ok");
    }
  });

  it("holds every image when the classifier is required and none runs (production)", async () => {
    const { id, api, toolbox, deps } = await setup({ kind: "image", ext: "jpg" });
    deps.classifier = createClassifier("none");
    deps.classifierRequired = true;
    toolbox.results["/image"] = imageResult(id);
    await processMessage({ type: "r2", publicId: id }, deps);
    expect(api.step("classifier")).toMatchObject({
      outcome: "held",
      reason: "classifier_unavailable",
    });
  });

  it("fails an unreadable image and removes the upload", async () => {
    const { id, api, toolbox, deps } = await setup({ kind: "image", ext: "jpg" });
    toolbox.results["/image"] = { ok: false, reason: "image_unreadable" };
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe(
      "failed:image_unreadable"
    );
    expect(api.steps()).toEqual(["hash:ok", "normalize:failed"]);
    expect(api.step("normalize")?.reason).toBe("image_unreadable");
    expect(await keys(`incoming/${id}/`)).toEqual([]);
  });
});

describe("documents and files", () => {
  it("scans a PDF, keeps the cleaned file and reports pages", async () => {
    const { id, api, toolbox, deps, frames } = await setup({
      kind: "document",
      ext: "pdf",
      mimeType: "application/pdf",
    });
    toolbox.results["/scan"] = { ok: true, verdict: "clean" };
    toolbox.results["/document"] = {
      ok: true,
      pageCount: 4,
      assets: [r2Asset("PAGE_PREVIEW", `derived/${id}/page/1.webp`, { variant: "p1" })],
      blur: r2Asset("BLUR", `derived/${id}/blur/32.webp`),
      original: {
        role: "ORIGINAL",
        storage: "R2",
        r2Key: `originals/${id}/original.pdf`,
        mimeType: "application/pdf",
        size: 900,
      },
      frames: [`derived/${id}/page/1.webp`],
    };
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe("ready");
    expect(api.steps()).toEqual([
      "hash:ok",
      "malware:ok",
      "normalize:ok",
      "csam:ok",
      "blur:ok",
      "done:ok",
    ]);
    expect(api.step("normalize")?.pageCount).toBe(4);
    expect(frames[0]).toEqual([{ key: `derived/${id}/page/1.webp` }]);
    expect(api.step("done")?.assets?.[0]).toMatchObject({
      r2Key: `originals/${id}/original.pdf`,
      scanStatus: "CLEAN",
    });
    expect(toolbox.calls[1]!.request.originalKey).toBe(`originals/${id}/original.pdf`);
  });

  it("keeps a clean zip as uploaded", async () => {
    const { id, api, toolbox, deps } = await setup({
      kind: "file",
      ext: "zip",
      mimeType: "application/zip",
      previewSeconds: null,
    });
    toolbox.results["/scan"] = { ok: true, verdict: "clean" };
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe("ready");
    expect(api.steps()).toEqual(["hash:ok", "malware:ok", "done:ok"]);
    expect(await (await env.CONTENT.get(`originals/${id}/original.zip`))?.text()).toBe(
      "upload bytes"
    );
  });

  it("quarantines malware, blocks the item with its hash, and never normalizes it", async () => {
    const { id, api, toolbox, deps } = await setup({ kind: "file", ext: "zip" });
    toolbox.results["/scan"] = { ok: true, verdict: "infected", signature: "Eicar-Signature" };
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe(
      "blocked:Eicar-Signature"
    );
    expect(api.steps()).toEqual(["hash:ok", "malware:blocked"]);
    expect(api.step("malware")).toMatchObject({
      reason: "Eicar-Signature",
      sha256: await sha256Hex("upload bytes"),
    });
    expect(await keys(`quarantine/${id}/`)).toEqual([`quarantine/${id}/original.zip`]);
    expect(await keys(`incoming/${id}/`)).toEqual([]);
    expect(await keys(`originals/${id}/`)).toEqual([]);
  });

  it("fails a zip bomb", async () => {
    const { id, api, toolbox, deps } = await setup({ kind: "file", ext: "zip" });
    toolbox.results["/scan"] = { ok: false, reason: "archive_ratio" };
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe("failed:archive_ratio");
    expect(api.steps()).toEqual(["hash:ok", "malware:failed"]);
    expect(await keys(`incoming/${id}/`)).toEqual([]);
  });
});

describe("stops", () => {
  it("stops and removes the upload when the hash is on the blocklist", async () => {
    const { id, api, toolbox, deps } = await setup();
    api.answers.hash = "blocked";
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe("blocked:blocklist");
    expect(toolbox.calls).toEqual([]);
    expect(await keys(`incoming/${id}/`)).toEqual([]);
  });

  it("stops without touching anything when the API ignores a step", async () => {
    const { id, api, toolbox, deps } = await setup();
    toolbox.results["/audio"] = audioResult(id);
    api.answers.normalize = "ignored";
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe(
      "stopped:normalize:ignored"
    );
    expect(await keys(`incoming/${id}/`)).toEqual([`incoming/${id}/original.mp3`]);
  });

  it("fails an item whose upload is gone", async () => {
    const { id, api, deps } = await setup();
    await env.CONTENT.delete(`incoming/${id}/original.mp3`);
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe("failed:source_missing");
    expect(api.steps()).toEqual(["hash:failed"]);
  });

  it("skips a finished item and removes a leftover upload", async () => {
    const { id, api, deps } = await setup({ status: "ready" });
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe("skipped:ready");
    expect(api.reports).toEqual([]);
    expect(await keys(`incoming/${id}/`)).toEqual([]);
  });

  it("acknowledges an item the API does not know", async () => {
    const { id, api, deps } = await setup();
    api.current = null;
    expect(await processMessage({ type: "r2", publicId: id }, deps)).toBe("not_found");
  });

  it("throws on a toolbox error so the Queue retries", async () => {
    const { id, toolbox, deps } = await setup();
    toolbox.results["/audio"] = new Error("toolbox /audio 500");
    await expect(processMessage({ type: "r2", publicId: id }, deps)).rejects.toThrow("500");
    expect(await keys(`incoming/${id}/`)).toEqual([`incoming/${id}/original.mp3`]);
  });
});

describe("video", () => {
  const keyframes = (n: number) =>
    Array.from(
      { length: n },
      (_, i) =>
        `https://customer-x.cloudflarestream.com/tok/thumbnails/thumbnail.jpg?time=${i * 5}s`
    );

  it("makes the poster set from Stream, checks keyframes and classifies 5 frames", async () => {
    const { api, toolbox, deps, frames, fetched } = await setup({
      kind: "video",
      incomingKey: null,
      ext: null,
      mimeType: "video/mp4",
      video: {
        durationMs: 60_000,
        posterUrl: "https://poster.test/p.jpg",
        keyframeUrls: keyframes(13),
      },
    });
    const job = api.current!;
    const classified: Frame[][] = [];
    deps.classifier = {
      name: "spy",
      classify: async (_job, f) => {
        classified.push(f);
        return { verdict: "safe" };
      },
    };
    toolbox.results["/image"] = imageResult(job.publicId, "cover", "COVER");
    expect(await processMessage({ type: "video", publicId: job.publicId }, deps)).toBe("ready");

    expect(fetched).toEqual(["https://poster.test/p.jpg"]);
    expect(toolbox.calls[0]!.request).toMatchObject({
      source: `incoming/${job.publicId}/poster.jpg`,
      ext: "jpg",
      mode: "poster",
    });
    expect(api.steps()).toEqual(["normalize:ok", "csam:ok", "blur:ok", "classifier:ok", "done:ok"]);
    expect(api.step("normalize")?.assets?.every(asset => asset.role === "COVER")).toBe(true);
    expect(frames[0]).toHaveLength(13);
    expect(classified[0]).toHaveLength(5);
    expect(api.step("done")?.assets).toBeUndefined();
    expect(await keys(`incoming/${job.publicId}/`)).toEqual([]);
  });

  it("finishes a video even when the poster is refused", async () => {
    const { api, toolbox, deps } = await setup({
      kind: "video",
      incomingKey: null,
      video: {
        durationMs: 10_000,
        posterUrl: "https://poster.test/p.jpg",
        keyframeUrls: keyframes(3),
      },
    });
    toolbox.results["/image"] = { ok: false, reason: "image_unreadable" };
    expect(await processMessage({ type: "video", publicId: api.current!.publicId }, deps)).toBe(
      "ready"
    );
    expect(api.steps()).toEqual(["normalize:ok", "csam:ok", "classifier:ok", "done:ok"]);
  });

  it("spreads classifier frames over the whole video", () => {
    expect(spread([1, 2, 3], 5)).toEqual([1, 2, 3]);
    expect(spread([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5)).toEqual([0, 2, 4, 6, 8]);
  });
});

describe("dead letter queue", () => {
  it("fails the item and removes its files", async () => {
    const { id, api, deps } = await setup();
    await env.CONTENT.put(`derived/${id}/waveform/peaks.json`, "{}");
    expect(await failDeadLetter({ type: "r2", publicId: id }, deps)).toBe("dead_letter:applied");
    expect(api.reports).toEqual([
      { publicId: id, step: "done", outcome: "failed", reason: "processing_error" },
    ]);
    expect(await keys(`incoming/${id}/`)).toEqual([]);
    expect(await keys(`derived/${id}/`)).toEqual([]);
  });

  it("leaves a finished item alone", async () => {
    const { id, api, deps } = await setup();
    api.answers.done = "ignored";
    expect(await failDeadLetter({ type: "r2", publicId: id }, deps)).toBe("dead_letter:ignored");
    expect(await keys(`incoming/${id}/`)).toEqual([`incoming/${id}/original.mp3`]);
  });
});
