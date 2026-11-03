/**
 * Amped Messages direct messages (Build Board #2 r4, PR M2; spec 7.1, 7.2, 7.5, 7.6).
 * Request routing, every refusal reason, the 4th message refusal, caps from SiteSettings,
 * the new account cap, unsend window with report snapshots, receipts and the router.
 * Rules are open to every creator (Rob, 2 Nov): no access engine allowlist.
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
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: async () => null }));

import { env } from "../env";
import { idToHex } from "../services/analytics/ids";
import { decryptMessageBody } from "../services/crypto/messageBody";
import { clearMessageCapsCache } from "../services/messaging/caps";
import {
  acceptRequest,
  canSendDirect,
  clearForMe,
  conversationPage,
  deleteRequest,
  listConversations,
  markRead,
  report,
  sendDirect,
  setBlocked,
  unreadSummary,
  unsend,
} from "../services/messaging/direct";
import { messagesRouter } from "../trpc/messages";
import {
  ANA,
  JORDAN,
  MAYA,
  POOL,
  SAM,
  openMessages,
  seedPeople,
} from "./helpers/messagingFixtures";

const send = (senderId: number, recipientId: number, body = "hi", idempotencyKey?: string) =>
  sendDirect({ senderId, recipientId, body, idempotencyKey });
const settingsOf = (userId: number) =>
  fake.db.table("messagingSettings").find((s: any) => s.userId === userId);
const member = (conversationId: Uint8Array, userId: number) =>
  fake.db
    .table("conversationMember")
    .find(
      (m: any) => Buffer.compare(m.conversationId, conversationId) === 0 && m.userId === userId
    );
const follow = (follower: number, creator: number) =>
  fake.db
    .table("follow")
    .push({ id: follower * 100 + creator, follower_id: follower, creator_id: creator });

beforeEach(() => {
  fake.db.reset();
  seedPeople(fake.db);
  clearMessageCapsCache();
  Object.assign(env, { MESSAGING_ENABLED: true });
});

describe("routing: Primary or Requests", () => {
  it("lands in Requests for a stranger the recipient allows, Primary once they accept", async () => {
    openMessages(fake.db, MAYA); // ANYONE
    const first = await send(JORDAN, MAYA);
    expect(first).toMatchObject({ folder: "REQUESTS", created: true });
    expect(member(first.conversationId, MAYA)).toMatchObject({ folder: "REQUESTS", unread: 1 });
    expect(member(first.conversationId, JORDAN)).toMatchObject({ folder: "PRIMARY" });
    await acceptRequest(MAYA, first.conversationId);
    expect(member(first.conversationId, MAYA).folder).toBe("PRIMARY");
    expect((await send(JORDAN, MAYA)).folder).toBe("PRIMARY");
  });

  it("goes to Primary when the recipient follows the sender", async () => {
    follow(MAYA, JORDAN);
    expect((await send(JORDAN, MAYA)).folder).toBe("PRIMARY");
  });

  it("goes to Primary when the recipient wrote first, and replying accepts", async () => {
    openMessages(fake.db, MAYA);
    const req = await send(JORDAN, MAYA);
    await send(MAYA, JORDAN);
    expect(member(req.conversationId, MAYA)).toMatchObject({ folder: "PRIMARY" });
    expect(member(req.conversationId, MAYA).acceptedAt).toBeInstanceOf(Date);
    expect((await send(JORDAN, MAYA)).folder).toBe("PRIMARY");
  });

  it("refuses the 4th message before the recipient accepts", async () => {
    openMessages(fake.db, MAYA);
    for (let i = 0; i < 3; i += 1) await send(JORDAN, MAYA);
    await expect(send(JORDAN, MAYA)).rejects.toMatchObject({ reason: "awaiting_accept" });
    const conversationId = fake.db.table("conversation")[0].id;
    await acceptRequest(MAYA, conversationId);
    await expect(send(JORDAN, MAYA)).resolves.toBeTruthy();
  });

  it("keeps one conversation per pair, either direction", async () => {
    follow(MAYA, JORDAN);
    follow(JORDAN, MAYA);
    await send(JORDAN, MAYA);
    await send(MAYA, JORDAN);
    expect(fake.db.table("conversation")).toHaveLength(1);
    expect(fake.db.table("directMessage")).toHaveLength(2);
  });
});

describe("refusals", () => {
  it("defaults to Followers and members: a non follower gets not_follower", async () => {
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({
      allowed: false,
      reason: "not_follower",
    });
    follow(JORDAN, MAYA);
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ allowed: true, folder: "REQUESTS" });
  });

  it("No one closes the inbox to strangers but not to people the recipient knows", async () => {
    openMessages(fake.db, MAYA, { enabled: false }); // ruleKind NOBODY
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ reason: "closed" });
    follow(MAYA, JORDAN);
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ allowed: true, folder: "PRIMARY" });
  });

  it("pool rules use stakes in any of the creator's pools, never the engine allowlist", async () => {
    openMessages(fake.db, MAYA, { ruleKind: "POOL_MEMBER" });
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ reason: "not_pool_fan" });
    fake.db.stakes.push({ poolId: POOL, userId: JORDAN, amount: 5n });
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ allowed: true });
    settingsOf(MAYA).ruleKind = "STAKE_MIN";
    settingsOf(MAYA).stakeMin = "250";
    const below = await canSendDirect(JORDAN, MAYA);
    expect(below).toMatchObject({ reason: "stake_below" });
    expect(JSON.stringify(below)).not.toContain("250");
  });

  it("a block either way stops sends both ways", async () => {
    follow(MAYA, JORDAN);
    follow(JORDAN, MAYA);
    const { conversationId } = await send(JORDAN, MAYA);
    await setBlocked(MAYA, conversationId, true);
    await expect(send(JORDAN, MAYA)).rejects.toMatchObject({ reason: "blocked" });
    await expect(send(MAYA, JORDAN)).rejects.toMatchObject({ reason: "blocked" });
    await setBlocked(MAYA, conversationId, false);
    await expect(send(JORDAN, MAYA)).resolves.toBeTruthy();
  });

  it("refuses a paused or suspended sender, a suspended recipient and oneself", async () => {
    openMessages(fake.db, MAYA);
    fake.db
      .table("messagingSenderStatus")
      .push({ userId: JORDAN, pausedAt: new Date(), pausedUntil: null });
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ reason: "sender_paused" });
    fake.db.table("user").find((u: any) => u.id === MAYA).block = "yes";
    expect(await canSendDirect(SAM, MAYA)).toMatchObject({ reason: "closed" });
    expect(await canSendDirect(SAM, SAM)).toMatchObject({ reason: "closed" });
  });

  it("the kill switch refuses sends: env or SiteSettings", async () => {
    openMessages(fake.db, MAYA);
    Object.assign(env, { MESSAGING_ENABLED: false });
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ reason: "disabled" });
    Object.assign(env, { MESSAGING_ENABLED: true });
    fake.db
      .table("siteSettings")
      .push({ setting_key: "messaging.enabled", setting_value: "false" });
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ reason: "disabled" });
  });

  it("a paused recipient takes no requests", async () => {
    openMessages(fake.db, MAYA, { pausedAt: new Date() });
    expect(await canSendDirect(JORDAN, MAYA)).toMatchObject({ reason: "closed" });
  });
});

describe("caps", () => {
  it("refuses the 21st message to one conversation in an hour", async () => {
    follow(MAYA, JORDAN);
    for (let i = 0; i < 20; i += 1) await send(JORDAN, MAYA);
    await expect(send(JORDAN, MAYA)).rejects.toMatchObject({ reason: "sender_cap" });
  });

  it("reads caps from SiteSettings, falling back on bad values", async () => {
    follow(MAYA, JORDAN);
    fake.db.table("siteSettings").push({
      setting_key: "messaging.caps.sendsPerConversationPerHour",
      setting_value: "2",
    });
    await send(JORDAN, MAYA);
    await send(JORDAN, MAYA);
    await expect(send(JORDAN, MAYA)).rejects.toMatchObject({ reason: "sender_cap" });
    fake.db.table("siteSettings")[0].setting_value = "lots";
    clearMessageCapsCache();
    await expect(send(JORDAN, MAYA)).resolves.toBeTruthy();
  });

  it("a new account starts 5 conversations a day", async () => {
    fake.db.table("user").find((u: any) => u.id === JORDAN).created_at = new Date();
    for (let id = 10; id < 16; id += 1) {
      fake.db.table("user").push({
        id,
        name: `User ${id}`,
        handle: `user${id}`,
        block: "no",
        email_verified: true,
        created_at: new Date("2026-01-01T00:00:00Z"),
      });
      openMessages(fake.db, id);
    }
    for (let id = 10; id < 15; id += 1) await send(JORDAN, id);
    await expect(send(JORDAN, 15)).rejects.toMatchObject({ reason: "sender_cap" });
  });

  it("the recipient's daily cap on new conversations", async () => {
    openMessages(fake.db, MAYA, { dailyNewThreadCap: 1 });
    await send(JORDAN, MAYA);
    await expect(send(SAM, MAYA)).rejects.toMatchObject({ reason: "cap_reached" });
  });
});

describe("send", () => {
  it("encrypts the body, flags financial promises and returns a repeat for a known key", async () => {
    follow(MAYA, JORDAN);
    const sent = await send(JORDAN, MAYA, "Stake now for guaranteed returns", "key-000001");
    const row = fake.db.table("directMessage")[0];
    expect(row.bodyEnc).not.toContain("guaranteed");
    expect(decryptMessageBody(row.bodyEnc)).toBe("Stake now for guaranteed returns");
    expect(sent.flaggedTerms.length).toBeGreaterThan(0);
    const again = await send(JORDAN, MAYA, "Stake now for guaranteed returns", "key-000001");
    expect(again).toMatchObject({ repeat: true });
    expect(fake.db.table("directMessage")).toHaveLength(1);
  });

  it("refuses an empty or too long body", async () => {
    follow(MAYA, JORDAN);
    await expect(send(JORDAN, MAYA, "   ")).rejects.toMatchObject({ code: "empty" });
    await expect(send(JORDAN, MAYA, "x".repeat(2001))).rejects.toMatchObject({ code: "too_long" });
  });

  it("collapses bell rows per conversation until seen, and skips muted conversations", async () => {
    follow(MAYA, JORDAN);
    const { conversationId } = await send(JORDAN, MAYA);
    await send(JORDAN, MAYA);
    const rows = fake.db.table("notification");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: MAYA, kind: "MESSAGE", count: 2 });
    await markRead(MAYA, conversationId, null);
    expect(rows[0].seenAt).toBeInstanceOf(Date);
    expect(member(conversationId, MAYA).unread).toBe(0);
    member(conversationId, MAYA).mutedUntil = new Date(Date.now() + 3600_000);
    await send(JORDAN, MAYA);
    expect(fake.db.table("notification")).toHaveLength(1);
  });

  it("a request bell row says REQUEST", async () => {
    openMessages(fake.db, MAYA);
    await send(JORDAN, MAYA);
    expect(fake.db.table("notification")[0].kind).toBe("REQUEST");
  });
});

describe("conversation actions", () => {
  beforeEach(() => {
    follow(MAYA, JORDAN);
    follow(JORDAN, MAYA);
  });

  it("unsends within 15 minutes and keeps the reported text for admins", async () => {
    const sent = await send(JORDAN, MAYA, "regret this");
    await report({
      userId: MAYA,
      conversationId: sent.conversationId,
      messageId: sent.messageId,
      reason: "HARASSMENT",
    });
    await unsend(JORDAN, sent.messageId);
    const row = fake.db.table("directMessage")[0];
    expect(row).toMatchObject({ bodyEnc: "", bodyLength: 0 });
    expect(decryptMessageBody(fake.db.table("messageReport")[0].bodySnapshotEnc)).toBe(
      "regret this"
    );
    const page = await conversationPage({ userId: MAYA, conversationId: sent.conversationId });
    expect(page.messages[0]).toMatchObject({ removed: true, body: null });
  });

  it("refuses unsend after the window or by someone else", async () => {
    const sent = await send(JORDAN, MAYA);
    await expect(unsend(MAYA, sent.messageId)).rejects.toMatchObject({ code: "not_yours" });
    fake.db.table("directMessage")[0].createdAt = new Date(Date.now() - 16 * 60_000);
    await expect(unsend(JORDAN, sent.messageId)).rejects.toMatchObject({ code: "unsend_window" });
  });

  it("clear hides history for the caller only", async () => {
    const { conversationId } = await send(JORDAN, MAYA, "one");
    await clearForMe(MAYA, conversationId);
    expect((await conversationPage({ userId: MAYA, conversationId })).messages).toHaveLength(0);
    expect((await conversationPage({ userId: JORDAN, conversationId })).messages).toHaveLength(1);
  });

  it("shows read receipts only when both sides keep them on", async () => {
    const sent = await send(JORDAN, MAYA);
    await markRead(MAYA, sent.conversationId, sent.messageId);
    const page = await conversationPage({ userId: JORDAN, conversationId: sent.conversationId });
    expect(page.seenUpTo).toBe(idToHex(sent.messageId));
    fake.db
      .table("messagingSettings")
      .push({ userId: MAYA, ruleKind: "FOLLOWER", readReceipts: false });
    const off = await conversationPage({ userId: JORDAN, conversationId: sent.conversationId });
    expect(off.seenUpTo).toBeNull();
  });

  it("refuses a stranger reading a conversation", async () => {
    const { conversationId } = await send(JORDAN, MAYA);
    await expect(conversationPage({ userId: SAM, conversationId })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("three blocks in 7 days pause the sender for 24 hours", async () => {
    for (const recipient of [MAYA, SAM, ANA]) {
      follow(recipient, JORDAN);
      const { conversationId } = await send(JORDAN, recipient);
      const paused = await setBlocked(recipient, conversationId, true);
      if (recipient === ANA) expect(paused.senderPaused).toBe(true);
    }
    const status = fake.db.table("messagingSenderStatus")[0];
    expect(status.userId).toBe(JORDAN);
    expect(status.pausedUntil.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("lists", () => {
  it("lists Primary and Requests separately with previews, and counts unread", async () => {
    openMessages(fake.db, MAYA);
    follow(MAYA, SAM);
    await send(JORDAN, MAYA, "request");
    await send(SAM, MAYA, "primary");
    const primary = await listConversations({ userId: MAYA, folder: "PRIMARY" });
    const requests = await listConversations({ userId: MAYA, folder: "REQUESTS" });
    expect(primary.rows).toHaveLength(1);
    expect(primary.rows[0]).toMatchObject({
      person: { id: SAM },
      preview: { text: "primary", mine: false },
      unread: 1,
    });
    expect(requests.rows[0]).toMatchObject({ person: { id: JORDAN } });
    expect(await unreadSummary(MAYA)).toEqual({ conversations: 1, requests: 1 });
    await deleteRequest(MAYA, requests.rows.length ? fake.db.table("conversation")[0].id : null);
    expect((await listConversations({ userId: MAYA, folder: "REQUESTS" })).rows).toHaveLength(0);
  });
});

describe("messages router", () => {
  const caller = (sub: number) => messagesRouter.createCaller({ user: { sub } } as never);

  it("canMessage by handle explains a refusal without amounts", async () => {
    openMessages(fake.db, MAYA, { ruleKind: "STAKE_MIN", stakeMin: "250" });
    const res = await caller(JORDAN).canMessage({ handle: "@maya" });
    expect(res).toMatchObject({ allowed: false, reason: "stake_below" });
    expect(res.allowed ? "" : res.message).toBe(
      "@maya takes messages from fans with a minimum stake."
    );
  });

  it("send by handle, then by conversation; refusals carry product copy", async () => {
    openMessages(fake.db, MAYA);
    const first = await caller(JORDAN).send({ to: "maya", body: "hello" });
    expect(first).toMatchObject({ folder: "REQUESTS", flagged: false });
    await caller(JORDAN).send({ conversationId: first.conversationId, body: "two" });
    await caller(JORDAN).send({ conversationId: first.conversationId, body: "three" });
    await expect(
      caller(JORDAN).send({ conversationId: first.conversationId, body: "four" })
    ).rejects.toThrow("Wait for @maya to accept your request before sending more.");
    await expect(
      caller(SAM).send({ conversationId: first.conversationId, body: "x" })
    ).rejects.toThrow("This conversation is not available.");
  });

  it("settings: No one, receipts, and Paid members refused until Memberships", async () => {
    await caller(MAYA).settings.set({ ruleKind: "NOBODY", readReceipts: false });
    expect(await caller(MAYA).settings.get()).toMatchObject({
      ruleKind: "NOBODY",
      readReceipts: false,
    });
    await expect(caller(MAYA).settings.set({ ruleKind: "PAID_MEMBER" })).rejects.toThrow();
    await expect(caller(MAYA).settings.set({ ruleKind: "STAKE_MIN" })).rejects.toThrow(
      "Set a minimum stake."
    );
  });
});
