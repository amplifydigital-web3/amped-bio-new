/**
 * One file's upload (spec 3.5 steps 1 to 3, board cs2). The browser sends
 * bytes straight to storage and never through the API (acceptance 25):
 *
 *   put        non video under 100 MB: one presigned PUT to R2
 *   multipart  non video at 100 MB and up: 10 MB parts to R2, signed in batches
 *   stream     video: TUS to Cloudflare Stream with tus-js-client, 50 MB chunks
 *
 * Pause keeps what was sent. Resume continues: missing parts for R2 (each part
 * is re-signed, so a URL that expired while paused is never reused), the TUS
 * offset for Stream. completeUpload follows, and the item moves to processing.
 *
 * Everything outside the browser is injected (UploadDeps), so the task runs in
 * tests without network, XHR or Stream.
 */
import { CONTENT_UPLOAD, type ContentUploadKind } from "@repo/constants";
import { CONTENT_COPY } from "../copy";

export type UploadTarget =
  | { type: "put"; url: string; headers: Record<string, string> }
  | { type: "multipart"; uploadId: string; partCount: number; partBytes: number }
  | { type: "stream"; uploadUrl: string; chunkBytes: number };

export interface CreateUploadInput {
  kind: ContentUploadKind;
  fileName: string;
  mimeType: string;
  size: number;
  title?: string;
  durationSec?: number;
}

/** A failure from the API, normalized from the tRPC error. */
export class ContentApiError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ContentApiError";
  }
}

/** A transfer failure. `status` is the HTTP status when the server answered. */
export class TransferError extends Error {
  constructor(
    message: string,
    readonly status: number | null
  ) {
    super(message);
    this.name = "TransferError";
  }
}

export interface ContentUploadApi {
  createUpload(input: CreateUploadInput): Promise<{ publicId: string; target: UploadTarget }>;
  signParts(input: {
    publicId: string;
    uploadId: string;
    partNumbers: number[];
  }): Promise<{ parts: { partNumber: number; url: string }[] }>;
  completeUpload(input: {
    publicId: string;
    uploadId?: string;
    parts?: { partNumber: number; etag: string }[];
  }): Promise<{ publicId: string; status: string }>;
  abortUpload(input: { publicId: string; uploadId?: string }): Promise<unknown>;
}

export interface TusHandle {
  start(): void;
  abort(): Promise<void>;
}

export interface TusOptions {
  uploadUrl: string;
  chunkSize: number;
  onProgress(sent: number, total: number): void;
  onSuccess(): void;
  onError(error: Error & { status?: number | null }): void;
}

export interface UploadDeps {
  api: ContentUploadApi;
  /** PUT a body with upload progress. Resolves with the ETag response header. */
  put(
    url: string,
    body: Blob,
    options: {
      headers?: Record<string, string>;
      signal: AbortSignal;
      onProgress(loaded: number): void;
    }
  ): Promise<{ etag: string | null }>;
  tus(file: File, options: TusOptions): TusHandle;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  isOnline(): boolean;
}

export type UploadPhase =
  | "waiting"
  | "preparing"
  | "uploading"
  | "paused"
  | "offline"
  | "finishing"
  | "processing"
  | "failed";

export interface UploadSnapshot {
  phase: UploadPhase;
  loaded: number;
  total: number;
  publicId: string | null;
  error: string | null;
}

// Waits between attempts of one part or one PUT; then the task fails and
// offers Retry. A dropped connection pauses instead (offline), with no limit.
export const RETRY_DELAYS_MS = [1000, 3000, 6000, 12000];
const PART_CONCURRENCY = 3;
// Stream reports pendingupload for a moment after the last TUS chunk, longer for
// a large file. About a minute in total, then Retry asks again.
const COMPLETE_DELAYS_MS = [1500, 3000, 5000, 8000, 13000, 21000];
const NOT_YET = /not found in storage/i;

class Paused extends Error {
  constructor() {
    super("paused");
    this.name = "Paused";
  }
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof Paused ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error as { name?: string } | null)?.name === "AbortError"
  );
}

/** A user facing line for an API failure. Server messages are written for creators. */
export function messageForApiError(error: unknown): string {
  if (error instanceof ContentApiError) {
    if (
      ["BAD_REQUEST", "PRECONDITION_FAILED", "TOO_MANY_REQUESTS", "NOT_FOUND"].includes(error.code)
    ) {
      return error.message;
    }
  }
  return CONTENT_COPY.errors.generic;
}

export class UploadTask {
  readonly file: File;
  readonly kind: ContentUploadKind;
  readonly mimeType: string;
  readonly durationSec?: number;

