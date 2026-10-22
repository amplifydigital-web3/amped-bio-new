/**
 * Signed calls to the API (spec 3.5 step 4). The API is the only writer of item
 * state. Both calls are signed like the processor callback: header
 * `x-amped-signature: t={unix},v1={hex}` with HMAC SHA-256 over `${t}.${rawBody}`
 * and CONTENT_PROCESSOR_SECRET (apps/server/src/services/cloudflare/mediaToken.ts).
 */
import {
  CONTENT_CALLBACK_PATH,
  CONTENT_JOB_PATH,
  type ContentJob,
} from "@repo/constants/src/contentJob";
import { hmacHex } from "./crypto";

/** The subset of the callback schema (packages/constants/src/content.ts) we send. */
export interface ProcessedAsset {
  role: string;
  storage: "R2" | "STREAM";
  r2Key?: string;
  streamUid?: string;
  variant?: string;
  lang?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  scanStatus: "PENDING" | "CLEAN" | "INFECTED" | "SKIPPED" | "ERROR";
}

export interface ProcessedCallback {
  publicId: string;
  step: "hash" | "csam" | "malware" | "normalize" | "blur" | "classifier" | "done";
  outcome: "ok" | "failed" | "blocked" | "held";
  reason?: string;
  sha256?: string;
  durationMs?: number;
  pageCount?: number;
  width?: number;
  height?: number;
  assets?: ProcessedAsset[];
}

/** applied: go on. blocked: the hash is on the blocklist, stop. ignored or not_found: stop. */
export type CallbackResult = "applied" | "ignored" | "blocked" | "not_found";

export interface Api {
  job(publicId: string): Promise<ContentJob | null>;
  report(callback: ProcessedCallback): Promise<CallbackResult>;
}

/** A failed API call. Thrown so the Queue retries the message. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const SIGNATURE_HEADER = "x-amped-signature";
const TIMEOUT_MS = 15_000;

export async function signBody(raw: string, secret: string, now = new Date()): Promise<string> {
  const t = Math.floor(now.getTime() / 1000);
  return `t=${t},v1=${await hmacHex(secret, `${t}.${raw}`)}`;
}

/** True for the API's own `{ error: "not_found" }` or `{ result: "not_found" }`. */
async function notFoundBody(response: Response): Promise<boolean> {
  try {
    const body = (await response.json()) as { error?: unknown; result?: unknown };
    return body.error === "not_found" || body.result === "not_found";
  } catch {
    return false;
  }
}

export function createApi(origin: string, secret: string): Api {
  async function post(path: string, body: unknown): Promise<Response> {
    const raw = JSON.stringify(body);
    return fetch(new URL(path, origin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SIGNATURE_HEADER]: await signBody(raw, secret),
      },
      body: raw,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  return {
    async job(publicId) {
      const response = await post(CONTENT_JOB_PATH, { publicId });
      // A bare 404 means the route is closed (no secret on the API): retry, never drop
      if (response.status === 404 && (await notFoundBody(response))) return null;
      if (!response.ok) throw new ApiError(`job ${response.status}`, response.status);
      return (await response.json()) as ContentJob;
    },
    async report(callback) {
      const response = await post(CONTENT_CALLBACK_PATH, callback);
      if (response.status === 404 && (await notFoundBody(response))) return "not_found";
      if (!response.ok) {
        throw new ApiError(`callback ${callback.step} ${response.status}`, response.status);
      }
      const { result } = (await response.json()) as { result: CallbackResult };
      return result;
    },
  };
}
