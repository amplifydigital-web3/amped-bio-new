/**
 * AB-6 seller tier (Build Board #66, docs/features/authbase-storefront.md 3.2b, decision M10):
 * creators need Enhanced to sell unless an admin override is active. The override ends at the
 * earlier of its date and the Authbase verification. The rule is off until the flag is on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  overrides: [] as {
    id: Buffer;
    userId: number;
    reason: string;
    endsAt: Date;
    createdById: number;
    revokedAt: Date | null;
    reminderSentAt: Date | null;
    endedNoticeAt: Date | null;
    createdAt: Date;
  }[],
  changes: [] as unknown[],
  emails: [] as { to: string[]; subject: string }[],
  throws: false,
}));

vi.mock("@repo/database", () => {
  const live = (where: { userId?: number; revokedAt?: null; endsAt?: { gt?: Date; lte?: Date } }) =>
    state.overrides.filter(
      o =>
        (where.userId === undefined || o.userId === where.userId) &&
        (where.revokedAt === undefined || o.revokedAt === null) &&
        (!where.endsAt?.gt || o.endsAt > where.endsAt.gt) &&
        (!where.endsAt?.lte || o.endsAt <= where.endsAt.lte)
    );
  const sellerOverride = {
    findFirst: async ({ where }: { where: never }) => {
      if (state.throws) throw new Error("db down");
      return live(where).sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0] ?? null;
    },
    findMany: async ({ where }: { where: never }) => live(where),
    create: async ({ data }: { data: never }) => {
      const row = {
        revokedAt: null,
        reminderSentAt: null,
        endedNoticeAt: null,
        createdAt: new Date(),
        ...(data as object),
      };
      state.overrides.push(row as never);
      return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
      const rows = state.overrides.filter(o =>
        where.id
          ? o.id.equals(where.id as Buffer) &&
            Object.entries(where).every(
              ([k, v]) => k === "id" || (o as Record<string, unknown>)[k] === v
            )
          : live(where as never).includes(o)
      );
      rows.forEach(r => Object.assign(r, data));
      return { count: rows.length };
    },
  };
  const prisma = {
    sellerOverride,
    adminChange: { create: async ({ data }: { data: unknown }) => state.changes.push(data) },
    user: { findUnique: async () => ({ id: 7, email: "maya@example.test" }) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  return { prisma, Prisma: {} };
});
vi.mock("../utils/email/transport", () => ({
  deliverEmail: vi.fn(async (email: { to: string[]; subject: string }) => {
    state.emails.push(email);
    return {};
  }),
}));

import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";
import {
  applySellerTier,
  setSellerOverride,
  revokeSellerOverride,
  sweepSellerOverrides,
} from "../services/identity/sellerOverride";

const NOW = new Date("2026-11-05T12:00:00Z");
const DAY = 86_400_000;
const STANDARD = {
  pass: true as const,
  tier: "STANDARD" as const,
  validUntil: new Date(NOW.getTime() + 300 * DAY),
};
const ENHANCED = { ...STANDARD, tier: "ENHANCED" as const };

beforeEach(() => {
  state.overrides.length = 0;
  state.changes.length = 0;
  state.emails.length = 0;
  state.throws = false;
  __setFeatureFlagOverridesForTests({ sellerRequiresEnhanced: true });
});

describe("applySellerTier", () => {
  it("passes Enhanced and leaves every result alone while the rule is off", async () => {
    expect(await applySellerTier(7, ENHANCED, NOW)).toEqual(ENHANCED);
    __setFeatureFlagOverridesForTests({ sellerRequiresEnhanced: false });
    expect(await applySellerTier(7, STANDARD, NOW)).toEqual(STANDARD);
  });

  it("refuses Standard with needs_enhanced, and fails closed on a read error", async () => {
    expect(await applySellerTier(7, STANDARD, NOW)).toEqual({
      pass: false,
      reason: "needs_enhanced",
    });
    state.throws = true;
    expect(await applySellerTier(7, STANDARD, NOW)).toEqual({ pass: false, reason: "unavailable" });
  });

  it("passes Standard with an override, until the earlier of the override and Authbase", async () => {
    await setSellerOverride({
      adminUserId: 1,
      userId: 7,
      reason: "Grace for launch",
      endsAt: new Date(NOW.getTime() + 30 * DAY),
      now: NOW,
    });
    const allowed = await applySellerTier(7, STANDARD, NOW);
    expect(allowed).toMatchObject({ pass: true, tier: "STANDARD" });
    expect(allowed.pass && allowed.validUntil.getTime()).toBe(NOW.getTime() + 30 * DAY);
    expect(allowed.pass && allowed.overrideUntil?.getTime()).toBe(NOW.getTime() + 30 * DAY);

    const shortAuthbase = { ...STANDARD, validUntil: new Date(NOW.getTime() + 10 * DAY) };
    const capped = await applySellerTier(7, shortAuthbase, NOW);
    expect(capped.pass && capped.validUntil.getTime()).toBe(NOW.getTime() + 10 * DAY);

    expect(await applySellerTier(7, STANDARD, new Date(NOW.getTime() + 31 * DAY))).toEqual({
      pass: false,
      reason: "needs_enhanced",
    });
  });
});

describe("overrides", () => {
  it("need a reason, a future end inside a year, and not the admin's own account; each is logged", async () => {
    await expect(
      setSellerOverride({
        adminUserId: 1,
        userId: 7,
        reason: "x",
        endsAt: new Date(NOW.getTime() + DAY),
        now: NOW,
      })
    ).rejects.toThrow("reason");
    await expect(
      setSellerOverride({ adminUserId: 1, userId: 7, reason: "Grace", endsAt: NOW, now: NOW })
    ).rejects.toThrow("future");
    await expect(
      setSellerOverride({
        adminUserId: 1,
        userId: 7,
        reason: "Grace",
        endsAt: new Date(NOW.getTime() + 400 * DAY),
        now: NOW,
      })
    ).rejects.toThrow("365");
    await expect(
      setSellerOverride({
        adminUserId: 7,
        userId: 7,
        reason: "Grace",
        endsAt: new Date(NOW.getTime() + DAY),
        now: NOW,
      })
    ).rejects.toThrow("own account");
    await setSellerOverride({
      adminUserId: 1,
      userId: 7,
      reason: "Grace",
      endsAt: new Date(NOW.getTime() + DAY),
      now: NOW,
    });
    expect(state.changes).toHaveLength(1);
    expect(state.emails[0]!.subject).toMatch(/Standard check for now/);
  });

  it("ends on request, then refuses Standard again", async () => {
    await setSellerOverride({
      adminUserId: 1,
      userId: 7,
      reason: "Grace",
      endsAt: new Date(NOW.getTime() + 30 * DAY),
      now: NOW,
    });
    await revokeSellerOverride({ adminUserId: 2, userId: 7, reason: "Upgraded", now: NOW });
    expect(await applySellerTier(7, STANDARD, NOW)).toEqual({
      pass: false,
      reason: "needs_enhanced",
    });
  });

  it("sends the 7 day reminder once and the ended notice once", async () => {
    await setSellerOverride({
      adminUserId: 1,
      userId: 7,
      reason: "Grace",
      endsAt: new Date(NOW.getTime() + 5 * DAY),
      now: NOW,
    });
    state.emails.length = 0;
    expect(await sweepSellerOverrides(NOW)).toBe(1);
    expect(await sweepSellerOverrides(NOW)).toBe(0);
    expect(await sweepSellerOverrides(new Date(NOW.getTime() + 6 * DAY))).toBe(1);
    expect(state.emails.map(e => e.subject)).toEqual([
      "Selling with Standard ends in 7 days",
      "Selling with Standard has ended",
    ]);
  });
});
