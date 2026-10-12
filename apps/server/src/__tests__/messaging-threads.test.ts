/**
 * Messaging on Telegram (Build Board #2), PR 3: conversations and delivery (spec 3.4,
 * 3.5; acceptance 6, 7, 8, 9). One thread per creator and fan, the Telegram copy for
 * the other side through the outbox, replies both ways, and blocks that stop both
 * directions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GrammyError } from "grammy";

const fake = vi.hoisted(() => ({ db: null as any }));
vi.mock("@repo/database", async () => {
  const helper = await import("./helpers/fakeMessagingDb");
  fake.db = helper.createFakeDb();
  return {
    prisma: fake.db.client,
    Prisma: helper.fakePrismaNamespace,
    withNumericIdCoercion: (client: unknown) => client,
  };
});
const tg = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock("../services/telegram/client", () => ({
  isTelegramConfigured: () => true,
  getTelegramBot: () => ({ api: { sendMessage: tg.sendMessage } }),
}));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: async () => null }));
vi.mock("../utils/rateLimit", () => ({ enforceRateLimits: vi.fn(), hitRateLimit: vi.fn() }));

import { env } from "../env";
import { idToHex } from "../services/analytics/ids";
import {
  MessagingInputError,
  creatorBlock,
  fanBlock,
  sendCreatorReply,
  sendFanMessage,
} from "../services/messaging/threads";
import { deliverDmJob } from "../services/messaging/delivery";
import { messagingFanRouter } from "../trpc/messaging/fan";
import {
  JORDAN,
  MAYA,
  follow,
  linkTelegram,
  openMessages,
  outboxRows,
  seedPeople,
} from "./helpers/messagingFixtures";

const threads = () => fake.db.table("messageThread");
const messages = () => fake.db.table("message");
const job = (row: any) => ({ ...row, attempts: 1 }) as never;

async function fanSays(body: string, extra: Record<string, unknown> = {}) {
  return sendFanMessage({ fanUserId: JORDAN, creatorUserId: MAYA, body, channel: "WEB", ...extra });
}

beforeEach(() => {
  fake.db.reset();
  tg.sendMessage.mockReset();
  tg.sendMessage.mockResolvedValue({ message_id: 501 });
  seedPeople(fake.db);
  openMessages(fake.db, MAYA, { ruleKind: "FOLLOWER" });
  follow(fake.db, JORDAN, MAYA);
  linkTelegram(fake.db, MAYA, 9001);
  linkTelegram(fake.db, JORDAN, 9002);
  Object.assign(env, { MESSAGING_INVITE_ONLY: true, APP_URL: "https://app.staging.amped.bio" });
});

describe("a fan writes", () => {
  it("creates one thread, stores the message and queues the creator's Telegram copy", async () => {
    const first = await fanSays("Loved the set");
    await fanSays("When is the next one?");
    expect(threads()).toHaveLength(1);
    expect(first.newThread).toBe(true);
    expect(threads()[0]).toMatchObject({ creatorUnread: 2, fanUnread: 0, status: "OPEN" });
    expect(messages().map((m: any) => m.sender)).toEqual(["FAN", "FAN"]);
    const rows = outboxRows(fake.db, "dm");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ priority: 0, payload: { to: "creator" } });
  });

  it("a repeat with the same idempotency key returns the first message", async () => {
    const a = await fanSays("Hi", { idempotencyKey: "key-12345" });
    const b = await fanSays("Hi", { idempotencyKey: "key-12345" });
    expect(idToHex(b.message.id)).toBe(idToHex(a.message.id));
    expect(messages()).toHaveLength(1);
  });

  it("refuses an empty or over long body", async () => {
    await expect(fanSays("   ")).rejects.toBeInstanceOf(MessagingInputError);
    await expect(fanSays("x".repeat(2001))).rejects.toMatchObject({ code: "too_long" });
  });
});

describe("delivery to the creator's Telegram (acceptance 6)", () => {
  it("sends '@fan (Follower): text' with Open thread and stores the forward id", async () => {
    await fanSays("Loved the set");
    await deliverDmJob(job(outboxRows(fake.db, "dm")[0]));
    const [chatId, text, opts] = tg.sendMessage.mock.calls[0]!;
    expect(chatId).toBe(9001);
    expect(text).toBe("@jordan (Follower): Loved the set");
    expect(opts.reply_markup.inline_keyboard[0][0].url).toBe(
      `https://app.staging.amped.bio/inbox?t=${idToHex(threads()[0].id)}`
    );
    expect(messages()[0]).toMatchObject({ tgForwardMessageId: 501n });
    // Delivered once: running the job again sends nothing
    await deliverDmJob(job(outboxRows(fake.db, "dm")[0]));
    expect(tg.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("stays in the Amped inbox when Reply from Telegram is off or the thread is muted", async () => {
    fake.db.table("creatorMessagingSettings")[0].replyFromTelegram = false;
    await fanSays("one");
    await deliverDmJob(job(outboxRows(fake.db, "dm")[0]));
    fake.db.table("creatorMessagingSettings")[0].replyFromTelegram = true;
    threads()[0].mutedUntil = new Date(Date.now() + 86_400_000);
    await fanSays("two");
    await deliverDmJob(job(outboxRows(fake.db, "dm")[1]));
    expect(tg.sendMessage).not.toHaveBeenCalled();
  });
});

describe("the creator replies (acceptance 7, 8)", () => {
  it("a web reply reaches a reachable fan as '{creator} replied: text'", async () => {
    await fanSays("Hi");
    const thread = threads()[0];
    await sendCreatorReply({
      creatorUserId: MAYA,
      threadId: thread.id,
      body: "Thanks!",
      channel: "WEB",
    });
    const toFan = outboxRows(fake.db, "dm").find((r: any) => r.payload.to === "fan");
    await deliverDmJob(job(toFan));
    expect(tg.sendMessage).toHaveBeenCalledWith(
      9002,
      "Maya Lin replied: Thanks!",
      expect.anything()
    );
    expect(thread).toMatchObject({ fanUnread: 1, creatorUnread: 0 });
  });

  it("a fan who cannot be reached keeps the reply on the web, marked not_reachable", async () => {
    await fanSays("Hi");
    fake.db.table("telegramAccount").find((a: any) => a.userId === JORDAN).blockedAt = new Date();
    await sendCreatorReply({
      creatorUserId: MAYA,
      threadId: threads()[0].id,
      body: "Thanks",
      channel: "WEB",
    });
    await deliverDmJob(job(outboxRows(fake.db, "dm").find((r: any) => r.payload.to === "fan")));
    expect(tg.sendMessage).not.toHaveBeenCalled();
    expect(messages().find((m: any) => m.sender === "CREATOR")).toMatchObject({
      failedReason: "not_reachable",
    });
  });

  it("a 403 marks the link blocked and the message not_reachable", async () => {
    await fanSays("Hi");
    await sendCreatorReply({
      creatorUserId: MAYA,
      threadId: threads()[0].id,
      body: "Thanks",
      channel: "WEB",
    });
    tg.sendMessage.mockRejectedValue(
      new GrammyError(
        "blocked",
        { ok: false, error_code: 403, description: "Forbidden" } as never,
        "sendMessage",
        {}
      )
    );
    await deliverDmJob(job(outboxRows(fake.db, "dm").find((r: any) => r.payload.to === "fan")));
    expect(
      fake.db.table("telegramAccount").find((a: any) => a.userId === JORDAN).blockedAt
    ).toBeInstanceOf(Date);
    expect(messages().find((m: any) => m.sender === "CREATOR").failedReason).toBe("not_reachable");
  });

  it("another creator cannot reply into the thread", async () => {
    await fanSays("Hi");
    await expect(
      sendCreatorReply({ creatorUserId: 4, threadId: threads()[0].id, body: "x", channel: "WEB" })
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("blocks stop both directions (acceptance 9)", () => {
  it("a creator block refuses the fan, closes pending copies and tells the fan once", async () => {
    await fanSays("Hi");
    await creatorBlock(MAYA, threads()[0].id);
    await creatorBlock(MAYA, threads()[0].id);
    const notices = outboxRows(fake.db, "notice");
    expect(notices).toHaveLength(1);
    expect(notices[0].payload.text).toBe("Maya Lin has closed messages from you.");
    await expect(fanSays("Hello?")).rejects.toMatchObject({ reason: "blocked" });
    // The copy queued before the block is not delivered
    await deliverDmJob(job(outboxRows(fake.db, "dm")[0]));
    expect(tg.sendMessage).not.toHaveBeenCalled();
    expect(messages()[0].failedReason).toBe("thread_closed");
    await expect(
      sendCreatorReply({
        creatorUserId: MAYA,
        threadId: threads()[0].id,
        body: "x",
        channel: "WEB",
      })
    ).rejects.toMatchObject({ code: "thread_closed" });
  });

  it("a fan block stops replies; the fan's next message opens the thread again", async () => {
    await fanSays("Hi");
    await fanBlock(JORDAN, threads()[0].id);
    await expect(
      sendCreatorReply({
        creatorUserId: MAYA,
        threadId: threads()[0].id,
        body: "x",
        channel: "WEB",
      })
    ).rejects.toMatchObject({ code: "thread_closed" });
    await fanSays("Back again");
    expect(threads()[0].status).toBe("OPEN");
  });
});

describe("messaging.fan router", () => {
  const caller = messagingFanRouter.createCaller({ user: { sub: JORDAN } } as never);

  it("send refuses with the rule copy when the fan does not qualify", async () => {
    fake.db.table("follow").length = 0;
    await expect(
      caller.send({ creatorUserId: MAYA, body: "Hi", idempotencyKey: "key-123456" })
    ).rejects.toThrow("Maya Lin takes messages from followers and members. Follow them to write.");
  });

  it("canMessage names the reason and the copy", async () => {
    fake.db.table("follow").length = 0;
    expect(await caller.canMessage({ creatorUserId: MAYA })).toMatchObject({
      allowed: false,
      reason: "not_follower",
    });
  });

  it("getThread is the fan's own thread only, and clears the fan's unread count", async () => {
    await fanSays("Hi");
    await new Promise(resolve => setTimeout(resolve, 5));
    await sendCreatorReply({
      creatorUserId: MAYA,
      threadId: threads()[0].id,
      body: "Yo",
      channel: "WEB",
    });
    const id = idToHex(threads()[0].id);
    const view = await caller.getThread({ threadId: id });
    expect(view.messages.map(m => m.body)).toEqual(["Hi", "Yo"]);
    expect(threads()[0].fanUnread).toBe(0);
    const stranger = messagingFanRouter.createCaller({ user: { sub: 3 } } as never);
    await expect(stranger.getThread({ threadId: id })).rejects.toThrow("Conversation not found.");
  });
});
