/**
 * Cloudflare Stream for the content system (Build Board #20). Spec 3.4 to 3.6.
 *
 * Video never touches R2 or our servers. The API creates a one time TUS upload URL
 * (direct creator upload) and the browser sends the bytes to Stream with
 * tus-js-client. Every video requires signed URLs; playback uses an RS256 token we
 * sign with our Stream key, so no Cloudflare API call is needed per view.
 *
 * Docs (checked 12 Oct 2026):
 * - Direct creator uploads: https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads
 * - Webhooks: https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 * - Signed URLs: https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
 */
import { createHmac, createPrivateKey, createSign, timingSafeEqual } from "node:crypto";
import { STREAM_WEBHOOK_WINDOW_SECONDS, base64UrlEncodeBytes } from "@repo/constants";
import { env } from "../../env";
import { streamAllowedOrigins } from "./config";

const API = "https://api.cloudflare.com/client/v4";
const REQUEST_TIMEOUT_MS = 15_000;

export class StreamApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "StreamApiError";
  }
}

function accountUrl(path: string): string {
  return `${API}/accounts/${env.CF_ACCOUNT_ID}/stream${path}`;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.CF_STREAM_API_TOKEN}` };
}

async function streamJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(accountUrl(path), {
    ...init,
    headers: { ...authHeaders(), "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: T;
    errors?: Array<{ message?: string }>;
  } | null;
  if (!response.ok || !body?.success) {
    const detail = body?.errors?.map(error => error.message).join("; ") || response.statusText;
    throw new StreamApiError(
      `Stream ${init.method ?? "GET"} ${path} failed: ${detail}`,
      response.status
    );
  }
  return body.result as T;
}

function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

// ----------------------------------------------------------------------------
// Direct creator upload (TUS)
// ----------------------------------------------------------------------------

export interface StreamDirectUploadParams {
  /** Exact file size in bytes. Stream refuses a different length. */
  size: number;
  /** The creator's video minutes left, capped at 4 hours (spec 3.5) */
  maxDurationSeconds: number;
  /** Upload URL expiry */
  expiresAt: Date;
}

export interface StreamDirectUpload {
  /** One time TUS URL for tus-js-client (uploadUrl option) */
  uploadUrl: string;
  /** Stream video uid, stored as the STREAM asset */
  uid: string;
}

/**
 * Upload-Metadata: comma separated `key base64(value)`; flags carry no value. Only
 * the keys Cloudflare documents for direct creator uploads. Name, meta and
 * allowedOrigins are set right after with updateStreamVideo.
 */
export function streamUploadMetadata(params: StreamDirectUploadParams): string {
  return [
    `maxDurationSeconds ${b64(String(Math.max(1, Math.floor(params.maxDurationSeconds))))}`,
    "requiresignedurls",
    `expiry ${b64(params.expiresAt.toISOString().replace(/\.\d{3}Z$/, "Z"))}`,
  ].join(",");
}

/** The uid is in the stream-media-id header; the Location path ends with it too. */
export function streamUidFrom(location: string, mediaIdHeader: string | null): string | null {
  if (mediaIdHeader && /^[a-f0-9]{32}$/.test(mediaIdHeader)) return mediaIdHeader;
  try {
    const last = new URL(location).pathname.split("/").filter(Boolean).pop() ?? "";
    return /^[a-f0-9]{32}$/.test(last) ? last : null;
  } catch {
    return null;
  }
}

export async function createStreamDirectUpload(
  params: StreamDirectUploadParams
): Promise<StreamDirectUpload> {
  const response = await fetch(`${accountUrl("")}?direct_user=true`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(params.size),
      "Upload-Metadata": streamUploadMetadata(params),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const location = response.headers.get("location");
  if (!response.ok || !location) {
    throw new StreamApiError(`Stream TUS create failed: ${response.status}`, response.status);
  }
  const uid = streamUidFrom(location, response.headers.get("stream-media-id"));
  if (!uid) throw new StreamApiError("Stream TUS create returned no video id", 502);
  return { uploadUrl: location, uid };
}

// ----------------------------------------------------------------------------
// Videos
// ----------------------------------------------------------------------------

export interface StreamVideo {
  uid: string;
  readyToStream: boolean;
  /** Seconds; -1 until known */
  duration: number;
  size?: number;
  status: { state: string; errReasonCode?: string; errReasonText?: string };
  meta?: Record<string, string>;
  /** `https://customer-{code}.cloudflarestream.com/{uid}/thumbnails/thumbnail.jpg` */
  thumbnail?: string;
}

