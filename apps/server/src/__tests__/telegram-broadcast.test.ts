/**
 * Messaging on Telegram (Build Board #2), PR 2: Broadcast on Telegram (spec 3.5
 * channel adapter, acceptance 2 and 3). Who is eligible, idempotent fan-out to
 * the outbox, the rendered message, and the send job's outcomes. The database
 * and the bot are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GrammyError } from "grammy";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    telegramAccount: { findMany: fn(), findUnique: fn(), update: fn() },
    telegramLinkEvent: { create: fn() },
    notificationPreference: { findMany: fn() },
    broadcast: { findUnique: fn() },
    broadcastDelivery: { findMany: fn(), findUnique: fn(), update: fn(), updateMany: fn() },
    telegramOutbox: { createMany: fn() },
    $transaction: fn(),
  };
});
vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));

const bot = vi.hoisted(() => ({ sendMessage: vi.fn(), configured: true }));
vi.mock("../services/telegram/client", () => ({
  isTelegramConfigured: () => bot.configured,
  getTelegramBot: () => ({ api: { sendMessage: bot.sendMessage } }),
}));

import {
  broadcastBodyToTelegramHtml,
  enqueueTelegramBroadcast,
  renderTelegramBroadcast,
  sendTelegramBroadcastJob,
  telegramEligibleRecipients,
} from "../services/telegram/broadcast";
import { TELEGRAM_LIMITS } from "@repo/constants";

const CREATOR = 3;
const future = new Date(Date.now() + 86_400_000);

beforeEach(() => {
  vi.clearAllMocks();
  bot.configured = true;
  db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("telegramEligibleRecipients", () => {
  // Users 1..6, each linked and reachable; preferences vary
  beforeEach(() => {
    db.telegramAccount.findMany.mockResolvedValue(
      [1, 2, 3, 4, 5].map(userId => ({ userId, telegramUserId: BigInt(1000 + userId) }))
    );
    db.notificationPreference.findMany.mockResolvedValue([
      { userId: 1, creatorUserId: 0, telegramEnabled: true, mutedUntil: null },
      { userId: 2, creatorUserId: 0, telegramEnabled: null, mutedUntil: null },
      { userId: 3, creatorUserId: 0, telegramEnabled: true, mutedUntil: null },
      { userId: 3, creatorUserId: CREATOR, telegramEnabled: false, mutedUntil: null },
      { userId: 4, creatorUserId: 0, telegramEnabled: true, mutedUntil: null },
      { userId: 4, creatorUserId: CREATOR, telegramEnabled: null, mutedUntil: future },
      { userId: 5, creatorUserId: 0, telegramEnabled: true, mutedUntil: null },
      { userId: 5, creatorUserId: CREATOR, telegramEnabled: null, mutedUntil: null },
    ]);
  });

  it("needs the global opt in, no creator off switch and no mute", async () => {
    const eligible = await telegramEligibleRecipients(CREATOR, [1, 2, 3, 4, 5, 6]);
    expect([...eligible.keys()].sort()).toEqual([1, 5]);
    expect(eligible.get(1)).toBe(1001n);
  });

  it("only asks for reachable links (bot access, not blocked)", async () => {
    await telegramEligibleRecipients(CREATOR, [1]);
    expect(db.telegramAccount.findMany.mock.calls[0]![0].where).toMatchObject({
      botAccess: true,
      blockedAt: null,
    });
  });
});

describe("enqueueTelegramBroadcast", () => {
  const sent = {
    id: 9,
    creatorUserId: CREATOR,
    sendTelegram: true,
    status: "SENT",
    flaggedTerms: null,
  };

  it("does nothing when the creator did not tick Telegram, or the broadcast was flagged", async () => {
    db.broadcast.findUnique.mockResolvedValueOnce({ ...sent, sendTelegram: false });
    expect(await enqueueTelegramBroadcast(9)).toBe(0);
    db.broadcast.findUnique.mockResolvedValueOnce({ ...sent, flaggedTerms: [{ phrase: "yield" }] });
    expect(await enqueueTelegramBroadcast(9)).toBe(0);
    expect(db.broadcastDelivery.findMany).not.toHaveBeenCalled();
  });

  it("does nothing while Telegram is off", async () => {
    bot.configured = false;
    expect(await enqueueTelegramBroadcast(9)).toBe(0);
    expect(db.broadcast.findUnique).not.toHaveBeenCalled();
  });

  it("queues one outbox row per eligible delivery and flips it to PENDING in one transaction", async () => {
    db.broadcast.findUnique.mockResolvedValue(sent);
    db.broadcastDelivery.findMany
      .mockResolvedValueOnce([
        { id: 11, userId: 1 },
        { id: 12, userId: 2 },
      ])
      .mockResolvedValueOnce([]);
    db.telegramAccount.findMany.mockResolvedValue([{ userId: 1, telegramUserId: 1001n }]);
    db.notificationPreference.findMany.mockResolvedValue([
      { userId: 1, creatorUserId: 0, telegramEnabled: true, mutedUntil: null },
    ]);
    expect(await enqueueTelegramBroadcast(9)).toBe(1);
    expect(db.broadcastDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [11] }, telegramStatus: "NOT_ELIGIBLE" },
      data: { telegramStatus: "PENDING" },
    });
    const rows = db.telegramOutbox.createMany.mock.calls[0]![0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "broadcast",
      priority: 3,
      chatId: 1001n,
      deliveryId: 11,
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    // Re-running only looks at deliveries still NOT_ELIGIBLE
    expect(db.broadcastDelivery.findMany.mock.calls[0]![0].where.telegramStatus).toBe(
      "NOT_ELIGIBLE"
    );
  });
});

describe("rendering", () => {
  it("escapes user text and keeps the Markdown subset as Telegram HTML", () => {
    expect(
      broadcastBodyToTelegramHtml("**New** <script> & [tour](https://amped.bio/t?a=1&b=2)")
    ).toBe('<b>New</b> &lt;script&gt; &amp; <a href="https://amped.bio/t?a=1&amp;b=2">tour</a>');
  });

  it("carries the creator, the title, the fixed footer and the bot footer", () => {
    const text = renderTelegramBroadcast({ creatorName: "Maya", title: "Tour", body: "Hello" });
    expect(text.startsWith("<b>Maya: Tour</b>")).toBe(true);
    expect(text).toContain(
      "Maya wrote this message. Amped.Bio delivers it and does not endorse it."
    );
    expect(text).toContain("Sent through Amped.Bio.");
  });

  it("stays inside Telegram's message limit for a 5,000 character body", () => {
    const text = renderTelegramBroadcast({
      creatorName: "M",
      title: "T",
      body: "word ".repeat(1000),
    });
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain("Sent through Amped.Bio.");
  });
});

describe("sendTelegramBroadcastJob", () => {
  const job = (over: Record<string, unknown> = {}) =>
    ({ id: Buffer.alloc(16), kind: "broadcast", deliveryId: 11, attempts: 1, ...over }) as never;
  const delivery = {
    id: 11,
    userId: 1,
    telegramStatus: "PENDING",
    broadcast: {
      title: "Tour",
      body: "Dates are up.",
      status: "SENT",
      creatorUserId: CREATOR,
      creator: { name: "Maya" },
    },
  };

  beforeEach(() => {
    db.broadcastDelivery.findUnique.mockResolvedValue(delivery);
    db.telegramAccount.findMany.mockResolvedValue([{ userId: 1, telegramUserId: 1001n }]);
    db.notificationPreference.findMany.mockResolvedValue([
      { userId: 1, creatorUserId: 0, telegramEnabled: true, mutedUntil: null },
    ]);
  });

  it("sends HTML with one button and records SENT with the message id", async () => {
    bot.sendMessage.mockResolvedValue({ message_id: 77 });
    await sendTelegramBroadcastJob(job());
    const [chatId, text, opts] = bot.sendMessage.mock.calls[0]!;
    expect(chatId).toBe(1001);
    expect(text).toContain("<b>Maya: Tour</b>");
    expect(opts.parse_mode).toBe("HTML");
    expect(opts.reply_markup.inline_keyboard[0][0].text).toBe("Open on Amped.Bio");
    expect(db.broadcastDelivery.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { telegramStatus: "SENT", tgMessageId: 77n },
    });
  });

  it("a fan who turned updates off since fan-out gets nothing", async () => {
    db.notificationPreference.findMany.mockResolvedValue([
      { userId: 1, creatorUserId: 0, telegramEnabled: false, mutedUntil: null },
    ]);
    await sendTelegramBroadcastJob(job());
    expect(bot.sendMessage).not.toHaveBeenCalled();
    expect(db.broadcastDelivery.update.mock.calls[0]![0].data.telegramStatus).toBe("NOT_ELIGIBLE");
  });

  it("a 403 marks the link blocked and the delivery BLOCKED without retrying", async () => {
    bot.sendMessage.mockRejectedValue(
      new GrammyError(
        "blocked",
        { ok: false, error_code: 403, description: "Forbidden" } as never,
        "sendMessage",
        {}
      )
    );
    db.telegramAccount.findUnique.mockResolvedValue({
      id: Buffer.alloc(16),
      telegramUserId: 1001n,
      blockedAt: null,
    });
    await expect(sendTelegramBroadcastJob(job())).resolves.toBeUndefined();
    expect(db.telegramAccount.update.mock.calls[0]![0].data.blockedAt).toBeInstanceOf(Date);
    expect(db.broadcastDelivery.update.mock.calls.at(-1)![0].data.telegramStatus).toBe("BLOCKED");
  });

  it("other errors rethrow for the loop to retry, and the last attempt records FAILED", async () => {
    bot.sendMessage.mockRejectedValue(new Error("network"));
    await expect(sendTelegramBroadcastJob(job())).rejects.toThrow("network");
    expect(db.broadcastDelivery.update).not.toHaveBeenCalled();
    await expect(
      sendTelegramBroadcastJob(job({ attempts: TELEGRAM_LIMITS.jobMaxAttempts }))
    ).rejects.toThrow();
    expect(db.broadcastDelivery.update.mock.calls.at(-1)![0].data.telegramStatus).toBe("FAILED");
  });

  it("a delivery already handled is skipped (no duplicate send)", async () => {
    db.broadcastDelivery.findUnique.mockResolvedValue({ ...delivery, telegramStatus: "SENT" });
    await sendTelegramBroadcastJob(job());
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });
});
