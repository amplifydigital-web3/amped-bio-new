/**
 * Messaging on Telegram (Build Board #2), PR 4: the two Telegram block types (spec
 * decision 14, Screen Review 115). Config validation, one of each per page, and the
 * public door: the page learns whether the door is open and the rule kind, never a
 * Telegram username, a Telegram id or a stake amount (spec 3.8, 3.11b).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    block: { findFirst: fn(), create: fn(), findMany: fn(), update: fn(), delete: fn() },
    creatorMessagingSettings: { findUnique: fn() },
    $transaction: fn(),
  };
});
vi.mock("@repo/database", () => ({ prisma: db }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
const bot = vi.hoisted(() => ({ username: "AmpedBioStagingBot" as string | null }));
vi.mock("../services/telegram/client", () => ({
  getBotUsername: vi.fn(async () => bot.username),
  getTelegramBot: () => null,
  isTelegramConfigured: () => true,
}));

import {
  DEFAULT_TELEGRAM_MESSAGE_LABEL,
  SINGLETON_BLOCK_TYPES,
  TELEGRAM_BLOCK_LABEL_MAX,
  blockConfigSchemaFor,
} from "@repo/constants";
import { env } from "../env";
import { blocksRouter } from "../trpc/blocks";
import { sanitizeBlockConfig } from "../utils/sanitizeBlockConfig";
import { telegramDoor } from "../services/messaging/door";

const caller = blocksRouter.createCaller({ user: { sub: 42 } } as never);

function settings(over: Record<string, unknown> = {}) {
  return {
    userId: 42,
    enabled: true,
    ruleKind: "FOLLOWER",
    stakeMin: null,
    dailyNewThreadCap: 50,
    replyFromTelegram: true,
    invitedAt: new Date(),
    pausedAt: null,
    pausedReason: null,
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bot.username = "AmpedBioStagingBot";
  Object.assign(env, { TELEGRAM_ENABLED: true, MESSAGING_INVITE_ONLY: true });
  db.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof db) => unknown)(db) : Promise.all(arg as [])
  );
});

describe("config schemas", () => {
  it("both types are singletons with a label from 1 to 40 characters", () => {
    expect(SINGLETON_BLOCK_TYPES).toEqual(
      expect.arrayContaining(["telegram_message", "telegram_group"])
    );
    const schema = blockConfigSchemaFor("telegram_message");
    expect(schema.parse({})).toEqual({ label: DEFAULT_TELEGRAM_MESSAGE_LABEL });
    expect(schema.safeParse({ label: "  " }).success).toBe(false);
    expect(schema.safeParse({ label: "x".repeat(TELEGRAM_BLOCK_LABEL_MAX + 1) }).success).toBe(
      false
    );
    expect(blockConfigSchemaFor("telegram_group").parse({ label: "Join us" })).toEqual({
      label: "Join us",
    });
  });
});

describe("sanitizeBlockConfig", () => {
  it("keeps only the label and hidden, so no username or rule text is stored or served", () => {
    const out = sanitizeBlockConfig("telegram_message", {
      label: "Write to me",
      hidden: true,
      username: "maya_private",
      rule: "Fans with 5000 tREVO",
    });
    expect(out).toEqual({ label: "Write to me", hidden: true });
  });

  it("falls back to the default label when the stored one is invalid", () => {
    expect(sanitizeBlockConfig("telegram_message", { label: "", hidden: true })).toEqual({
      label: DEFAULT_TELEGRAM_MESSAGE_LABEL,
      hidden: true,
    });
  });
});

describe("addBlock", () => {
  it("refuses a second Message me on Telegram block", async () => {
    db.block.findFirst.mockResolvedValue({ id: 1, user_id: 42, type: "telegram_message" });
    await expect(
      caller.addBlock({ type: "telegram_message", config: { label: "Again" } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "This block is already on your page" });
    expect(db.block.create).not.toHaveBeenCalled();
  });

  it("stores the first one with the sanitized config", async () => {
    db.block.findFirst.mockResolvedValue(null);
    db.block.create.mockResolvedValue({ id: 9, type: "telegram_message" });
    await caller.addBlock({
      type: "telegram_message",
      config: { label: "Message me", username: "maya_private" },
    });
    expect(db.block.create.mock.calls[0]![0].data.config).toEqual({ label: "Message me" });
  });
});

describe("telegramDoor (the public page's view of the block)", () => {
  it("is open with the rule kind and the bot, and never carries an amount or a username", async () => {
    db.creatorMessagingSettings.findUnique.mockResolvedValue(
      settings({ ruleKind: "STAKE_MIN", stakeMin: "250000" })
    );
    const door = await telegramDoor(42);
    expect(door).toEqual({
      open: true,
      ruleKind: "STAKE_MIN",
      botUsername: "AmpedBioStagingBot",
    });
    expect(JSON.stringify(door)).not.toContain("250000");
  });

  it("is closed when messages are off, paused, not invited, or Telegram is off", async () => {
    db.creatorMessagingSettings.findUnique.mockResolvedValue(settings({ enabled: false }));
    expect((await telegramDoor(42)).open).toBe(false);
    db.creatorMessagingSettings.findUnique.mockResolvedValue(settings({ pausedAt: new Date() }));
    expect((await telegramDoor(42)).open).toBe(false);
    db.creatorMessagingSettings.findUnique.mockResolvedValue(settings({ invitedAt: null }));
    expect((await telegramDoor(42)).open).toBe(false);
    db.creatorMessagingSettings.findUnique.mockResolvedValue(settings());
    Object.assign(env, { TELEGRAM_ENABLED: false });
    expect(await telegramDoor(42)).toEqual({
      open: false,
      ruleKind: "FOLLOWER",
      botUsername: null,
    });
  });

  it("is closed while the bot username is unknown, since the button needs a deep link", async () => {
    bot.username = null;
    db.creatorMessagingSettings.findUnique.mockResolvedValue(settings());
    expect((await telegramDoor(42)).open).toBe(false);
  });
});