export function getStreamVideo(uid: string): Promise<StreamVideo> {
  return streamJson<StreamVideo>(`/${uid}`);
}

/**
 * Sets meta (publicId, env), the allowed playback origins and signed URLs on a video
 * (spec 3.4). Called right after the upload URL is created. Signed URLs were
 * already required by the upload metadata, so a failure here never opens playback.
 */
export function updateStreamVideo(uid: string, meta: Record<string, string>): Promise<StreamVideo> {
  return streamJson<StreamVideo>(`/${uid}`, {
    method: "POST",
    body: JSON.stringify({
      meta: { name: meta.publicId ?? "", ...meta },
      requireSignedURLs: true,
      allowedOrigins: streamAllowedOrigins(),
    }),
  });
}

export async function deleteStreamVideo(uid: string): Promise<void> {
  const response = await fetch(accountUrl(`/${uid}`), {
    method: "DELETE",
    headers: authHeaders(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // 404 means it is already gone, which is the goal
  if (!response.ok && response.status !== 404) {
    throw new StreamApiError(`Stream DELETE failed: ${response.status}`, response.status);
  }
}

/** Preview clip from 0 to `seconds` as a separate signed video (called at READY, PR 4). */
export function createStreamClip(
  uid: string,
  seconds: number,
  meta: Record<string, string>
): Promise<StreamVideo> {
  return streamJson<StreamVideo>("/clip", {
    method: "POST",
    body: JSON.stringify({
      clippedFromVideoUID: uid,
      startTimeSeconds: 0,
      endTimeSeconds: seconds,
      requireSignedURLs: true,
      allowedOrigins: streamAllowedOrigins(),
      meta,
    }),
  });
}

/** Turns on the MP4 download, only for videos with downloads allowed (called at READY, PR 4). */
export function enableStreamDownloads(uid: string): Promise<unknown> {
  return streamJson<unknown>(`/${uid}/downloads`, { method: "POST" });
}

// ----------------------------------------------------------------------------
// Playback tokens (spec 3.6): RS256 JWT signed with our Stream key, no API call
// ----------------------------------------------------------------------------

/** Cloudflare returns the PEM base64 encoded; accept that or a raw PEM. */
export function streamSigningPem(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("-----BEGIN")) return trimmed;
  return Buffer.from(trimmed, "base64").toString("utf8").trim();
}

export interface StreamTokenParams {
  uid: string;
  expiresInSeconds: number;
  downloadable?: boolean;
  now?: Date;
}

export function signStreamToken(
  params: StreamTokenParams,
  keyId = env.CF_STREAM_KEY_ID,
  pem = env.CF_STREAM_KEY_PEM
): string {
  if (!keyId || !pem) throw new Error("Stream signing key is not configured");
  const nowSec = Math.floor((params.now ?? new Date()).getTime() / 1000);
  const json = (value: unknown) => base64UrlEncodeBytes(Buffer.from(JSON.stringify(value)));
  const header = json({ alg: "RS256", kid: keyId });
  const payload = json({
    sub: params.uid,
    kid: keyId,
    // A minute of slack for clock skew between us and the edge
    nbf: nowSec - 60,
    exp: nowSec + Math.max(60, Math.floor(params.expiresInSeconds)),
    ...(params.downloadable ? { downloadable: true } : {}),
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = base64UrlEncodeBytes(signer.sign(createPrivateKey(streamSigningPem(pem))));
  return `${header}.${payload}.${signature}`;
}

// ----------------------------------------------------------------------------
// Webhook signature (spec 3.5 step 5)
// ----------------------------------------------------------------------------

/**
 * Webhook-Signature: `time={unix},sig1={hex}` where sig1 is HMAC-SHA256 of
 * `${time}.${rawBody}` with the webhook secret. Every byte of the body counts, so
 * the route reads the raw body before any JSON parsing.
 */
export function verifyStreamWebhookSignature(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string,
  now: Date = new Date()
): boolean {
  if (!header || !secret) return false;
  const fields = Object.fromEntries(
    header.split(",").map(part => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    })
  );
  const time = Number(fields.time);
  const given = fields.sig1;
  if (!Number.isInteger(time) || typeof given !== "string" || !/^[a-f0-9]{64}$/.test(given)) {
    return false;
  }
  if (Math.abs(Math.floor(now.getTime() / 1000) - time) > STREAM_WEBHOOK_WINDOW_SECONDS)
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${fields.time}.`)
    .update(rawBody)
    .digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}
