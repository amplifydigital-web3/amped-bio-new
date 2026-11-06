/**
 * AB-2 service offers (Build Board #66, docs/features/authbase-storefront.md 3.3 and 3.4): the
 * Identity tab storefront lists a merchant's active offers, says whether it takes payments, and
 * carries the viewer's open order; merchant products are validated and owned by its first Owner.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  offers: [] as Record<string, unknown>[],
  purchase: null as Record<string, unknown> | null,
  owner: { userId: 10 } as { userId: number } | null,
  gate: { pass: true, feeBps: 2000 } as Record<string, unknown>,
  created: [] as Record<string, unknown>[],
}));

vi.mock("@repo/database", () => ({
  Prisma: {},
  prisma: {
    offer: {
      findMany: vi.fn(async () => state.offers),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        state.created.push(data)
      ),
      update: vi.fn(),
    },
    purchase: { findFirst: vi.fn(async () => state.purchase) },
    merchantMember: { findFirst: vi.fn(async () => state.owner) },
    merchantAuditLog: { create: vi.fn() },
  },
}));
vi.mock("../services/merchants/check", () => ({ checkMerchant: vi.fn(async () => state.gate) }));

import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";
import { storefront, upsertMerchantOffer } from "../services/merchants/offers";

const MERCHANT = {
  id: Buffer.alloc(16, 1),
  name: "Authbase",
  storePolicyUrl: "https://authbase.test/policy",
};
const offer = (code: string, rank: number) => ({
  id: Buffer.alloc(16, rank + 2),
  externalCode: code,
  title: code === "STANDARD" ? "Standard" : "Enhanced",
  description: null,
  features: ["Over 18 check. Opens adult (18+) content on Amped.Bio", "a", "b", "c", "d"],
  tag: code === "STANDARD" ? "For fans" : "For creators",
  amountUnits: 15_000_000n,
  rank,
  merchant: MERCHANT,
});

beforeEach(() => {
  __setFeatureFlagOverridesForTests({ authbaseStorefront: true });
  state.offers = [offer("STANDARD", 0), offer("ENHANCED", 1)];
  state.purchase = null;
  state.owner = { userId: 10 };
  state.gate = { pass: true, feeBps: 2000 };
  state.created = [];
});

describe("storefront", () => {
  it("is null while the flag is off", async () => {
    __setFeatureFlagOverridesForTests({ authbaseStorefront: false });
    expect(await storefront("rns_identity", 5)).toBeNull();
  });

  it("lists the offers in order with four feature lines at most and the merchant fee", async () => {
    const front = await storefront("rns_identity", 5);
    expect(front?.merchant).toMatchObject({ name: "Authbase", takingPayments: true });
    expect(front?.feeBps).toBe(2000);
    expect(front?.offers.map(o => o.code)).toEqual(["STANDARD", "ENHANCED"]);
    expect(front?.offers[0]!.features).toHaveLength(4);
    expect(front?.offers[0]!.amountUnits).toBe("15000000");
  });

  it("says when the merchant is not taking payments", async () => {
    state.gate = { pass: false, reason: "not_active" };
    const front = await storefront("rns_identity", 5);
    expect(front?.merchant.takingPayments).toBe(false);
  });

  it("carries the viewer's open order and drops one past its 30 days", async () => {
    const now = new Date("2026-11-05T12:00:00Z");
    state.purchase = {
      id: Buffer.alloc(16, 9),
      offerId: Buffer.alloc(16, 3),
      status: "confirmed_soft",
      fulfillmentState: "paid",
      softConfirmedAt: now,
      accessUntil: new Date(now.getTime() + 30 * 86_400_000),
    };
    const open = await storefront("rns_identity", 5, now);
    expect(open?.latestOrder).toMatchObject({ code: "ENHANCED", fulfillmentState: "paid" });
    const later = await storefront("rns_identity", 5, new Date(now.getTime() + 31 * 86_400_000));
    expect(later?.latestOrder).toBeNull();
  });
});

describe("upsertMerchantOffer", () => {
  const base = {
    merchantId: MERCHANT.id,
    actorId: 1,
    code: "standard",
    title: "Standard",
    features: ["Over 18 check"],
    amountUnits: 15_000_000n,
    rank: 0,
    status: "active" as const,
  };

  it("creates an external, 30 day service offer owned by the first Owner", async () => {
    await upsertMerchantOffer(base);
    expect(state.created[0]).toMatchObject({
      creatorUserId: 10,
      kind: "service",
      fulfillment: "external",
      externalCode: "STANDARD",
      placement: "rns_identity",
      accessPeriodDays: 30,
    });
  });

  it("refuses without an Owner, a bad code, five features or a zero price", async () => {
    state.owner = null;
    await expect(upsertMerchantOffer(base)).rejects.toThrow("Owner");
    state.owner = { userId: 10 };
    await expect(upsertMerchantOffer({ ...base, code: "x" })).rejects.toThrow("code");
    await expect(
      upsertMerchantOffer({ ...base, features: ["1", "2", "3", "4", "5"] })
    ).rejects.toThrow("four");
    await expect(upsertMerchantOffer({ ...base, amountUnits: 0n })).rejects.toThrow("price");
  });
});
