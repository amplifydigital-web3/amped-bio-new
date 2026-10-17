/**
 * USDC-6 Buy USDC admin half and privacy (Build Board #5, spec 3.8 and 3.9).
 * Pause Buy USDC, the Admin, Money on-ramp read outs, and the USDC records
 * export. The database and Coinbase are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAddress } from "viem";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    user: { findUnique: fn(), findMany: fn() },
    siteSettings: { findUnique: fn(), upsert: fn() },
    onrampSession: { findMany: fn(), groupBy: fn(), aggregate: fn(), create: fn() },
    onrampEvent: { findFirst: fn(), findMany: fn(), count: fn() },
    onrampUserAuth: { findUnique: fn(), deleteMany: fn() },
    usdcSend: { findMany: fn() },
    paymentEvent: { findMany: fn() },
  };
});

vi.mock("@repo/database", () => ({
  prisma: db,
  Prisma: { PrismaClientKnownRequestError: class extends Error {}, JsonNull: "JsonNull" },
}));

import { SITE_SETTINGS } from "@repo/constants";
import { env } from "../env";
import { setOnrampApiForTests, type OnrampApi } from "../services/onramp/coinbase";
import {
  onrampEvents,
  onrampOverview,
  onrampSessions,
  setOnrampPaused,
} from "../services/onramp/admin";
import {
  clearOnrampCachesForTests,
  createCoinbaseSession,
  onrampOptions,
  onrampQuote,
} from "../services/onramp/sessions";
import { forgetCoinbaseToken, usdcRecordsFor } from "../services/usdc/records";

const WALLET = getAddress("0x4444444444444444444444444444444444444444");
const NY = { country: "US", subdivision: "NY" };
const NOW = new Date("2026-10-17T15:00:00Z");

const api = {
  getOnrampBuyConfig: vi.fn(),
  getOnrampBuyOptions: vi.fn(),
  getOnrampTransactions: vi.fn(),
  createOnrampSession: vi.fn(),
  createOnrampOrder: vi.fn(),
  getOnrampOrder: vi.fn(),
} satisfies Record<keyof OnrampApi, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  clearOnrampCachesForTests();
  setOnrampApiForTests(api as unknown as OnrampApi);
  Object.assign(env, {
    ONRAMP_ENABLED: true,
    ONRAMP_SANDBOX: true,
    CDP_API_KEY_ID: "kid",
    CDP_API_KEY_SECRET: "secret",
    CDP_ONRAMP_WEBHOOK_SECRET: "whsec",
  });
  api.getOnrampBuyConfig.mockResolvedValue({
    countries: [{ id: "US", subdivisions: ["NY"], payment_methods: [{ id: "CARD" }] }],
  });
  api.getOnrampBuyOptions.mockResolvedValue({
    payment_currencies: [{ id: "USD", limits: [{ id: "CARD", min: "5", max: "500" }] }],
    purchase_currencies: [{ id: "usdc", symbol: "USDC", networks: [{ name: "base" }] }],
  });
  db.siteSettings.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue({ onramp_ref: "ob_abc", wallet: { address: WALLET } });
});

describe("Pause Buy USDC", () => {
  it("stores the switch as a site setting", async () => {
    await setOnrampPaused(true);
    expect(db.siteSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { setting_key: SITE_SETTINGS.USDC_ONRAMP_PAUSED },
        update: { setting_value: "true", value_type: "BOOLEAN" },
      })
    );
  });

  it("tells the panel and refuses new quotes and links while on", async () => {
    db.siteSettings.findUnique.mockResolvedValue({ setting_value: "true" });
    const options = await onrampOptions(NY, null, NOW.getTime());
    expect(options.paused).toBe(true);
    await expect(
      onrampQuote(7, { cents: 2500, mode: "coinbase_account", region: NY }, NOW.getTime())
    ).rejects.toThrow("Buy USDC is paused");
    await expect(createCoinbaseSession(7, { cents: 2500, region: NY }, NOW)).rejects.toThrow(
      "Buy USDC is paused"
    );
    expect(api.createOnrampSession).not.toHaveBeenCalled();
    expect(db.onrampSession.create).not.toHaveBeenCalled();
  });

  it("is off by default", async () => {
    const options = await onrampOptions(NY, null, NOW.getTime());
    expect(options.paused).toBe(false);
  });
});

describe("Admin, Money on-ramp read outs", () => {
  it("counts the last 7 days by status and way to pay, with failure codes", async () => {
    db.onrampSession.groupBy
      .mockResolvedValueOnce([
        { status: "success", _count: { _all: 3 } },
        { status: "failed", _count: { _all: 2 } },
        { status: "processing", _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { mode: "apple_pay", _count: { _all: 4 } },
        { mode: "coinbase_account", _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { failureCode: "ERROR_CODE_GUEST_TRANSACTION_LIMIT", _count: { _all: 2 } },
      ]);
    db.onrampSession.aggregate.mockResolvedValue({
      _sum: { fiatAmount: 7500, usdcAmount: 71_000_000n },
    });
    db.onrampEvent.findFirst.mockResolvedValue({ receivedAt: NOW });
    db.onrampEvent.count.mockResolvedValue(1);

    const overview = await onrampOverview(NOW);
    expect(overview.week.total).toBe(6);
    expect(overview.week.byStatus.success).toBe(3);
    expect(overview.week.byMode.apple_pay).toBe(4);
    expect(overview.week.paidUsd).toBe("75.00");
    expect(overview.week.usdcUnits).toBe("71000000");
    expect(overview.week.failures[0]).toEqual({
      code: "ERROR_CODE_GUEST_TRANSACTION_LIMIT",
      count: 2,
    });
    expect(overview.webhook.errorsThisWeek).toBe(1);
    expect(overview.sandbox).toBe(true);
    const since = db.onrampSession.groupBy.mock.calls[0]![0].where.createdAt.gte as Date;
    expect(NOW.getTime() - since.getTime()).toBe(7 * 86_400_000);
  });

  it("lists sessions with handles only, never the Coinbase reference", async () => {
    db.onrampSession.findMany.mockResolvedValue([
      {
        id: Buffer.alloc(16, 1),
        userId: 7,
        mode: "google_pay",
        status: "failed",
        fiatAmount: 2500,
        fiatCurrency: "USD",
        usdcAmount: null,
        partnerUserRef: "sandbox-ob_secret",
        sessionRef: "ord_1",
        txHash: null,
        failureCode: "ERROR_CODE_GUEST_CARD_HARD_DECLINED",
        sandbox: true,
        createdAt: NOW,
      },
    ]);
    db.user.findMany.mockResolvedValue([{ id: 7, handle: "fan" }]);
    const [row] = await onrampSessions({ limit: 25, status: "failed" });
    expect(row).toMatchObject({ handle: "fan", fiatAmount: "25.00", status: "failed" });
    expect(JSON.stringify(row)).not.toContain("ob_secret");
    expect(db.onrampSession.findMany.mock.calls[0]![0].where.status).toBe("failed");
  });

  it("shows the webhook log without the payload", async () => {
    db.onrampEvent.findMany.mockResolvedValue([
      {
        id: Buffer.alloc(16, 2),
        eventId: "evt_1",
        eventType: "onramp.transaction.success",
        sessionId: null,
        payload: { walletAddress: WALLET },
        processedAt: NOW,
        error: "no_session",
        receivedAt: NOW,
      },
    ]);
    const [event] = await onrampEvents(25);
    expect(event).toMatchObject({ processed: true, error: "no_session" });
    expect(event).not.toHaveProperty("payload");
  });
});

describe("USDC records for a privacy request", () => {
  it("exports sends, transfers and purchases, and never the Coinbase token", async () => {
    db.user.findUnique.mockResolvedValue({
      id: 7,
      handle: "fan",
      onramp_ref: "ob_abc",
      usdc_wallet_seen_at: NOW,
      wallet: { address: WALLET },
    });
    db.usdcSend.findMany.mockResolvedValue([
      {
        id: Buffer.alloc(16, 3),
        createdAt: NOW,
        chainId: 8453,
        fromAddress: WALLET,
        toAddress: WALLET,
        amount: 5_000_000n,
        status: "confirmed",
        txHash: "0xabc",
        failureCode: null,
      },
    ]);
    db.paymentEvent.findMany.mockResolvedValue([
      {
        id: Buffer.alloc(16, 4),
        occurredAt: NOW,
        chainId: 8453,
        payerUserId: null,
        payeeUserId: 7,
        fromAddress: WALLET,
        toAddress: WALLET,
        amount: 24_000_000n,
        refType: "onramp",
        kind: "usdc_transfer",
        txHash: "0xdef",
      },
    ]);
    db.onrampSession.findMany.mockResolvedValue([
      {
        id: Buffer.alloc(16, 5),
        createdAt: NOW,
        mode: "apple_pay",
        status: "success",
        fiatAmount: 2500,
        fiatCurrency: "USD",
        usdcAmount: 24_000_000n,
        destination: WALLET,
        sessionRef: "ord_1",
        txHash: "0xdef",
        failureCode: null,
        sandbox: false,
      },
    ]);
    db.onrampUserAuth.findUnique.mockResolvedValue({
      provider: "coinbase",
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
    });

    const records = await usdcRecordsFor(7);
    expect(records!.usdcSends).toHaveLength(1);
    expect(records!.usdcTransfers[0]).toMatchObject({ direction: "received", kind: "onramp" });
    expect(records!.coinbasePurchases[0]).toMatchObject({ method: "apple_pay", paid: "25.00" });
    expect(records!.coinbaseSignInKept).not.toBeNull();
    // The token column is never selected
    expect(db.onrampUserAuth.findUnique.mock.calls[0]![0].select).not.toHaveProperty("tokenEnc");
    expect(JSON.stringify(records, (_key, value) => value)).not.toContain("tokenEnc");
  });

  it("deletes the stored Coinbase token on request", async () => {
    db.onrampUserAuth.deleteMany.mockResolvedValue({ count: 1 });
    expect(await forgetCoinbaseToken(7)).toEqual({ deleted: 1 });
    expect(db.onrampUserAuth.deleteMany).toHaveBeenCalledWith({ where: { userId: 7 } });
  });
});
