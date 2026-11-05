/**
 * Public fonts (Theme Engine v2 fonts, phase 2b PR 2, decision 2). The API
 * mirrors Google Fonts stylesheets and WOFF2 files to fonts/ on the media
 * bucket; creator pages and the apps load them here, so no visitor's browser
 * contacts Google. Fonts are public: no token, no takedown check, open CORS
 * (a font is fetched in CORS mode from every page origin), and a year of
 * caching, since every key is content addressed and never changes.
 */
import { isFontKey } from "@repo/constants/src/fonts/keys";
import { applySecurity } from "./headers";

const YEAR = "public, max-age=31536000, immutable";

/** The font key a request path names, or null. One decode, no dot or empty segments. */
export function fontKeyFromPath(pathname: string): string | null {
  let key: string;
  try {
    key = decodeURIComponent(pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
  return isFontKey(key) ? key : null;
}

function fontHeaders(contentType: string, etag?: string): Headers {
  const headers = new Headers();
  applySecurity(headers);
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", YEAR);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Timing-Allow-Origin", "*");
  if (etag) headers.set("ETag", etag);
  return headers;
}

/** Serves a public font key from the edge cache or R2. */
export async function serveFont(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  key: string
): Promise<Response> {
  const contentType = key.endsWith(".css") ? "text/css; charset=utf-8" : "font/woff2";
  const cacheKey = new Request(new URL(`/${key}`, request.url).toString());
  if (request.method === "GET") {
    const hit = await caches.default.match(cacheKey);
    if (hit) return new Response(hit.body, { status: 200, headers: hit.headers });
  }
  const object =
    request.method === "HEAD" ? await env.CONTENT.head(key) : await env.CONTENT.get(key);
  if (!object) {
    // Not mirrored yet: the page shows the fallback font this once
    const headers = fontHeaders("text/plain");
    headers.set("Cache-Control", "no-store");
    return new Response(null, { status: 404, headers });
  }
  const headers = fontHeaders(contentType, object.httpEtag);
  headers.set("Content-Length", String(object.size));
  if (request.method === "HEAD" || !("body" in object)) {
    return new Response(null, { status: 200, headers });
  }
  const [forViewer, forCache] = (object as R2ObjectBody).body.tee();
  ctx.waitUntil(caches.default.put(cacheKey, new Response(forCache, { headers })).catch(() => {}));
  return new Response(forViewer, { status: 200, headers });
}
