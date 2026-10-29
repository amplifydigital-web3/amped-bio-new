/**
 * TON safe mode (Build Board #2, spec r3 3.7, decision tg-miniapp-allowlist). Walks every
 * block type and every link and media platform: only the allow list may render inside the
 * Mini App, and no Mini App string names a non TON asset, a stake or a return.
 */
import { describe, it, expect } from "vitest";
import {
  CRYPTO_PLATFORMS,
  TELEGRAM_MINIAPP_BLOCK_KINDS,
  TELEGRAM_MINIAPP_STRINGS,
  allowedPlatforms,
  collectTelegramCopy,
  isCryptoLinkUrl,
  isMiniAppSafeBlock,
  mediaPlataforms,
  miniAppBannedWord,
  type BlockType,
} from "@repo/constants";

// Every block type. A new type fails to compile here until it is placed on one side.
const ALL_BLOCK_TYPES: Record<BlockType["type"], "allowed" | "skipped"> = {
  text: "allowed",
  link: "allowed",
  media: "allowed",
  follow: "allowed",
  followers: "allowed",
  telegram_message: "allowed",
  telegram_group: "allowed",
  pool: "skipped",
  referral: "skipped",
  rnsid: "skipped",
};

// Platforms that are not crypto and may render. Every other platform must be in CRYPTO_PLATFORMS.
const SAFE_PLATFORMS = new Set([
  "twitter",
  "telegram",
  "discord",
  "instagram",
  "facebook",
  "tiktok",
  "element",
  "github",
  "linkedin",
  "medium",
  "youtube",
  "patreon",
  "onlyfans",
  "appstore",
  "playstore",
  "email",
  "document",
  "custom",
  "vimeo",
  "spotify",
  "substack",
  "twitch",
]);

describe("tonSafeRender", () => {
  it("renders only the allow list, block type by block type", () => {
    for (const [type, side] of Object.entries(ALL_BLOCK_TYPES)) {
      const safe = isMiniAppSafeBlock({ type, config: {} } as never);
      expect(`${type}: ${safe}`).toBe(`${type}: ${side === "allowed"}`);
      expect((TELEGRAM_MINIAPP_BLOCK_KINDS as readonly string[]).includes(type)).toBe(
        side === "allowed"
      );
    }
  });

  it("skips every crypto platform for links and media, and a block type it has never seen", () => {
    for (const platform of [...allowedPlatforms, ...mediaPlataforms]) {
      const crypto = (CRYPTO_PLATFORMS as readonly string[]).includes(platform);
      expect(crypto || SAFE_PLATFORMS.has(platform)).toBe(true);
      for (const type of ["link", "media"]) {
        expect(isMiniAppSafeBlock({ type, config: { platform } } as never)).toBe(!crypto);
      }
    }
    expect(isMiniAppSafeBlock({ type: "store", config: {} } as never)).toBe(false);
    expect(isMiniAppSafeBlock({ type: "text", config: {}, adult: true } as never)).toBe(false);
  });

  it("skips links to exchanges, NFT markets, explorers and Amped pool pages", () => {
    for (const url of [
      "https://opensea.io/collection/x",
      "app.uniswap.org/swap",
      "https://basescan.org/address/0x1",
      "https://amped.bio/i/pools/0xabc",
    ]) {
      expect(isCryptoLinkUrl(url)).toBe(true);
      expect(
        isMiniAppSafeBlock({ type: "link", config: { platform: "custom", url } } as never)
      ).toBe(false);
    }
    expect(isCryptoLinkUrl("https://amped.bio/maya")).toBe(false);
  });

  it("finds the banned words as words, not inside other words", () => {
    expect(miniAppBannedWord("Join my pool")).toBe("pool");
    expect(miniAppBannedWord("tREVO drops")).toBe("trevo");
    expect(miniAppBannedWord("Poolside sessions")).toBeNull();
    expect(miniAppBannedWord("Made with Amped.Bio")).toBeNull();
  });

  it("no Mini App string names a non TON asset, a stake or a return", () => {
    for (const text of collectTelegramCopy(TELEGRAM_MINIAPP_STRINGS)) {
      expect(`${miniAppBannedWord(text)} in "${text}"`).toBe(`null in "${text}"`);
    }
  });
});
