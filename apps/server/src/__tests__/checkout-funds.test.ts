/**
 * A short balance on the pay sheet (Build Board #49 Mobile checkout, PR CK-3). The database
 * is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: Buffer; userId: number | null; status: string; expiresAt: Date };

const state = vi.hoisted(() => ({ rows: [] as Row[], updates: [] as unknown[] }));

vi.mock("@repo/database", () => ({
  prisma: {
    checkoutIntent: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: Buffer } }) =>
          state.rows.find(r => r.id.equals(where.id)) ?? null
      ),
      update: vi.fn(async (args: unknown) => {
        state.updates.push(args);
      }),
    },
  },
}));

import { awaitFunds } from "../services/checkout/funds";

const ID = "0f".repeat(16);
const intent = (overrides: Partial<Row> = {}): Row => ({
  id: Buffer.from(ID, "hex"),
  userId: 20,
  status: "open",
  expiresAt: new Date(Date.now() + 3600_000),
  ...overrides,
});

beforeEach(() => {
  state.rows = [intent()];
  state.updates = [];
});

describe("awaitFunds", () => {
  it("moves an open intent to awaiting_funds", async () => {
    expect(await awaitFunds(20, ID)).toEqual({ id: ID, status: "awaiting_funds" });
    expect(state.updates).toEqual([
      { where: { id: Buffer.from(ID, "hex") }, data: { status: "awaiting_funds" } },
    ]);
  });

  it("only the fan who claimed the intent can move it", async () => {
    await expect(awaitFunds(30, ID)).rejects.toThrow("checkout has ended");
    state.rows = [intent({ userId: null })];
    await expect(awaitFunds(20, ID)).rejects.toThrow("checkout has ended");
    expect(state.updates).toEqual([]);
  });

  it("an expired intent is not found; a paid or waiting one is left as it is", async () => {
    state.rows = [intent({ expiresAt: new Date(Date.now() - 1000) })];
    await expect(awaitFunds(20, ID)).rejects.toThrow("checkout has ended");
    state.rows = [intent({ status: "paid" })];
    expect((await awaitFunds(20, ID)).status).toBe("paid");
    state.rows = [intent({ status: "awaiting_funds" })];
    expect((await awaitFunds(20, ID)).status).toBe("awaiting_funds");
    expect(state.updates).toEqual([]);
  });
});

describe("checkout funding helpers (mobile checkout 8)", () => {
  it("prefills the shortfall rounded up to the cent, or Coinbase's minimum", async () => {
    const { checkoutFundingCents } = await import("@repo/constants");
    expect(checkoutFundingCents(1_000_000n, 500)).toEqual({ cents: 500, raisedToMinimum: true });
    expect(checkoutFundingCents(7_250_001n, 500)).toEqual({ cents: 726, raisedToMinimum: false });
    expect(checkoutFundingCents(5_000_000n, 500)).toEqual({ cents: 500, raisedToMinimum: false });
  });

  it("reads the intent from a pay path and nothing else", async () => {
    const { checkoutIntentFromPath, checkoutPayPath } = await import("@repo/constants");
    expect(checkoutIntentFromPath(checkoutPayPath(ID))).toBe(ID);
    expect(checkoutIntentFromPath(`/pay/${ID}/x`)).toBeNull();
    expect(checkoutIntentFromPath("/explore/@maya")).toBeNull();
    expect(checkoutIntentFromPath(null)).toBeNull();
  });
});
