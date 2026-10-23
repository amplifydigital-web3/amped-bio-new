/**
 * Signed delivery for content items (Build Board #20, spec 3.6). Turns an item and
 * its assets into the URLs a viewer needs: gateway URLs for R2 objects and Stream
 * tokens for video. Nothing here decides who may open an item; callers check
 * access first (access.ts) and pass "public" or "private".
 *
 * Lifetimes (spec 3.6 table). "private" covers everything that is not public:
 * an owner previewing a draft today, gated items from PR 8.
 *
 *   images, covers         public 24 h rounded up to the hour   private 5 min
 *   documents              public 1 h                            private 5 min
 *   audio, waveform, VTT   public 24 h rounded up to the hour   private duration + 10 min, 4 h max
 *   Stream token           public duration + 30 min, 6 h max    private duration + 10 min, 4 h max
 *   downloads              2 min; R2 files single use
 *
 * The rounded public expiry keeps server rendered HTML cacheable for the hour.
 */
import type { ContentAsset, ContentItem } from "@repo/database";
import {
  MEDIA_TOKEN_MAX_LIFETIME_SECONDS,
  captionLabel,
  type ContentCaptionTrack,
  type ContentCard,
  type ContentDownload,
  type ContentImageSet,
  type ContentPlayback,
} from "@repo/constants";
import { mediaUrl, newDownloadJti, signMediaToken } from "../cloudflare/mediaToken";
import { signStreamToken } from "../cloudflare/stream";
import { streamCustomerHost } from "./job";
import { fromDbKind } from "./ids";
import { assetServable } from "./access";

export type DeliveryAccess = "public" | "private";

type Asset = Pick<
  ContentAsset,
  | "role"
  | "storage"
  | "r2Key"
  | "streamUid"
  | "variant"
  | "lang"
  | "mimeType"
  | "width"
  | "height"
  | "scanStatus"
>;
type Item = Pick<
  ContentItem,
  "publicId" | "kind" | "title" | "durationMs" | "pageCount" | "allowDownload"
>;

const MINUTE = 60;
const HOUR = 60 * MINUTE;

export class DeliveryError extends Error {
  constructor(readonly reason: "not_ready" | "no_download" | "not_configured") {
    super(reason);
    this.name = "DeliveryError";
  }
}

// ----------------------------------------------------------------------------
// Lifetimes
// ----------------------------------------------------------------------------

export type ExpiryClass = "image" | "document" | "timed" | "stream" | "download";

function roundUpToHour(unixSeconds: number): number {
  return Math.ceil(unixSeconds / HOUR) * HOUR;
}

