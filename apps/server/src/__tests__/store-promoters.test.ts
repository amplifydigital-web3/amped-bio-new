/**
 * Store promoters (C12; content spec 3.9 Promoters, decisions 20 and 25): codes, the share
 * bounds and creator floor, scope, attribution rules, the refund pause, and the promoter's
 * own list. The database is an in memory fake; payment settings and screening are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";

type Row = Record<string, any>;

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  screenAllowed: true,
  settings: {
    platformFeeBps: 500,
    promoterShareMinBps: 100,
    promoterShareMaxBps: 3_000,
    promoterRefundPauseRateBps: 1_000,
  },
}));

function eq(a: unknown, b: unknown) {
  if (Buffer.isBuffer(a) || a instanceof Uint8Array) {
    return (Buffer.isBuffer(b) || b instanceof Uint8Array) && Buffer.from(a).equals(Buffer.from(b));
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (
      cond &&
      typeof cond === "object" &&
      !Buffer.isBuffer(cond) &&
      !(cond instanceof Date) &&
      !(cond instanceof Uint8Array)
    ) {
      if ("in" in cond) return cond.in.some((c: unknown) => eq(value, c));
      if ("not" in cond) return !eq(value, cond.not);
      if ("gte" in cond) return value !== null && value >= cond.gte;
      return true;
    }
    return eq(value ?? null, cond);
  });
}

function table(name: string) {
  state.tables[name] ??= [];
  return state.tables[name]!;
}

function withIncludes(name: string, row: Row | null, include?: Row) {
  if (!row || !include) return row;
  const out = { ...row };
  const user = (id: number) => {
    const u = table("user").find(r => r.id === id)!;
    return { ...u, wallet: u.walletAddress ? { address: u.walletAddress } : null };
  };
  if (include.promoter) out.promoter = user(row.promoterUserId);
  if (include.creator) out.creator = user(row.creatorUserId);
  return out;
}

function model(name: string) {
  const rows = () => table(name);
  return {
    findUnique: vi.fn(async ({ where, include }: Row) =>
      withIncludes(name, rows().find(r => matches(r, where)) ?? null, include)
    ),
    findFirst: vi.fn(async ({ where, select }: Row) => {
      const row = rows().find(r => matches(r, where)) ?? null;
      if (row && select?.wallet) {
        return { ...row, wallet: row.walletAddress ? { address: row.walletAddress } : null };
      }
      return row;
    }),
    findMany: vi.fn(async ({ where, include }: Row) =>
      rows()
        .filter(r => matches(r, where))
        .map(r => withIncludes(name, r, include))
    ),
    count: vi.fn(async ({ where }: Row) => rows().filter(r => matches(r, where)).length),
    create: vi.fn(async ({ data }: Row) => {
      if (name === "promoterCode" && rows().some(r => r.code === data.code)) {
        throw Object.assign(new Error("dup"), { code: "P2002" });
      }
      const row = {
        status: "active",
        pausedReason: null,
        endedAt: null,
        createdAt: new Date(),
        ...data,
      };
      rows().push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: Row) =>
      Object.assign(rows().find(r => matches(r, where))!, data)
    ),
    updateMany: vi.fn(async ({ where, data }: Row) => {
      const hit = rows().filter(r => matches(r, where));
      hit.forEach(r => Object.assign(r, data));
      return { count: hit.length };
    }),
  };
}

vi.mock("@repo/database", () => ({
  prisma: new Proxy({} as Row, {
    get: (target, prop: string) => (target[prop] ??= model(prop)),
  }),
}));
vi.mock("../services/payments/settings", () => ({
  paymentSettings: vi.fn(async () => state.settings),
}));
vi.mock("../services/usdc/screen", () => ({
  ScreeningUnavailableError: class extends Error {},
  screenAddress: vi.fn(async () => ({ allowed: state.screenAllowed, checkedBy: ["circle"] })),
}));

import {
  checkRefundPause,
  generateCode,
  listCodes,
  listMine,
  resolvePromoter,
  setCodeStatus,
  upsertCode,
} from "../services/store/promoters";

const MAYA = 10;
const SAM = 30;
const FAN = 20;
const SAM_WALLET = getAddress("0xd000000000000000000000000000000000000004");
const FAN_WALLET = getAddress("0xf000000000000000000000000000000000000005");
const NOW = new Date("2026-11-04T12:00:00Z");
const OFFER = "0a".repeat(16);
const OTHER_OFFER = "0b".repeat(16);
const PLAN = "0d".repeat(16);

beforeEach(() => {
  state.screenAllowed = true;
  state.settings = {
    platformFeeBps: 500,
    promoterShareMinBps: 100,
    promoterShareMaxBps: 3_000,
    promoterRefundPauseRateBps: 1_000,
  };
  state.tables = {
    user: [
      {
        id: MAYA,
        handle: "maya",
        name: "Maya Lin",
        block: "no",
        walletAddress: "0x" + "c".repeat(40),
      },
      { id: SAM, handle: "sam", name: "Sam", block: "no", walletAddress: SAM_WALLET },
      { id: FAN, handle: "fan", name: "Fan", block: "no", walletAddress: FAN_WALLET },
      { id: 40, handle: "nowallet", name: "No Wallet", block: "no", walletAddress: null },
    ],
    offer: [
      { id: Buffer.from(OFFER, "hex"), creatorUserId: MAYA, status: "active" },
      { id: Buffer.from(OTHER_OFFER, "hex"), creatorUserId: 99, status: "active" },
    ],
    membershipPlan: [{ id: Buffer.from(PLAN, "hex"), creatorUserId: MAYA }],
    promoterCode: [],
    purchase: [],
    membership: [],
    notification: [],
  };
});

const make = (extra: Row = {}) =>
  upsertCode(MAYA, { promoterHandle: "@Sam", bps: 1_000, scope: "all", ...extra }, NOW);

const attribute = (extra: Row = {}) =>
  resolvePromoter({
    via: "SAM10",
    creatorUserId: MAYA,
    targetId: OFFER,
    buyerUserId: FAN,
    payer: FAN_WALLET,
    platformFeeBps: 500,
    minCreatorBps: 5_000,
    now: NOW,
    ...extra,
  });

describe("promoter codes", () => {
  it("makes a code for a handle, tells the promoter, and lists it", async () => {
    const row = await make();
    expect(row).toMatchObject({
      promoter: { handle: "sam", name: "Sam" },
      bps: 1_000,
      scope: "all",
      status: "active",
      sales: 0,
    });
    expect(row.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(table("notification")).toEqual([
      expect.objectContaining({ userId: SAM, kind: "PROMOTER_CODE", actorId: MAYA }),
    ]);
    expect(await listCodes(MAYA, NOW)).toHaveLength(1);
    expect(generateCode()).toHaveLength(8);
  });

  it("refuses a missing handle, the creator, an account with no wallet and a taken code", async () => {
    await expect(make({ promoterHandle: "nobody" })).rejects.toMatchObject({
      code: "promoter_not_found",
    });
    await expect(make({ promoterHandle: "maya" })).rejects.toMatchObject({ code: "promoter_self" });
    await expect(make({ promoterHandle: "nowallet" })).rejects.toMatchObject({
      code: "promoter_no_wallet",
    });
    await make({ code: "SAM10" });
    await expect(make({ code: "SAM10" })).rejects.toMatchObject({ code: "code_taken" });
  });

  it("holds the share to the settings range and the creator minimum", async () => {
    await expect(make({ bps: 50 })).rejects.toMatchObject({
      code: "share_range",
      detail: { min: "1%", max: "30%" },
    });
    await expect(make({ bps: 3_500 })).rejects.toMatchObject({ code: "share_range" });
    state.settings.promoterShareMaxBps = 5_000;
    // 10,000 less the 5% fee and the 50% creator floor leaves 45%
    await expect(make({ bps: 4_600 })).rejects.toMatchObject({ code: "creator_floor" });
    await expect(make({ bps: 4_500 })).resolves.toMatchObject({ bps: 4_500 });
  });

  it("accepts only the creator's own products and plan, and an end date after today", async () => {
    await expect(make({ scope: [OTHER_OFFER] })).rejects.toMatchObject({
      code: "scope_not_yours",
    });
    await expect(make({ scope: [OFFER, PLAN] })).resolves.toMatchObject({ scope: [OFFER, PLAN] });
    await expect(make({ expiresAt: "2026-11-01T00:00:00Z" })).rejects.toMatchObject({
      code: "expires_past",
    });
  });

  it("edits share and scope, pauses, turns back on and ends for good", async () => {
    const row = await make({ code: "SAM10" });
    const edited = await upsertCode(MAYA, { id: row.id, bps: 2_000, scope: [OFFER] }, NOW);
    expect(edited).toMatchObject({ bps: 2_000, scope: [OFFER], code: "SAM10" });
    expect(await setCodeStatus(MAYA, row.id, "paused", NOW)).toMatchObject({
      status: "paused",
      pausedReason: "creator",
    });
    expect(await setCodeStatus(MAYA, row.id, "active", NOW)).toMatchObject({ status: "active" });
    expect(await setCodeStatus(MAYA, row.id, "ended", NOW)).toMatchObject({ status: "ended" });
    await expect(setCodeStatus(MAYA, row.id, "active", NOW)).rejects.toMatchObject({
      code: "ended",
    });
    await expect(
      upsertCode(MAYA, { id: row.id, bps: 500, scope: "all" }, NOW)
    ).rejects.toMatchObject({
      code: "ended",
    });
    await expect(setCodeStatus(SAM, row.id, "paused", NOW)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("attribution", () => {
  it("returns the promoter row for an active, in scope code, case insensitive", async () => {
    await make({ code: "SAM10" });
    expect(await attribute({ via: "sam10", screen: true })).toMatchObject({
      promoterUserId: SAM,
      handle: "sam",
      to: SAM_WALLET,
      bps: 1_000,
    });
  });

  it("attributes nothing for a bad, paused, expired, other store or out of scope code", async () => {
    expect(await attribute({ via: "UNKNOWN1" })).toBeNull();
    expect(await attribute({ via: "x!" })).toBeNull();
    const row = await make({ code: "SAM10", scope: [PLAN] });
    expect(await attribute()).toBeNull();
    expect(await attribute({ targetId: PLAN })).not.toBeNull();
    expect(await attribute({ targetId: null })).toBeNull();
    expect(await attribute({ targetId: PLAN, creatorUserId: 99 })).toBeNull();
    await setCodeStatus(MAYA, row.id, "paused", NOW);
    expect(await attribute({ targetId: PLAN })).toBeNull();
    await setCodeStatus(MAYA, row.id, "active", NOW);
    await upsertCode(
      MAYA,
      { id: row.id, bps: 1_000, scope: [PLAN], expiresAt: "2026-11-05T00:00:00Z" },
      NOW
    );
    expect(await attribute({ targetId: PLAN, now: new Date("2026-11-06T00:00:00Z") })).toBeNull();
  });

  it("never pays the buyer through their own code or wallet", async () => {
    await make({ code: "SAM10" });
    expect(await attribute({ buyerUserId: SAM })).toBeNull();
    expect(await attribute({ payer: SAM_WALLET })).toBeNull();
  });

  it("drops the row when the settings or the fee now break the creator minimum, or screening denies", async () => {
    await make({ code: "SAM10" });
    state.settings.promoterShareMaxBps = 500;
    expect(await attribute()).toBeNull();
    state.settings.promoterShareMaxBps = 3_000;
    expect(await attribute({ platformFeeBps: 4_500 })).toBeNull();
    state.screenAllowed = false;
    expect(await attribute({ screen: true })).toBeNull();
    expect(await attribute({ screen: false })).not.toBeNull();
  });
});

describe("refunds and the promoter's view", () => {
  function sale(codeId: Buffer, status: string, extra: Row = {}) {
    table("purchase").push({
      promoterCodeId: codeId,
      amount: 10_000_000n,
      split: { recipients: [{ to: SAM_WALLET, bps: 1_000, role: 2 }] },
      status,
      refundedAt: status === "refunded" ? NOW : null,
      createdAt: NOW,
      ...extra,
    });
  }

  it("pauses a code whose refunds pass the rate in 30 days, and not before", async () => {
    const row = await make({ code: "SAM10" });
    const id = Buffer.from(row.id, "hex");
    for (let i = 0; i < 9; i += 1) sale(id, "confirmed");
    sale(id, "refunded");
    // 1 refund in 10 sales is exactly 10%: not above the rate
    expect(await checkRefundPause(id, NOW)).toBe(false);
    sale(id, "refunded");
    expect(await checkRefundPause(id, NOW)).toBe(true);
    expect((await listCodes(MAYA, NOW))[0]).toMatchObject({
      status: "paused",
      pausedReason: "refunds",
      sales: 9,
      refunds30d: 2,
    });
  });

  it("shows the promoter their codes, sales and earnings, refunds kept", async () => {
    const row = await make({ code: "SAM10" });
    const id = Buffer.from(row.id, "hex");
    sale(id, "confirmed");
    sale(id, "refunded");
    table("membership").push({
      promoterCodeId: id,
      status: "active",
      pricePerPeriod: 5_000_000n,
      chargeCount: 2,
      joinTable: { recipients: [{ to: SAM_WALLET, bps: 1_000, role: 2 }] },
    });
    const [mine] = await listMine(SAM, NOW);
    expect(mine).toMatchObject({
      code: "SAM10",
      creator: { handle: "maya" },
      bps: 1_000,
      scopeCount: "all",
      status: "active",
      sales: 2,
      // 1 + 1 from the two sales, 0.5 times two charges from the membership
      earned: "3000000",
    });
    expect(await listMine(FAN, NOW)).toEqual([]);
  });
});
