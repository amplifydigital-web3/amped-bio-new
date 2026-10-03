/**
 * Screen Review 104 D1, 105 I04, 106 I08: the Authbase router behind the RNS
 * Identity, Attributes and Facets tabs. Authbase, the database and the session
 * layer are mocked, so no network or database is needed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const WALLET = "0x7a3f00000000000000000000000000000000c91e";

const state = vi.hoisted(() => ({
  rows: new Map<string, { user_id: number; feature: string; source: string }>(),
  statusCalls: [] as string[],
}));

vi.mock("../utils/auth", () => ({ auth: { api: { getSession: vi.fn(async () => null) } } }));
vi.mock("../services/authbase", () => ({
  AuthbaseError: class extends Error {},
  isAuthbaseConfigured: () => true,
  getAuthbaseWalletStatus: vi.fn(async (address: string) => {
    state.statusCalls.push(address);
    return {
      wallet_address: address,
      status: "VERIFIED",
      verified: true,
      hasBadge: false,
      attributes: { name: "Maya Lin", country: "United States" },
    };
  }),
}));
vi.mock("@repo/database", () => {
  const key = (where: { user_id: number; feature: string }) => `${where.user_id}:${where.feature}`;
  return {
    prisma: {
      featureInterest: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: { user_id_feature: { user_id: number; feature: string } };
          }) => (state.rows.get(key(where.user_id_feature)) ? { id: 1 } : null)
        ),
        upsert: vi.fn(
          async ({
            where,
            create,
          }: {
            where: { user_id_feature: { user_id: number; feature: string } };
            create: { user_id: number; feature: string; source: string };
          }) => {
            const k = key(where.user_id_feature);
            if (!state.rows.has(k)) state.rows.set(k, create);
            return state.rows.get(k);
          }
        ),
        deleteMany: vi.fn(async ({ where }: { where: { user_id: number; feature: string } }) => {
          state.rows.delete(key(where));
          return { count: 1 };
        }),
      },
    },
  };
});

import { authbaseRouter } from "../trpc/authbase";

const ctx = (user?: { sub: number; wallet: string | null }) =>
  ({
    req: {} as never,
    res: {} as never,
    user: user && { ...user, email: "maya@lin.studio", role: "user", poolAddresses: {} },
  }) as Parameters<typeof authbaseRouter.createCaller>[0];

beforeEach(() => {
  state.rows.clear();
  state.statusCalls.length = 0;
});

describe("authbase router", () => {
  it("the public lookup never returns shared attributes", async () => {
    const result = await authbaseRouter.createCaller(ctx()).getWalletStatus({ address: WALLET });
    expect(result?.attributes).toEqual({});
    expect(JSON.stringify(result)).not.toContain("Maya Lin");
  });

  it("getMyStatus reads the session wallet and returns the owner's attributes", async () => {
    const result = await authbaseRouter.createCaller(ctx({ sub: 7, wallet: WALLET })).getMyStatus();
    expect(state.statusCalls).toEqual([WALLET]);
    expect(result?.attributes).toEqual({ name: "Maya Lin", country: "United States" });
  });

  it("getMyStatus with no wallet returns null and asks Authbase nothing", async () => {
    const result = await authbaseRouter.createCaller(ctx({ sub: 7, wallet: null })).getMyStatus();
    expect(result).toBeNull();
    expect(state.statusCalls).toEqual([]);
  });

  it("signed out callers cannot read or set Notify me", async () => {
    await expect(authbaseRouter.createCaller(ctx()).identityInterest()).rejects.toThrow();
    await expect(
      authbaseRouter.createCaller(ctx()).setIdentityInterest({ on: true, source: "attributes" })
    ).rejects.toThrow();
  });

  it("Notify me is one record shared by Attributes and Facets", async () => {
    const caller = authbaseRouter.createCaller(ctx({ sub: 7, wallet: WALLET }));
    expect(await caller.identityInterest()).toEqual({ on: false });
    await caller.setIdentityInterest({ on: true, source: "attributes" });
    await caller.setIdentityInterest({ on: true, source: "facets" });
    expect(state.rows.size).toBe(1);
    expect([...state.rows.values()][0].source).toBe("attributes");
    expect(await caller.identityInterest()).toEqual({ on: true });
    await caller.setIdentityInterest({ on: false, source: "facets" });
    expect(await caller.identityInterest()).toEqual({ on: false });
  });

  it("another account does not see the first account's Notify me", async () => {
    await authbaseRouter
      .createCaller(ctx({ sub: 7, wallet: WALLET }))
      .setIdentityInterest({ on: true, source: "facets" });
    expect(
      await authbaseRouter.createCaller(ctx({ sub: 8, wallet: null })).identityInterest()
    ).toEqual({ on: false });
  });
});
