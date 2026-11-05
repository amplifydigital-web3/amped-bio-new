/**
 * Fan Library money (FL-7, MB-3; spec 2.1 and 2.2 items 5 and 6, row 125 and 182): the
 * membership cards with the wallet's coverage, the status sheet's membership, receipts and
 * purchases, and the Purchased and plan labels. The database and chain reads are fakes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  balance: 0n as bigint | null,
  allowance: 0n,
}));

function eq(a: unknown, b: unknown) {
  if (a instanceof Uint8Array && b instanceof Uint8Array)
    return Buffer.from(a).equals(Buffer.from(b));
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Row[]).some(c => matches(row, c));
    const value = row[key];
    if (
      cond &&
      typeof cond === "object" &&
      !(cond instanceof Uint8Array) &&
      !(cond instanceof Date)
    ) {
      if ("in" in cond) return cond.in.some((c: unknown) => eq(value, c));
      if ("gt" in cond) return value !== null && value > cond.gt;
      return true;
    }
    return eq(value ?? null, cond);
  });
}
function table(name: string) {
  state.tables[name] ??= [];
  return state.tables[name]!;
}
const PLAN_NAME = "Inner circle";
function withInclude(name: string, row: Row) {
  if (name === "membership") return { ...row, plan: { name: PLAN_NAME } };
  if (name === "offerItem") {
    const offer = table("offer").find(o => eq(o.id, row.offerId))!;
    return { ...row, offer };
  }
  return row;
}
function model(name: string) {
  const rows = () => table(name);
  return {
    findMany: vi.fn(async ({ where }: Row = {}) =>
      rows()
        .filter(r => matches(r, where))
        .map(r => withInclude(name, r))
    ),
    findUnique: vi.fn(async ({ where }: Row) => rows().find(r => matches(r, where)) ?? null),
    count: vi.fn(async ({ where }: Row) => rows().filter(r => matches(r, where)).length),
    groupBy: vi.fn(async ({ where }: Row) => {
      const counts = new Map<number, number>();
      for (const r of rows().filter(r => matches(r, where))) {
        counts.set(r.creatorUserId, (counts.get(r.creatorUserId) ?? 0) + 1);
      }
      return [...counts].map(([creatorUserId, n]) => ({ creatorUserId, _count: { _all: n } }));
    }),
  };
}

vi.mock("@repo/database", () => ({
  prisma: new Proxy({} as Row, { get: (t, p: string) => (t[p] ??= model(p)) }),
}));
vi.mock("../services/library/library", () => ({
  ownersFor: vi.fn(async (ids: number[]) => {
    const handles: Record<number, string> = { 10: "maya", 11: "lio" };
    return new Map(
      ids.map(id => [id, { owner: { handle: handles[id], name: null, image: null, accent: null } }])
    );
  }),
}));
vi.mock("../services/payments/onchain", () => ({
  ampedMembershipsAddress: () => "0x00000000000000000000000000000000000000aa",
}));
vi.mock("../services/usdc/chain", () => ({
  usdcAddress: () => "0x00000000000000000000000000000000000000bb",
  getUsdcBalance: vi.fn(async () => {
    if (state.balance === null) throw new Error("rpc down");
    return state.balance;
  }),
  paymentClient: () => ({ readContract: vi.fn(async () => state.allowance) }),
}));

import {
  creatorMoneyStatus,
  libraryCreatorMoney,
  libraryMembership,
  libraryMemberships,
  moneyCreatorIds,
  moneyLabels,
} from "../services/library/money";

const FAN = 20;
const NOW = new Date("2026-11-04T12:00:00Z");
const DAY = 86_400_000;
const WALLET = "0x00000000000000000000000000000000000000f1";
const id = (n: number) => Buffer.alloc(16, n);

function membership(n: number, extra: Row = {}) {
  return {
    id: id(n),
    fanUserId: FAN,
    creatorUserId: 10,
    member: WALLET,
    interval: "every_30_days",
    status: "active",
    pricePerPeriod: 5_000_000n,
    currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY),
    pastDueSince: null,
    renewalPausedAt: null,
    endedAt: null,
    storePolicyVersionId: null,
    createdAt: new Date(NOW.getTime() - 20 * DAY),
    updatedAt: NOW,
    ...extra,
  };
}

beforeEach(() => {
  state.balance = 0n;
  state.allowance = 0n;
  state.tables = {
    membership: [],
    purchase: [],
    paymentEvent: [],
    storePolicyVersion: [],
    offer: [],
    offerItem: [],
    contentItem: [],
    membershipPlan: [],
  };
});

describe("memberships cards (row 125)", () => {
  it("orders past due, not covered, covered, ends; matches charges to the wallet by due date", async () => {
    state.balance = 7_000_000n;
    state.allowance = 60_000_000n;
    table("membership").push(
      membership(1, { creatorUserId: 10, currentPeriodEnd: new Date(NOW.getTime() + 5 * DAY) }),
      membership(2, { creatorUserId: 11, currentPeriodEnd: new Date(NOW.getTime() + 9 * DAY) }),
      membership(3, {
        creatorUserId: 11,
        status: "canceled",
        currentPeriodEnd: new Date(NOW.getTime() + 3 * DAY),
      }),
      membership(4, {
        creatorUserId: 10,
        status: "past_due",
        pastDueSince: new Date(NOW.getTime() - 2 * DAY),
      })
    );
    const cards = await libraryMemberships(FAN, NOW);
    expect(cards.map(c => [c.id, c.state])).toEqual([
      [id(4).toString("hex"), "past_due"],
      [id(1).toString("hex"), "not_covered"],
      [id(2).toString("hex"), "not_covered"],
      [id(3).toString("hex"), "ends"],
    ]);
    // Past due falls due first and takes 5 of the 7 USDC; the next due is short by 3, the
    // one after by the full 5, so two cards never claim the same USDC
    expect(cards[0]).toMatchObject({ graceDay: 3, need: null, chargesLeft: 12 });
    expect(cards[1]).toMatchObject({ need: "3000000", allowanceShort: false });
    expect(cards[2]).toMatchObject({ need: "5000000" });
    expect(cards[3]).toMatchObject({ need: null, chargesLeft: null });
  });

  it("says covered through the period after the next charge when the wallet holds it", async () => {
    state.balance = 50_000_000n;
    state.allowance = 50_000_000n;
    table("membership").push(membership(1));
    const [card] = await libraryMemberships(FAN, NOW);
    expect(card).toMatchObject({
      state: "covered",
      coveredThrough: new Date(NOW.getTime() + 40 * DAY).toISOString(),
      chargesLeft: 10,
      need: null,
      owner: { handle: "maya" },
      planName: PLAN_NAME,
    });
  });

  it("flags an approval that ran out even with USDC in the wallet", async () => {
    state.balance = 50_000_000n;
    state.allowance = 1_000_000n;
    table("membership").push(membership(1));
    const [card] = await libraryMemberships(FAN, NOW);
    expect(card).toMatchObject({
      state: "not_covered",
      need: null,
      allowanceShort: true,
      chargesLeft: 0,
    });
  });

  it("claims nothing when the wallet can not be read, and asks the full charge when past due", async () => {
    state.balance = null;
    table("membership").push(
      membership(1),
      membership(2, { status: "past_due", pastDueSince: new Date(NOW.getTime() - DAY) })
    );
    const cards = await libraryMemberships(FAN, NOW);
    expect(cards.find(c => c.id === id(1).toString("hex"))).toMatchObject({
      state: "active",
      coveredThrough: null,
      chargesLeft: null,
    });
    expect(cards.find(c => c.id === id(2).toString("hex"))).toMatchObject({
      state: "past_due",
      need: "5000000",
    });
  });

  it("keeps ended memberships for 90 days for Rejoin, and names the policy at join", async () => {
    table("storePolicyVersion").push({ id: id(9), version: 3 });
    table("membership").push(
      membership(1, {
        status: "ended",
        endedAt: new Date(NOW.getTime() - 10 * DAY),
        storePolicyVersionId: id(9),
      }),
      membership(2, { status: "ended", endedAt: new Date(NOW.getTime() - 100 * DAY) })
    );
    const cards = await libraryMemberships(FAN, NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ state: "ended", storePolicyVersion: 3 });
  });

  it("returns the Manage sheet with receipts only for the fan's own membership", async () => {
    state.balance = 50_000_000n;
    state.allowance = 50_000_000n;
    table("membership").push(membership(1));
    table("paymentEvent").push({
      kind: "membership_charged",
      refType: "membership",
      refId: id(1),
      payerUserId: FAN,
      occurredAt: NOW,
      amount: 5_000_000n,
      txHash: "0xabc",
    });
    const found = await libraryMembership(FAN, id(1).toString("hex"), NOW);
    expect(found?.receipts).toEqual([
      { at: NOW.toISOString(), amount: "5000000", txHash: "0xabc" },
    ]);
    expect(await libraryMembership(99, id(1).toString("hex"), NOW)).toBeNull();
  });
});

describe("status sheet and labels (row 182)", () => {
  it("lists purchases from a creator with the policy shown, and the current membership", async () => {
    table("offer").push({ id: id(5), title: "Course", alsoInMembership: false, creatorUserId: 10 });
    table("storePolicyVersion").push({ id: id(9), version: 2 });
    table("purchase").push(
      {
        id: id(6),
        buyerUserId: FAN,
        creatorUserId: 10,
        targetType: "offer",
        targetId: id(5).toString("hex"),
        offerId: id(5),
        amount: 12_000_000n,
        status: "confirmed",
        txHash: "0xdef",
        softConfirmedAt: NOW,
        confirmedAt: NOW,
        createdAt: NOW,
        accessUntil: null,
        storePolicyVersionId: id(9),
      },
      {
        id: id(7),
        buyerUserId: FAN,
        creatorUserId: 10,
        targetType: "content",
        targetId: "abcdefghijklmnop",
        offerId: null,
        amount: 3_000_000n,
        status: "refunded",
        txHash: "0x123",
        softConfirmedAt: NOW,
        confirmedAt: null,
        createdAt: NOW,
        accessUntil: null,
        storePolicyVersionId: null,
      }
    );
    table("membership").push(membership(1));
    const money = await libraryCreatorMoney(FAN, 10, NOW);
    expect(money.purchases).toEqual([
      expect.objectContaining({
        title: "Course",
        amount: "12000000",
        state: "final",
        storePolicyVersion: 2,
      }),
      expect.objectContaining({
        title: "Removed item",
        state: "refunded",
        storePolicyVersion: null,
      }),
    ]);
    expect(money.membership?.id).toBe(id(1).toString("hex"));

    table("membershipPlan").push({
      creatorUserId: 10,
      name: PLAN_NAME,
      status: "active",
      amountEvery30Days: 5_000_000n,
    });
    expect(await creatorMoneyStatus(FAN, 10, NOW)).toEqual({
      membership: expect.objectContaining({ state: "active", planName: PLAN_NAME }),
      purchases: 1,
      plan: { name: PLAN_NAME, amountEvery30Days: "5000000" },
    });
  });

  it("labels Purchased over the plan, and the plan only on Also in membership products", async () => {
    const bought = { id: id(21), publicId: "boughtitem000001", userId: 10 };
    const inPlan = { id: id(22), publicId: "planitem00000001", userId: 10 };
    const plain = { id: id(23), publicId: "plainitem0000001", userId: 10 };
    table("offer").push(
      { id: id(31), alsoInMembership: true, creatorUserId: 10 },
      { id: id(32), alsoInMembership: false, creatorUserId: 10 }
    );
    table("offerItem").push(
      { contentItemId: id(21), offerId: id(31) },
      { contentItemId: id(22), offerId: id(31) },
      { contentItemId: id(23), offerId: id(32) }
    );
    table("purchase").push({
      buyerUserId: FAN,
      creatorUserId: 10,
      targetType: "content",
      targetId: "boughtitem000001",
      offerId: null,
      status: "confirmed_soft",
      accessUntil: null,
    });
    table("membership").push(membership(1));
    const labels = await moneyLabels(FAN, [bought, inPlan, plain], NOW);
    expect(labels.get(bought.publicId)).toEqual({ source: "purchased", planName: null });
    expect(labels.get(inPlan.publicId)).toEqual({ source: "member", planName: PLAN_NAME });
    expect(labels.has(plain.publicId)).toBe(false);

    // A membership past its period end labels nothing
    table("membership")[0]!.status = "canceled";
    table("membership")[0]!.currentPeriodEnd = new Date(NOW.getTime() - DAY);
    expect((await moneyLabels(FAN, [inPlan], NOW)).size).toBe(0);
  });

  it("connects members and buyers, and marks a past due creator", async () => {
    table("membership").push(
      membership(1, {
        creatorUserId: 10,
        status: "past_due",
        pastDueSince: new Date(NOW.getTime() - DAY),
      })
    );
    table("purchase").push({ buyerUserId: FAN, creatorUserId: 11, status: "confirmed" });
    const ids = await moneyCreatorIds(FAN, NOW);
    expect([...ids.members]).toEqual([10]);
    expect([...ids.pastDue]).toEqual([10]);
    expect([...ids.purchased]).toEqual([[11, 1]]);
  });
});
