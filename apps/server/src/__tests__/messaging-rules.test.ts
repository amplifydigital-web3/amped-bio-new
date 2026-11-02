/**
 * Messaging on Telegram (Build Board #2), PR 3: who may write to a creator (spec 3.3,
 * 3.8, 3.9; acceptance 5). canMessage gives one reason for every closed door, and the
 * creator's settings refuse states that cannot work.
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
import { canMessage } from "../services/messaging/access";
import { messagingCreatorRouter } from "../trpc/messaging/creator";
import {
  JORDAN,
  MAYA,
  POOL,
  SAM,
  follow,
  linkTelegram,
  openMessages,
  seedPeople,
} from "./helpers/messagingFixtures";

const settings = () => fake.db.table("creatorMessagingSettings")[0];

beforeEach(() => {
  fake.db.reset();
  seedPeople(fake.db);
  Object.assign(env, { MESSAGING_INVITE_ONLY: true });
});

/** One tREVO in wei. Stakes are mirrored in wei; creators type whole tREVO. */
const WEI = 10n ** 18n;

describe("canMessage: the creator takes messages", () => {
  it("is disabled with no settings, settings off, a pause, an unpublished page, or to oneself", async () => {
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ allowed: false, reason: "disabled" });
    openMessages(fake.db, MAYA, { enabled: false });
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ reason: "disabled" });
    settings().enabled = true;
    settings().pausedAt = new Date();
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ reason: "disabled" });
    settings().pausedAt = null;
    fake.db.table("user").find((u: any) => u.id === MAYA).page_status = "UNPUBLISHED";
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ reason: "disabled" });
    fake.db.table("user").find((u: any) => u.id === MAYA).page_status = "PUBLISHED";
    expect(await canMessage(MAYA, MAYA)).toMatchObject({ reason: "disabled" });
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ allowed: true });
  });

  it("needs an invite while MESSAGING_INVITE_ONLY is on", async () => {
    openMessages(fake.db, MAYA, { invitedAt: null });
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ reason: "disabled" });
    Object.assign(env, { MESSAGING_INVITE_ONLY: false });
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ allowed: true });
  });
});

describe("canMessage: the fan may send", () => {
  beforeEach(() => openMessages(fake.db));

  it("a paused fan gets sender_paused until the pause ends", async () => {
    fake.db.table("messagingSenderStatus").push({
      userId: JORDAN,
      pausedAt: new Date(),
      pausedUntil: new Date(Date.now() + 60_000),
    });
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ reason: "sender_paused" });
    fake.db.table("messagingSenderStatus")[0].pausedUntil = new Date(Date.now() - 1);
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ allowed: true });
  });

  it("a thread the creator blocked, or a Fan Graph block, is blocked", async () => {
    fake.db.table("messageThread").push({
      id: Buffer.alloc(16, 1),
      creatorUserId: MAYA,
      fanUserId: JORDAN,
      status: "BLOCKED_BY_CREATOR",
      createdAt: new Date(),
    });
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ reason: "blocked" });
    fake.db.table("followBlock").push({ creator_id: MAYA, user_id: SAM });
    expect(await canMessage(SAM, MAYA)).toMatchObject({ reason: "blocked" });
  });
});

describe("canMessage: the creator's rule", () => {
  it("FOLLOWER admits followers and pool fans, refuses everyone else with not_follower", async () => {
    openMessages(fake.db, MAYA, { ruleKind: "FOLLOWER" });
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ reason: "not_follower" });
    follow(fake.db, JORDAN, MAYA);
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ allowed: true, rule: "FOLLOWER" });
    fake.db.stakes.push({ poolId: POOL, userId: SAM, amount: 5n });
    expect(await canMessage(SAM, MAYA)).toMatchObject({ allowed: true });
  });

  it("a follow from an unverified account inside the 30 day email grace counts", async () => {
    openMessages(fake.db, MAYA, { ruleKind: "FOLLOWER" });
    const jordan = fake.db.table("user").find((u: any) => u.id === JORDAN);
    jordan.email_verified = false;
    jordan.created_at = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    follow(fake.db, JORDAN, MAYA);
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ allowed: true, rule: "FOLLOWER" });
  });

  it("a follow from an unverified account past the grace does not count", async () => {
    openMessages(fake.db, MAYA, { ruleKind: "FOLLOWER" });
    fake.db.table("user").find((u: any) => u.id === JORDAN).email_verified = false;
    follow(fake.db, JORDAN, MAYA);
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ reason: "not_follower" });
  });

  it("PAID_MEMBER refuses with not_member until Memberships ships", async () => {
    openMessages(fake.db, MAYA, { ruleKind: "PAID_MEMBER" });
    follow(fake.db, JORDAN, MAYA);
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ reason: "not_member" });
  });

  it("POOL_MEMBER admits a positive stake and names not_pool_fan otherwise", async () => {
    openMessages(fake.db, MAYA, { ruleKind: "POOL_MEMBER" });
    follow(fake.db, JORDAN, MAYA);
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ reason: "not_pool_fan" });
    fake.db.stakes.push({ poolId: POOL, userId: JORDAN, amount: 1n });
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ allowed: true });
  });

  it("STAKE_MIN compares against the threshold and never returns the amount", async () => {
    // The creator types whole tREVO; the stake mirror holds wei
    openMessages(fake.db, MAYA, { ruleKind: "STAKE_MIN", stakeMin: "100" });
    fake.db.stakes.push({ poolId: POOL, userId: JORDAN, amount: 99n * WEI });
    const refused = await canMessage(JORDAN, MAYA);
    expect(refused).toMatchObject({ allowed: false, reason: "stake_below" });
    expect(JSON.stringify(refused)).not.toContain("100");
    fake.db.stakes[0].amount = 100n * WEI;
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ allowed: true });
  });

  it("STAKE_MIN refuses a stake of 100 wei against a 100 tREVO minimum (G0 unit defect)", async () => {
    openMessages(fake.db, MAYA, { ruleKind: "STAKE_MIN", stakeMin: "100" });
    fake.db.stakes.push({ poolId: POOL, userId: JORDAN, amount: 100n });
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ allowed: false, reason: "stake_below" });
    fake.db.stakes[0].amount = 100n * WEI - 1n;
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ allowed: false, reason: "stake_below" });
  });

  it("STAKE_MIN with a malformed threshold refuses everyone", async () => {
    openMessages(fake.db, MAYA, { ruleKind: "STAKE_MIN", stakeMin: "1e3" });
    fake.db.stakes.push({ poolId: POOL, userId: JORDAN, amount: 5000n });
    expect(await canMessage(JORDAN, MAYA)).toMatchObject({ reason: "stake_below" });
  });
});