  private deps: UploadDeps;
  private onChange: () => void;
  private state: UploadSnapshot;
  private target: UploadTarget | null = null;
  private etags = new Map<number, string>();
  private inFlight = new Map<number, number>();
  private controller: AbortController | null = null;
  private tusHandle: TusHandle | null = null;
  private running: Promise<void> | null = null;
  /** Set when the stored upload can not be continued; the next run starts over */
  private restart = false;
  /** run() was called while a paused transfer was still unwinding */
  private resumeAfter = false;
  /** Every byte reached storage; a later pause or failure only repeats completeUpload */
  private sent = false;
  private canceled = false;

  constructor(
    init: { file: File; kind: ContentUploadKind; mimeType: string; durationSec?: number },
    deps: UploadDeps,
    onChange: () => void
  ) {
    this.file = init.file;
    this.kind = init.kind;
    this.mimeType = init.mimeType;
    this.durationSec = init.durationSec;
    this.deps = deps;
    this.onChange = onChange;
    this.state = {
      phase: "waiting",
      loaded: 0,
      total: init.file.size,
      publicId: null,
      error: null,
    };
  }

  get snapshot(): UploadSnapshot {
    return this.state;
  }

  get isActive(): boolean {
    return this.running !== null;
  }

  private set(patch: Partial<UploadSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.onChange();
  }

  /** Runs until the item is processing, paused or failed. Safe to call twice. */
  run(): Promise<void> {
    if (this.running) {
      // Resumed before the paused transfer finished unwinding: run again right after
      const phase = this.state.phase;
      if (phase === "paused" || phase === "offline" || phase === "waiting") {
        this.resumeAfter = true;
      }
      return this.running;
    }
    if (this.state.phase === "processing") return Promise.resolve();
    this.controller = new AbortController();
    this.running = this.execute(this.controller.signal).finally(() => {
      this.running = null;
      this.controller = null;
      this.tusHandle = null;
      if (this.resumeAfter) {
        this.resumeAfter = false;
        void this.run();
      }
    });
    return this.running;
  }

  /** Stops sending and keeps progress. `offline` marks a pause the network caused. */
  pause(reason: "paused" | "offline" = "paused") {
    if (this.state.phase === "processing" || this.state.phase === "failed") return;
    this.resumeAfter = false;
    this.controller?.abort();
    void this.tusHandle?.abort();
    this.set({ phase: reason });
  }

  /** Puts a paused or failed upload back in line behind the file that is sending. */
  markWaiting() {
    const phase = this.state.phase;
    if (phase === "paused" || phase === "offline" || phase === "failed") {
      this.set({ phase: "waiting", error: null });
    }
  }

  /** Stops and deletes the server side upload. The caller drops the task. */
  async cancel(): Promise<void> {
    this.canceled = true;
    this.resumeAfter = false;
    this.controller?.abort();
    void this.tusHandle?.abort();
    // createUpload may still be in flight: wait, so the item it creates is removed too
    if (this.running) await this.running.catch(() => {});
    const publicId = this.state.publicId;
    if (!publicId || this.state.phase === "processing") return;
    const uploadId = this.target?.type === "multipart" ? this.target.uploadId : undefined;
    try {
      await this.deps.api.abortUpload({ publicId, uploadId });
    } catch {
      // The 24 hour sweep removes an upload that was never finished (spec 3.5)
    }
  }

  private async create() {
    this.set({ phase: "preparing", error: null });
    const created = await this.deps.api.createUpload({
      kind: this.kind,
      fileName: this.file.name,
      mimeType: this.mimeType,
      size: this.file.size,
      durationSec: this.durationSec ? Math.max(1, Math.ceil(this.durationSec)) : undefined,
    });
    this.target = created.target;
    this.set({ publicId: created.publicId });
  }

  private async execute(signal: AbortSignal): Promise<void> {
    try {
      if (this.canceled) throw new Paused();
      if (this.restart) await this.startOver();
      if (!this.target || !this.state.publicId) await this.create();
      if (signal.aborted) throw new Paused();
      if (!this.sent) {
        this.set({ phase: "uploading", error: null });
        const target = this.target!;
        if (target.type === "put") {
          try {
            await this.sendPut(target, signal);
          } catch (error) {
            // The presigned URL lasts 15 minutes and can not be re-signed. After a
            // long pause it answers 403: replace the item once and send again.
            if (!(error instanceof TransferError && error.status === 403) || signal.aborted) {
              throw error;
            }
            await this.startOver();
            await this.create();
            if (signal.aborted) throw new Paused();
            this.set({ phase: "uploading" });
            await this.sendPut(this.target as Extract<UploadTarget, { type: "put" }>, signal);
          }
        } else if (target.type === "multipart") await this.sendParts(target, signal);
        else await this.sendTus(target, signal);
        if (signal.aborted) throw new Paused();
        this.sent = true;
      }
      this.set({ phase: "finishing", loaded: this.file.size });
      await this.complete(signal);
      this.set({ phase: "processing", loaded: this.file.size });
    } catch (error) {
      if (isAbort(error) || signal.aborted) {
        // pause() already set paused or offline
        if (this.state.phase !== "paused" && this.state.phase !== "offline") {
          this.set({ phase: "paused" });
        }
        return;
      }
      if (!this.deps.isOnline()) {
        this.set({ phase: "offline" });
        return;
      }
      this.fail(error);
    }
  }

