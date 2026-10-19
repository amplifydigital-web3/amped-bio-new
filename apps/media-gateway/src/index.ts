/**
 * Media gateway (Build Board #20, content system PR 3, spec 3.6).
 *
 * Every R2 byte a viewer receives passes through here:
 *   1. GET or HEAD only. CORS preflight for the app origins.
 *   2. The path must be a served R2 key (originals/, audio/, derived/).
 *   3. The token must verify: known kid, valid HMAC, not expired, lifetime within
 *      the cap, and payload.k equal to the path.
 *   4. The item must not be taken down (KV `blocked:{publicId}`).
 *   5. A download token is single use (Durable Object keyed by its jti).
 *   6. Serve from the edge cache by the token free key, or from R2 with Range and
 *      conditional requests, filling the cache for objects up to 512 MB.
 * Any refusal is 403 with no body. Logs carry the key and the outcome, never the
 * token. Handoff: docs/fixes/content-media-gateway.md.
 */
import { DownloadClaims } from "./downloads";
import {
  CACHE_MAX_BYTES,
  allowedOrigins,
  applySecurity,
  cacheCopyHeaders,
  preflight,
  refusal,
  viewerResponse,
  type ViewerContext,
} from "./headers";
import { pathForKey, servedKeyFromPath } from "./path";
import { parseRange, resolveRange } from "./range";
import { verificationKeys, verifyToken } from "./token";

export { DownloadClaims };

type Outcome = Record<string, string | number | boolean | undefined>;

function log(outcome: Outcome): void {
  console.log(JSON.stringify({ event: "media", ...outcome }));
}

function refuse(reason: string, extra: Outcome = {}, status = 403): Response {
  log({ status, reason, ...extra });
  return refusal(status);
}

/** Headers the edge cache uses to answer Range and conditional requests itself. */
function cacheLookup(url: URL, request: Request): Request {
  const headers = new Headers();
  for (const name of ["Range", "If-None-Match", "If-Modified-Since"]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Request(url, { headers });
}

/** Stores the whole object under the token free key, once per colo. */
async function fillCache(env: Env, key: string, cacheUrl: URL): Promise<void> {
  try {
    const cache = caches.default;
    if (await cache.match(new Request(cacheUrl))) return;
    const object = await env.CONTENT.get(key);
    if (!object) return;
    await cache.put(
      new Request(cacheUrl),
      new Response(object.body, { headers: cacheCopyHeaders(object) })
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "media_cache_fill_failed", key, error: String(error) }));
  }
}

