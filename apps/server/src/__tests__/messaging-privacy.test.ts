/**
 * Messaging on Telegram (Build Board #2), PR 3: privacy of Telegram identities (spec
 * 3.8; acceptance 17). No messaging response carries a Telegram id or a Telegram
 * message id. A fan's Telegram username reaches the creator only with shareUsername.
 * The fan never sees the creator's Telegram username.
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
  isTelegramConfigured: () => true,
  getTelegramBot: () => null,
}));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: async () => null }));
vi.mock("../utils/rateLimit", () => ({ enforceRateLimits: vi.fn(), hitRateLimit: vi.fn() }));

import { env } from "../env";
import { idToHex } from "../services/analytics/ids";
import { sendFanMessage } from "../services/messaging/threads";
import { messagingCreatorRouter } from "../trpc/messaging/creator";
import { messagingFanRouter } from "../trpc/messaging/fan";
import {
  JORDAN,
  MAYA,
  follow,
  linkTelegram,
  openMessages,
  seedPeople,
} from "./helpers/messagingFixtures";

const creator = messagingCreatorRouter.createCaller({ user: { sub: MAYA } } as never);
const fan = messagingFanRouter.createCaller({ user: { sub: JORDAN } } as never);
const json = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? `${v}n` : v));

beforeEach(async () => {
  fake.db.reset();
  seedPeople(fake.db);
  openMessages(fake.db, MAYA, { ruleKind: "FOLLOWER" });
  follow(fake.db, JORDAN, MAYA);
  linkTelegram(fake.db, MAYA, 777000111);
  linkTelegram(fake.db, JORDAN, 888000222);
  Object.assign(env, { MESSAGING_INVITE_ONLY: true });
  await sendFanMessage({
    fanUserId: JORDAN,
    creatorUserId: MAYA,
    body: "Hi",
    channel: "TELEGRAM",
    tgMessageId: 4242n,
  });
  fake.db.table("message")[0].tgForwardMessageId = 5353n;
});

describe("the creator's inbox", () => {
  it("shows the fan's handle and relation, never a Telegram id or message id", async () => {
    const list = await creator.listThreads({ filter: "all" });
    const thread = await creator.getThread({ threadId: list.items[0]!.id });
    const out = json({ list, thread });
    expect(list.items[0]!.fan).toMatchObject({ handle: "jordan", relationLabel: "Follower" });
    for (const secret of ["888000222", "777000111", "4242", "5353"]) {
      expect(out).not.toContain(secret);
    }
  });

  it("shows the fan's Telegram username only when the fan shares it", async () => {
    let list = await creator.listThreads({ filter: "all" });
    expect(list.items[0]!.fan!.telegramUsername).toBeNull();
    expect(json(list)).not.toContain(`tg_user_${JORDAN}`);
    fake.db.table("telegramAccount").find((a: any) => a.userId === JORDAN).shareUsername = true;
    list = await creator.listThreads({ filter: "all" });
    expect(list.items[0]!.fan!.telegramUsername).toBe(`tg_user_${JORDAN}`);
  });

  it("filters unread and keeps another creator out", async () => {
    expect((await creator.listThreads({ filter: "unread" })).items).toHaveLength(1);
    expect(await creator.unreadCount()).toEqual({ count: 1 });
    const other = messagingCreatorRouter.createCaller({ user: { sub: 4 } } as never);
    expect((await other.listThreads({ filter: "all" })).items).toHaveLength(0);
    await expect(
      other.getThread({ threadId: idToHex(fake.db.table("messageThread")[0].id) })
    ).rejects.toThrow("Conversation not found.");
  });
});

describe("the fan's inbox", () => {
  it("never carries the creator's Telegram username or any Telegram id", async () => {
    fake.db.table("telegramAccount").find((a: any) => a.userId === MAYA).shareUsername = true;
    const list = await fan.listThreads({});
    const thread = await fan.getThread({ threadId: list.items[0]!.id });
    const out = json({ list, thread });
    expect(list.items[0]!.creator).toMatchObject({ handle: "maya", name: "Maya Lin" });
    for (const secret of [`tg_user_${MAYA}`, "777000111", "888000222", "4242", "5353"]) {
      expect(out).not.toContain(secret);
    }
  });
});