  private fail(error: unknown) {
    let message: string;
    if (error instanceof ContentApiError) {
      message = messageForApiError(error);
      const finishing = this.state.phase === "finishing";
      // The item failed on the server (size or type mismatch, unreadable video): the
      // next try is a new upload. "Not found in storage" is not that: the bytes may
      // still arrive (Stream catching up), so Retry only asks again.
      if (finishing && error.code === "BAD_REQUEST" && !NOT_YET.test(error.message)) {
        this.restart = true;
      }
      // A server fault after a multipart complete can not be repeated: start over
      if (
        finishing &&
        error.code === "INTERNAL_SERVER_ERROR" &&
        this.target?.type === "multipart"
      ) {
        this.restart = true;
      }
      // Nothing was created: the next try starts at createUpload
      if (!this.state.publicId) this.target = null;
    } else if (error instanceof TransferError && (error.status === 404 || error.status === 410)) {
      // The Stream upload URL expired (6 hours) or the multipart upload is gone
      message = CONTENT_COPY.errors.expired;
      this.restart = true;
    } else {
      message = CONTENT_COPY.errors.stopped;
      // A single presigned PUT can not be re-signed; the next try starts over,
      // unless every byte already arrived and only completeUpload is left
      if (this.target?.type === "put" && !this.sent) this.restart = true;
    }
    this.set({ phase: "failed", error: message });
  }

  /** Deletes the old server item and clears local state so the next run creates a new one. */
  private async startOver() {
    const publicId = this.state.publicId;
    const uploadId = this.target?.type === "multipart" ? this.target.uploadId : undefined;
    this.restart = false;
    this.sent = false;
    this.target = null;
    this.etags.clear();
    this.inFlight.clear();
    this.set({ publicId: null, loaded: 0 });
    if (publicId) {
      try {
        await this.deps.api.abortUpload({ publicId, uploadId });
      } catch {
        // Already gone, or the sweep will remove it
      }
    }
  }

  private async withRetries<T>(signal: AbortSignal, attempt: () => Promise<T>): Promise<T> {
    for (let i = 0; ; i++) {
      try {
        return await attempt();
      } catch (error) {
        if (isAbort(error) || signal.aborted) throw new Paused();
        if (error instanceof ContentApiError) throw error;
        // A 4xx from storage other than an expired URL will not pass on retry
        const status = error instanceof TransferError ? error.status : null;
        if (status !== null && status >= 400 && status < 500 && status !== 403) throw error;
        // A 403 is an expired URL. Multipart re-signs on retry; a PUT can not
        if (status === 403 && this.target?.type === "put") throw error;
        if (!this.deps.isOnline()) throw error;
        if (i >= RETRY_DELAYS_MS.length) throw error;
        await this.deps.sleep(RETRY_DELAYS_MS[i]!, signal);
      }
    }
  }

  private async sendPut(target: Extract<UploadTarget, { type: "put" }>, signal: AbortSignal) {
    // The presigned URL binds Content-Type and Content-Length, so the body is the whole file
    await this.withRetries(signal, async () => {
      this.set({ loaded: 0 });
      await this.deps.put(target.url, this.file, {
        headers: target.headers,
        signal,
        onProgress: loaded => this.set({ loaded }),
      });
    });
  }

  private partRange(partNumber: number, partBytes: number) {
    const start = (partNumber - 1) * partBytes;
    return { start, end: Math.min(start + partBytes, this.file.size) };
  }

  private partsLoaded(partBytes: number): number {
    let total = 0;
    for (const partNumber of this.etags.keys()) {
      const { start, end } = this.partRange(partNumber, partBytes);
      total += end - start;
    }
    for (const loaded of this.inFlight.values()) total += loaded;
    return total;
  }

