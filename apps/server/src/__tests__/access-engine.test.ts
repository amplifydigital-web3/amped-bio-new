/**
 * Access gating engine core (Build Board #21, PR G1). The database, cache, chain,
 * identity checks and facts are mocked, so no network is needed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = 10;
const FAN = 20;
const POOL = 5;
const WEI = 10n ** 18n;

type RuleRow = {
  id: Buffer;
  ownerUserId: number;
  kind: string;
  params: unknown;
  opensToAllAt: Date | null;
  version: number;
};

const state = vi.hoisted(() => ({
  gate: null as null | {
    ownerUserId: number;
    ruleId: Buffer | null;
    adult: boolean;
    available: boolean;
  },
  owner: { id: 10, handle: "maya", block: "no", page_status: "PUBLISHED" } as {
    id: number;
    handle: string | null;
    block: string;
    page_status: string;
  } | null,
  viewerBlock: "no",
  followBlocked: false,
  rules: new Map<string, RuleRow>(),
  follow: "none" as "active" | "pending" | "none",
  pool: { id: 5, ownerUserId: 10, chainId: "1", poolAddress: "0xpool" } as null | {
    id: number;
    ownerUserId: number;
    chainId: string;
    poolAddress: string | null;
  },
  mirror: 0n,
  chain: 0n as bigint | "throw",
  identity: {
    pass: true,
    validUntil: new Date(Date.now() + 86_400_000),
    tier: "STANDARD",
  } as unknown,
  allowlist: "10",
  allowlistRow: null as string | null,
  allowlistReads: 0,
  allowlistError: false,
  events: [] as unknown[],
}));

vi.mock("../env", () => ({
  env: {
    get ACCESS_STAKE_KINDS_ALLOWLIST() {
      return state.allowlist;
    },
    ANALYTICS_SALT_SECRET: "test-salt",
    BETTER_AUTH_SECRET: "test-secret",
  },
}));
vi.mock("../utils/cache", () => ({
  getRedisClient: () => null,
  cache: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => true),
  },
}));
vi.mock("../services/identity/checks", () => ({
  checkIdentity: vi.fn(async () => state.identity),
}));
vi.mock("../services/access/facts", () => ({
  followState: vi.fn(async () => state.follow),
  loadPool: vi.fn(async () => state.pool),
  mirrorStakeWei: vi.fn(async () => state.mirror),
  chainStakeWei: vi.fn(async () => {
    if (state.chain === "throw") throw new Error("rpc down");
    return state.chain;
  }),
}));
vi.mock("@repo/database", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) =>
        where.id === OWNER ? state.owner : { block: state.viewerBlock }
      ),
    },
    followBlock: {
      findUnique: vi.fn(async () => (state.followBlocked ? { user_id: FAN } : null)),
    },
    // eligibleUserIds for stake kinds (broadcast audiences, M9)
    stakedPool: {
      findMany: vi.fn(async () => [
        { stakeAmount: "5", userWallet: { userId: FAN } },
        { stakeAmount: "0", userWallet: { userId: FAN + 1 } },
      ]),
    },
    accessRule: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: Buffer } }) =>
          state.rules.get(Buffer.from(where.id).toString("hex")) ?? null
      ),
    },
    accessEvent: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        state.events.push(data);
      }),
    },
    siteSettings: {
      findUnique: vi.fn(async () => {
        state.allowlistReads += 1;
        if (state.allowlistError) throw new Error("database down");
        return state.allowlistRow === null ? null : { setting_value: state.allowlistRow };
      }),
      upsert: vi.fn(async ({ update }: { update: { setting_value: string } }) => {
        state.allowlistRow = update.setting_value;
      }),
      deleteMany: vi.fn(async () => {
        state.allowlistRow = null;
      }),
    },
  },
}));

import { ACCESS_RULE_PARAMS, accessRuleInputSchema, type AccessDecision } from "@repo/constants";
import {
  ageDecision,
  check,
  clearEventDedupe,
  clearResolvers,
  eligibleUserIds,
  open,
  registerResolver,
  viewerKey,
} from "../services/access/engine";
import {
  __resetStakeKindsAllowlistCacheForTests,
  STAKE_KINDS_ALLOWLIST_CACHE_MS,
  parseStakeKindsAllowlist,
  readStakeKindsAllowlist,
  setStakeKindsAllowlist,
  stakeKindsAllowed,
} from "../services/access/allowlist";
import { parseRuleRow } from "../services/access/rules";

const fan = { userId: FAN, wallet: "0xfan" };
const anon = { userId: null, wallet: null, request: { ip: "203.0.113.9", userAgent: "UA" } };
const resource = { type: "block" as const, id: "1" };

let ruleSeq = 0;
function addRule(kind: string, params: unknown, extra: Partial<RuleRow> = {}): Buffer {
  ruleSeq += 1;
  const id = Buffer.alloc(16, ruleSeq);
  state.rules.set(id.toString("hex"), {
    id,
    ownerUserId: OWNER,
    kind,
    params,
    opensToAllAt: null,
    version: 1,
    ...extra,
  });
  return id;
}

function gateWith(ruleId: Buffer | null, adult = false) {
  state.gate = { ownerUserId: OWNER, ruleId, adult, available: true };
}

beforeEach(() => {
  clearResolvers();
  registerResolver("block", { get: async () => state.gate });
  state.gate = null;
  state.owner = { id: OWNER, handle: "maya", block: "no", page_status: "PUBLISHED" };
  state.viewerBlock = "no";
  state.followBlocked = false;
  state.rules.clear();
  state.follow = "none";
  state.pool = { id: POOL, ownerUserId: OWNER, chainId: "1", poolAddress: "0xpool" };
  state.mirror = 0n;
  state.chain = 0n;
  state.identity = { pass: true, validUntil: new Date(Date.now() + 86_400_000), tier: "STANDARD" };
  state.allowlist = String(OWNER);
  state.allowlistRow = null;
  state.allowlistReads = 0;
  state.allowlistError = false;
  __resetStakeKindsAllowlistCacheForTests();
  state.events = [];
  clearEventDedupe();
});

describe("preconditions", () => {
  it("an unknown resource is not found", async () => {
    expect((await check(fan, resource)).reason).toBe("not_found");
  });

  it("the owner always passes", async () => {
    gateWith(addRule("follower", {}));
    const d = await check({ userId: OWNER, wallet: null }, resource);
    expect(d).toMatchObject({ allowed: true, reason: "owner" });
  });

  it("a suspended or unpublished creator is not found", async () => {
    gateWith(null);
    state.owner = { id: OWNER, handle: "maya", block: "yes", page_status: "PUBLISHED" };
    expect((await check(fan, resource)).reason).toBe("not_found");
    state.owner = { id: OWNER, handle: "maya", block: "no", page_status: "UNPUBLISHED" };
    expect((await check(fan, resource)).reason).toBe("not_found");
  });

  it("a suspended viewer is not found, a blocked viewer is blocked on every kind (acceptance 9)", async () => {
    gateWith(null);
    state.viewerBlock = "yes";
    expect((await check(fan, resource)).reason).toBe("not_found");
    state.viewerBlock = "no";
    state.followBlocked = true;
    expect((await check(fan, resource)).reason).toBe("blocked");
    state.follow = "active";
    gateWith(addRule("follower", {}));
    expect((await check(fan, resource)).reason).toBe("blocked");
  });

  it("public when there is no rule, or after the early access date", async () => {
    gateWith(null);
    expect(await check(anon, resource)).toMatchObject({ allowed: true, reason: "public" });
    gateWith(addRule("follower", {}, { opensToAllAt: new Date(Date.now() - 1000) }));
    expect(await check(anon, resource)).toMatchObject({ allowed: true, reason: "public" });
  });

  it("a rule whose params fail its schema refuses (default deny)", async () => {
    gateWith(addRule("stake_min", { poolId: POOL, minWei: "abc" }));
    expect(await check(fan, resource)).toMatchObject({
      allowed: false,
      reason: "kind_unavailable",
    });
  });

  it("a kind that is not live yet refuses", async () => {
    gateWith(addRule("paid", { offerId: "ab".repeat(16) }));
    expect((await check(fan, resource)).reason).toBe("kind_unavailable");
  });
});

describe("age precondition (spec 3.4, acceptance 11 and 15)", () => {
  it("maps identity results to reasons and hints", () => {
    expect(ageDecision("signed_out")).toMatchObject({
      reason: "age_check_required",
      hint: { action: "sign_in" },
    });
    expect(ageDecision({ pass: false, reason: "not_shared" })).toMatchObject({
      hint: { action: "verify_age" },
    });
    expect(ageDecision({ pass: false, reason: "under_18" })).toMatchObject({
      reason: "age_check_required",
      hint: { action: "none" },
    });
    expect(ageDecision({ pass: false, reason: "unavailable" })).toMatchObject({
      reason: "identity_unavailable",
      hint: { action: "unavailable" },
    });
  });

  it("an 18+ item refuses even a follower until the age check passes", async () => {
    state.follow = "active";
    gateWith(addRule("follower", {}), true);
    state.identity = { pass: false, reason: "not_verified" };
    expect((await check(fan, resource)).reason).toBe("age_check_required");
    state.identity = { pass: true, validUntil: new Date(Date.now() + 1000), tier: "STANDARD" };
    expect((await check(fan, resource)).allowed).toBe(true);
  });
});

describe("follower kind (acceptance 3)", () => {
  it("active passes, pending asks to confirm the email, none offers Follow", async () => {
    gateWith(addRule("follower", {}));
    state.follow = "active";
    expect((await check(fan, resource)).allowed).toBe(true);
    state.follow = "pending";
    expect(await check(fan, resource)).toMatchObject({
      reason: "follow_pending",
      hint: { action: "confirm_email" },
    });
    state.follow = "none";
    expect(await check(fan, resource)).toMatchObject({
      reason: "not_follower",
      hint: { action: "follow", creatorHandle: "maya" },
    });
  });

  it("signed out viewers are asked to sign in", async () => {
    gateWith(addRule("follower", {}));
    expect(await check(anon, resource)).toMatchObject({
      reason: "not_signed_in",
      hint: { action: "sign_in" },
    });
  });
});

describe("stake kinds (acceptance 1, 2, 7, 8)", () => {
  it("are off for creators outside the pilot allowlist", async () => {
    state.allowlist = "";
    gateWith(addRule("pool_member", { poolId: POOL }));
    state.mirror = 1n;
    expect((await check(fan, resource)).reason).toBe("kind_unavailable");
    expect(await stakeKindsAllowed(10, " 3, 10 ,11")).toBe(true);
    expect(await stakeKindsAllowed(10, "100")).toBe(false);
  });

  it("the access_stake_kinds_allowlist site setting wins over the environment", async () => {
    state.allowlist = "";
    state.allowlistRow = "3,10";
    expect(await stakeKindsAllowed(10)).toBe(true);
    __resetStakeKindsAllowlistCacheForTests();
    state.allowlist = "10";
    state.allowlistRow = "";
    expect(await stakeKindsAllowed(10)).toBe(false);
    __resetStakeKindsAllowlistCacheForTests();
    state.allowlistRow = null;
    expect(await stakeKindsAllowed(10)).toBe(true);
  });

  it("reads the row once per cache window, and a fresh read skips the cache", async () => {
    vi.useFakeTimers();
    try {
      state.allowlistRow = "10";
      await stakeKindsAllowed(10);
      await stakeKindsAllowed(10);
      expect(state.allowlistReads).toBe(1);
      // Another instance changed the row: this one sees it after the window
      state.allowlistRow = "";
      expect(await stakeKindsAllowed(10)).toBe(true);
      vi.advanceTimersByTime(STAKE_KINDS_ALLOWLIST_CACHE_MS);
      expect(await stakeKindsAllowed(10)).toBe(false);
      expect(state.allowlistReads).toBe(2);
      expect(await readStakeKindsAllowlist({ fresh: true })).toEqual({
        value: "",
        source: "setting",
      });
      expect(state.allowlistReads).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the saving instance applies a change at once, both ways", async () => {
    state.allowlist = "";
    expect(await stakeKindsAllowed(10)).toBe(false);
    await setStakeKindsAllowlist([11, 10, 10], 1);
    expect(state.allowlistRow).toBe("10,11");
    expect(await stakeKindsAllowed(10)).toBe(true);
    state.allowlist = "12";
    await setStakeKindsAllowlist(null, 1);
    expect(state.allowlistRow).toBeNull();
    expect(await stakeKindsAllowed(10)).toBe(false);
    expect(await stakeKindsAllowed(12)).toBe(true);
    expect(state.allowlistReads).toBe(1);
  });

  it("a database error is not cached and refuses stake rules (default deny)", async () => {
    state.allowlistError = true;
    gateWith(addRule("pool_member", { poolId: POOL }));
    state.mirror = 1n;
    expect((await check(fan, resource)).reason).toBe("kind_unavailable");
    await expect(stakeKindsAllowed(10)).rejects.toThrow("database down");
    state.allowlistError = false;
    expect(await stakeKindsAllowed(10)).toBe(true);
  });

  it("parseStakeKindsAllowlist keeps positive integer ids only", () => {
    expect(parseStakeKindsAllowlist(" 3, 10 ,x,, -4, 0, 1.5,11")).toEqual([3, 10, 11]);
    expect(parseStakeKindsAllowlist("")).toEqual([]);
  });

  it("eligibleUserIds returns no stake audience outside the pilot allowlist", async () => {
    state.allowlist = "";
    for (const kind of ["pool_member", "stake_min"] as const) {
      const params = kind === "stake_min" ? { poolId: POOL, minWei: "1" } : { poolId: POOL };
      expect(await eligibleUserIds({ kind, params }, OWNER)).toEqual({
        userIds: [],
        nextCursor: null,
      });
    }
  });

  it("eligibleUserIds with stakeAllowlist false reads stakers outside the pilot (M9 broadcasts)", async () => {
    state.allowlist = "";
    expect(
      await eligibleUserIds(
        { kind: "pool_member", params: { poolId: POOL } },
        OWNER,
        {},
        {
          stakeAllowlist: false,
        }
      )
    ).toEqual({ userIds: [FAN], nextCursor: null });
  });

  it("only the owner's own pool counts", async () => {
    state.pool = { id: POOL, ownerUserId: 99, chainId: "1", poolAddress: "0xpool" };
    gateWith(addRule("pool_member", { poolId: POOL }));
    state.mirror = 5n * WEI;
    expect((await check(fan, resource)).reason).toBe("kind_unavailable");
  });

  it("pool_member: any stake passes, none refuses with View pool and no amount", async () => {
    gateWith(addRule("pool_member", { poolId: POOL }));
    state.mirror = 1n;
    expect((await check(fan, resource)).allowed).toBe(true);
    state.mirror = 0n;
    const d = await check(fan, resource);
    expect(d).toMatchObject({
      reason: "not_pool_member",
      hint: { action: "view_pool", poolId: POOL },
    });
    expect(d.rule?.summary).toBe("Pool fans");
  });

  it("stake_min 500 tREVO: 499 refuses, 500 passes, in wei", async () => {
    const min = (500n * WEI).toString();
    gateWith(addRule("stake_min", { poolId: POOL, minWei: min }));
    state.mirror = 499n * WEI;
    const refused = await check(fan, resource);
    expect(refused.reason).toBe("stake_below_min");
    // No refusal carries an amount another person set (acceptance 4)
    expect(JSON.stringify(refused)).not.toContain(min);
    expect(JSON.stringify(refused)).not.toContain("500");
    state.mirror = 500n * WEI;
    expect((await check(fan, resource)).allowed).toBe(true);
  });

  it("a viewer without a wallet is asked to link one", async () => {
    gateWith(addRule("pool_member", { poolId: POOL }));
    expect(await check({ userId: FAN, wallet: null }, resource)).toMatchObject({
      reason: "no_wallet",
      hint: { action: "link_wallet" },
    });
  });

  it("open reads the chain; the mirror never passes when the chain is down", async () => {
    gateWith(addRule("pool_member", { poolId: POOL }));
    state.mirror = 10n * WEI;
    state.chain = 0n;
    expect((await check(fan, resource, { intent: "open" })).reason).toBe("not_pool_member");
    state.chain = "throw";
    expect((await check(fan, resource, { intent: "open" })).reason).toBe("chain_unavailable");
    state.chain = 3n;
    expect((await check(fan, resource, { intent: "open" })).allowed).toBe(true);
  });
});

describe("combinators", () => {
  it("any passes on one leaf, all needs every leaf", async () => {
    const follower = addRule("follower", {});
    const pool = addRule("pool_member", { poolId: POOL });
    const ids = [follower.toString("hex"), pool.toString("hex")];
    state.follow = "active";
    state.mirror = 0n;
    gateWith(addRule("any", { ruleIds: ids }));
    expect((await check(fan, resource)).allowed).toBe(true);
    gateWith(addRule("all", { ruleIds: ids }));
    expect(await check(fan, resource)).toMatchObject({ allowed: false, reason: "not_pool_member" });
  });

  it("a leaf owned by someone else refuses", async () => {
    const foreign = addRule("follower", {}, { ownerUserId: 77 });
    const own = addRule("follower", {});
    gateWith(addRule("any", { ruleIds: [own.toString("hex"), foreign.toString("hex")] }));
    expect((await check(fan, resource)).reason).toBe("kind_unavailable");
  });
});

describe("open (acceptance 12)", () => {
  it("never calls reveal on a refusal, and calls it once on a pass", async () => {
    gateWith(addRule("follower", {}));
    const reveal = vi.fn(async (_d: AccessDecision) => "secret");
    const refused = await open(fan, resource, reveal);
    expect(refused.value).toBeUndefined();
    expect(reveal).not.toHaveBeenCalled();
    state.follow = "active";
    const passed = await open(fan, resource, reveal);
    expect(passed.value).toBe("secret");
    expect(reveal).toHaveBeenCalledTimes(1);
  });
});

describe("access events (content gating 3.6)", () => {
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  it("records a locked render once per viewer key and resource in 10 minutes", async () => {
    gateWith(addRule("follower", {}));
    for (let i = 0; i < 5; i += 1) await check(fan, resource);
    await check(anon, resource);
    await check(fan, { type: "block", id: "2" });
    await flush();
    const types = (
      state.events as Array<{ type: string; viewerKey: string; resource: string }>
    ).map(event => `${event.type}:${event.viewerKey.slice(0, 2)}:${event.resource}`);
    expect(types).toEqual([
      "locked_view:u::block:1",
      "locked_view:v::block:1",
      "locked_view:u::block:2",
    ]);
  });

  it("records no event for a passing render", async () => {
    gateWith(addRule("follower", {}));
    state.follow = "active";
    await check(fan, resource);
    await flush();
    expect(state.events).toHaveLength(0);
  });

  it("records denied and revealed on open every time", async () => {
    gateWith(addRule("follower", {}));
    await open(fan, resource, async () => "x");
    await open(fan, resource, async () => "x");
    state.follow = "active";
    await open(fan, resource, async () => "x");
    await open(fan, resource, async () => "x");
    await flush();
    expect((state.events as Array<{ type: string }>).map(event => event.type)).toEqual([
      "denied",
      "denied",
      "revealed",
      "revealed",
    ]);
  });
});

describe("contract and keys", () => {
  it("rule params and creator input are validated per kind", () => {
    expect(ACCESS_RULE_PARAMS.stake_min.safeParse({ poolId: 1, minWei: "0" }).success).toBe(false);
    expect(ACCESS_RULE_PARAMS.any.safeParse({ ruleIds: ["ab".repeat(16)] }).success).toBe(false);
    expect(ACCESS_RULE_PARAMS.follower.safeParse({ extra: 1 }).success).toBe(false);
    expect(
      accessRuleInputSchema.safeParse({ kind: "stake_min", params: { poolId: 1, minTrevo: "500" } })
        .success
    ).toBe(true);
    expect(
      accessRuleInputSchema.safeParse({ kind: "paid", params: { offerId: "x" } }).success
    ).toBe(false);
  });

  it("parseRuleRow rejects unknown kinds and bad params", () => {
    const row = { id: Buffer.alloc(16), ownerUserId: 1, opensToAllAt: null, version: 1 };
    expect(parseRuleRow({ ...row, kind: "code_lock", params: {} })).toBe("invalid");
    expect(parseRuleRow({ ...row, kind: "pool_member", params: { poolId: "1" } })).toBe("invalid");
    expect(parseRuleRow({ ...row, kind: "follower", params: {} })).not.toBe("invalid");
  });

  it("a signed out viewer key is the salted hash, 24 characters, never the IP", () => {
    const key = viewerKey(anon, OWNER);
    expect(key).toHaveLength(24);
    expect(key.startsWith("v:")).toBe(true);
    expect(key).not.toContain("203.0.113.9");
    expect(viewerKey(fan, OWNER)).toBe(`u:${FAN}`);
  });
});
