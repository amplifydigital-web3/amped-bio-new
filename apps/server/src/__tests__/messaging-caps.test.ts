/**
 * Messaging on Telegram (Build Board #2), PR 3: caps and automatic pauses (spec 3.9;
 * acceptance 10). 20 messages per creator per hour and 200 a day per fan; the
 * creator's daily cap on new conversations; a fan blocked by 3 creators in 7 days
 * pauses for 24 hours; fan reports at 1% of a creator's active threads (minimum 5)
 * pause the creator's Fan messages.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
vi.mock("../services/telegram/client", () => ({
  isTelegramConfigured: () => false,
  getTelegramBot: () => null,
}));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: async () => null }));

import { env } from "../env";
import { uuidv7 } from "../utils/uuid-v7";
import { canMessage, senderPaused } from "../services/messaging/access";
import { creatorBlock, reportThread, sendFanMessage } from "../services/messaging/threads";
import { ANA, JORDAN, MAYA, SAM, openMessages, seedPeople } from "./helpers/messagingFixtures";

const send = (fanUserId: number, creatorUserId: number, body = "hi") =>
  sendFanMessage({ fanUserId, creatorUserId, body, channel: "WEB" });

function addUser(id: number) {
  fake.db.table("user").push({
    id,
    name: `User ${id}`,
    handle: `user${id}`,
    page_status: "PUBLISHED",
    block: "no",
    email_verified: true,
  });
}

beforeEach(() => {
  fake.db.reset();
  seedPeople(fake.db);
  openMessages(fake.db, MAYA);
  Object.assign(env, { MESSAGING_INVITE_ONLY: true });
});

describe("fan caps", () => {
  it("refuses the 21st message to one creator in an hour", async () => {
    for (let i = 0; i < 20; i += 1) await send(JORDAN, MAYA);
    await expect(send(JORDAN, MAYA)).rejects.toMatchObject({ reason: "sender_cap" });
    // Messages older than an hour no longer count
    for (const m of fake.db.table("message")) m.createdAt = new Date(Date.now() - 61 * 60_000);
    await expect(send(JORDAN, MAYA)).resolves.toBeTruthy();
  });

  it("refuses the 201st message in a day across creators", async () => {
    const thread = {
      id: uuidv7(),
      creatorUserId: ANA,
      fanUserId: JORDAN,
      status: "OPEN",
      createdAt: new Date(),
    };
    fake.db.table("messageThread").push(thread);
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
    for (let i = 0; i < 200; i += 1) {
      fake.db.table("message").push({
        id: uuidv7(),
        threadId: thread.id,
        sender: "FAN",
        body: "x",
        createdAt: twoHoursAgo,
      });
    }
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ allowed: false, reason: "sender_cap" });
  });
});

describe("creator's daily new conversation cap", () => {
  it("refuses the 51st new thread in a day, and still takes messages in existing threads", async () => {
    for (let id = 100; id < 150; id += 1) {
      addUser(id);
      await send(id, MAYA);
    }
    addUser(150);
    await expect(send(150, MAYA)).rejects.toMatchObject({ reason: "cap_reached" });
    await expect(send(100, MAYA)).resolves.toBeTruthy();
  });

  it("follows the creator's own cap", async () => {
    fake.db.table("creatorMessagingSettings")[0].dailyNewThreadCap = 1;
    await send(JORDAN, MAYA);
    await expect(send(SAM, MAYA)).rejects.toMatchObject({ reason: "cap_reached" });
  });
});

describe("automatic pauses", () => {
  it("a fan blocked by 3 creators in 7 days cannot send for 24 hours", async () => {
    openMessages(fake.db, ANA);
    addUser(5);
    openMessages(fake.db, 5);
    for (const creator of [MAYA, ANA, 5]) {
      const { threadId } = await send(JORDAN, creator);
      await creatorBlock(creator, threadId);
    }
    expect(await senderPaused(JORDAN)).toBe(true);
    addUser(6);
    openMessages(fake.db, 6);
    expect(await canMessage(JORDAN, 6)).toMatchObject({ reason: "sender_paused" });
    expect(await senderPaused(JORDAN, new Date(Date.now() + 25 * 3_600_000))).toBe(false);
  });

  it("two blocks do not pause", async () => {
    openMessages(fake.db, ANA);
    for (const creator of [MAYA, ANA]) {
      const { threadId } = await send(JORDAN, creator);
      await creatorBlock(creator, threadId);
    }
    expect(await senderPaused(JORDAN)).toBe(false);
  });

  it("5 fan reports pause the creator's Fan messages; the creator's own reports do not", async () => {
    const threadIds: Uint8Array[] = [];
    for (let id = 100; id < 105; id += 1) {
      addUser(id);
      threadIds.push((await send(id, MAYA)).threadId);
    }
    for (const threadId of threadIds) {
      await reportThread({ reporterUserId: MAYA, threadId, reason: "SPAM" });
    }
    expect(fake.db.table("creatorMessagingSettings")[0].pausedAt).toBeNull();
    for (let i = 0; i < 4; i += 1) {
      await reportThread({
        reporterUserId: 100 + i,
        threadId: threadIds[i]!,
        reason: "HARASSMENT",
      });
    }
    expect(fake.db.table("creatorMessagingSettings")[0].pausedAt).toBeNull();
    await reportThread({
      reporterUserId: 104,
      threadId: threadIds[4]!,
      reason: "FINANCIAL_PROMISE",
    });
    expect(fake.db.table("creatorMessagingSettings")[0].pausedAt).toBeInstanceOf(Date);
    addUser(200);
    expect(await canMessage(200, MAYA)).toMatchObject({ reason: "disabled" });
  });

  it("only a participant can report a thread", async () => {
    const { threadId } = await send(JORDAN, MAYA);
    await expect(
      reportThread({ reporterUserId: SAM, threadId, reason: "SPAM" })
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("retention (spec decision 11)", () => {
  it("deletes messages 12 months after a conversation's last message and keeps the rest", async () => {
    const { purgeStaleMessages } = await import("../services/telegram/loop");
    const stale = await send(JORDAN, MAYA, "old");
    await send(SAM, MAYA, "recent");
    const staleThread = fake.db
      .table("messageThread")
      .find((t: any) => Buffer.compare(t.id, stale.threadId) === 0);
    staleThread.lastMessageAt = new Date(Date.now() - 366 * 86_400_000);
    expect(await purgeStaleMessages()).toBe(1);
    expect(fake.db.table("message").map((m: any) => m.body)).toEqual(["recent"]);
    expect(fake.db.table("messageThread")).toHaveLength(2);
  });
});