describe("messaging.creator.setSettings", () => {
  const caller = messagingCreatorRouter.createCaller({ user: { sub: MAYA } } as never);

  beforeEach(() => {
    Object.assign(env, { MESSAGING_INVITE_ONLY: false });
    linkTelegram(fake.db, MAYA, 9001);
  });

  it("turns Fan messages on with the default rule for a published, verified, linked creator", async () => {
    await caller.setSettings({ enabled: true, ruleKind: "FOLLOWER" });
    expect(settings()).toMatchObject({
      enabled: true,
      ruleKind: "FOLLOWER",
      dailyNewThreadCap: 50,
    });
  });

  it("refuses without a link, a verified email, a published page or an invite", async () => {
    fake.db.table("telegramAccount").length = 0;
    await expect(caller.setSettings({ enabled: true, ruleKind: "ANYONE" })).rejects.toThrow(
      "Link Telegram first."
    );
    linkTelegram(fake.db, MAYA, 9001);
    fake.db.table("telegramAccount")[0].botAccess = false;
    await expect(caller.setSettings({ enabled: true, ruleKind: "ANYONE" })).rejects.toThrow(
      "Open the Amped.Bio bot in Telegram and press Start"
    );
    // Without Telegram replies the bot never has to write to the creator
    await caller.setSettings({ enabled: true, ruleKind: "ANYONE", replyFromTelegram: false });
    fake.db.table("telegramAccount")[0].botAccess = true;
    fake.db.table("user").find((u: any) => u.id === MAYA).email_verified = false;
    await expect(caller.setSettings({ enabled: true, ruleKind: "ANYONE" })).rejects.toThrow(
      "Verify your email first."
    );
    fake.db.table("user").find((u: any) => u.id === MAYA).email_verified = true;
    fake.db.table("user").find((u: any) => u.id === MAYA).page_status = "UNPUBLISHED";
    await expect(caller.setSettings({ enabled: true, ruleKind: "ANYONE" })).rejects.toThrow(
      "Publish your page"
    );
    fake.db.table("user").find((u: any) => u.id === MAYA).page_status = "PUBLISHED";
    Object.assign(env, { MESSAGING_INVITE_ONLY: true });
    await expect(caller.setSettings({ enabled: true, ruleKind: "ANYONE" })).rejects.toThrow(
      "invite only"
    );
  });

  it("refuses PAID_MEMBER, a pool rule without a pool, and STAKE_MIN without an amount", async () => {
    await expect(caller.setSettings({ enabled: false, ruleKind: "PAID_MEMBER" })).rejects.toThrow(
      "Memberships are not available yet."
    );
    await expect(
      caller.setSettings({ enabled: false, ruleKind: "STAKE_MIN", stakeMin: "0" })
    ).rejects.toThrow("whole number");
    fake.db.table("creatorPool").length = 0;
    await expect(caller.setSettings({ enabled: false, ruleKind: "POOL_MEMBER" })).rejects.toThrow(
      "Create your pool first."
    );
  });

  it("caps dailyNewThreadCap at 500", async () => {
    await expect(
      caller.setSettings({ enabled: false, ruleKind: "ANYONE", dailyNewThreadCap: 501 })
    ).rejects.toThrow();
  });
});