/** Unix seconds when a URL of this class expires. */
export function deliveryExpiry(
  kind: ExpiryClass,
  access: DeliveryAccess,
  durationMs: number | null,
  now: Date = new Date()
): number {
  const nowSec = Math.floor(now.getTime() / 1000);
  const durationSec = durationMs ? Math.ceil(durationMs / 1000) : HOUR;
  let exp: number;
  switch (kind) {
    case "image":
      exp = access === "public" ? roundUpToHour(nowSec + 24 * HOUR) : nowSec + 5 * MINUTE;
      break;
    case "document":
      exp = nowSec + (access === "public" ? HOUR : 5 * MINUTE);
      break;
    case "timed":
      exp =
        access === "public"
          ? roundUpToHour(nowSec + 24 * HOUR)
          : nowSec + Math.min(durationSec + 10 * MINUTE, 4 * HOUR);
      break;
    case "stream":
      exp =
        nowSec +
        (access === "public"
          ? Math.min(durationSec + 30 * MINUTE, 6 * HOUR)
          : Math.min(durationSec + 10 * MINUTE, 4 * HOUR));
      break;
    case "download":
      exp = nowSec + 2 * MINUTE;
      break;
  }
  // The signer refuses anything past the gateway's ceiling; stay under it
  return Math.min(exp, nowSec + MEDIA_TOKEN_MAX_LIFETIME_SECONDS);
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

class Signer {
  /** The earliest expiry signed so far, unix seconds */
  earliest = Number.POSITIVE_INFINITY;

  constructor(
    readonly item: Item,
    readonly access: DeliveryAccess,
    readonly now: Date
  ) {}

  private note(exp: number) {
    this.earliest = Math.min(this.earliest, exp);
  }

  /** Gateway URL for an R2 asset, or null when it may not be served. */
  r2(asset: Asset | undefined, kind: ExpiryClass): string | null {
    if (!asset?.r2Key || asset.storage !== "R2" || !assetServable(asset)) return null;
    const exp = deliveryExpiry(kind, this.access, this.item.durationMs, this.now);
    this.note(exp);
    const token = signMediaToken(
      { k: asset.r2Key, r: asset.role.toLowerCase(), exp, dl: 0 },
      undefined,
      this.now
    );
    return mediaUrl(asset.r2Key, token);
  }

  stream(uid: string, downloadable = false): string {
    const exp = deliveryExpiry(
      downloadable ? "download" : "stream",
      this.access,
      this.item.durationMs,
      this.now
    );
    this.note(exp);
    return signStreamToken({
      uid,
      expiresInSeconds: exp - Math.floor(this.now.getTime() / 1000),
      downloadable,
      now: this.now,
    });
  }

  expiresAtMs(): number {
    const fallback = Math.floor(this.now.getTime() / 1000) + HOUR;
    return (Number.isFinite(this.earliest) ? this.earliest : fallback) * 1000;
  }
}

/** Renditions sorted small to large: "320.webp", "640.webp", "1280.webp", "full.webp". */
function webpSet(assets: Asset[], role: Asset["role"]): Asset[] {
  const width = (asset: Asset) =>
    asset.variant?.startsWith("full") ? Number.MAX_SAFE_INTEGER : parseInt(asset.variant ?? "", 10);
  return assets
    .filter(asset => asset.role === role && asset.variant?.endsWith(".webp"))
    .sort((a, b) => width(a) - width(b));
}

function imageSet(signer: Signer, assets: Asset[], role: Asset["role"]): ContentImageSet | null {
  const set = webpSet(assets, role);
  if (!set.length) return null;
  const signed = set
    .map(asset => ({ asset, url: signer.r2(asset, "image") }))
    .filter((entry): entry is { asset: Asset; url: string } => entry.url !== null);
  if (!signed.length) return null;
  // The largest bounded rendition is the src; full size only when it is all there is
  const bounded = signed.filter(entry => !entry.asset.variant?.startsWith("full"));
  const main = (bounded.length ? bounded : signed)[(bounded.length ? bounded : signed).length - 1]!;
  return {
    src: main.url,
    srcSet: signed
      .filter(entry => entry.asset.width)
      .map(entry => `${entry.url} ${entry.asset.width}w`)
      .join(", "),
    width: main.asset.width,
    height: main.asset.height,
  };
}

let cachedStreamHost: string | null = null;

/** The account's Stream delivery host, looked up once per process. */
async function streamHost(uid: string): Promise<string> {
  if (!cachedStreamHost) cachedStreamHost = await streamCustomerHost(uid);
  return cachedStreamHost;
}

/** Test hook. */
export function resetStreamHostForTests(): void {
  cachedStreamHost = null;
}

/** A safe download file name: the title's letters, digits and spaces plus the extension. */
export function downloadFileName(title: string, ext: string): string {
  const base =
    title
      .normalize("NFKD")
      .replace(/[^\w\s.-]/g, "")
      .replace(/\s+/g, " ")
      // No hidden files and no relative path look alikes
      .replace(/^[.\s]+/, "")
      .trim()
      .slice(0, 80) || "download";
  const cleanExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return cleanExt ? `${base}.${cleanExt}` : base;
}

// ----------------------------------------------------------------------------
// Playback
// ----------------------------------------------------------------------------

/**
 * Everything a viewer needs to open the item. Every URL carries the shortest
 * lifetime its class allows; `expiresAt` is the earliest of them, so the
 * client asks again a minute before it.
 */
export async function buildPlayback(
  item: Item,
  assets: Asset[],
  access: DeliveryAccess,
  now: Date = new Date()
): Promise<ContentPlayback> {
  const kind = fromDbKind(item.kind) as ContentPlayback["kind"];
  const signer = new Signer(item, access, now);
  const find = (role: Asset["role"], variant?: string) =>
    assets.find(
      asset => asset.role === role && (variant === undefined || asset.variant === variant)
    );

  const cover =
    kind === "image" ? imageSet(signer, assets, "RENDITION") : imageSet(signer, assets, "COVER");

  const playback: ContentPlayback = {
    publicId: item.publicId,
    kind,
    expiresAt: 0,
    cover,
    video: null,
    audio: null,
    image: kind === "image" ? cover : null,
    document: null,
    captions: [],
  };

  const captions = assets.filter(asset => asset.role === "CAPTION" && asset.lang);

  if (kind === "video") {
    const stream = find("STREAM");
    if (!stream?.streamUid) throw new DeliveryError("not_ready");
    const host = await streamHost(stream.streamUid);
    const token = signer.stream(stream.streamUid);
    const posterAsset =
      assets.find(asset => asset.role === "COVER" && asset.variant === "1280.jpg") ??
      assets.find(asset => asset.role === "COVER" && asset.variant === "full.jpg");
    playback.video = {
      hls: `https://${host}/${token}/manifest/video.m3u8`,
      dash: `https://${host}/${token}/manifest/video.mpd`,
      poster: signer.r2(posterAsset, "image") ?? cover?.src ?? null,
    };
    // Video captions live on Stream and ride in the manifest
    playback.captions = captions.map(
      (asset): ContentCaptionTrack => ({
        lang: asset.lang!,
        label: captionLabel(asset.lang!),
        src: null,
      })
    );
  }

  if (kind === "audio") {
    const rendition = find("RENDITION", "m4a") ?? find("RENDITION");
    const src = signer.r2(rendition, "timed");
    if (!src) throw new DeliveryError("not_ready");
    playback.audio = {
      src,
      mimeType: rendition?.mimeType ?? "audio/mp4",
      waveform: signer.r2(find("WAVEFORM"), "timed"),
    };
    playback.captions = captions
      .map(asset => ({
        lang: asset.lang!,
        label: captionLabel(asset.lang!),
        src: signer.r2(asset, "timed"),
      }))
      .filter(track => track.src !== null);
  }

  if (kind === "document") {
    const original = find("ORIGINAL");
    const format = original?.mimeType === "application/epub+zip" ? "epub" : "pdf";
    const pages = assets
      .filter(asset => asset.role === "PAGE_PREVIEW")
      .sort((a, b) => (a.variant ?? "").localeCompare(b.variant ?? ""))
      .map(asset => signer.r2(asset, "document"))
      .filter((url): url is string => url !== null);
    playback.document = {
      format,
      // EPUB has no in app reader; it opens as a download when allowed
      src: format === "pdf" ? signer.r2(original, "document") : null,
      pageCount: item.pageCount,
      pages,
    };
  }

  playback.expiresAt = signer.expiresAtMs();
  return playback;
}

// ----------------------------------------------------------------------------
// Cards (spec 3.7): covers only, for bio blocks, the feed and the item page
// ----------------------------------------------------------------------------

type CardItem = Item & Pick<ContentItem, "publishedAt">;

/**
 * A card for a public surface. Covers are signed with the public image lifetime,
 * rounded to the hour, so server HTML stays cacheable. Never a playback URL.
 */
export function buildCard(item: CardItem, assets: Asset[], now: Date = new Date()): ContentCard {
  const kind = fromDbKind(item.kind) as ContentCard["kind"];
  const signer = new Signer(item, "public", now);
  const cover =
    kind === "image" ? imageSet(signer, assets, "RENDITION") : imageSet(signer, assets, "COVER");
  const blur = signer.r2(
    assets.find(asset => asset.role === "BLUR"),
    "image"
  );
  return {
    publicId: item.publicId,
    kind,
    title: item.title,
    durationMs: item.durationMs,
    pageCount: item.pageCount,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
    cover,
    blur,
    allowDownload: item.allowDownload,
  };
}

/** Asset roles a card reads. Lists fetch only these. */
export const CARD_ASSET_ROLES = ["COVER", "RENDITION", "BLUR"] as const;

// ----------------------------------------------------------------------------
// Downloads (decision 24)
// ----------------------------------------------------------------------------

/**
 * A 2 minute download link. R2 files carry a single use id the gateway enforces.
 * Video downloads come from Stream's MP4, which is not single use. The caller
 * checks allowDownload and the daily cap first.
 */
export async function buildDownload(
  item: Item,
  assets: Asset[],
  now: Date = new Date()
): Promise<ContentDownload> {
  if (!item.allowDownload) throw new DeliveryError("no_download");
  const signer = new Signer(item, "private", now);
  const exp = deliveryExpiry("download", "private", item.durationMs, now);

  if (item.kind === "VIDEO") {
    const stream = assets.find(asset => asset.role === "STREAM");
    if (!stream?.streamUid) throw new DeliveryError("not_ready");
    const host = await streamHost(stream.streamUid);
    const token = signer.stream(stream.streamUid, true);
    return {
      url: `https://${host}/${token}/downloads/default.mp4`,
      fileName: downloadFileName(item.title, "mp4"),
      expiresAt: exp * 1000,
    };
  }

  const original = assets.find(asset => asset.role === "ORIGINAL");
  if (!original?.r2Key || original.storage !== "R2" || !assetServable(original)) {
    throw new DeliveryError("not_ready");
  }
  const ext = original.r2Key.split(".").pop() ?? "";
  const fileName = downloadFileName(item.title, ext);
  const token = signMediaToken(
    { k: original.r2Key, r: "original", exp, dl: 1, fn: fileName, j: newDownloadJti() },
    undefined,
    now
  );
  return { url: mediaUrl(original.r2Key, token), fileName, expiresAt: exp * 1000 };
}
