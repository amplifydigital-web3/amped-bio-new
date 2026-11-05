/**
 * Edge cache purge by URL for removed content (content takedown C7a, spec 4.5).
 * Cleanup only: the gateway checks the takedown key before its cache, so a purge
 * is never what stops delivery. Failures are logged and not retried; the cached
 * copy expires within 24 hours and the KV key refuses it before that.
 *
 * POST /zones/{zone}/purge_cache { files: [...] }, 30 URLs per request.
 * The amped.bio zone also serves the app, the site and the API, and staging and
 * production share it, so only URLs on this API's own MEDIA_GATEWAY_ORIGIN are sent.
 * Docs (checked 4 Nov 2026): https://developers.cloudflare.com/cache/how-to/purge-cache/
 */
import { env } from "../../env";

const API = "https://api.cloudflare.com/client/v4";
const REQUEST_TIMEOUT_MS = 10_000;
export const PURGE_BATCH = 30;

export function cachePurgeConfigured(): boolean {
  return Boolean(env.CF_MEDIA_ZONE_ID && env.CF_CACHE_PURGE_TOKEN && env.MEDIA_GATEWAY_ORIGIN);
}

/** Token free gateway URL for an R2 key, the same path the gateway caches under. */
export function gatewayCacheUrl(r2Key: string, origin = env.MEDIA_GATEWAY_ORIGIN): string {
  const path = r2Key.split("/").map(encodeURIComponent).join("/");
  return `${origin.replace(/\/+$/, "")}/${path}`;
}

/** Purges the given URLs. Returns how many requests failed; never throws. */
export async function purgeGatewayUrls(urls: string[]): Promise<number> {
  if (!cachePurgeConfigured() || urls.length === 0) return 0;
  const origin = new URL(env.MEDIA_GATEWAY_ORIGIN).origin;
  const own = urls.filter(url => {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  });
  let failed = 0;
  for (let i = 0; i < own.length; i += PURGE_BATCH) {
    try {
      const response = await fetch(`${API}/zones/${env.CF_MEDIA_ZONE_ID}/purge_cache`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CF_CACHE_PURGE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: own.slice(i, i + PURGE_BATCH) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
    } catch (error) {
      failed += 1;
      console.error(
        "[content] cache purge failed",
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
      );
    }
  }
  return failed;
}
