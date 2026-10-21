import { CONTENT_PUBLIC_ID_REGEX } from "@repo/constants/src/contentKeys";
import { MEDIA_GATEWAY_SERVED_PREFIXES } from "@repo/constants/src/mediaToken";

/** An R2 key the gateway may serve, with the item it belongs to. */
export interface ServedKey {
  key: string;
  publicId: string;
}

const SERVED = new Set<string>(MEDIA_GATEWAY_SERVED_PREFIXES);

/**
 * Turns a request path into an R2 key. The API builds URLs by encoding each key
 * segment (mediaUrl in apps/server), so each segment is decoded on its own and a
 * decoded slash, dot segment or empty segment is refused. Only the served
 * prefixes pass, and the second segment must be a content public id, which is
 * also the takedown key (spec 3.4 and 3.6).
 */
export function servedKeyFromPath(pathname: string): ServedKey | null {
  const raw = pathname.replace(/^\/+/, "").split("/");
  if (raw.length < 3) return null;
  const segments: string[] = [];
  for (const segment of raw) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      /[/\\]/.test(decoded) ||
      [...decoded].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    ) {
      return null;
    }
    segments.push(decoded);
  }
  const [prefix, publicId] = segments as [string, string];
  if (!SERVED.has(prefix) || !CONTENT_PUBLIC_ID_REGEX.test(publicId)) return null;
  return { key: segments.join("/"), publicId };
}

/** The URL path the API builds for a key, so the cache key matches mediaUrl exactly. */
export function pathForKey(key: string): string {
  return `/${key.split("/").map(encodeURIComponent).join("/")}`;
}
