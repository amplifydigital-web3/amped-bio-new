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
  authbase: "verified" as "verified" | "badge" | "expired" | "not_verified" | "throw",
  configured: true,
  flag: true,
  attributesFlag: false,
  cache: {} as Record<string, unknown>,
  cacheHits: false,
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
vi.mock("../services/authbase", async () => ({
  publicSharedAttributes: (
    await vi.importActual<typeof import("../services/authbase")>("../services/authbase")
  ).publicSharedAttributes,
  isAuthbaseConfigured: () => state.configured,
  getAuthbaseWalletStatus: vi.fn(async () => {
    if (state.authbase === "throw") throw new Error("down");
    const verified = state.authbase !== "not_verified";
    const badge = state.authbase === "badge";
    return {
      verified,
      hasBadge: badge,
      status: badge ? "VERIFIED_WITH_BADGE" : verified ? "VERIFIED" : "NOT_VERIFIED",
      verification: verified
        ? {
            type: badge ? "ENHANCED" : "STANDARD",
            verified_at: "2026-08-12T00:00:00Z",
            // An expired check Authbase has not flipped yet (clock window)
            valid_until:
              state.authbase === "expired" ? "2026-09-01T00:00:00Z" : "2027-08-12T00:00:00Z",
          }
        : null,
      badge: badge
        ? {
            tier: "ENHANCED",
            token_id: "115792089237316195423570985008687907853269984665640564039457",
            transaction_hash: null,
            minted_at: "2026-08-13T00:00:00Z",
          }
        : null,
      attributes: { legal_name: "Secret Name", name: "Maya Lin", country: "US", gender: "F" },
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
    get RNS_PUBLIC_ATTRIBUTES() {
      return state.attributesFlag;
    },
    SUBGRAPH_URL: "",
  },
}));
vi.mock("../utils/cache", () => ({
  cache: {
    get: vi.fn(async (key: string) => (state.cacheHits ? (state.cache[key] ?? null) : null)),
    set: vi.fn(async (key: string, value: unknown) => {
      state.cache[key] = value;
    }),
    delete: vi.fn(async (key: string) => {
      delete state.cache[key];
    }),
  },
}));

import {
  computeRnsIdentity,
  parseRnsDisplay,
  rnsIdBlockOptions,
  RNS_DISPLAY_DEFAULTS,
  type RnsIdBlockOptions,
} from "../services/rnsIdentity";
import { formatAuthbaseAttribute } from "@repo/constants";

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
  state.attributesFlag = false;
  state.cache = {};
  state.cacheHits = false;
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

// RNS ID block (Build Board #33, Screen Review 112 D1): a shared attribute
// reaches the page only with the attributes flag on, a verified chip and
// the owner's block switch on for it. Every other path leaves it out.
describe("RNS ID block: shared attributes", () => {
  const block: RnsIdBlockOptions = { attributes: ["name"], visible: true };
  const withBlock = (over: Partial<typeof RNS_DISPLAY_DEFAULTS> = {}, options = block) =>
    computeRnsIdentity({
      storedName: "mayalin",
      wallet: WALLET,
      display: display(over),
      block: options,
    });

  it("is left out while RNS_PUBLIC_ATTRIBUTES is off, whatever the block asks", async () => {
    const { identity } = await withBlock();
    expect(identity?.chip).toBe("verified");
    expect(identity && "attributes" in identity).toBe(false);
  });

  it("shows only the switched on attributes with the flag and a verified chip", async () => {
    state.attributesFlag = true;
    const { identity } = await withBlock();
    expect(identity?.attributes).toEqual({ name: "Maya Lin" });
    const json = JSON.stringify(identity);
    expect(json).not.toContain("Secret Name");
    expect(json).not.toContain("US");
    const more = await withBlock({}, { attributes: ["gender", "country"], visible: true });
    expect(more.identity?.attributes).toEqual({ gender: "F", country: "US" });
  });

  it("is left out when the block switch is off or there is no block", async () => {
    state.attributesFlag = true;
    expect(
      (await withBlock({}, { attributes: [], visible: true })).identity?.attributes
    ).toBeUndefined();
    const { identity } = await computeRnsIdentity({
      storedName: "mayalin",
      wallet: WALLET,
      display: display(),
    });
    expect(identity?.attributes).toBeUndefined();
  });

  it("survives Show Verified badge off, and only verification gates it", async () => {
    state.attributesFlag = true;
    const badgeOff = await withBlock({ showBadge: false });
    expect(badgeOff.identity?.chip).toBe("name");
    expect(badgeOff.identity?.attributes).toEqual({ name: "Maya Lin" });
    state.authbase = "not_verified";
    const unverified = await withBlock();
    expect(unverified.identity?.chip).toBe("name");
    expect(unverified.identity?.attributes).toBeUndefined();
  });
});

describe("rnsIdBlockOptions", () => {
  it("reads the switches from a visible rnsid block only", () => {
    expect(rnsIdBlockOptions([])).toEqual({ attributes: [], visible: false });
    expect(rnsIdBlockOptions([{ type: "link", config: { url: "x" } }])).toEqual({
      attributes: [],
      visible: false,
    });
    expect(rnsIdBlockOptions([{ type: "rnsid", config: { show: { nameOnId: true } } }])).toEqual({
      attributes: ["name"],
      visible: true,
    });
    expect(
      rnsIdBlockOptions([
        { type: "rnsid", config: { show: { country: true, ageOver18: true, gender: true } } },
      ])
    ).toEqual({ attributes: ["age_over_18", "gender", "country"], visible: true });
    expect(
      rnsIdBlockOptions([{ type: "rnsid", config: { show: { nameOnId: true }, hidden: true } }])
    ).toEqual({ attributes: [], visible: false });
    expect(rnsIdBlockOptions([{ type: "rnsid", config: null }])).toEqual({
      attributes: [],
      visible: false,
    });
  });

  it("reads the first rnsid row when a legacy page somehow holds two", () => {
    const two = [
      { type: "rnsid", config: { show: { nameOnId: true } } },
      { type: "rnsid", config: { show: { nameOnId: false }, hidden: true } },
    ];
    expect(rnsIdBlockOptions(two)).toEqual({ attributes: ["name"], visible: true });
    // The server side addBlock gate keeps this from happening (see
    // rns-id-block-singleton.test.ts); the read side stays deterministic anyway
  });

  it("a cached verification never releases the name once the public attributes flag is off", async () => {
    const run = () =>
      computeRnsIdentity({
        storedName: "mayalin",
        wallet: WALLET,
        display: display({}, { check: true }),
        block: { attributes: ["name"], visible: true },
      });
    // Warm the cache while the flag is on: the entry carries the name
    state.attributesFlag = true;
    expect((await run()).identity?.attributes).toEqual({ name: "Maya Lin" });
    // The flag turns off; the cached entry can still hold the name for the TTL
    state.attributesFlag = false;
    state.cacheHits = true;
    expect((await run()).identity?.attributes).toBeUndefined();
  });

  it("fresh skips the cached verification, so a consent change on Authbase shows at once", async () => {
    state.attributesFlag = true;
    state.cacheHits = true;
    // Consent granted since this entry was written
    state.cache[`rns_verification:${WALLET}`] = { state: "not_verified" };
    const read = (options?: { fresh?: boolean }) =>
      computeRnsIdentity(
        {
          storedName: "mayalin",
          wallet: WALLET,
          display: display(),
          block: { attributes: ["name"], visible: true },
        },
        options
      );
    expect((await read()).identity?.chip).toBe("name");
    expect((await read({ fresh: true })).identity?.attributes).toEqual({ name: "Maya Lin" });
  });
});

describe("formatAuthbaseAttribute", () => {
  it("reads Authbase values as people do, and passes anything else through", () => {
    expect(formatAuthbaseAttribute("age_over_18", "true")).toBe("Yes");
    expect(formatAuthbaseAttribute("age_over_18", "false")).toBe("No");
    expect(formatAuthbaseAttribute("gender", "F")).toBe("Female");
    expect(formatAuthbaseAttribute("gender", "M")).toBe("Male");
    expect(formatAuthbaseAttribute("country", "us")).toBe("United States");
    expect(formatAuthbaseAttribute("country", "Narnia")).toBe("Narnia");
    expect(formatAuthbaseAttribute("name", "Maya Lin")).toBe("Maya Lin");
  });
});

// Build Board #33: the badge and the verification status on the RNS ID block,
// the Verified badge switched off (112 D8) and no linked name (112 D9)
describe("RNS ID block: badge and status", () => {
  const block: RnsIdBlockOptions = { attributes: ["name"], visible: true };
  const build = (
    over: Partial<typeof RNS_DISPLAY_DEFAULTS> = {},
    options: RnsIdBlockOptions | null = block,
    storedName: string | null = "mayalin"
  ) =>
    computeRnsIdentity({
      storedName,
      wallet: WALLET,
      display: display(over),
      block: options ?? undefined,
    });

  it("carries the badge tier and mint date, never the token id", async () => {
    state.authbase = "badge";
    const { identity, verification } = await build();
    expect(identity).toMatchObject({
      chip: "verified",
      linked: true,
      badge: { tier: "enhanced", mintedAt: "2026-08-13T00:00:00Z" },
      check: { tier: "enhanced" },
    });
    expect(verification).toMatchObject({ state: "verified", badge: { tier: "enhanced" } });
    expect(JSON.stringify(identity)).not.toContain("115792089");
    expect(JSON.stringify(verification)).not.toContain("115792089");
  });

  it("has no badge on a plain VERIFIED status, and drops it with the Verified badge off", async () => {
    expect((await build()).identity?.badge).toBeUndefined();
    state.authbase = "badge";
    const off = await build({ showBadge: false });
    expect(off.identity?.chip).toBe("name");
    expect(off.identity?.badge).toBeUndefined();
    expect(off.identity?.check).toBeUndefined();
  });

  it("reports an expired check to the owner and shows it as no Verified claim", async () => {
    state.authbase = "expired";
    const { identity, verification } = await build();
    expect(verification).toEqual({ state: "expired", validUntil: "2026-09-01T00:00:00Z" });
    expect(identity?.chip).toBe("name");
    expect(identity?.checkHidden).toBeUndefined();
    expect(identity?.badge).toBeUndefined();
  });

  it("D8: badge off on a current check marks checkHidden; Not verified never does", async () => {
    state.attributesFlag = true;
    const off = await build({ showBadge: false });
    expect(off.identity).toMatchObject({ chip: "name", linked: true, checkHidden: true });
    expect(off.identity?.attributes).toEqual({ name: "Maya Lin" });
    state.authbase = "not_verified";
    const unverified = await build({ showBadge: false });
    expect(unverified.identity?.checkHidden).toBeUndefined();
  });

  it("D9: a visible block with no linked name shows the check without a name", async () => {
    for (const storedName of [null, "mayalin"]) {
      if (storedName) state.record = { expiry: now() + 300 * DAY, owner: OTHER, addr: OTHER };
      state.authbase = "badge";
      const { identity, nameState } = await build({}, block, storedName);
      expect(identity).toMatchObject({
        chip: "verified",
        linked: false,
        badge: { tier: "enhanced" },
      });
      expect(identity?.name).toBeUndefined();
      expect(identity?.label).toBeUndefined();
      expect(nameState).toBe(storedName ? "not_linked" : "none");
    }
  });

  it("D9: no linked name gets nothing without a visible block, a current check or Show on my page", async () => {
    const noName = (over = {}, options: RnsIdBlockOptions | null = block) =>
      build(over, options, null);
    expect((await noName({}, null)).identity).toBeNull();
    expect((await noName({}, { attributes: ["name"], visible: false })).identity).toBeNull();
    expect((await noName({ showName: false })).identity).toBeNull();
    state.authbase = "not_verified";
    expect((await noName()).identity).toBeNull();
    state.authbase = "expired";
    expect((await noName()).identity).toBeNull();
  });

  it("D8 and D9 together: attributes only, or nothing when none are shared", async () => {
    expect((await build({ showBadge: false }, block, null)).identity).toBeNull();
    state.attributesFlag = true;
    const { identity } = await build({ showBadge: false }, block, null);
    expect(identity).toEqual({
      chip: "none",
      linked: false,
      checkHidden: true,
      wallet: expect.any(String),
      attributes: { name: "Maya Lin" },
    });
  });

  it("an RNS read failure never turns into a name claim", async () => {
    state.readFails = true;
    const { identity } = await build();
    expect(identity).toMatchObject({ chip: "verified", linked: false });
    expect(identity?.name).toBeUndefined();
    expect((await build({}, null)).identity).toBeNull();
  });
});
