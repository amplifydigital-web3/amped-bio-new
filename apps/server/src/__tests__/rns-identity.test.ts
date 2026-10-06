/**
 * Screen Review 108 I02, I04 and 109 I01: the public RNS identity. For every
 * owner switch combination the payload carries only the allowed fields, a
 * page without a wallet gets no chip, and any doubt fails closed. The chain,
 * Authbase and cache are mocked, so no network is needed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const WALLET = "0x7a3f00000000000000000000000000000000c91e";
const OTHER = "0x1111111111111111111111111111111111111111";
const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);

const state = vi.hoisted(() => ({
  record: { expiry: 0, owner: null as string | null, addr: null as string | null },
  readFails: false,
  authbase: "verified" as "verified" | "not_verified" | "throw",
  configured: true,
  flag: true,
}));

vi.mock("../services/rns", async () => {
  const actual = await vi.importActual<typeof import("../services/rns")>("../services/rns");
  const read = async () => {
    if (state.readFails) throw new Error("rpc down");
    return state.record;
  };
  return {
    ...actual,
    checkRnsBinding: (name: string, wallet: string) => actual.checkRnsBinding(name, wallet, read),
    checkRnsBindingCached: (name: string, wallet: string) =>
      actual.checkRnsBinding(name, wallet, read),
  };
});
vi.mock("../services/rnsSummary", () => ({ readPrimaryName: vi.fn(async () => null) }));
vi.mock("../services/authbase", () => ({
  isAuthbaseConfigured: () => state.configured,
  getAuthbaseWalletStatus: vi.fn(async () => {
    if (state.authbase === "throw") throw new Error("down");
    const verified = state.authbase === "verified";
    return {
      verified,
      status: verified ? "VERIFIED" : "NOT_VERIFIED",
      verification: verified
        ? {
            type: "STANDARD",
            verified_at: "2026-08-12T00:00:00Z",
            valid_until: "2027-08-12T00:00:00Z",
          }
        : null,
      attributes: { legal_name: "Secret Name" },
      message: "upstream message",
      authbase_wallet_address: WALLET,
    };
  }),
}));
vi.mock("../env", () => ({
  env: {
    get RNS_PUBLIC_IDENTITY() {
      return state.flag;
    },
    SUBGRAPH_URL: "",
  },
}));
vi.mock("../utils/cache", () => ({
  cache: { get: vi.fn(async () => null), set: vi.fn(async () => undefined) },
}));

import { computeRnsIdentity, parseRnsDisplay, RNS_DISPLAY_DEFAULTS } from "../services/rnsIdentity";

const display = (over: Partial<typeof RNS_DISPLAY_DEFAULTS> = {}, details = {}) => ({
  ...RNS_DISPLAY_DEFAULTS,
  ...over,
  details: { ...RNS_DISPLAY_DEFAULTS.details, ...details },
});

const run = (
  d = display(),
  storedName: string | null = "mayalin",
  wallet: string | null = WALLET
) => computeRnsIdentity({ storedName, wallet, display: d });

beforeEach(() => {
  state.record = { expiry: now() + 300 * DAY, owner: WALLET, addr: WALLET };
  state.readFails = false;
  state.authbase = "verified";
  state.configured = true;
  state.flag = true;
});

describe("public RNS identity", () => {
  it("shows the verified chip with every allowed field by default", async () => {
    const { identity } = await run();
    expect(identity).toMatchObject({
      chip: "verified",
      label: "mayalin",
      wallet: expect.stringMatching(/^0x7a3f0+c91e$/i),
      check: {
        verifiedAt: "2026-08-12T00:00:00Z",
        validUntil: "2027-08-12T00:00:00Z",
        tier: "standard",
      },
    });
    expect(identity?.name).toMatch(/^mayalin\./);
  });

  it("never returns Authbase attributes or the upstream message", async () => {
    const json = JSON.stringify((await run()).identity);
    expect(json).not.toContain("Secret Name");
    expect(json).not.toContain("upstream message");
    expect(json).not.toContain("attributes");
  });

  it("returns only the detail fields the owner allows", async () => {
    for (const name of [true, false]) {
      for (const wallet of [true, false]) {
        for (const check of [true, false]) {
          const { identity } = await run(display({}, { name, wallet, check }));
          expect(identity?.chip).toBe("verified");
          expect("name" in identity!).toBe(name);
          expect("label" in identity!).toBe(name);
          expect("wallet" in identity!).toBe(wallet);
          expect("check" in identity!).toBe(check);
        }
      }
    }
  });

  it("falls back to the name chip with Show Verified badge off, and drops the check", async () => {
    const { identity } = await run(display({ showBadge: false }));
    expect(identity?.chip).toBe("name");
    expect(identity?.name).toBeTruthy();
    expect(identity && "check" in identity).toBe(false);
  });

  it("shows no chip with Show on my page off, and keeps the stored name", async () => {
    const result = await run(display({ showName: false }));
    expect(result.identity).toBeNull();
    expect(result.label).toBe("mayalin");
    expect(result.nameState).toBe("linked");
  });

  it("shows no chip for a page without a wallet", async () => {
    const result = await run(display(), "mayalin", null);
    expect(result.identity).toBeNull();
    expect(result.nameState).toBe("no_wallet");
  });

  it("fails closed for a name in grace, owned elsewhere, pointing elsewhere or unreadable", async () => {
    state.record = { expiry: now() - 60, owner: WALLET, addr: WALLET };
    expect((await run()).identity).toBeNull();
    expect((await run()).nameState).toBe("expired");

    state.record = { expiry: now() + 300 * DAY, owner: OTHER, addr: WALLET };
    expect((await run()).identity).toBeNull();
    expect((await run()).nameState).toBe("not_linked");

    state.record = { expiry: now() + 300 * DAY, owner: WALLET, addr: OTHER };
    expect((await run()).identity).toBeNull();

    state.readFails = true;
    expect((await run()).identity).toBeNull();
    expect((await run()).nameState).toBe("unavailable");
  });

  it("shows the name chip when Authbase lapses, fails or is off", async () => {
    for (const setup of [
      () => (state.authbase = "not_verified"),
      () => (state.authbase = "throw"),
      () => (state.configured = false),
      () => (state.flag = false),
    ]) {
      state.authbase = "verified";
      state.configured = true;
      state.flag = true;
      setup();
      const { identity } = await run();
      expect(identity?.chip).toBe("name");
      expect(identity && "check" in identity).toBe(false);
    }
  });

  it("reads malformed display settings as the defaults", () => {
    expect(parseRnsDisplay(null)).toEqual(RNS_DISPLAY_DEFAULTS);
    expect(parseRnsDisplay({ showName: "yes" })).toEqual(RNS_DISPLAY_DEFAULTS);
  });
});
