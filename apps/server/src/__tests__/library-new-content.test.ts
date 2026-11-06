/**
 * Fan Library new content alerts and the daily email (Build Board #26, FL-6,
 * spec 3.4). The rules that matter: only a gated item's first publish alerts;
 * the audience is the rule's (any is the union, all the intersection); fans who
 * turned alerts off or blocked the creator get nothing; repeats fold into the
 * unseen row for the creator. The email goes only to followers with Email me
 * updates, at most once a day per creator, lists only items the fan opens, and
 * sends nothing without the flag or the postal address. Database, engine and
 * transport are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    notificationPreference: { findMany: fn(), upsert: fn() },
    conversationMember: { findMany: fn() },
    notification: { findMany: fn(), updateMany: fn(), createMany: fn() },
    notificationJob: { create: fn() },
    follow: { findMany: fn(), findUnique: fn(), updateMany: fn() },
    user: { findUnique: fn(), findFirst: fn() },
    userWallet: { findUnique: fn() },
    contentItem: { findMany: fn() },
    accessRule: { findMany: fn() },
  };
});
const engine = vi.hoisted(() => ({ eligibleUserIds: vi.fn(), checkBatch: vi.fn() }));
const rules = vi.hoisted(() => ({ loadRule: vi.fn() }));
const mail = vi.hoisted(() => ({ deliverEmail: vi.fn(async () => ({ id: "x" })) }));
const bus = vi.hoisted(() => ({ publish: vi.fn(async () => undefined) }));
const env = vi.hoisted(() => ({
  env: {
    BETTER_AUTH_SECRET: "test-secret",
    API_HOST: "api.amped.bio",
    APP_URL: "https://app.amped.bio",
    LANDINGPAGE_URL: "https://amped.bio",
    BULK_FOOTER_ADDRESS: "1 Main St, Miami FL 33101",
  },
}));

vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));
vi.mock("../env", () => env);
vi.mock("../services/access/engine", () => engine);
vi.mock("../services/access/rules", () => ({
  loadRule: rules.loadRule,
  idToHex: (id: Uint8Array) => Buffer.from(id).toString("hex"),
}));
vi.mock("../utils/email/transport", () => mail);
vi.mock("../services/realtime/bus", () => bus);
vi.mock("../services/follow/poolFans", () => ({
  batchPoolFanCreatorIds: vi.fn(async () => new Set<number>()),
}));
vi.mock("../utils/email/LibraryDigestTemplate", () => ({
  default: (props: Record<string, unknown>) => props,
}));
vi.mock("@react-email/render", () => ({
  render: vi.fn(async (props: Record<string, unknown>) => JSON.stringify(props)),
}));

import {
  digestDedupeKey,
  fanOutNewContent,
  nextDigestAt,
  readUpdatesOffToken,
  ruleAudience,
  runDigest,
  scheduleDigests,
  updatesOffToken,
} from "../services/library/newContent";
import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";

const MAYA = 3;
const RULE = Buffer.alloc(16, 0xa1);
const hex = (id: Buffer) => id.toString("hex");

const gatedItem = {
  id: Buffer.alloc(16, 1),
  publicId: "item000000000001",
  userId: MAYA,
  accessRuleId: RULE as Buffer | null,
  adult: false,
  publishedAt: new Date("2026-11-04T15:00:00Z"),
};

function leaf(kind: string, id = hex(RULE)) {
  return { id, ownerUserId: MAYA, kind, params: {}, opensToAllAt: null, version: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  env.env.BULK_FOOTER_ADDRESS = "1 Main St, Miami FL 33101";
  __setFeatureFlagOverridesForTests({ fanLibrary: true, accessGating: true, libraryDigest: true });
  db.notificationPreference.findMany.mockResolvedValue([]);
  db.conversationMember.findMany.mockResolvedValue([]);
  db.notification.findMany.mockResolvedValue([]);
  db.accessRule.findMany.mockResolvedValue([]);
});

describe("the audience (spec 3.4)", () => {
  it("pages a leaf rule through the engine", async () => {
    engine.eligibleUserIds
      .mockResolvedValueOnce({ userIds: [10, 11], nextCursor: 11 })
      .mockResolvedValueOnce({ userIds: [12], nextCursor: null });
    expect([...(await ruleAudience(leaf("follower") as never))]).toEqual([10, 11, 12]);
  });

  it("takes the union for any() and the intersection for all()", async () => {
    const a = "a".repeat(32);
    const b = "b".repeat(32);
    rules.loadRule.mockImplementation(async (id: string) =>
      leaf(id === a ? "follower" : "pool_member", id)
    );
    engine.eligibleUserIds.mockImplementation(async (rule: { kind: string }) => ({
      userIds: rule.kind === "follower" ? [10, 11] : [11, 12],
      nextCursor: null,
    }));
    const any = { ...leaf("any"), params: { ruleIds: [a, b] } };
    const all = { ...leaf("all"), params: { ruleIds: [a, b] } };
    expect([...(await ruleAudience(any as never))].sort()).toEqual([10, 11, 12]);
    expect([...(await ruleAudience(all as never))]).toEqual([11]);
  });

  it("gives no one when a leaf belongs to another creator", async () => {
    rules.loadRule.mockResolvedValue({ ...leaf("follower"), ownerUserId: 99 });
    const any = { ...leaf("any"), params: { ruleIds: ["a".repeat(32)] } };
    expect((await ruleAudience(any as never)).size).toBe(0);
  });
});

describe("bell alerts", () => {
  beforeEach(() => {
    rules.loadRule.mockResolvedValue(leaf("follower"));
    engine.eligibleUserIds.mockResolvedValue({ userIds: [10, 11, 12, MAYA], nextCursor: null });
  });

  it("writes one CONTENT row per fan, never the creator, grouped per creator", async () => {
    expect(await fanOutNewContent(gatedItem)).toBe(3);
    const rows = db.notification.createMany.mock.calls[0]![0].data;
    expect(rows.map((r: { userId: number }) => r.userId)).toEqual([10, 11, 12]);
    expect(rows[0]).toMatchObject({ kind: "CONTENT", actorId: MAYA, groupKey: `content:${MAYA}` });
    expect(bus.publish).toHaveBeenCalledWith(10, { type: "unread.changed" });
  });

  it("leaves out fans who turned alerts off or blocked the creator", async () => {
    db.notificationPreference.findMany.mockResolvedValue([{ userId: 10 }]);
    db.conversationMember.findMany.mockResolvedValue([{ userId: 11 }]);
    expect(await fanOutNewContent(gatedItem)).toBe(1);
    expect(db.notification.createMany.mock.calls[0]![0].data).toHaveLength(1);
    expect(db.notificationPreference.findMany.mock.calls[0]![0].where).toMatchObject({
      creatorUserId: { in: [0, MAYA] },
      newContentEnabled: false,
    });
  });

  it("folds a repeat into the fan's unseen row for the creator", async () => {
    db.notification.findMany.mockResolvedValue([{ id: Buffer.alloc(16, 9), userId: 10 }]);
    await fanOutNewContent(gatedItem);
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [Buffer.alloc(16, 9)] } },
      data: expect.objectContaining({ count: { increment: 1 }, refId: gatedItem.id }),
    });
    expect(db.notification.createMany.mock.calls[0]![0].data).toHaveLength(2);
  });

  it("alerts no one for a public item, an 18+ item, or with gating off", async () => {
    expect(await fanOutNewContent({ ...gatedItem, accessRuleId: null })).toBe(0);
    expect(await fanOutNewContent({ ...gatedItem, adult: true })).toBe(0);
    __setFeatureFlagOverridesForTests({ fanLibrary: true, accessGating: false });
    expect(await fanOutNewContent(gatedItem)).toBe(0);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it("never throws: an item publishes whether or not alerts go out", async () => {
    rules.loadRule.mockRejectedValue(new Error("db down"));
    await expect(fanOutNewContent(gatedItem)).resolves.toBe(0);
  });
});

describe("the daily email", () => {
  it("picks the next 14:00 UTC slot at least an hour away", () => {
    expect(nextDigestAt(new Date("2026-11-04T09:00:00Z")).toISOString()).toBe(
      "2026-11-04T14:00:00.000Z"
    );
    expect(nextDigestAt(new Date("2026-11-04T13:30:00Z")).toISOString()).toBe(
      "2026-11-05T14:00:00.000Z"
    );
  });

  it("queues one job per follower with updates, deduped per creator", async () => {
    db.follow.findMany.mockResolvedValue([{ follower_id: 10 }, { follower_id: 11 }]);
    db.notificationJob.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error("dupe"), { code: "P2002" }));
    expect(await scheduleDigests(gatedItem, new Date("2026-11-04T09:00:00Z"))).toBe(1);
    expect(db.follow.findMany.mock.calls[0]![0].where).toMatchObject({
      creator_id: MAYA,
      email_updates: true,
    });
    expect(db.notificationJob.create.mock.calls[0]![0].data).toMatchObject({
      channel: "digest",
      userId: 10,
      dedupeKey: digestDedupeKey(10, MAYA),
      runAfter: new Date("2026-11-04T14:00:00Z"),
    });
  });

  it("queues nothing while the libraryDigest flag is off", async () => {
    __setFeatureFlagOverridesForTests({ fanLibrary: true, libraryDigest: false });
    expect(await scheduleDigests(gatedItem)).toBe(0);
    expect(db.follow.findMany).not.toHaveBeenCalled();
  });

  describe("sending", () => {
    const payload = { type: "library_digest" as const, creatorUserId: MAYA };
    const now = new Date("2026-11-04T14:00:00Z");
    const row = (extra: Record<string, unknown> = {}) => ({
      id: Buffer.alloc(16, 2),
      publicId: "item000000000002",
      userId: MAYA,
      kind: "VIDEO",
      title: "Studio session 12",
      status: "READY",
      publishState: "PUBLISHED",
      moderationState: "CLEAR",
      accessRuleId: null,
      adult: false,
      deletedAt: null,
      user: { page_status: "PUBLISHED", block: "no" },
      ...extra,
    });

    beforeEach(() => {
      db.follow.findUnique.mockResolvedValue({ email_updates: true });
      db.user.findUnique.mockResolvedValue({
        email: "fan@example.com",
        email_verified: true,
        block: "no",
      });
      db.user.findFirst.mockResolvedValue({ handle: "Maya", name: "Maya Lin" });
      db.userWallet.findUnique.mockResolvedValue(null);
      db.contentItem.findMany.mockResolvedValue([row()]);
    });

    it("sends the titles of items the fan opens, with the off link and the address", async () => {
      expect(await runDigest(10, payload, now)).toBe("sent");
      const sent = (mail.deliverEmail.mock.calls[0] as unknown[])[0] as {
        to: string[];
        subject: string;
        html: string;
      };
      expect(sent.to).toEqual(["fan@example.com"]);
      expect(sent.subject).toBe("New from @maya");
      const props = JSON.parse(sent.html);
      expect(props.items).toEqual([{ title: "Studio session 12", kind: "video" }]);
      expect(props.postalAddress).toBe("1 Main St, Miami FL 33101");
      expect(props.offUrl).toMatch(/^https:\/\/api\.amped\.bio\/email\/updates-off\?t=/);
      expect(db.contentItem.findMany.mock.calls[0]![0].where).toMatchObject({
        adult: false,
        publishedAt: { gt: new Date("2026-11-03T14:00:00Z") },
      });
    });

    it("sends nothing without the postal address, the flag or the consent", async () => {
      env.env.BULK_FOOTER_ADDRESS = "  ";
      expect(await runDigest(10, payload, now)).toBe("no_address");
      env.env.BULK_FOOTER_ADDRESS = "1 Main St";
      db.follow.findUnique.mockResolvedValue({ email_updates: false });
      expect(await runDigest(10, payload, now)).toBe("no_consent");
      __setFeatureFlagOverridesForTests({ fanLibrary: true, libraryDigest: false });
      expect(await runDigest(10, payload, now)).toBe("off");
      expect(mail.deliverEmail).not.toHaveBeenCalled();
    });

    it("skips a fan with no verified email", async () => {
      db.user.findUnique.mockResolvedValue({ email: "x@y.z", email_verified: false, block: "no" });
      expect(await runDigest(10, payload, now)).toBe("no_email");
    });

    it("sends nothing when every new item is locked for the fan", async () => {
      db.contentItem.findMany.mockResolvedValue([row({ accessRuleId: RULE })]);
      engine.checkBatch.mockResolvedValue(
        new Map([
          [
            "content:item000000000002",
            {
              allowed: false,
              reason: "not_pool_member",
              hint: { action: "view_pool", poolId: 1 },
              rule: null,
              checkedAt: "",
            },
          ],
        ])
      );
      expect(await runDigest(10, payload, now)).toBe("empty");
      expect(mail.deliverEmail).not.toHaveBeenCalled();
    });
  });

  it("signs the off link per fan and creator", () => {
    const token = updatesOffToken(10, MAYA);
    expect(readUpdatesOffToken(token)).toEqual({ userId: 10, creatorUserId: MAYA });
    expect(readUpdatesOffToken(token.replace("10-", "11-"))).toBeNull();
    expect(readUpdatesOffToken("junk")).toBeNull();
  });
});
