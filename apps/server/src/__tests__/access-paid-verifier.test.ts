/**
 * UsdcPaymentVerifier (gating spec 3.3, G4). The database is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  offer: null as null | { creatorUserId: number; status: string; amountUnits: bigint },
  purchases: [] as Array<{ status: string; accessUntil: Date | null }>,
  where: null as unknown,
}));

vi.mock("@repo/database", () => ({
  prisma: {
    offer: { findUnique: vi.fn(async () => state.offer) },
    purchase: {
      findMany: vi.fn(async ({ where }: { where: unknown }) => {
        state.where = where;
        return state.purchases;
      }),
    },
  },
}));

import { usdcPaymentVerifier } from "../services/access/verifiers/usdc";

const OFFER = "ab".repeat(16);
const now = new Date("2026-11-04T12:00:00Z");
const later = new Date("2026-12-01T00:00:00Z");
const earlier = new Date("2026-11-01T00:00:00Z");
const row = (status: string, accessUntil: Date | null = null) => ({ status, accessUntil });

beforeEach(() => {
  state.offer = null;
  state.purchases = [];
  state.where = null;
});

describe("usdcPaymentVerifier.offer", () => {
  it("maps the product, and returns null for a bad id or a missing row", async () => {
    expect(await usdcPaymentVerifier.offer("nope")).toBeNull();
    expect(await usdcPaymentVerifier.offer(OFFER)).toBeNull();
    state.offer = { creatorUserId: 10, status: "active", amountUnits: 5_000_000n };
    expect(await usdcPaymentVerifier.offer(OFFER)).toEqual({
      ownerUserId: 10,
      status: "active",
      amountUnits: 5_000_000n,
    });
  });
});

describe("usdcPaymentVerifier.verifyPurchase", () => {
  it("reads only this fan's rows for this product, in the statuses that matter", async () => {
    await usdcPaymentVerifier.verifyPurchase(20, OFFER, now);
    expect(state.where).toEqual({
      buyerUserId: 20,
      targetType: "offer",
      targetId: OFFER,
      status: { in: ["confirmed", "confirmed_soft", "submitting", "submitted"] },
    });
  });

  it("none when nothing gives access", async () => {
    expect(await usdcPaymentVerifier.verifyPurchase(20, OFFER, now)).toBe("none");
    expect(await usdcPaymentVerifier.verifyPurchase(20, "bad", now)).toBe("none");
  });

  it("purchased on a final row, lifetime or inside its period", async () => {
    state.purchases = [row("confirmed")];
    expect(await usdcPaymentVerifier.verifyPurchase(20, OFFER, now)).toBe("purchased");
    state.purchases = [row("confirmed", later)];
    expect(await usdcPaymentVerifier.verifyPurchase(20, OFFER, now)).toBe("purchased");
  });

  it("confirming on the first confirmation (soft unlock)", async () => {
    state.purchases = [row("confirmed_soft")];
    expect(await usdcPaymentVerifier.verifyPurchase(20, OFFER, now)).toBe("confirming");
  });

  it("pending while sent and not on chain", async () => {
    state.purchases = [row("submitted")];
    expect(await usdcPaymentVerifier.verifyPurchase(20, OFFER, now)).toBe("pending");
    state.purchases = [row("submitting")];
    expect(await usdcPaymentVerifier.verifyPurchase(20, OFFER, now)).toBe("pending");
  });

  it("an ended access period gives no access; a new payment on its way reads pending", async () => {
    state.purchases = [row("confirmed", earlier)];
    expect(await usdcPaymentVerifier.verifyPurchase(20, OFFER, now)).toBe("none");
    state.purchases = [row("confirmed", earlier), row("submitted")];
    expect(await usdcPaymentVerifier.verifyPurchase(20, OFFER, now)).toBe("pending");
  });

  it("final wins over soft, soft wins over pending", async () => {
    state.purchases = [row("submitted"), row("confirmed_soft"), row("confirmed")];
    expect(await usdcPaymentVerifier.verifyPurchase(20, OFFER, now)).toBe("purchased");
    state.purchases = [row("submitted"), row("confirmed_soft")];
    expect(await usdcPaymentVerifier.verifyPurchase(20, OFFER, now)).toBe("confirming");
  });
});
