/**
 * Admin, Messaging (Build Board #2 r4, PR M7, board m6). Roles, reports with snapshots
 * and status, the logged case view, pauses, caps, flagged terms without text, the kill
 * switch with a reason, and legacy thread reports resolving through the M1 copy ids.
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
vi.mock("../utils/cache", () => ({ getRedisClient: () => null }));
vi.mock("../services/telegram/client", () => ({
  isTelegramConfigured: () => false,
  getTelegramBot: () => null,
}));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: async () => null }));

import { env } from "../env";
import { idToHex } from "../services/analytics/ids";
import { clearMessageCapsCache, messageCaps } from "../services/messaging/caps";
import { canSendDirect, report, sendDirect, unsend } from "../services/messaging/direct";
import { messagingAdminRouter } from "../trpc/admin/messaging";
import { uuidv7 } from "../utils/uuid-v7";
import { ANA, JORDAN, MAYA, SAM, seedPeople } from "./helpers/messagingFixtures";

const ADMIN = 900;
const admin = (role = "admin") =>
  messagingAdminRouter.createCaller({ user: { sub: ADMIN, role } } as never);
const friends = (a: number, b: number) => {
  fake.db.table("follow").push({ id: a * 100 + b, follower_id: a, creator_id: b });
  fake.db.table("follow").push({ id: b * 100 + a, follower_id: b, creator_id: a });
};

beforeEach(() => {
  fake.db.reset();
  seedPeople(fake.db);
  fake.db.table("user").push({ id: ADMIN, name: "Ops", handle: "ops", block: "no" });
  clearMessageCapsCache();
  Object.assign(env, { MESSAGING_ENABLED: true });
});

describe("roles", () => {
  it("admins and moderators may use it; anyone else is refused", async () => {
    await expect(admin("moderator").health()).resolves.toBeTruthy();
    await expect(admin("user").health()).rejects.toThrow("Forbidden");
  });
});

describe("reports and the case view", () => {
  it("lists a report with the snapshot kept after unsend, and opens a logged case", async () => {
    friends(MAYA, JORDAN);
    const sent = await sendDirect({
      senderId: JORDAN,
      recipientId: MAYA,
      body: "stake with me, double up",
    });
    await sendDirect({ senderId: MAYA, recipientId: JORDAN, body: "no thanks" });
    await report({
      userId: MAYA,
      conversationId: sent.conversationId,
      messageId: sent.messageId,
      reason: "FINANCIAL_PROMISE",
    });
    await unsend(JORDAN, sent.messageId);

    const [row] = await admin().listReports({ status: "open" });
    expect(row).toMatchObject({
      reason: "FINANCIAL_PROMISE",
      reporter: { id: MAYA },
      reported: { id: JORDAN },
      snapshot: "stake with me, double up",
      unsent: true,
      status: "open",
    });
    expect((await admin().health()).openReports).toBe(1);

    const kase = await admin("moderator").reportCase({ reportId: row.id });
    const reported = kase.messages.find(m => m.reported);
    expect(reported).toMatchObject({ unsent: true, body: "stake with me, double up" });
    expect(kase.messages.map(m => m.body)).toContain("no thanks");
    const log = await admin().log();
    expect(log[0]).toMatchObject({ action: "case_opened", target: row.id, actor: { id: ADMIN } });

    await admin().resolveReport({ reportId: row.id });
    expect(await admin().listReports({ status: "open" })).toHaveLength(0);
    expect((await admin().listReports({ status: "resolved" }))[0].status).toBe("resolved");
  });

  it("refuses the case view for a conversation nobody reported", async () => {
    await expect(admin().reportCase({ reportId: idToHex(uuidv7()) })).rejects.toThrow(
      "This report is not available."
    );
  });

  it("resolves a Telegram era thread report through the copied ids", async () => {
    friends(MAYA, SAM);
    const sent = await sendDirect({ senderId: SAM, recipientId: MAYA, body: "legacy text" });
    fake.db.table("messageReport").push({
      id: uuidv7(),
      threadId: sent.conversationId,
      messageId: sent.messageId,
      conversationId: null,
      directMessageId: null,
      reporterUserId: MAYA,
      reason: "SPAM",
      note: null,
      resolvedAt: null,
      createdAt: new Date(),
    });
    const [row] = await admin().listReports();
    expect(row).toMatchObject({ reported: { id: SAM }, snapshot: "legacy text" });
  });
});

describe("pauses", () => {
  it("pauses a sender for 24 hours, shows them, and resumes", async () => {
    friends(MAYA, JORDAN);
    await admin().pauseSender({ userId: JORDAN, hours: 24, reason: "spam wave" });
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ reason: "sender_paused" });
    const paused = await admin().listPaused();
    expect(paused[0]).toMatchObject({
      kind: "sending",
      person: { id: JORDAN },
      reason: "Admin: spam wave",
    });
    expect(paused[0].pausedUntil).toBeInstanceOf(Date);
    await admin().resumeSender({ userId: JORDAN });
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ allowed: true });
  });

  it("lists and resumes a paused inbox", async () => {
    fake.db.table("messagingSettings").push({
      userId: ANA,
      ruleKind: "ANYONE",
      pausedAt: new Date(),
      pausedReason: "5 people reported in 7 days",
    });
    expect((await admin().listPaused())[0]).toMatchObject({
      kind: "requests",
      person: { id: ANA },
    });
    await admin().resumeInbound({ userId: ANA });
    expect(fake.db.table("messagingSettings")[0].pausedAt).toBeNull();
  });
});

describe("caps", () => {
  it("saves caps the send path reads at once", async () => {
    const { current, defaults } = await admin().caps();
    expect(current).toEqual(defaults);
    await admin().setCaps({ ...defaults, sendsPerConversationPerHour: 2 });
    expect((await messageCaps()).sendsPerConversationPerHour).toBe(2);
    expect((await admin().log())[0].action).toBe("caps_saved");
  });
});

describe("flagged terms", () => {
  it("shows the sender, the matched words and a count, never the text", async () => {
    friends(MAYA, JORDAN);
    await sendDirect({
      senderId: JORDAN,
      recipientId: MAYA,
      body: "guaranteed returns on my pool",
    });
    const rows = await admin().flagged();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ person: { id: JORDAN }, count: 1, paused: false });
    expect(rows[0].phrases.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain("on my pool");
  });
});

describe("kill switch", () => {
  it("needs a reason to turn off, stops sends, shows the reason and logs both ways", async () => {
    friends(MAYA, JORDAN);
    await expect(admin().setEnabled({ enabled: false, reason: "" } as never)).rejects.toThrow();
    expect(
      await admin().setEnabled({ enabled: false, reason: "Spam wave from new accounts" })
    ).toEqual({
      enabled: false,
    });
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ reason: "disabled" });
    const health = await admin().health();
    expect(health).toMatchObject({
      enabled: false,
      off: { reason: "Spam wave from new accounts", by: ADMIN },
    });
    await admin().setEnabled({ enabled: true });
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ allowed: true });
    expect((await admin().log()).map(e => e.action).slice(0, 2)).toEqual([
      "kill_switch_on",
      "kill_switch_off",
    ]);
  });
});
