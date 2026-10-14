/**
 * Messaging on Telegram (Build Board #2), acceptance 18: every string in
 * packages/constants/src/telegram.ts passes the compliance copy check, and the
 * check itself catches the phrases it exists for.
 */
import { describe, it, expect } from "vitest";
import {
  DM_RULE_LABELS,
  TELEGRAM_BOT_COMMANDS,
  TELEGRAM_BOT_PROFILE,
  TELEGRAM_BOT_STRINGS,
  TESTNET_LINE,
  collectTelegramCopy,
} from "@repo/constants";
import { checkTelegramCopy } from "../../../../scripts/check-compliance-copy";

describe("Telegram copy compliance", () => {
  it("collects every product and bot string, template functions included", () => {
    const strings = collectTelegramCopy();
    expect(strings.length).toBeGreaterThan(80);
    expect(strings).toContain(TELEGRAM_BOT_STRINGS.help);
    expect(strings).toContain(TELEGRAM_BOT_STRINGS.dmReady("Maya Lin"));
    expect(strings).toContain(TELEGRAM_BOT_STRINGS.inlineCardLine(128));
  });

  it("passes the banned term list and the Telegram phrase list", () => {
    const hits = checkTelegramCopy(collectTelegramCopy());
    expect(hits).toEqual([]);
  });

  it("flags a reward, a yield, an amount next to tREVO and a Telegram verification claim", () => {
    const hits = checkTelegramCopy([
      "Earn tREVO by messaging",
      "Stake for APY",
      "Members with 500 tREVO staked",
      "Verified by Telegram",
      "Message all your fans",
    ]);
    const rules = hits.map(h => h.rule).sort();
    expect(rules).toContain("broadcast:returns");
    expect(rules).toContain("broadcast:yield");
    expect(rules).toContain("telegram:amount");
    expect(rules.filter(r => r === "telegram:phrase")).toHaveLength(2);
  });

  it("exempts the verbatim testnet line by exact match only", () => {
    expect(checkTelegramCopy([TESTNET_LINE])).toEqual([]);
    expect(checkTelegramCopy([`${TESTNET_LINE} Rewards grow daily.`]).length).toBeGreaterThan(0);
  });

  it("keeps the BotFather profile fields within Telegram's limits", () => {
    expect(TELEGRAM_BOT_PROFILE.name.length).toBeLessThanOrEqual(64);
    expect(TELEGRAM_BOT_PROFILE.about.length).toBeLessThanOrEqual(120);
    expect(TELEGRAM_BOT_PROFILE.description.length).toBeLessThanOrEqual(512);
    expect(TELEGRAM_BOT_PROFILE.inlinePlaceholder.length).toBeLessThanOrEqual(64);
    for (const command of TELEGRAM_BOT_COMMANDS) {
      expect(command.command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(command.description.length).toBeGreaterThanOrEqual(3);
      expect(command.description.length).toBeLessThanOrEqual(256);
    }
  });

  it("uses the Memberships vocabulary: Members means paid, Pool fans means stakers", () => {
    expect(DM_RULE_LABELS.PAID_MEMBER).toBe("Members only");
    expect(DM_RULE_LABELS.POOL_MEMBER).toBe("Pool fans only");
    expect(DM_RULE_LABELS.STAKE_MIN).toBe("Fans with a minimum stake");
  });

  it("never shows a creator's Telegram username on a public surface", () => {
    const publicStrings = [
      TELEGRAM_BOT_STRINGS.inlineCardLine(128),
      TELEGRAM_BOT_PROFILE.description,
    ];
    for (const s of publicStrings) expect(s).not.toMatch(/@\w+/);
  });
});
