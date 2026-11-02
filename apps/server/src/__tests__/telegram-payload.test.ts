/**
 * Messaging on Telegram (Build Board #2), fix/telegram-pre-groups. Deep link payloads,
 * the Mini App allow list and the single testnet line (Telegram Full QA, 29 Oct:
 * F4, F5, F6; spec r3 3.5 and 3.7).
 */
import { describe, it, expect } from "vitest";
import {
  CRYPTO_PLATFORMS,
  TESTNET_LINE,
  TESTNET_NOTICE,
  TELEGRAM_LINK_CODE_REGEX,
  isMiniAppSafeBlock,
  parseTelegramStartPayload,
  telegramPayload,
} from "@repo/constants";

import { decodeLinkCode, encodeLinkCode } from "../services/telegram/linkCodes";

describe("deep link payloads", () => {
  it("fit Telegram's 64 character limit for the longest handle", () => {
    const code = encodeLinkCode(2_147_483_647);
    expect(TELEGRAM_LINK_CODE_REGEX.test(code)).toBe(true);
    for (const payload of [
      telegramPayload.message(code),
      telegramPayload.join(code),
      telegramPayload.page(code, encodeLinkCode(1)),
    ]) {
      expect(payload.length).toBeLessThanOrEqual(64);
      expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("parse back to what they encode", () => {
    expect(parseTelegramStartPayload("m_k7q2lm9x4a")).toEqual({
      kind: "message",
      code: "k7q2lm9x4a",
    });
    expect(parseTelegramStartPayload("j_k7q2lm9x4a")).toEqual({ kind: "join", code: "k7q2lm9x4a" });
    expect(parseTelegramStartPayload("p_k7q2lm9x4a_ab12cd34ef")).toEqual({
      kind: "page",
      code: "k7q2lm9x4a",
      sharerCode: "ab12cd34ef",
    });
    expect(parseTelegramStartPayload("p_k7q2lm9x4a")).toEqual({
      kind: "page",
      code: "k7q2lm9x4a",
      sharerCode: null,
    });
  });

  it("keep reading the older dm_{handle} links, including handles with _ref in them", () => {
    expect(parseTelegramStartPayload("dm_maya_ref")).toEqual({
      kind: "legacy_dm",
      handle: "maya_ref",
    });
    expect(parseTelegramStartPayload("dm_MayaLin")).toEqual({
      kind: "legacy_dm",
      handle: "MayaLin",
    });
  });

  it("read anything malformed as none", () => {
    for (const raw of [
      "",
      "m_short",
      "m_UPPERCASE1",
      "p_k7q2lm9x4a_x_y",
      "dm_Maya.Lin",
      "x".repeat(65),
    ]) {
      expect(parseTelegramStartPayload(raw)).toEqual({ kind: "none" });
    }
  });
});

describe("link codes", () => {
  it("are stable, 10 lowercase characters, and decode back to the id", () => {
    for (const id of [1, 2, 42, 99_999, 2_147_483_647]) {
      const code = encodeLinkCode(id);
      expect(code).toMatch(/^[a-z0-9]{10}$/);
      expect(encodeLinkCode(id)).toBe(code);
      expect(decodeLinkCode(code)).toBe(id);
    }
  });

  it("do not reveal the id order and reject malformed codes", () => {
    expect(encodeLinkCode(1)).not.toBe(encodeLinkCode(2));
    expect(decodeLinkCode("bad")).toBeNull();
    expect(decodeLinkCode("zzzzzzzzzz")).toBeNull();
  });
});

describe("Mini App allow list", () => {
  it("renders the listed kinds and skips everything else", () => {
    expect(
      isMiniAppSafeBlock({ type: "text", config: { content: "", platform: "" } } as never)
    ).toBe(true);
    expect(isMiniAppSafeBlock({ type: "follow", config: { label: "Follow" } } as never)).toBe(true);
    for (const type of [
      "pool",
      "referral",
      "rnsid",
      "paid_content",
      "store",
      "membership",
      "tip",
    ]) {
      expect(isMiniAppSafeBlock({ type, config: {} } as never)).toBe(false);
    }
  });

  it("skips link and media blocks on crypto platforms", () => {
    expect(CRYPTO_PLATFORMS).toContain("creator-pool");
    for (const platform of CRYPTO_PLATFORMS) {
      expect(isMiniAppSafeBlock({ type: "media", config: { platform } } as never)).toBe(false);
      expect(isMiniAppSafeBlock({ type: "link", config: { platform } } as never)).toBe(false);
    }
    expect(isMiniAppSafeBlock({ type: "media", config: { platform: "spotify" } } as never)).toBe(
      true
    );
  });

  it("never renders an 18+ block", () => {
    expect(isMiniAppSafeBlock({ type: "text", config: {}, adult: true } as never)).toBe(false);
  });
});

describe("testnet line", () => {
  it("is one string across Telegram and the rest of the product", () => {
    expect(TESTNET_LINE).toBe(TESTNET_NOTICE);
    expect(TESTNET_NOTICE).toBe(
      "Testnet only. Pool rewards come from the network, vary, and are not guaranteed."
    );
  });
});
