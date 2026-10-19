/**
 * Response headers (spec 3.6). Creator files are untrusted, so every response is
 * locked down: no sniffing, a sandbox CSP, no referrer, and a content type from a
 * fixed list. Anything else is served as an opaque download type.
 */
import type { MediaTokenPayload } from "@repo/constants/src/mediaToken";

/** Cached copies live a day at the edge, under the token free key. */
export const EDGE_CACHE_SECONDS = 86_400;
/** Browsers keep a response at most 5 minutes, and never past the token. */
export const VIEWER_MAX_AGE_SECONDS = 300;
/** Objects above this stream uncached (Cache API limit below Enterprise). */
export const CACHE_MAX_BYTES = 512 * 1024 * 1024;

const SAFE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
  "audio/wav",
  "audio/flac",
  "application/pdf",
  "application/epub+zip",
  "application/zip",
  "application/json",
]);

/** The stored type when it is on the list, otherwise application/octet-stream. */
export function safeContentType(stored: string | undefined): string {
  const base = (stored ?? "").split(";")[0]!.trim().toLowerCase();
  return SAFE_CONTENT_TYPES.has(base) ? base : "application/octet-stream";
}

/** Origins allowed to read responses from script (PDF viewer, waveform fetches). */
export function allowedOrigins(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map(item => item.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  );
}

export function applyCors(headers: Headers, origin: string | null, allowed: Set<string>): void {
  headers.append("Vary", "Origin");
  if (!origin || !allowed.has(origin)) return;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, ETag"
  );
}

/** Answer to a CORS preflight. Range is the only header viewers send. */
export function preflight(origin: string | null, allowed: Set<string>): Response {
  if (!origin || !allowed.has(origin)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, If-None-Match, If-Modified-Since",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}

function lastSegment(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1) || "download";
}

/**
 * `attachment` with an ASCII fallback name and the UTF-8 name (RFC 6266). Quotes,
 * slashes and control characters never reach the header.
 */
export function contentDisposition(fileName: string | undefined, key: string): string {
  const name =
    [...(fileName ?? "")]
      .filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
      // Slice code points, never UTF-16 units: half a surrogate pair breaks encodeURIComponent
      .slice(0, 150)
      .join("")
      .replace(/["\\/]/g, "_")
      .trim() || lastSegment(key);
  const ascii = [...name].map(char => (char.charCodeAt(0) < 127 ? char : "_")).join("");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Headers every gateway response carries, success or not. */
export function applySecurity(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("Referrer-Policy", "no-referrer");
}

/** Headers for the copy stored in the edge cache: public, a day, no viewer state. */
export function cacheCopyHeaders(object: R2Object): Headers {
  const headers = new Headers();
  headers.set("Content-Type", safeContentType(object.httpMetadata?.contentType));
  headers.set("Content-Length", String(object.size));
  headers.set("ETag", object.httpEtag);
  headers.set("Last-Modified", object.uploaded.toUTCString());
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", `public, max-age=${EDGE_CACHE_SECONDS}`);
  return headers;
}

export interface ViewerContext {
  payload: MediaTokenPayload;
  origin: string | null;
  allowed: Set<string>;
  /** Unix seconds */
  now: number;
}

/**
 * The response the viewer receives, built from an R2 read or a cache hit. Only
 * entity headers are kept from the source; everything else is set here.
 */
export function viewerResponse(
  status: number,
  body: ReadableStream | null,
  source: Headers,
  context: ViewerContext
): Response {
  const headers = new Headers();
  for (const name of ["Content-Type", "Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (headers.has("Content-Type")) {
    headers.set("Content-Type", safeContentType(headers.get("Content-Type") ?? undefined));
  }
  headers.set("Accept-Ranges", "bytes");
  const maxAge = Math.max(0, Math.min(VIEWER_MAX_AGE_SECONDS, context.payload.exp - context.now));
  headers.set("Cache-Control", `private, max-age=${maxAge}`);
  if (context.payload.dl === 1) {
    headers.set("Content-Disposition", contentDisposition(context.payload.fn, context.payload.k));
  }
  applySecurity(headers);
  applyCors(headers, context.origin, context.allowed);
  return new Response(body, { status, headers });
}

/** Every refusal: no body, no detail, nothing cached. */
export function refusal(status = 403): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  applySecurity(headers);
  return new Response(null, { status, headers });
}
