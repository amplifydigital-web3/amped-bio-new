/**
 * PR 6a (Build Board #20 spec 3.6, Fan Library #26): who may open an item, and the
 * signed URLs it opens with. Real token signing with test keys; the Stream host
 * lookup is faked. Handoff: docs/fixes/media-player.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { base64UrlEncodeBytes, parseMediaTokenKeys } from "@repo/constants";

vi.mock("../services/content/job", () => ({
  streamCustomerHost: vi.fn(async () => "customer-abc.cloudflarestream.com"),
}));

import { env } from "../env";
import { verifyMediaToken } from "../services/cloudflare/mediaToken";
import {
  assetServable,
  isPublicItem,
  openDecision,
  ownerCanOpen,
  servedAssetsClean,
} from "../services/content/access";
import {
  buildDownload,
  buildPlayback,
  deliveryExpiry,
  downloadFileName,
  resetStreamHostForTests,
  DeliveryError,
} from "../services/content/delivery";

const KEYS = `t1:${base64UrlEncodeBytes(randomBytes(48))}`;
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const now = new Date("2026-10-23T10:20:30Z");
const nowSec = Math.floor(now.getTime() / 1000);

beforeEach(() => {
  resetStreamHostForTests();
  Object.assign(env, {
    MEDIA_TOKEN_KEYS: KEYS,
    MEDIA_GATEWAY_ORIGIN: "https://media-staging.ampedusercontent.com",
    CF_STREAM_KEY_ID: "stream-key",
    CF_STREAM_KEY_PEM: PEM,
  });
});

const publicItem = {
  status: "READY" as const,
  publishState: "PUBLISHED" as const,
  moderationState: "CLEAR" as const,
  accessRuleId: null,
  adult: false,
  deletedAt: null,
  userId: 7,
};
const page = { page_status: "PUBLISHED", block: "no" };

describe("access", () => {
  it("opens a ready, published, clear, ungated item on a live page to anyone", () => {
    expect(isPublicItem(publicItem, page)).toBe(true);
    expect(openDecision(publicItem, page, { userId: null })).toBe("public");
    expect(openDecision(publicItem, page, { userId: 8 })).toBe("public");
  });

  it("keeps drafts, held, gated, 18+ and deleted items and suspended pages closed", () => {
    const closed = [
      { ...publicItem, publishState: "DRAFT" as const },
      { ...publicItem, moderationState: "HELD" as const },
      { ...publicItem, accessRuleId: new Uint8Array(16) },
      { ...publicItem, adult: true },
      { ...publicItem, deletedAt: new Date() },
      { ...publicItem, status: "PROCESSING" as const },
    ];
    for (const item of closed) expect(openDecision(item, page, { userId: 8 })).toBeNull();
    expect(openDecision(publicItem, { ...page, block: "yes" }, { userId: 8 })).toBeNull();
    expect(
      openDecision(publicItem, { ...page, page_status: "UNPUBLISHED" }, { userId: 8 })
    ).toBeNull();
    expect(openDecision(publicItem, null, { userId: 8 })).toBeNull();
  });

  it("lets the owner preview any finished item that is not blocked", () => {
    const draft = {
      ...publicItem,
      publishState: "DRAFT" as const,
      moderationState: "HELD" as const,
    };
    expect(openDecision(draft, page, { userId: 7 })).toBe("owner");
    expect(ownerCanOpen({ status: "PROCESSING", moderationState: "CLEAR" })).toBe(false);
    expect(ownerCanOpen({ status: "READY", moderationState: "BLOCKED" })).toBe(false);
  });

  it("serves only scanned assets, and Stream's own encodes", () => {
    expect(assetServable({ role: "RENDITION", scanStatus: "SKIPPED" })).toBe(true);
    expect(assetServable({ role: "ORIGINAL", scanStatus: "CLEAN" })).toBe(true);
    expect(assetServable({ role: "ORIGINAL", scanStatus: "PENDING" })).toBe(false);
    expect(assetServable({ role: "ORIGINAL", scanStatus: "INFECTED" })).toBe(false);
    expect(assetServable({ role: "STREAM", scanStatus: "PENDING" })).toBe(true);
    expect(
      servedAssetsClean([
        { role: "STREAM", scanStatus: "PENDING" },
        { role: "COVER", scanStatus: "ERROR" },
      ])
    ).toBe(false);
  });
});

describe("delivery lifetimes (spec 3.6)", () => {
  it("rounds public images and audio up to the hour, 24 hours out", () => {
    const exp = deliveryExpiry("image", "public", null, now);
    expect(exp % 3600).toBe(0);
    expect(exp - nowSec).toBeGreaterThanOrEqual(24 * 3600);
    expect(exp - nowSec).toBeLessThan(25 * 3600);
    expect(deliveryExpiry("timed", "public", 60_000, now)).toBe(exp);
  });

  it("keeps private URLs short and bounds timed media by duration", () => {
    expect(deliveryExpiry("image", "private", null, now) - nowSec).toBe(300);
    expect(deliveryExpiry("document", "private", null, now) - nowSec).toBe(300);
    expect(deliveryExpiry("document", "public", null, now) - nowSec).toBe(3600);
    expect(deliveryExpiry("timed", "private", 20 * 60_000, now) - nowSec).toBe(30 * 60);
    expect(deliveryExpiry("timed", "private", 10 * 3600_000, now) - nowSec).toBe(4 * 3600);
  });

  it("gives Stream tokens duration plus 30 or 10 minutes, capped", () => {
    expect(deliveryExpiry("stream", "public", 12 * 60_000, now) - nowSec).toBe(42 * 60);
    expect(deliveryExpiry("stream", "public", 9 * 3600_000, now) - nowSec).toBe(6 * 3600);
    expect(deliveryExpiry("stream", "private", 12 * 60_000, now) - nowSec).toBe(22 * 60);
    expect(deliveryExpiry("stream", "private", 9 * 3600_000, now) - nowSec).toBe(4 * 3600);
    expect(deliveryExpiry("download", "public", null, now) - nowSec).toBe(120);
  });
});

const r2 = (role: string, r2Key: string, extra: Record<string, unknown> = {}) =>
  ({
    role,
    storage: "R2",
    r2Key,
    streamUid: null,
    variant: null,
    lang: null,
    mimeType: null,
    width: null,
    height: null,
    scanStatus: "SKIPPED",
    ...extra,
  }) as any;

const item = (kind: string, extra: Record<string, unknown> = {}) =>
  ({
    publicId: "abcdefghijklmnop",
    kind,
    title: "Point Reyes, new moon session",
    durationMs: 760_000,
    pageCount: null,
    allowDownload: false,
    ...extra,
  }) as any;

function tokenOf(url: string) {
  const token = new URL(url).searchParams.get("t")!;
  return verifyMediaToken(token, parseMediaTokenKeys(KEYS), now);
}

describe("buildPlayback", () => {
  it("signs the HLS manifest, the poster and Stream captions for a video", async () => {
    const assets = [
      {
        ...r2("STREAM", ""),
        storage: "STREAM",
        r2Key: null,
        streamUid: "u1",
        scanStatus: "PENDING",
      },
      r2("COVER", "derived/abcdefghijklmnop/cover/1280.jpg", { variant: "1280.jpg", width: 1280 }),
      r2("COVER", "derived/abcdefghijklmnop/cover/640.webp", { variant: "640.webp", width: 640 }),
      { ...r2("CAPTION", ""), storage: "STREAM", r2Key: null, streamUid: "u1", lang: "en" },
    ];
    const playback = await buildPlayback(item("VIDEO"), assets, "public", now);
    expect(playback.kind).toBe("video");
    expect(playback.video!.hls).toMatch(
      /^https:\/\/customer-abc\.cloudflarestream\.com\/[^/]+\.[^/]+\.[^/]+\/manifest\/video\.m3u8$/
    );
    expect(tokenOf(playback.video!.poster!)?.k).toBe("derived/abcdefghijklmnop/cover/1280.jpg");
    expect(playback.captions).toEqual([{ lang: "en", label: "English", src: null }]);
    // The earliest expiry is the Stream token: 12:40 plus 30 minutes
    expect(playback.expiresAt).toBe((nowSec + 760 + 30 * 60) * 1000);
  });

  it("signs the audio rendition, waveform and caption files, never the upload", async () => {
    const assets = [
      r2("RENDITION", "audio/abcdefghijklmnop/full.m4a", { variant: "m4a", mimeType: "audio/mp4" }),
      r2("WAVEFORM", "derived/abcdefghijklmnop/waveform/peaks.json"),
      r2("CAPTION", "derived/abcdefghijklmnop/captions/es.vtt", { lang: "es" }),
      r2("ORIGINAL", "incoming/abcdefghijklmnop/original.mp3", { scanStatus: "PENDING" }),
    ];
    const playback = await buildPlayback(item("AUDIO"), assets, "private", now);
    expect(tokenOf(playback.audio!.src)).toMatchObject({
      k: "audio/abcdefghijklmnop/full.m4a",
      dl: 0,
    });
    expect(tokenOf(playback.audio!.waveform!)?.r).toBe("waveform");
    expect(playback.captions).toHaveLength(1);
    expect(playback.captions[0]!.label).toBe("Spanish");
    expect(JSON.stringify(playback)).not.toContain("incoming/");
  });

  it("builds a srcset from the WebP renditions of an image", async () => {
    const assets = [320, 640, 1280].map(width =>
      r2("RENDITION", `derived/abcdefghijklmnop/item/${width}.webp`, {
        variant: `${width}.webp`,
        width,
        height: width / 2,
      })
    );
    assets.push(
      r2("RENDITION", "derived/abcdefghijklmnop/item/full.webp", {
        variant: "full.webp",
        width: 4000,
      })
    );
    const playback = await buildPlayback(
      item("IMAGE", { durationMs: null }),
      assets,
      "public",
      now
    );
    expect(tokenOf(playback.image!.src)?.k).toContain("/1280.webp");
    expect(playback.image!.srcSet.split(", ")).toHaveLength(4);
    expect(playback.image!.width).toBe(1280);
  });

  it("serves the PDF and its page images, but no reader file for an EPUB", async () => {
    const pages = ["p1", "p2"].map(p =>
      r2("PAGE_PREVIEW", `derived/abcdefghijklmnop/page/${p}.webp`, { variant: p })
    );
    const pdf = await buildPlayback(
      item("DOCUMENT", { pageCount: 18 }),
      [
        r2("ORIGINAL", "originals/abcdefghijklmnop/original.pdf", {
          scanStatus: "CLEAN",
          mimeType: "application/pdf",
        }),
        ...pages,
      ],
      "public",
      now
    );
    expect(pdf.document).toMatchObject({ format: "pdf", pageCount: 18 });
    expect(pdf.document!.pages).toHaveLength(2);
    expect(tokenOf(pdf.document!.src!)?.k).toBe("originals/abcdefghijklmnop/original.pdf");
    const epub = await buildPlayback(
      item("DOCUMENT"),
      [
        r2("ORIGINAL", "originals/abcdefghijklmnop/original.epub", {
          scanStatus: "CLEAN",
          mimeType: "application/epub+zip",
        }),
      ],
      "public",
      now
    );
    expect(epub.document).toMatchObject({ format: "epub", src: null });
  });

  it("refuses an item with nothing to play", async () => {
    await expect(buildPlayback(item("VIDEO"), [], "public", now)).rejects.toBeInstanceOf(
      DeliveryError
    );
    await expect(
      buildPlayback(
        item("AUDIO"),
        [r2("RENDITION", "audio/x/full.m4a", { scanStatus: "INFECTED" })],
        "public",
        now
      )
    ).rejects.toBeInstanceOf(DeliveryError);
  });
});

describe("buildDownload (decision 24)", () => {
  it("gives a 2 minute, single use attachment link for an R2 file", async () => {
    const download = await buildDownload(
      item("FILE", { allowDownload: true, title: "Field kit: presets / v2" }),
      [r2("ORIGINAL", "originals/abcdefghijklmnop/original.zip", { scanStatus: "CLEAN" })],
      now
    );
    const payload = tokenOf(download.url)!;
    expect(payload).toMatchObject({ dl: 1, fn: "Field kit presets v2.zip" });
    expect(payload.j).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(payload.exp - nowSec).toBe(120);
    expect(download.expiresAt).toBe((nowSec + 120) * 1000);
  });

  it("uses Stream's MP4 for video and refuses when downloads are off", async () => {
    const stream = { ...r2("STREAM", ""), storage: "STREAM", r2Key: null, streamUid: "u1" };
    const download = await buildDownload(item("VIDEO", { allowDownload: true }), [stream], now);
    expect(download.url).toMatch(/\/downloads\/default\.mp4$/);
    expect(download.fileName).toBe("Point Reyes new moon session.mp4");
    await expect(buildDownload(item("VIDEO"), [stream], now)).rejects.toMatchObject({
      reason: "no_download",
    });
  });

  it("keeps file names to safe characters", () => {
    expect(downloadFileName("../../etc/passwd", "txt")).toBe("etcpasswd.txt");
    expect(downloadFileName("", "pdf")).toBe("download.pdf");
    expect(downloadFileName("Café menu", "p d f")).toBe("Cafe menu.pdf");
  });
});