export async function handle(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  nowMs: number = Date.now()
): Promise<Response> {
  const allowed = allowedOrigins(env.ALLOWED_ORIGINS);
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") return preflight(origin, allowed);
  if (request.method !== "GET" && request.method !== "HEAD") {
    const response = refuse("method", { method: request.method }, 405);
    response.headers.set("Allow", "GET, HEAD, OPTIONS");
    return response;
  }

  const url = new URL(request.url);
  const served = servedKeyFromPath(url.pathname);
  if (!served) return refuse("path");
  const token = url.searchParams.get("t");
  if (!token) return refuse("no_token");

  let keys: Map<string, CryptoKey>;
  try {
    keys = await verificationKeys(env.MEDIA_TOKEN_KEYS);
  } catch (error) {
    // A configuration fault, not the viewer's: 503 so monitoring sees it
    console.error(JSON.stringify({ event: "media_config", error: String(error) }));
    return refusal(503);
  }

  const now = Math.floor(nowMs / 1000);
  const check = await verifyToken(token, keys, now);
  if (!check.ok) return refuse(check.reason, { key: served.key });
  const payload = check.payload;
  if (payload.k !== served.key) return refuse("path_mismatch", { key: served.key });

  if ((await env.TAKEDOWN.get(`blocked:${served.publicId}`)) !== null) {
    return refuse("takedown", { key: served.key });
  }

  const context: ViewerContext = { payload, origin, allowed, now };
  const key = served.key;

  // Single-use downloads are claimed only when bytes are about to be served, so a
  // failed or missing read never burns the buyer's token
  const claimDownload = async (): Promise<Response | null> => {
    if (payload.j === undefined) return null;
    const claims = env.DOWNLOADS.get(env.DOWNLOADS.idFromName(payload.j));
    return (await claims.claim(payload.exp)) ? null : refuse("download_used", { key });
  };

  if (request.method === "HEAD") {
    const object = await env.CONTENT.head(key);
    if (!object) return refuse("missing", { key });
    log({ status: 200, key, role: payload.r, method: "HEAD" });
    return viewerResponse(200, null, cacheCopyHeaders(object), context);
  }

  const cacheUrl = new URL(pathForKey(key), url.origin);
  const hit = await caches.default.match(cacheLookup(cacheUrl, request));
  if (hit) {
    const denied = await claimDownload();
    if (denied) return denied;
    log({ status: hit.status, key, role: payload.r, cache: "hit" });
    return viewerResponse(hit.status, hit.body, hit.headers, context);
  }

  const range = parseRange(request.headers.get("Range"));
  // Only the validators the gateway answers itself: an If-Match or
  // If-Unmodified-Since failure needs a 412, not the 304 the block below returns
  const conditionals = new Headers();
  for (const name of ["If-None-Match", "If-Modified-Since"]) {
    const value = request.headers.get(name);
    if (value !== null) conditionals.set(name, value);
  }
  let object: R2ObjectBody | R2Object | null;
  try {
    object = await env.CONTENT.get(key, {
      range: range ?? undefined,
      onlyIf: conditionals,
    });
  } catch (error) {
    if (!range) {
      // A failed read without a Range is a backend fault, not a client mistake
      console.error(JSON.stringify({ event: "media_read_failed", key, error: String(error) }));
      return refusal(503);
    }
    // R2 refuses a range past the end of the object
    const head = await env.CONTENT.head(key);
    if (!head) return refuse("missing", { key });
    return unsatisfiable(head.size, context, key);
  }
  if (!object) return refuse("missing", { key });

  // A failed precondition returns metadata without a body: the viewer's copy is current
  if (!("body" in object)) {
    const headers = new Headers({ ETag: object.httpEtag });
    log({ status: 304, key, role: payload.r, cache: "miss" });
    return viewerResponse(304, null, headers, context);
  }

  const cacheable = object.size <= CACHE_MAX_BYTES;
  const full = cacheCopyHeaders(object);

  if (range) {
    const resolved = resolveRange(range, object.size);
    if (!resolved) {
      await object.body.cancel();
      return unsatisfiable(object.size, context, key);
    }
    const denied = await claimDownload();
    if (denied) {
      await object.body.cancel();
      return denied;
    }
    const headers = new Headers(full);
    headers.set("Content-Length", String(resolved.length));
    headers.set(
      "Content-Range",
      `bytes ${resolved.offset}-${resolved.offset + resolved.length - 1}/${object.size}`
    );
    if (cacheable) ctx.waitUntil(fillCache(env, key, cacheUrl));
    log({ status: 206, key, role: payload.r, cache: cacheable ? "fill" : "none" });
    return viewerResponse(206, object.body, headers, context);
  }

  const denied = await claimDownload();
  if (denied) {
    await object.body.cancel();
    return denied;
  }

  let body: ReadableStream = object.body;
  if (cacheable) {
    const [forViewer, forCache] = object.body.tee();
    body = forViewer;
    ctx.waitUntil(
      caches.default
        .put(new Request(cacheUrl), new Response(forCache, { headers: full }))
        .catch(error =>
          console.error(
            JSON.stringify({ event: "media_cache_put_failed", key, error: String(error) })
          )
        )
    );
  }
  log({ status: 200, key, role: payload.r, cache: cacheable ? "fill" : "none" });
  return viewerResponse(200, body, full, context);
}

function unsatisfiable(size: number, context: ViewerContext, key: string): Response {
  log({ status: 416, key, role: context.payload.r });
  const headers = new Headers({ "Content-Range": `bytes */${size}`, "Cache-Control": "no-store" });
  applySecurity(headers);
  applyCors(headers, context.origin, context.allowed);
  return new Response(null, { status: 416, headers });
}

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