  private async sendParts(
    target: Extract<UploadTarget, { type: "multipart" }>,
    signal: AbortSignal
  ) {
    const publicId = this.state.publicId!;
    const pending: number[] = [];
    for (let n = 1; n <= target.partCount; n++) if (!this.etags.has(n)) pending.push(n);
    this.inFlight.clear();
    this.set({ loaded: this.partsLoaded(target.partBytes) });

    // URLs last 15 minutes, so each batch is signed just before it is sent
    const batchSize = Math.min(CONTENT_UPLOAD.signPartsBatchMax, PART_CONCURRENCY * 2);
    const urls = new Map<number, string>();
    const sign = async (partNumbers: number[]) => {
      const { parts } = await this.deps.api.signParts({
        publicId,
        uploadId: target.uploadId,
        partNumbers,
      });
      for (const part of parts) urls.set(part.partNumber, part.url);
    };

    // Workers share a child signal: a failed part stops the others without
    // reading as a pause, and a pause stops them all
    const local = new AbortController();
    const onAbort = () => local.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    let firstError: unknown = null;

    let next = 0;
    const worker = async () => {
      while (next < pending.length) {
        if (local.signal.aborted) throw new Paused();
        const partNumber = pending[next++]!;
        const { start, end } = this.partRange(partNumber, target.partBytes);
        const blob = this.file.slice(start, end);
        let attempt = 0;
        const etag = await this.withRetries(local.signal, async () => {
          // Re-sign on every retry: the old URL may have expired while waiting
          if (!urls.has(partNumber) || attempt > 0) {
            const batch = pending
              .slice(pending.indexOf(partNumber), pending.indexOf(partNumber) + batchSize)
              .filter(n => n === partNumber || !urls.has(n));
            await sign(attempt > 0 ? [partNumber] : batch);
          }
          attempt += 1;
          this.inFlight.set(partNumber, 0);
          const { etag } = await this.deps.put(urls.get(partNumber)!, blob, {
            signal: local.signal,
            onProgress: loaded => {
              this.inFlight.set(partNumber, loaded);
              this.set({ loaded: this.partsLoaded(target.partBytes) });
            },
          });
          if (!etag) throw new TransferError("missing etag", null);
          return etag;
        });
        this.inFlight.delete(partNumber);
        urls.delete(partNumber);
        this.etags.set(partNumber, etag);
        this.set({ loaded: this.partsLoaded(target.partBytes) });
      }
    };

    const guarded = async () => {
      try {
        await worker();
      } catch (error) {
        if (!isAbort(error) && firstError === null) {
          // One part failed for good: stop the others and keep the parts already sent
          firstError = error;
          local.abort();
        }
        throw error;
      }
    };
    const workers = Array.from({ length: Math.min(PART_CONCURRENCY, pending.length) }, guarded);
    const results = await Promise.allSettled(workers);
    signal.removeEventListener("abort", onAbort);
    this.inFlight.clear();
    if (firstError !== null) throw firstError;
    if (results.some(r => r.status === "rejected")) throw new Paused();
  }

  private sendTus(target: Extract<UploadTarget, { type: "stream" }>, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new Paused());
      // The server created the TUS upload; resume into its URL, never a new endpoint
      const handle = this.deps.tus(this.file, {
        uploadUrl: target.uploadUrl,
        chunkSize: target.chunkBytes,
        onProgress: sent => this.set({ loaded: sent }),
        onSuccess: () => resolve(),
        onError: error => reject(new TransferError(error.message, error.status ?? null)),
      });
      this.tusHandle = handle;
      signal.addEventListener("abort", () => reject(new Paused()), { once: true });
      handle.start();
    });
  }

  private async complete(signal: AbortSignal) {
    const target = this.target!;
    const publicId = this.state.publicId!;
    const input =
      target.type === "multipart"
        ? {
            publicId,
            uploadId: target.uploadId,
            parts: [...this.etags.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([partNumber, etag]) => ({ partNumber, etag })),
          }
        : { publicId };
    for (let i = 0; ; i++) {
      try {
        await this.deps.api.completeUpload(input);
        return;
      } catch (error) {
        // "File not found in storage" while Stream or R2 catch up: the item stays
        // uploading on the server, so asking again is safe (completeUpload is idempotent).
        // A network failure (no tRPC code) is asked again too.
        const final =
          error instanceof ContentApiError &&
          ["BAD_REQUEST", "NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN"].includes(error.code) &&
          !NOT_YET.test(error.message);
        if (isAbort(error) || signal.aborted) throw new Paused();
        if (final || !this.deps.isOnline() || i >= COMPLETE_DELAYS_MS.length) throw error;
        await this.deps.sleep(COMPLETE_DELAYS_MS[i]!, signal);
      }
    }
  }
}
