/**
 * AB-1 merchants core (Build Board #66, docs/features/authbase-storefront.md 3.2, 3.8, 3.10,
 * decisions M1 to M3): checkMerchant fails closed, the two person rule for a merchant's status
 * and fee, and the payout wallet change (second Owner, 24 hour wait, old quotes unchanged).
 * The database is faked in memory.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
const { db, tables } = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {};

  function eq(a: unknown, b: unknown) {
    if (Buffer.isBuffer(a) || a instanceof Uint8Array)
      return Buffer.from(a as Uint8Array).equals(Buffer.from(b as Uint8Array));
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    return a === b;
  }

  function matches(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key === "NOT") return !matches(row, cond as Row);
      if (
        key.includes("_") &&
        typeof cond === "object" &&
        cond &&
        !Array.isArray(cond) &&
        !(cond instanceof Uint8Array) &&
        !("in" in cond) &&
        !("lte" in cond) &&
        !("startsWith" in cond)
      ) {
        return matches(row, cond as Row);
      }
      const value = row[key];
      if (
        cond &&
        typeof cond === "object" &&
        !(cond instanceof Uint8Array) &&
        !(cond instanceof Date)
      ) {
        const c = cond as Row;
        if ("in" in c) return (c.in as unknown[]).some(v => eq(value, v));
        if ("lte" in c) return value != null && value <= c.lte;
        if ("startsWith" in c) return String(value).startsWith(c.startsWith);
      }
      return eq(value, cond);
    });
  }

  function model(name: string) {
    tables[name] ??= [];
    const t = () => tables[name]!;
    return {
      findUnique: async ({ where }: Row) => t().find(r => matches(r, where)) ?? null,
      findFirst: async ({ where, orderBy }: Row) => {
        const rows = t().filter(r => matches(r, where));
        if (orderBy) {
          const [[k, dir]] = Object.entries(orderBy) as [string, string][];
          rows.sort((a, b) => (a[k!] > b[k!] ? 1 : -1) * (dir === "desc" ? -1 : 1));
        }
        return rows[0] ?? null;
      },
      findMany: async ({ where }: Row = {}) => t().filter(r => matches(r, where)),
      create: async ({ data }: Row) => {
        const row = { createdAt: new Date(), ...data };
        t().push(row);
        return row;
      },
      update: async ({ where, data }: Row) => {
        const row = t().find(r => matches(r, where));
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: Row) => {
        const rows = t().filter(r => matches(r, where));
        rows.forEach(r => Object.assign(r, data));
        return { count: rows.length };
      },
      upsert: async ({ where, create, update }: Row) => {
        const row = t().find(r => matches(r, where));
        if (row) return Object.assign(row, update);
        t().push({ ...create });
        return create;
      },
    };
  }

  const db: Row = {
    merchant: model("merchant"),
    merchantMember: model("merchantMember"),
    merchantPayoutWallet: model("merchantPayoutWallet"),
    merchantAuditLog: model("merchantAuditLog"),
    adminChange: model("adminChange"),
    user: model("user"),
  };
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
  return { db, tables };
});

vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));
vi.mock("../utils/email/transport", () => ({ deliverEmail: vi.fn(async () => ({})) }));
const screen = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ allowed: true, checkedBy: ["none"] }))
);
vi.mock("../services/usdc/screen", () => ({
  screenAddress: (...args: unknown[]) => screen(...args),
  ScreeningUnavailableError: class ScreeningUnavailableError extends Error {},
}));

import { checkMerchant } from "../services/merchants/check";
import {
  approveMerchantChange,
  createMerchant,
  draftMerchantChange,
  recordBusinessCheck,
  MerchantAdminError,
} from "../services/merchants/admin";
import {
  PayoutWalletError,
  applyDuePayoutWallets,
  approvePayoutWallet,
  proofChallenge,
  proposePayoutWallet,
  setProofVerifierForTests,
} from "../services/merchants/payoutWallets";

const ADMIN_A = 1;
const ADMIN_B = 2;
const OWNER_A = 10;
const OWNER_B = 11;
const WALLET = "0x1111111111111111111111111111111111111111";
const NEXT_WALLET = "0x2222222222222222222222222222222222222222";

async function seedMerchant() {
  const { id } = await createMerchant({ userId: ADMIN_A, slug: "authbase", name: "Authbase" });
  const merchantId = Buffer.from(id, "hex");
  for (const userId of [OWNER_A, OWNER_B]) {
    tables.merchantMember!.push({ merchantId, userId, role: "owner" });
    tables.user!.push({ id: userId, email: `${userId}@authbase.test` });
  }
  return { id, merchantId };
}

async function activate(merchantId: Buffer) {
  await recordBusinessCheck({
    adminUserId: ADMIN_A,
    merchantId,
    check: { registration: true, beneficialOwners: true, sanctionsScreen: true },
  });
  const change = await draftMerchantChange({
    userId: ADMIN_A,
    merchantId,
    field: "status",
    newValue: "active",
    reason: "Business check on file",
  });
  await approveMerchantChange({ userId: ADMIN_B, changeId: Buffer.from(change.id) });
}

async function propose(merchantId: Buffer, id: string, address: string, userId = OWNER_A) {
  const message = await proofChallenge(id, address);
  return proposePayoutWallet({ merchantId, userId, address, message, signature: "0x1234" });
}

beforeEach(() => {
  for (const key of Object.keys(tables)) tables[key]!.length = 0;
  screen.mockClear();
  screen.mockResolvedValue({ allowed: true, checkedBy: ["none"] });
  setProofVerifierForTests(async () => true);
});

describe("checkMerchant (M1)", () => {
  it("refuses a pending merchant, one with no wallet, and a screened wallet; passes when all hold", async () => {
    const { id, merchantId } = await seedMerchant();
    expect(await checkMerchant(merchantId)).toEqual({ pass: false, reason: "not_active" });
    await activate(merchantId);
    expect(await checkMerchant(merchantId)).toEqual({ pass: false, reason: "no_payout_wallet" });

    const row = await propose(merchantId, id, WALLET);
    const now = new Date();
    await approvePayoutWallet({ merchantId, walletId: Buffer.from(row.id), userId: OWNER_B, now });
    await applyDuePayoutWallets(new Date(now.getTime() + 24 * 3600_000));

    const passed = await checkMerchant(merchantId);
    expect(passed).toMatchObject({ pass: true, feeBps: 2_000 });
    screen.mockResolvedValueOnce({ allowed: false, checkedBy: ["circle"] });
    expect(await checkMerchant(merchantId)).toEqual({ pass: false, reason: "screening" });
  });

  it("fails closed when the database throws", async () => {
    const original = db.merchant.findUnique;
    db.merchant.findUnique = async () => {
      throw new Error("down");
    };
    expect(await checkMerchant(Buffer.alloc(16))).toEqual({ pass: false, reason: "unavailable" });
    db.merchant.findUnique = original;
  });

  it("is not found for an unknown merchant", async () => {
    expect(await checkMerchant(Buffer.alloc(16, 7))).toEqual({ pass: false, reason: "not_found" });
  });
});

describe("two person rule for status and fee (M1, M3)", () => {
  it("needs the business check before active, and a second admin", async () => {
    const { merchantId } = await seedMerchant();
    await expect(
      draftMerchantChange({
        userId: ADMIN_A,
        merchantId,
        field: "status",
        newValue: "active",
        reason: "go",
      })
    ).rejects.toBeInstanceOf(MerchantAdminError);
    await recordBusinessCheck({
      adminUserId: ADMIN_A,
      merchantId,
      check: { registration: true, beneficialOwners: true, sanctionsScreen: true },
    });
    const change = await draftMerchantChange({
      userId: ADMIN_A,
      merchantId,
      field: "status",
      newValue: "active",
      reason: "Business check on file",
    });
    await expect(
      approveMerchantChange({ userId: ADMIN_A, changeId: Buffer.from(change.id) })
    ).rejects.toThrow("A different admin must approve this change.");
    await approveMerchantChange({ userId: ADMIN_B, changeId: Buffer.from(change.id) });
    expect(tables.merchant![0]!.status).toBe("active");
  });

  it("keeps the fee inside the contract's merchant ceiling of 20%", async () => {
    const { merchantId } = await seedMerchant();
    await expect(
      draftMerchantChange({
        userId: ADMIN_A,
        merchantId,
        field: "fee_bps",
        newValue: "2001",
        reason: "x y z",
      })
    ).rejects.toThrow(/between 500 and 2000/);
    const change = await draftMerchantChange({
      userId: ADMIN_A,
      merchantId,
      field: "fee_bps",
      newValue: "1500",
      reason: "Pilot rate",
    });
    await approveMerchantChange({ userId: ADMIN_B, changeId: Buffer.from(change.id) });
    expect(tables.merchant![0]!.feeBps).toBe(1_500);
  });
});

describe("payout wallet change (M2)", () => {
  it("needs a valid proof, an Owner, and a different Owner to approve", async () => {
    const { id, merchantId } = await seedMerchant();
    setProofVerifierForTests(async () => false);
    await expect(propose(merchantId, id, WALLET)).rejects.toThrow(
      "The signature does not come from this wallet."
    );
    setProofVerifierForTests(async () => true);
    await expect(propose(merchantId, id, WALLET, 99)).rejects.toThrow(
      "Only an Owner can change the payout wallet."
    );
    await expect(
      proposePayoutWallet({
        merchantId,
        userId: OWNER_A,
        address: WALLET,
        message: "sign me",
        signature: "0x12",
      })
    ).rejects.toBeInstanceOf(PayoutWalletError);

    const row = await propose(merchantId, id, WALLET);
    await expect(
      approvePayoutWallet({ merchantId, walletId: Buffer.from(row.id), userId: OWNER_A })
    ).rejects.toThrow("A different Owner must approve this change.");
  });

  it("takes effect only 24 hours after approval and replaces the old wallet", async () => {
    const { id, merchantId } = await seedMerchant();
    const now = new Date("2026-11-05T12:00:00Z");
    const first = await propose(merchantId, id, WALLET);
    await approvePayoutWallet({
      merchantId,
      walletId: Buffer.from(first.id),
      userId: OWNER_B,
      now,
    });
    await applyDuePayoutWallets(new Date("2026-11-06T12:00:00Z"));

    const second = await propose(merchantId, id, NEXT_WALLET, OWNER_B);
    await approvePayoutWallet({
      merchantId,
      walletId: Buffer.from(second.id),
      userId: OWNER_A,
      now,
    });
    expect(await applyDuePayoutWallets(new Date("2026-11-06T11:59:59Z"))).toHaveLength(0);
    const statuses = () => tables.merchantPayoutWallet!.map(w => [w.address, w.status]);
    expect(statuses()).toEqual([
      [WALLET, "effective"],
      [NEXT_WALLET, "approved"],
    ]);
    expect(await applyDuePayoutWallets(new Date("2026-11-06T12:00:00Z"))).toHaveLength(1);
    expect(statuses()).toEqual([
      [WALLET, "replaced"],
      [NEXT_WALLET, "effective"],
    ]);
    const actions = tables.merchantAuditLog!.map(a => a.action);
    expect(actions).toContain("payout_wallet.effective");
  });

  it("refuses a wallet the screen denies", async () => {
    const { id, merchantId } = await seedMerchant();
    screen.mockResolvedValueOnce({ allowed: false, checkedBy: ["circle"] });
    await expect(propose(merchantId, id, WALLET)).rejects.toThrow(
      "This wallet cannot receive payments."
    );
  });
});
