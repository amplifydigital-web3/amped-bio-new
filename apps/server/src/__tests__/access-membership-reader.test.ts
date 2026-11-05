/**
 * Membership reader for the `member` kind (gating spec 3.3, G5). The database is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  plan: null as null | { creatorUserId: number; status: string; amountEvery30Days: bigint },
  row: null as null | {
    status: string;
    currentPeriodEnd: Date | null;
    pastDueSince: Date | null;
  },
}));

vi.mock("@repo/database", () => ({
  prisma: {
    membershipPlan: { findUnique: vi.fn(async () => state.plan) },
    membership: { findFirst: vi.fn(async () => state.row) },
  },
}));

import { membershipReader } from "../services/access/verifiers/membership";

const PLAN = "cd".repeat(16);
const now = new Date("2026-11-04T12:00:00Z");
const later = new Date("2026-12-01T00:00:00Z");
const earlier = new Date("2026-10-01T00:00:00Z");
const row = (status: string, currentPeriodEnd: Date | null, pastDueSince: Date | null = null) => ({
  status,
  currentPeriodEnd,
  pastDueSince,
});

beforeEach(() => {
  state.plan = null;
  state.row = null;
});

describe("membershipReader.plan", () => {
  it("maps the plan, and returns null for a bad id or a missing row", async () => {
    expect(await membershipReader.plan("nope")).toBeNull();
    expect(await membershipReader.plan(PLAN)).toBeNull();
    state.plan = { creatorUserId: 10, status: "active", amountEvery30Days: 4_990_000n };
    expect(await membershipReader.plan(PLAN)).toEqual({
      ownerUserId: 10,
      status: "active",
      amountEvery30Days: 4_990_000n,
    });
  });
});

describe("membershipReader.membership", () => {
  it("none when the fan never joined", async () => {
    expect(await membershipReader.membership(20, 10, now)).toBe("none");
  });

  it("active through the paid period, ended after it closes", async () => {
    state.row = row("active", later);
    expect(await membershipReader.membership(20, 10, now)).toBe("active");
    state.row = row("active", null);
    expect(await membershipReader.membership(20, 10, now)).toBe("ended");
  });

  it("canceled keeps access to the period end", async () => {
    state.row = row("canceled", later);
    expect(await membershipReader.membership(20, 10, now)).toBe("active");
    state.row = row("canceled", earlier);
    expect(await membershipReader.membership(20, 10, now)).toBe("ended");
  });

  it("past due is grace for 7 days, then ended", async () => {
    state.row = row("past_due", earlier, new Date("2026-11-01T00:00:00Z"));
    expect(await membershipReader.membership(20, 10, now)).toBe("grace");
    state.row = row("past_due", earlier, new Date("2026-10-20T00:00:00Z"));
    expect(await membershipReader.membership(20, 10, now)).toBe("ended");
  });

  it("an ended membership stays ended", async () => {
    state.row = row("ended", earlier);
    expect(await membershipReader.membership(20, 10, now)).toBe("ended");
  });
});
