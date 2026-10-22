/**
 * The browser side of an upload: XHR PUT with progress, tus-js-client for
 * Stream, and the tRPC calls with errors normalized for UploadTask.
 */
import { TRPCClientError } from "@trpc/client";
import { Upload } from "tus-js-client";
import { trpcClient } from "@repo/ui";
import {
  ContentApiError,
  TransferError,
  type ContentUploadApi,
  type TusOptions,
  type UploadDeps,
} from "./uploadTask";

/** PUT with upload progress. R2 CORS exposes ETag (spec 3.4), which multipart needs. */
export function putWithProgress(
  url: string,
  body: Blob,
  options: { headers?: Record<string, string>; signal: AbortSignal; onProgress(n: number): void }
): Promise<{ etag: string | null }> {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) return reject(new DOMException("aborted", "AbortError"));
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = event => {
      if (event.lengthComputable) options.onProgress(event.loaded);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve({ etag: request.getResponseHeader("ETag") });
      } else {
        reject(new TransferError("upload failed", request.status));
      }
    };
    request.onerror = () => reject(new TransferError("network", null));
    request.ontimeout = () => reject(new TransferError("timeout", null));
    request.onabort = () => reject(new DOMException("aborted", "AbortError"));
    options.signal.addEventListener("abort", () => request.abort(), { once: true });
    request.send(body);
  });
}

/** tus-js-client into the upload URL the server created on Stream (spec 3.5 step 1). */
export function startTus(file: File, options: TusOptions) {
  const upload = new Upload(file, {
    uploadUrl: options.uploadUrl,
    chunkSize: options.chunkSize,
    // tus retries a dropped chunk on its own before reporting an error
    retryDelays: [0, 1000, 3000, 5000, 10000],
    // The server owns the upload URL; nothing is kept in localStorage
    storeFingerprintForResuming: false,
    removeFingerprintOnSuccess: true,
    onProgress: (sent, total) => options.onProgress(sent, total),
    onSuccess: () => options.onSuccess(),
    onError: error => {
      const status =
        (
          error as { originalResponse?: { getStatus(): number } | null }
        ).originalResponse?.getStatus() ?? null;
      options.onError(Object.assign(new Error(error.message), { status }));
    },
  });
  return {
    start: () => upload.start(),
    abort: () => upload.abort(false),
  };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/** Turns a tRPC failure into a ContentApiError; a network failure stays as it is. */
export function normalizeApiError(error: unknown): unknown {
  if (error instanceof TRPCClientError) {
    const data = error.data as { code?: string; httpStatus?: number } | undefined;
    if (data?.code) return new ContentApiError(data.code, error.message);
  }
  return error;
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

export const contentUploadApi: ContentUploadApi = {
  createUpload: input => call(() => trpcClient.content.createUpload.mutate(input)),
  signParts: input => call(() => trpcClient.content.signParts.mutate(input)),
  completeUpload: input => call(() => trpcClient.content.completeUpload.mutate(input)),
  abortUpload: input => call(() => trpcClient.content.abortUpload.mutate(input)),
};

export const browserUploadDeps: UploadDeps = {
  api: contentUploadApi,
  put: putWithProgress,
  tus: startTus,
  sleep,
  isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
};
