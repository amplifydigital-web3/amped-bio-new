/**
 * PAY-A1 AmpedPay admin controls (Build Board #50), spec docs/features/ampedpay.md 3.3 to
 * 3.9 and acceptance 4, 6, 7 and 8: settings defaults and ranges, the two person rule,
 * two factor at the moment of change, pause at once and resume through approval, fee
 * effective dates, draft expiry, and read only access for a plain admin. The database and
 * better-auth are faked in memory.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;

const store = vi.hoisted(() => ({
  settings: new Map<string, Row>(),
  changes: [] as Row[],
  users: [] as Row[],
  twoFactor: new Map<number, Row>(),
}));

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (
      condition &&
      typeof condition === "object" &&
      !(condition instanceof Date) &&
      !Buffer.isBuffer(condition)
    ) {
      if ("in" in condition) return condition.in.includes(value);
      if ("lt" in condition) return value < condition.lt;
      if ("lte" in condition) return value !== null && value <= condition.lte;
      return true;
    }
    if (Buffer.isBuffer(condition)) return Buffer.isBuffer(value) && condition.equals(value);
    return value === condition;
  });
}

const db = vi.hoisted(() => {
  const api: Row = {
    siteSettings: {
      findMany: vi.fn(async ({ where }: Row) =>
        [...store.settings.values()].filter(row => where.setting_key.in.includes(row.setting_key))
      ),
      findUnique: vi.fn(async ({ where }: Row) => store.settings.get(where.setting_key) ?? null),
      upsert: vi.fn(async ({ where, create, update }: Row) => {
        const existing = store.settings.get(where.setting_key);
        const row = existing ? { ...existing, ...update } : { ...create };
        store.settings.set(where.setting_key, row);
        return row;
      }),
    },
    adminChange: {
      create: vi.fn(async ({ data }: Row) => {
        const row = {
          effectiveAt: null,
          approvedById: null,
          decisionNote: null,
          safeTxHash: null,
          txHash: null,
          chainId: null,
          decidedAt: null,
          appliedAt: null,
          createdAt: new Date(),
          ...data,
        };
        store.changes.push(row);
        return row;
      }),
      findFirst: vi.fn(
        async ({ where }: Row) => store.changes.find(row => matches(row, where)) ?? null
      ),
      findUnique: vi.fn(
        async ({ where }: Row) =>
          store.changes.find(row => Buffer.from(row.id).equals(where.id)) ?? null
      ),
      findMany: vi.fn(async ({ where, take }: Row) => {
        const rows = store.changes
          .filter(row => matches(row, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      }),
      updateMany: vi.fn(async ({ where, data }: Row) => {
        let count = 0;
        for (const row of store.changes) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: Row) => {
        if (where.handle) return store.users.filter(user => where.handle.in.includes(user.handle));
        return store.users.filter(user => where.id.in.includes(user.id));
      }),
    },
    twoFactor: {
      findUnique: vi.fn(async ({ where }: Row) => store.twoFactor.get(where.userId) ?? null),
    },
  };
  api.$transaction = vi.fn(async (fn: (tx: Row) => unknown) => fn(api));
  return api;
});

const verifyTOTP = vi.hoisted(() => vi.fn());

vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));
vi.mock("../utils/auth", () => ({ auth: { api: { verifyTOTP } } }));
vi.mock("../services/usdc/admin", () => ({
  relayerState: vi.fn(async () => ({ configured: false })),
}));

import { env } from "../env";
import {
  applyDueChanges,
  checkEffectiveAt,
  clearPaymentSettingsCache,
  contractLimits,
  defaultForKey,
  paymentSettings,
  validateServerValue,
  PaymentSettingError,
} from "../services/payments/settings";
import {
  approveChange,
  draftChange,
  expireStaleDrafts,
  listChanges,
  pausePayments,
  rejectChange,
  settingsView,
} from "../services/payments/changes";
import { clearTwoFactorFailuresForTests } from "../services/payments/twoFactor";
import { paymentsAdminRouter } from "../trpc/admin/payments";

const JOHN = 11;
const ROB = 12;
const PLAIN = 13;
const NOW = new Date("2026-10-28T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function caller(sub: number, role: string) {
  return paymentsAdminRouter.createCaller({
    req: { headers: {} } as never,
    res: {} as never,
    user: { sub, email: `${sub}@amped.bio`, role, wallet: null, poolAddresses: {} },
  });
}

const john = () => caller(JOHN, "admin,payments_admin");
const rob = () => caller(ROB, "user, admin, payments_admin");
const plain = () => caller(PLAIN, "admin");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  store.settings.clear();
  store.changes.length = 0;
  store.users.splice(
    0,
    store.users.length,
    { id: JOHN, handle: "john" },
    { id: ROB, handle: "rob" },
    { id: PLAIN, handle: "ops" },
    { id: 40, handle: "maya_lin" },
    { id: 41, handle: "dj-kai" }
  );
  store.twoFactor.clear();
  store.twoFactor.set(JOHN, { verified: true });
  store.twoFactor.set(ROB, { verified: true });
  store.twoFactor.set(PLAIN, { verified: true });
  clearPaymentSettingsCache();
  clearTwoFactorFailuresForTests();
  verifyTOTP.mockImplementation(async ({ body }: Row) => {
    if (body.code === "123456") return { token: "session-token", user: {} };
    throw new Error("INVALID_CODE");
  });
  Object.assign(env, {
    PAYMENTS_ENABLED: false,
    AMPEDPAY_ADDRESS: "",
    AMPEDPAY_SAFE: "0x5555555555555555555555555555555555555555",
    RELAYER_GAS_ALARM_ETH: "0.05",
    RELAYER_GAS_STOP_ETH: "0.01",
  });
});

describe("paymentSettings defaults (spec 3.3)", () => {
  it("returns the spec defaults when no row exists", async () => {
    const settings = await paymentSettings(NOW.getTime());
    expect(settings).toMatchObject({
      paymentsPaused: false,
      platformFeeBps: 500,
      oneTimePriceMin: 500_000n,
      oneTimePriceMax: 1_000_000_000n,
      promoterShareMinBps: 100,
      promoterShareMaxBps: 3_000,
      quoteWindowSeconds: 600,
      softUnlockConfirmations: 1,
      finalConfirmations: 12,
      purchasesPerDayPerAccount: 20,
      purchaseUsdcPerDayPerAccount: 2_000_000_000n,
      promoterRefundPauseRateBps: 1_000,
      refundWindowDays: 30,
      relayerGasAlarmEth: "0.05",
      relayerGasStopEth: "0.01",
      pilotOnly: true,
      pilotCreators: [],
    });
  });

  it("reads stored rows and keeps env gas lines as the fallback", async () => {
    store.settings.set("platform_fee_bps", {
      setting_key: "platform_fee_bps",
      setting_value: "450",
    });
    env.RELAYER_GAS_ALARM_ETH = "0.08";
    const settings = await paymentSettings(NOW.getTime());
    expect(settings.platformFeeBps).toBe(450);
    expect(settings.relayerGasAlarmEth).toBe("0.08");
    expect(defaultForKey("one_time_price_max")).toBe("1000000000");
  });

  it("caches for 30 seconds", async () => {
    await paymentSettings(NOW.getTime());
    await paymentSettings(NOW.getTime() + 10_000);
    expect(db.siteSettings.findMany).toHaveBeenCalledTimes(1);
    await paymentSettings(NOW.getTime() + 31_000);
    expect(db.siteSettings.findMany).toHaveBeenCalledTimes(2);
  });
});

describe("server ranges (spec 3.3)", () => {
  const base = async () => ({
    values: (await paymentSettings(NOW.getTime())).values,
    limits: contractLimits(),
  });

  it("keeps the platform fee between the floor and 10%", async () => {
    const context = await base();
    expect(
      validateServerValue("platform_fee_bps", "450", {
        ...context,
        limits: { ...context.limits, feeFloorBps: 400 },
      })
    ).toBe("450");
    expect(() => validateServerValue("platform_fee_bps", "450", context)).toThrow(/fee floor/);
    expect(() => validateServerValue("platform_fee_bps", "1001", context)).toThrow(
      PaymentSettingError
    );
    expect(() => validateServerValue("platform_fee_bps", "5.5", context)).toThrow(/whole number/);
  });

  it("keeps the creator at the minimum with the platform fee and promoter maximum", async () => {
    const context = await base();
    expect(validateServerValue("promoter_share", "0,4500", context)).toBe("0,4500");
    expect(() => validateServerValue("promoter_share", "0,4600", context)).toThrow(
      /creator minimum/
    );
    expect(() => validateServerValue("promoter_share", "200,100", context)).toThrow(
      /minimum must not be above/
    );
  });

  it("keeps the price range inside the contract limits", async () => {
    const context = await base();
    expect(validateServerValue("one_time_price", "500000,1000000000", context)).toBe(
      "500000,1000000000"
    );
    expect(() => validateServerValue("one_time_price", "400000,1000000000", context)).toThrow(
      /contract minimum/
    );
    expect(() => validateServerValue("one_time_price", "500000,1000000001", context)).toThrow(
      /contract minimum/
    );
  });

  it("checks quote window, confirmations, limits and refunds", async () => {
    const context = await base();
    expect(() => validateServerValue("quote_window_seconds", "59", context)).toThrow();
    expect(() => validateServerValue("quote_window_seconds", "3601", context)).toThrow(
      /split limit/
    );
    expect(validateServerValue("quote_window_seconds", "3600", context)).toBe("3600");
    expect(() => validateServerValue("soft_unlock_confirmations", "13", context)).toThrow();
    expect(() => validateServerValue("final_confirmations", "65", context)).toThrow();
    expect(() => validateServerValue("purchases_per_day_per_account", "501", context)).toThrow();
    expect(() =>
      validateServerValue("purchase_usdc_per_day_per_account", "20000000001", context)
    ).toThrow();
    expect(validateServerValue("purchase_usdc_per_day_per_account", "20000000000", context)).toBe(
      "20000000000"
    );
    expect(() => validateServerValue("refund_window_days", "366", context)).toThrow();
    expect(() => validateServerValue("promoter_refund_pause_rate", "99", context)).toThrow();
  });

  it("keeps the gas stop line below the alarm line", async () => {
    const context = await base();
    expect(validateServerValue("relayer_gas_stop_eth", "0.02", context)).toBe("0.02");
    expect(() => validateServerValue("relayer_gas_stop_eth", "0.05", context)).toThrow(
      /below the alarm/
    );
    expect(() => validateServerValue("relayer_gas_alarm_eth", "0.0000001", context)).toThrow(
      /6 decimal/
    );
  });

  it("normalizes pilot handles and refuses unknown ones", async () => {
    const context = await base();
    const known = new Set(["maya_lin", "dj-kai"]);
    expect(
      validateServerValue("payments_pilot_creators", "@Maya_Lin, dj-kai maya_lin", {
        ...context,
        knownHandles: known,
      })
    ).toBe("dj-kai,maya_lin");
    expect(() =>
      validateServerValue("payments_pilot_creators", "ghost", { ...context, knownHandles: known })
    ).toThrow(/@ghost/);
  });

  it("refuses contract and fixed values", async () => {
    const context = await base();
    expect(() => validateServerValue("feeFloorBps", "400", context)).toThrow(
      /not a server setting/
    );
  });
});

describe("fee effective dates (decision 4)", () => {
  it("needs 30 days notice for an increase", () => {
    expect(() => checkEffectiveAt("platform_fee_bps", "500", "600", null, NOW)).toThrow(/30 days/);
    expect(() =>
      checkEffectiveAt("platform_fee_bps", "500", "600", new Date(NOW.getTime() + 29 * DAY), NOW)
    ).toThrow();
    const date = new Date(NOW.getTime() + 31 * DAY);
    expect(checkEffectiveAt("platform_fee_bps", "500", "600", date, NOW)).toBe(date);
  });

  it("lets a decrease apply on approval or on a date", () => {
    expect(checkEffectiveAt("platform_fee_bps", "600", "500", null, NOW)).toBeNull();
    const date = new Date(NOW.getTime() + 2 * DAY);
    expect(checkEffectiveAt("platform_fee_bps", "600", "500", date, NOW)).toBe(date);
  });

  it("takes no date on other values", () => {
    expect(() =>
      checkEffectiveAt("refund_window_days", "30", "14", new Date(NOW.getTime() + DAY), NOW)
    ).toThrow(/no date/);
  });
});

describe("two person rule (acceptance 4)", () => {
  it("applies a server change only after a second payments admin approves", async () => {
    const draft = await john().changes.draft({
      key: "refund_window_days",
      value: "14",
      reason: "Match seller terms",
      code: "123456",
    });
    expect(draft!.status).toBe("draft");
    expect((await paymentSettings(Date.now() + 60_000)).refundWindowDays).toBe(30);

    await expect(john().changes.approve({ id: draft!.id, code: "123456" })).rejects.toThrow(
      /different payments admin/
    );

    const approved = await rob().changes.approve({ id: draft!.id, code: "123456" });
    expect(approved!.status).toBe("applied");
    expect(store.settings.get("refund_window_days")!.setting_value).toBe("14");
    const row = store.changes[0]!;
    expect(row).toMatchObject({
      status: "applied",
      oldValue: "30",
      newValue: "14",
      draftedById: JOHN,
      approvedById: ROB,
    });
  });

  it("refuses a second draft for the same value while one waits", async () => {
    await john().changes.draft({
      key: "refund_window_days",
      value: "14",
      reason: "Match seller terms",
      code: "123456",
    });
    await expect(
      rob().changes.draft({
        key: "refund_window_days",
        value: "20",
        reason: "Other idea",
        code: "123456",
      })
    ).rejects.toThrow(/already waiting/);
  });

  it("supersedes a draft when the value changed since", async () => {
    const draft = await draftChange({
      userId: JOHN,
      itemId: "refund_window_days",
      newValue: "14",
      reason: "Seller terms",
      now: NOW,
    });
    store.settings.set("refund_window_days", {
      setting_key: "refund_window_days",
      setting_value: "21",
    });
    await expect(approveChange({ userId: ROB, changeId: draft.id, now: NOW })).rejects.toThrow(
      /changed since the draft/
    );
    expect(store.changes[0]!.status).toBe("superseded");
  });

  it("writes both keys of a range in one approval", async () => {
    const draft = await draftChange({
      userId: JOHN,
      itemId: "one_time_price",
      newValue: "1000000,500000000",
      reason: "Pilot pricing",
      now: NOW,
    });
    await approveChange({ userId: ROB, changeId: draft.id, now: NOW });
    expect(store.settings.get("one_time_price_min")!.setting_value).toBe("1000000");
    expect(store.settings.get("one_time_price_max")!.setting_value).toBe("500000000");
  });

  it("holds a dated fee change as approved and applies it on the date", async () => {
    const effectiveAt = new Date(NOW.getTime() + 31 * DAY);
    const draft = await draftChange({
      userId: JOHN,
      itemId: "platform_fee_bps",
      newValue: "600",
      reason: "New pricing",
      effectiveAt,
      now: NOW,
    });
    expect((await approveChange({ userId: ROB, changeId: draft.id, now: NOW })).status).toBe(
      "approved"
    );
    expect(store.settings.has("platform_fee_bps")).toBe(false);

    expect(await applyDueChanges(new Date(NOW.getTime() + 30 * DAY))).toBe(0);
    expect(await applyDueChanges(new Date(effectiveAt.getTime() + 1000))).toBe(1);
    expect(store.settings.get("platform_fee_bps")!.setting_value).toBe("600");
    expect(store.changes[0]!.status).toBe("applied");
    expect(await applyDueChanges(new Date(effectiveAt.getTime() + 2000))).toBe(0);
  });

  it("rejects with a note, and the drafter can withdraw", async () => {
    const draft = await john().changes.draft({
      key: "promoter_share",
      value: "100,4000",
      reason: "Partner request",
      code: "123456",
    });
    await expect(
      rob().changes.reject({ id: draft!.id, note: "no", code: "123456" })
    ).rejects.toThrow();
    await rob().changes.reject({
      id: draft!.id,
      note: "Keep 30% until counsel reviews",
      code: "123456",
    });
    expect(store.changes[0]).toMatchObject({
      status: "rejected",
      decisionNote: "Keep 30% until counsel reviews",
    });
    await expect(rob().changes.approve({ id: draft!.id, code: "123456" })).rejects.toThrow(
      /rejected/
    );
    const second = await draftChange({
      userId: JOHN,
      itemId: "promoter_share",
      newValue: "100,3500",
      reason: "Smaller step",
      now: NOW,
    });
    await rejectChange({ userId: JOHN, changeId: second.id, note: "Withdrawn", now: NOW });
    expect(store.changes[1]!.status).toBe("rejected");
  });

  it("expires drafts after 7 days", async () => {
    const draft = await draftChange({
      userId: JOHN,
      itemId: "refund_window_days",
      newValue: "14",
      reason: "Seller terms",
      now: NOW,
    });
    expect(await expireStaleDrafts(new Date(NOW.getTime() + 6 * DAY))).toBe(0);
    expect(await expireStaleDrafts(new Date(NOW.getTime() + 7 * DAY + 1000))).toBe(1);
    await expect(
      approveChange({ userId: ROB, changeId: draft.id, now: new Date(NOW.getTime() + 8 * DAY) })
    ).rejects.toThrow(/expired/);
  });

  it("refuses on chain and fixed values until PAY-A2", async () => {
    await expect(
      john().changes.draft({
        key: "feeFloorBps",
        value: "450",
        reason: "Lower floor",
        code: "123456",
      })
    ).rejects.toThrow(/Safe/);
    await expect(
      john().changes.draft({
        key: "MAX_FEE_BPS",
        value: "900",
        reason: "Lower cap",
        code: "123456",
      })
    ).rejects.toThrow(/fixed/);
  });
});

describe("two factor at the moment of change (spec 3.5)", () => {
  it("refuses a wrong code and changes nothing", async () => {
    await expect(
      john().changes.draft({
        key: "refund_window_days",
        value: "14",
        reason: "Seller terms",
        code: "000000",
      })
    ).rejects.toThrow(/did not match/);
    expect(store.changes).toHaveLength(0);
  });

  it("needs two factor turned on", async () => {
    store.twoFactor.delete(JOHN);
    await expect(
      john().changes.draft({
        key: "refund_window_days",
        value: "14",
        reason: "Seller terms",
        code: "123456",
      })
    ).rejects.toThrow(/Turn on two factor/);
  });

  it("locks after 5 wrong codes", async () => {
    for (let i = 0; i < 5; i += 1) {
      await expect(john().pause({ reason: "Incident", code: "000000" })).rejects.toThrow(
        /did not match/
      );
    }
    await expect(john().pause({ reason: "Incident", code: "123456" })).rejects.toThrow(
      /locked for 15 minutes/
    );
  });
});

describe("pause and resume (acceptance 6)", () => {
  it("pauses at once with one admin and resumes through the two person rule", async () => {
    await john().pause({ reason: "Relayer gas below the stop line", code: "123456" });
    expect(store.settings.get("payments_paused")!.setting_value).toBe("true");
    expect(store.changes[0]).toMatchObject({
      key: "payments_paused",
      status: "applied",
      approvedById: null,
    });
    await expect(john().pause({ reason: "Again", code: "123456" })).rejects.toThrow(
      /already paused/
    );

    await expect(
      john().changes.draft({
        key: "payments_paused",
        value: "true",
        reason: "Pause by draft",
        code: "123456",
      })
    ).rejects.toThrow(/Only Resume/);
    const resume = await john().changes.draft({
      key: "payments_paused",
      value: "false",
      reason: "Relayer topped up",
      code: "123456",
    });
    await expect(john().changes.approve({ id: resume!.id, code: "123456" })).rejects.toThrow(
      /different payments admin/
    );
    await rob().changes.approve({ id: resume!.id, code: "123456" });
    expect(store.settings.get("payments_paused")!.setting_value).toBe("false");
  });
});

describe("access (acceptance 8)", () => {
  it("lets a plain admin read everything and change nothing", async () => {
    const settings = await plain().settings();
    expect(settings.items.find(item => item.id === "platform_fee_bps")).toMatchObject({
      value: "500",
      valueText: "5.00%",
      target: "server",
    });
    expect(settings.items.find(item => item.id === "treasury")).toMatchObject({
      target: "contract",
      value: "0x5555555555555555555555555555555555555555",
    });
    const overview = await plain().overview();
    expect(overview).toMatchObject({
      enabled: false,
      paused: false,
      contract: { deployed: false },
    });
    expect((await plain().viewer()).canChange).toBe(false);
    await expect(plain().pause({ reason: "Incident", code: "123456" })).rejects.toThrow(
      /Only a payments admin/
    );
    await expect(
      plain().changes.draft({
        key: "refund_window_days",
        value: "14",
        reason: "Seller terms",
        code: "123456",
      })
    ).rejects.toThrow(/Only a payments admin/);
  });

  it("refuses a payments admin role without admin", async () => {
    await expect(caller(JOHN, "payments_admin").settings()).rejects.toThrow(/Forbidden/);
  });
});

describe("change log (acceptance 7)", () => {
  it("lists changes newest first with drafter, approver and words", async () => {
    const first = await draftChange({
      userId: JOHN,
      itemId: "refund_window_days",
      newValue: "14",
      reason: "Seller terms",
      now: NOW,
    });
    await approveChange({ userId: ROB, changeId: first.id, now: NOW });
    await draftChange({
      userId: ROB,
      itemId: "quote_window_seconds",
      newValue: "300",
      reason: "Faster checkout",
      now: new Date(NOW.getTime() + 1000),
    });

    const all = await listChanges({ now: new Date(NOW.getTime() + 2000) });
    expect(all.items.map(item => item.key)).toEqual(["quote_window_seconds", "refund_window_days"]);
    expect(all.items[1]).toMatchObject({
      draftedBy: "john",
      approvedBy: "rob",
      oldText: "30 days",
      newText: "14 days",
      status: "applied",
    });
    expect(all.items[0]).toMatchObject({ newText: "5 minutes", status: "draft" });

    const waiting = await listChanges({ filter: "waiting", now: new Date(NOW.getTime() + 2000) });
    expect(waiting.items).toHaveLength(1);

    const view = await settingsView(new Date(NOW.getTime() + 2000));
    const refund = view.items.find(item => item.id === "refund_window_days")!;
    expect(refund.lastChange?.approvedBy).toBe("rob");
    expect(view.items.find(item => item.id === "quote_window_seconds")!.waiting?.draftedBy).toBe(
      "rob"
    );
  });

  it("logs a pause with the reason and no second admin", async () => {
    await pausePayments({ userId: JOHN, reason: "Incident on Base", now: NOW });
    const { items } = await listChanges({ now: NOW });
    expect(items[0]).toMatchObject({
      label: "Pause payments",
      oldText: "Open",
      newText: "Paused",
      reason: "Incident on Base",
      approvedBy: null,
    });
  });
});
