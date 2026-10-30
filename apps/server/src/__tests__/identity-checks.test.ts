/**
 * Identity checks (Build Board #47, docs/features/identity-checks.md, PR I1).
 * Authbase, the chain, the database and email are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const WALLET = "0x7a3f00000000000000000000000000000000c91e";
const OTHER = "0x1111111111111111111111111111111111111111";
const DAY = 86_400_000;

type Row = {
  userId: number;
  kind: string;
  walletAddress: string;
  pass: boolean;
  reason: string | null;
  tier: string | null;
  validUntil: Date | null;
  checkedAt: Date;
};
type Case = {
  id: Buffer;
  userId: number;
  kind: string;
  status: string;
  alertedAt: Date | null;
  results: number;
};

const state = vi.hoisted(() => ({
  configured: true,
  authbase: null as unknown,
  authbaseThrows: false,
  binding: null as unknown,
  bindingThrows: false,
  user: null as null | {
    revo_name: string | null;
    wallet: { address: string } | null;
    handle?: string;
  },
  rows: [] as Row[],
  cases: [] as Case[],
  emails: [] as { to: string[]; subject: string; html: string }[],
  authbaseCalls: 0,
  alertEmail: "safety@example.test",
}));

vi.mock("../services/authbase", () => ({
  isAuthbaseConfigured: () => state.configured,
  getAuthbaseWalletStatus: vi.fn(async () => {
    state.authbaseCalls += 1;
    if (state.authbaseThrows) throw new Error("authbase down");
    return state.authbase;
  }),
}));
vi.mock("../services/rns", () => ({
  checkRnsBinding: vi.fn(async () => {
    if (state.bindingThrows) throw new Error("rpc down");
    return state.binding;
  }),
}));
vi.mock("../env", () => ({
  env: {
    get SAFETY_ALERT_EMAIL() {
      return state.alertEmail;
    },
  },
}));
vi.mock("../utils/email/transport", () => ({
  deliverEmail: vi.fn(async (email: { to: string[]; subject: string; html: string }) => {
    state.emails.push(email);
    return { transport: "test", id: "1" };
  }),
}));
vi.mock("@repo/database", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => state.user),
    },
    identityCheck: {
      findUnique: vi.fn(
        async ({ where }: { where: { userId_kind: { userId: number; kind: string } } }) => {
          const { userId, kind } = where.userId_kind;
          return state.rows.find(r => r.userId === userId && r.kind === kind) ?? null;
        }
      ),
      upsert: vi.fn(
        async ({
          create,
          update,
          where,
        }: {
          create: Row;
          update: Partial<Row>;
          where: { userId_kind: { userId: number; kind: string } };
        }) => {
          const { userId, kind } = where.userId_kind;
          const found = state.rows.find(r => r.userId === userId && r.kind === kind);
          if (found) Object.assign(found, update);
          else state.rows.push({ ...create });
        }
      ),
    },
    identityReviewCase: {
      findFirst: vi.fn(
        async ({ where }: { where: { userId: number; status: string } }) =>
          state.cases.find(c => c.userId === where.userId && c.status === where.status) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Case }) => {
        state.cases.push({ ...data, alertedAt: null, results: 1 });
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: Buffer }; data: Record<string, unknown> }) => {
          const found = state.cases.find(c => c.id.equals(where.id));
          if (!found) return;
          if (data.alertedAt) found.alertedAt = data.alertedAt as Date;
          if (data.results) found.results += 1;
        }
      ),
    },
  },
}));

import {
  checkIdentity,
  evaluateIdentity,
  reuseStored,
  sellerReasonFromBinding,
} from "../services/identity/checks";
import { under18AlertEmail } from "../services/identity/reviewCase";

const verified = (ageOver18?: boolean) => ({
  status: "VERIFIED",
  verification: {
    type: "STANDARD",
    verified_at: "2026-01-01T00:00:00Z",
    valid_until: new Date(Date.now() + 300 * DAY).toISOString(),
  },
  attributes:
    ageOver18 === undefined ? {} : { age_over_18: String(ageOver18), name: "Secret Name" },
});

beforeEach(() => {
  state.configured = true;
  state.authbase = verified(true);
  state.authbaseThrows = false;
  state.binding = {
    ok: true,
    label: "maya",
    name: "maya.revotest.eth",
    expiry: Math.floor((Date.now() + 100 * DAY) / 1000),
  };
  state.bindingThrows = false;
  state.user = { revo_name: "maya", wallet: { address: WALLET }, handle: "maya" };
  state.rows = [];
  state.cases = [];
  state.emails = [];
  state.authbaseCalls = 0;
  state.alertEmail = "safety@example.test";
});

describe("evaluateIdentity", () => {
  const facts = {
    status: "VERIFIED" as const,
    tier: "STANDARD" as const,
    validUntil: new Date(Date.now() + DAY),
    ageOver18: "true" as const,
  };

  it("maps Authbase statuses first", () => {
    expect(evaluateIdentity("age_over_18", { ...facts, status: "NOT_LINKED" }, null)).toEqual({
      pass: false,
      reason: "not_linked",
    });
    expect(evaluateIdentity("seller", { ...facts, status: "NOT_VERIFIED" }, null)).toEqual({
      pass: false,
      reason: "not_verified",
    });
  });

  it("age: absent is not shared, false is under 18", () => {
    expect(evaluateIdentity("age_over_18", { ...facts, ageOver18: null }, null)).toEqual({
      pass: false,
      reason: "not_shared",
    });
    expect(evaluateIdentity("age_over_18", { ...facts, ageOver18: "false" }, null)).toEqual({
      pass: false,
      reason: "under_18",
    });
    expect(evaluateIdentity("age_over_18", facts, null).pass).toBe(true);
  });

  it("seller: the earlier of Authbase and the name expiry", () => {
    const nameExpiry = Math.floor((Date.now() + 1000) / 1000);
    const result = evaluateIdentity("seller", facts, {
      ok: true,
      label: "maya",
      name: "maya.revotest.eth",
      expiry: nameExpiry,
    });
    expect(result.pass).toBe(true);
    if (result.pass) expect(result.validUntil.getTime()).toBe(nameExpiry * 1000);
  });

  it("seller reasons from the RNS binding", () => {
    expect(
      sellerReasonFromBinding({ ok: false, reason: "invalid", label: null, expiry: null })
    ).toBe("no_name");
    expect(
      sellerReasonFromBinding({ ok: false, reason: "not_found", label: "x", expiry: null })
    ).toBe("no_name");
    expect(sellerReasonFromBinding({ ok: false, reason: "expired", label: "x", expiry: 1 })).toBe(
      "name_expired"
    );
    expect(sellerReasonFromBinding({ ok: false, reason: "not_owner", label: "x", expiry: 1 })).toBe(
      "name_not_bound"
    );
    expect(
      sellerReasonFromBinding({ ok: false, reason: "addr_elsewhere", label: "x", expiry: 1 })
    ).toBe("name_not_bound");
  });
});

describe("reuseStored", () => {
  const now = new Date();
  const base = {
    walletAddress: WALLET,
    tier: "STANDARD",
    validUntil: new Date(now.getTime() + DAY),
    checkedAt: now,
  };

  it("ignores a row for another wallet (acceptance 9)", () => {
    expect(
      reuseStored({ ...base, walletAddress: OTHER, pass: true, reason: null }, WALLET, now)
    ).toBeNull();
  });

  it("reuses a pass for 24 hours and never past valid until", () => {
    expect(reuseStored({ ...base, pass: true, reason: null }, WALLET, now)?.pass).toBe(true);
    expect(
      reuseStored(
        { ...base, pass: true, reason: null, checkedAt: new Date(now.getTime() - DAY) },
        WALLET,
        now
      )
    ).toBeNull();
    expect(
      reuseStored(
        { ...base, pass: true, reason: null, validUntil: new Date(now.getTime() - 1) },
        WALLET,
        now
      )
    ).toBeNull();
  });

  it("reuses a fail for 5 minutes, never unavailable", () => {
    expect(reuseStored({ ...base, pass: false, reason: "not_shared" }, WALLET, now)).toEqual({
      pass: false,
      reason: "not_shared",
    });
    expect(
      reuseStored(
        {
          ...base,
          pass: false,
          reason: "not_shared",
          checkedAt: new Date(now.getTime() - 6 * 60_000),
        },
        WALLET,
        now
      )
    ).toBeNull();
    expect(reuseStored({ ...base, pass: false, reason: "unavailable" }, WALLET, now)).toBeNull();
  });
});

describe("checkIdentity", () => {
  it("passes Over 18 and stores no attribute value (acceptance 8)", async () => {
    const result = await checkIdentity(1, "age_over_18");
    expect(result.pass).toBe(true);
    expect(state.rows).toHaveLength(1);
    expect(Object.keys(state.rows[0]!).sort()).toEqual(
      [
        "checkedAt",
        "id",
        "kind",
        "pass",
        "reason",
        "tier",
        "userId",
        "validUntil",
        "walletAddress",
      ].sort()
    );
    expect(JSON.stringify(state.rows[0])).not.toContain("Secret Name");
  });

  it("an account without a wallet is no_wallet", async () => {
    state.user = { revo_name: null, wallet: null };
    expect(await checkIdentity(1, "age_over_18")).toEqual({ pass: false, reason: "no_wallet" });
  });

  it("Authbase down is unavailable, writes no row, and Try again reaches Authbase (acceptance 12)", async () => {
    state.authbaseThrows = true;
    expect(await checkIdentity(1, "age_over_18")).toEqual({ pass: false, reason: "unavailable" });
    expect(state.rows).toHaveLength(0);
    state.authbaseThrows = false;
    expect((await checkIdentity(1, "age_over_18")).pass).toBe(true);
    expect(state.authbaseCalls).toBe(2);
  });

  it("Authbase not configured fails closed", async () => {
    state.configured = false;
    expect(await checkIdentity(1, "seller")).toEqual({ pass: false, reason: "unavailable" });
  });

  it("reuses a stored pass, and fresh reads Authbase again", async () => {
    await checkIdentity(1, "age_over_18");
    await checkIdentity(1, "age_over_18");
    expect(state.authbaseCalls).toBe(1);
    await checkIdentity(1, "age_over_18", { fresh: true });
    expect(state.authbaseCalls).toBe(2);
  });

  it("seller needs a bound, active RNS name (acceptance 5)", async () => {
    state.binding = { ok: false, reason: "addr_elsewhere", label: "maya", expiry: 1 };
    expect(await checkIdentity(1, "seller")).toEqual({ pass: false, reason: "name_not_bound" });
    state.user = { revo_name: null, wallet: { address: WALLET } };
    expect(await checkIdentity(1, "seller", { fresh: true })).toEqual({
      pass: false,
      reason: "no_name",
    });
  });

  it("a chain read failure on the seller check is unavailable", async () => {
    state.bindingThrows = true;
    expect(await checkIdentity(1, "seller")).toEqual({ pass: false, reason: "unavailable" });
    expect(state.rows).toHaveLength(0);
  });

  it("under 18 opens one case, alerts support once, and later results attach (acceptance 13)", async () => {
    state.authbase = verified(false);
    expect(await checkIdentity(7, "age_over_18")).toEqual({ pass: false, reason: "under_18" });
    expect(state.cases).toHaveLength(1);
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0]!.to).toEqual(["safety@example.test"]);
    expect(state.emails[0]!.html).not.toContain("Secret Name");

    // While the case is open, a later pass from Authbase still does not open 18+
    state.authbase = verified(true);
    expect(await checkIdentity(7, "age_over_18", { fresh: true })).toEqual({
      pass: false,
      reason: "under_18",
    });
    expect(state.cases).toHaveLength(1);
    expect(state.emails).toHaveLength(1);
  });

  it("a second under 18 result attaches to the open case without a second alert", async () => {
    state.authbase = verified(false);
    await checkIdentity(8, "seller"); // seller does not open a case
    expect(state.cases).toHaveLength(0);
    state.cases.push({
      id: Buffer.alloc(16, 1),
      userId: 8,
      kind: "under_18",
      status: "cleared",
      alertedAt: new Date(),
      results: 1,
    });
    await checkIdentity(8, "age_over_18");
    expect(state.cases.filter(c => c.status === "open")).toHaveLength(1);
  });

  it("no alert address logs instead of sending, and the next result retries the alert", async () => {
    state.alertEmail = "";
    state.authbase = verified(false);
    await checkIdentity(9, "age_over_18");
    expect(state.emails).toHaveLength(0);
    expect(state.cases[0]!.alertedAt).toBeNull();
  });
});

describe("under18AlertEmail", () => {
  it("names the case and handle only, and has no dashes", () => {
    const email = under18AlertEmail({
      caseId: "0192f0aa00",
      handle: "lumen.kai",
      at: new Date("2026-10-30T09:12:00Z"),
    });
    expect(email.text.join(" ")).toContain("@lumen.kai");
    expect(email.html).not.toMatch(/[–—]/);
  });
});
