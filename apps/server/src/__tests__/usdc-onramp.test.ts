/**
 * USDC-4 Buy USDC through Coinbase, Coinbase account path (Build Board #5).
 * Spec docs/features/usdc-wallet-onramp.md 3.5, 3.7 and acceptance 8, 10, 11
 * and 13. The database, Coinbase and the Base RPC are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { getAddress } from "viem";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    user: { findUnique: fn(), updateMany: fn() },
    onrampSession: {
      create: fn(),
      update: fn(),
      updateMany: fn(),
      findFirst: fn(),
      findMany: fn(),
    },
    onrampEvent: { create: fn(), findUnique: fn(), update: fn() },
    paymentEvent: { findFirst: fn(), updateMany: fn() },
  };
});

vi.mock("@repo/database", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, { code }: { code: string }) {
      super(message);
      this.code = code;
    }
  }
  return {
    prisma: db,
    Prisma: { PrismaClientKnownRequestError, JsonNull: "JsonNull" },
  };
});
vi.mock("../utils/rateLimit", () => ({
  enforceRateLimits: vi.fn(),
  hitRateLimit: vi.fn(async () => 1),
}));

import { Prisma } from "@repo/database";
import { env } from "../env";
import { CdpError } from "../services/usdc/cdp";
import { setPaymentClientForTests } from "../services/usdc/chain";
import { fromCents, parseFiatInput, toCents, toUsdcUnits } from "../services/onramp/amounts";
import { setOnrampApiForTests, type OnrampApi } from "../services/onramp/coinbase";
import { newOnrampRef } from "../services/onramp/refs";
import {
  cancelOnrampSession,
  clearOnrampCachesForTests,
  createCoinbaseSession,
  nextStatus,
  onrampOptions,
  onrampQuote,
  onrampStatus,
  safeReturnTo,
} from "../services/onramp/sessions";
import {
  normalizeOnrampEvent,
  processOnrampEvent,
  signPayload,
  verifyOnrampSignature,
} from "../services/onramp/webhook";
import { handleOnrampWebhook } from "../routes/onramp";

const WALLET = getAddress("0x4444444444444444444444444444444444444444");
const NY = { country: "US", subdivision: "NY" };
const NOW = new Date("2026-10-17T15:00:00Z");
const SECRET = "whsec_test";
const SESSION_HEX = "0192a1b2c3d4e5f60718293a4b5c6d7e";

const quote = {
  paymentTotal: "25.00",
  paymentSubtotal: "23.76",
  paymentCurrency: "USD",
  purchaseAmount: "23.760000",
  purchaseCurrency: "USDC",
  destinationNetwork: "base",
  fees: [
    { type: "FEE_TYPE_EXCHANGE", amount: "0.99", currency: "USD" },
    { type: "FEE_TYPE_NETWORK", amount: "0.25", currency: "USD" },
  ],
  exchangeRate: "1",
};

const api = {
  getOnrampBuyConfig: vi.fn(),
  getOnrampBuyOptions: vi.fn(),
  getOnrampTransactions: vi.fn(),
  createOnrampSession: vi.fn(),
} satisfies Record<keyof OnrampApi, unknown>;

const chain = { getTransactionReceipt: vi.fn() };

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: new Uint8Array(Buffer.from(SESSION_HEX, "hex")),
    userId: 7,
    provider: "coinbase",
    mode: "coinbase_account",
    sessionRef: null,
    partnerUserRef: "sandbox-ob_abc",
    status: "created",
    fiatAmount: 2500,
    fiatCurrency: "USD",
    usdcAmount: 23_760_000n,
    quote,
    destination: WALLET,
    chainId: 84532,
    txHash: null,
    failureCode: null,
    returnTo: null,
    sandbox: false,
    checkedAt: null,
    createdAt: new Date(NOW.getTime() - 60_000),
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearOnrampCachesForTests();
  setOnrampApiForTests(api as unknown as OnrampApi);
  setPaymentClientForTests(chain as never);
  Object.assign(env, {
    ONRAMP_ENABLED: true,
    ONRAMP_SANDBOX: true,
    CDP_API_KEY_ID: "kid",
    CDP_API_KEY_SECRET: "secret",
    CDP_ONRAMP_WEBHOOK_SECRET: SECRET,
    APP_URL: "https://app.staging.amped.bio",
  });
  api.getOnrampBuyConfig.mockResolvedValue({
    countries: [
      {
        id: "US",
        subdivisions: ["NY", "CA"],
        payment_methods: [
          { id: "CARD" },
          { id: "ACH_BANK_ACCOUNT" },
          { id: "GUEST_CHECKOUT_APPLE_PAY" },
        ],
      },
      { id: "GB", payment_methods: [{ id: "CARD" }] },
    ],
  });
  api.getOnrampBuyOptions.mockResolvedValue({
    payment_currencies: [
      {
        id: "USD",
        limits: [
          { id: "CARD", min: "5", max: "500" },
          { id: "ACH_BANK_ACCOUNT", min: "10", max: "25000" },
        ],
      },
    ],
    purchase_currencies: [{ id: "usdc", symbol: "USDC", networks: [{ name: "base" }] }],
  });
  api.createOnrampSession.mockResolvedValue({
    session: { onrampUrl: "https://pay.coinbase.com/buy?sessionToken=abc" },
    quote,
  });
  db.user.findUnique.mockResolvedValue({ onramp_ref: "ob_abc", wallet: { address: WALLET } });
  db.onrampSession.create.mockResolvedValue({});
  db.onrampSession.update.mockImplementation(async ({ data }: { data: object }) => ({
    ...sessionRow(),
    ...data,
  }));
  db.onrampSession.findMany.mockResolvedValue([]);
  db.paymentEvent.findFirst.mockResolvedValue(null);
  db.paymentEvent.updateMany.mockResolvedValue({ count: 0 });
});

describe("amounts", () => {
  it("reads Coinbase decimals without floating point", () => {
    expect(toCents("25.5")).toBe(2550);
    expect(toCents({ value: "100.759" })).toBe(10075);
    expect(fromCents(2505)).toBe("25.05");
    expect(toUsdcUnits("23.4912345")).toBe(23_491_234n);
    expect(toUsdcUnits({ value: "5", currency: "USDC" })).toBe(5_000_000n);
    expect(toCents("abc")).toBeNull();
  });

  it("accepts what the fan types only with up to 2 decimals and above zero", () => {
    expect(parseFiatInput("25")).toBe(2500);
    expect(parseFiatInput("25.10")).toBe(2510);
    expect(parseFiatInput("0")).toBeNull();
    expect(parseFiatInput("1.005")).toBeNull();
    expect(parseFiatInput("-3")).toBeNull();
  });

  it("makes an opaque partnerUserRef, never the user id", () => {
    expect(newOnrampRef()).toMatch(/^ob_[a-z0-9]{16}$/);
  });

  it("keeps returnTo inside the app", () => {
    expect(safeReturnTo("/explore/@maya")).toBe("/explore/@maya");
    expect(safeReturnTo("https://evil.example")).toBeNull();
    expect(safeReturnTo("//evil.example")).toBeNull();
  });
});

describe("onramp.options (spec 3.5)", () => {
  it("asks for a US state before quoting", async () => {
    const options = await onrampOptions({ country: "US", subdivision: null });
    expect(options).toMatchObject({ needsRegion: true, regionSupported: true });
    expect(api.getOnrampBuyOptions).not.toHaveBeenCalled();
  });

  it("uses Coinbase's limits for the Coinbase account path", async () => {
    const options = await onrampOptions(NY);
    expect(options).toMatchObject({
      region: NY,
      regionSupported: true,
      fiatCurrency: "USD",
      paths: { coinbase_account: { available: true, minCents: 500, maxCents: 2_500_000 } },
    });
    expect(api.getOnrampBuyOptions).toHaveBeenCalledWith("US", "NY");
  });

  it("says the region is not served when Coinbase does not sell USDC on Base there (acceptance 11)", async () => {
    expect(await onrampOptions({ country: "JP", subdivision: null })).toMatchObject({
      regionSupported: false,
    });
    api.getOnrampBuyOptions.mockResolvedValue({ payment_currencies: [], purchase_currencies: [] });
    expect(await onrampOptions({ country: "GB", subdivision: null })).toMatchObject({
      regionSupported: false,
    });
  });

  it("prefers the region the fan picked over the detected one", async () => {
    const options = await onrampOptions(NY, { country: "US", subdivision: "CA" });
    expect(options.region).toEqual({ country: "US", subdivision: "CA" });
  });
});

describe("onramp.quote (acceptance 8)", () => {
  it("returns Coinbase's quote from the Session API quote use case, unchanged", async () => {
    const result = await onrampQuote(
      7,
      { cents: 2500, mode: "coinbase_account", region: NY },
      NOW.getTime()
    );
    expect(api.createOnrampSession).toHaveBeenCalledWith({
      purchaseCurrency: "USDC",
      destinationNetwork: "base",
      destinationAddress: WALLET,
      paymentAmount: "25.00",
      paymentCurrency: "USD",
      paymentMethod: "CARD",
      country: "US",
      subdivision: "NY",
      partnerUserRef: "sandbox-ob_abc",
    });
    expect(result.quote).toEqual({
      paymentTotal: "25.00",
      paymentSubtotal: "23.76",
      paymentCurrency: "USD",
      purchaseAmount: "23.760000",
      coinbaseFee: "0.99",
      networkFee: "0.25",
      exchangeRate: "1",
    });
  });

  it("serves the same quote for 30 seconds without asking Coinbase again", async () => {
    await onrampQuote(7, { cents: 2500, mode: "coinbase_account", region: NY }, NOW.getTime());
    await onrampQuote(
      7,
      { cents: 2500, mode: "coinbase_account", region: NY },
      NOW.getTime() + 10_000
    );
    expect(api.createOnrampSession).toHaveBeenCalledTimes(1);
    await onrampQuote(
      7,
      { cents: 2500, mode: "coinbase_account", region: NY },
      NOW.getTime() + 31_000
    );
    expect(api.createOnrampSession).toHaveBeenCalledTimes(2);
  });

  it("refuses an amount under Coinbase's minimum before calling Coinbase", async () => {
    await expect(
      onrampQuote(7, { cents: 400, mode: "coinbase_account", region: NY })
    ).rejects.toThrow(/Minimum 5.00 USD/);
    expect(api.createOnrampSession).not.toHaveBeenCalled();
  });

  it("is off while the server switch is off", async () => {
    env.ONRAMP_ENABLED = false;
    await expect(
      onrampQuote(7, { cents: 2500, mode: "coinbase_account", region: NY })
    ).rejects.toThrow(/not available/);
  });
});

describe("onramp.createSession (acceptance 10)", () => {
  it("makes a single use hosted URL for USDC on Base to the fan's wallet with a redirect back", async () => {
    await onrampQuote(7, { cents: 2500, mode: "coinbase_account", region: NY }, NOW.getTime());
    api.createOnrampSession.mockClear();
    const result = await createCoinbaseSession(
      7,
      { cents: 2500, region: NY, returnTo: "/explore/@maya", clientIp: "203.0.113.9" },
      NOW
    );
    expect(result.onrampUrl).toBe("https://pay.coinbase.com/buy?sessionToken=abc");
    const body = api.createOnrampSession.mock.calls[0]![0];
    expect(body).toMatchObject({
      purchaseCurrency: "USDC",
      destinationNetwork: "base",
      destinationAddress: WALLET,
      paymentAmount: "25.00",
      paymentCurrency: "USD",
      clientIp: "203.0.113.9",
      partnerUserRef: "sandbox-ob_abc",
    });
    // No payment method: the fan picks card, bank or balance at Coinbase
    expect(body.paymentMethod).toBeUndefined();
    expect(body.redirectUrl).toBe(
      `https://app.staging.amped.bio/wallet?fund=usdc&session=${result.sessionId}`
    );
    expect(db.onrampSession.create.mock.calls[0]![0].data).toMatchObject({
      mode: "coinbase_account",
      status: "created",
      fiatAmount: 2500,
      usdcAmount: 23_760_000n,
      destination: WALLET,
      returnTo: "/explore/@maya",
      sandbox: true,
    });
  });

  it("records the failure when Coinbase refuses", async () => {
    api.createOnrampSession.mockRejectedValue(new CdpError(503, "unavailable", "down"));
    await expect(createCoinbaseSession(7, { cents: 2500, region: NY }, NOW)).rejects.toThrow(
      /did not answer/
    );
    expect(db.onrampSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "failed", failureCode: "coinbase_503" } })
    );
  });
});

describe("status", () => {
  it("never moves backwards, and a Coinbase result wins over a cancel", () => {
    expect(nextStatus("processing", "created")).toBe("processing");
    expect(nextStatus("canceled", "processing")).toBe("canceled");
    expect(nextStatus("canceled", "success")).toBe("success");
    expect(nextStatus("success", "failed")).toBe("success");
  });

  it("claims the oldest unclaimed Coinbase transaction made after the session started", async () => {
    db.onrampSession.findFirst.mockResolvedValue(sessionRow({ status: "created" }));
    db.onrampSession.findMany.mockResolvedValue([{ sessionRef: "tx-claimed" }]);
    api.getOnrampTransactions.mockResolvedValue({
      transactions: [
        {
          transaction_id: "tx-new",
          status: "ONRAMP_TRANSACTION_STATUS_IN_PROGRESS",
          created_at: NOW.toISOString(),
          wallet_address: WALLET,
        },
        {
          transaction_id: "tx-claimed",
          status: "ONRAMP_TRANSACTION_STATUS_SUCCESS",
          created_at: NOW.toISOString(),
        },
        {
          transaction_id: "tx-old",
          status: "ONRAMP_TRANSACTION_STATUS_SUCCESS",
          created_at: "2026-10-01T00:00:00Z",
        },
      ],
    });
    const status = await onrampStatus(7, SESSION_HEX, NOW);
    expect(api.getOnrampTransactions).toHaveBeenCalledWith("sandbox-ob_abc", 10);
    expect(db.onrampSession.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { status: "processing", sessionRef: "tx-new" } })
    );
    expect(status).toMatchObject({ status: "processing", chainConfirmed: false });
  });

  it("shows Arrived only once the USDC Transfer is on chain", async () => {
    const hash = `0x${"ab".repeat(32)}`;
    db.onrampSession.findFirst.mockResolvedValue(sessionRow({ status: "success", txHash: hash }));
    chain.getTransactionReceipt.mockRejectedValue(new Error("not found"));
    expect((await onrampStatus(7, SESSION_HEX, NOW)).chainConfirmed).toBe(false);
    db.paymentEvent.findFirst.mockResolvedValue({ id: new Uint8Array(16) });
    expect((await onrampStatus(7, SESSION_HEX, NOW)).chainConfirmed).toBe(true);
  });

  it("lets the webhook drive arrival on sandbox, where Coinbase delivers nothing", async () => {
    db.onrampSession.findFirst.mockResolvedValue(sessionRow({ status: "success", sandbox: true }));
    expect(await onrampStatus(7, SESSION_HEX, NOW)).toMatchObject({
      chainConfirmed: true,
      sandbox: true,
    });
  });

  it("expires a session Coinbase never saw after two hours", async () => {
    db.onrampSession.findFirst.mockResolvedValue(
      sessionRow({ createdAt: new Date(NOW.getTime() - 3 * 60 * 60_000), checkedAt: NOW })
    );
    expect((await onrampStatus(7, SESSION_HEX, NOW)).status).toBe("expired");
  });

  it("cancels only an open session", async () => {
    db.onrampSession.findFirst.mockResolvedValue(sessionRow({ status: "canceled" }));
    await cancelOnrampSession(7, SESSION_HEX);
    expect(db.onrampSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 7,
        status: { in: ["created", "pending_verification", "pending_payment"] },
      }),
      data: { status: "canceled" },
    });
  });
});

describe("webhook (acceptance 13)", () => {
  const raw = Buffer.from(
    JSON.stringify({
      eventType: "onramp.transaction.success",
      transactionId: "tx-new",
      status: "ONRAMP_TRANSACTION_STATUS_SUCCESS",
      purchaseAmount: "23.76",
      paymentTotal: "25.00",
      txHash: `0x${"cd".repeat(32)}`,
      partnerUserRef: "sandbox-ob_abc",
    })
  );
  const seconds = () => String(Math.floor(Date.now() / 1000));

  function request(signature: string) {
    return {
      body: raw,
      ip: "198.51.100.1",
      headers: {
        "x-hook0-signature": signature,
        "x-event-id": "evt_1",
        "x-event-type": "onramp.transaction.success",
      },
    } as unknown as Request;
  }

  function response() {
    const res = { statusCode: 0, headersSent: false } as Response & { statusCode: number };
    res.status = vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }) as never;
    res.end = vi.fn(() => res) as never;
    return res;
  }

  it("verifies v0 over the raw body and refuses a stale or forged signature", () => {
    const t = seconds();
    const good = `t=${t},h=content-type,v0=${signPayload(SECRET, t, raw)},v1=x`;
    expect(verifyOnrampSignature(raw, good, SECRET)).toBe(true);
    expect(verifyOnrampSignature(Buffer.from(`${raw} `), good, SECRET)).toBe(false);
    expect(verifyOnrampSignature(raw, good, "other")).toBe(false);
    const old = String(Math.floor(Date.now() / 1000) - 600);
    expect(verifyOnrampSignature(raw, `t=${old},v0=${signPayload(SECRET, old, raw)}`, SECRET)).toBe(
      false
    );
  });

  it("answers 401 to a bad signature and stores nothing", async () => {
    const res = response();
    await handleOnrampWebhook(request("t=1,v0=00"), res);
    expect(res.statusCode).toBe(401);
    expect(db.onrampEvent.create).not.toHaveBeenCalled();
  });

  it("stores a delivery once and answers 200 to the replay without processing it again", async () => {
    const t = seconds();
    const header = `t=${t},v0=${signPayload(SECRET, t, raw)}`;
    db.onrampEvent.create.mockResolvedValueOnce({});
    const first = response();
    await handleOnrampWebhook(request(header), first);
    expect(first.statusCode).toBe(200);
    db.onrampEvent.create.mockRejectedValueOnce(
      new (Prisma.PrismaClientKnownRequestError as unknown as new (
        m: string,
        o: { code: string }
      ) => Error)("dup", { code: "P2002" })
    );
    const replay = response();
    await handleOnrampWebhook(request(header), replay);
    expect(replay.statusCode).toBe(200);
    expect(db.onrampEvent.create).toHaveBeenCalledTimes(2);
    expect(db.onrampEvent.create.mock.calls[0]![0].data).toMatchObject({
      provider: "coinbase",
      eventId: "evt_1",
      eventType: "onramp.transaction.success",
    });
  });

  it("reads both the order and the hosted transaction shapes", () => {
    expect(
      normalizeOnrampEvent(
        { orderId: "ord-1", status: "ONRAMP_ORDER_STATUS_COMPLETED", purchaseAmount: "10.000000" },
        "onramp.transaction.success"
      )
    ).toMatchObject({ kind: "order", ref: "ord-1", status: "success", usdcAmount: 10_000_000n });
    expect(
      normalizeOnrampEvent(
        { transactionId: "tx-2", partnerUserRef: "ob_x" },
        "onramp.transaction.failed"
      )
    ).toMatchObject({ kind: "transaction", ref: "tx-2", status: "failed", partnerUserRef: "ob_x" });
    expect(normalizeOnrampEvent({ hello: 1 }, "ping")).toBeNull();
  });

  it("moves the session to success and labels the transfer, never crediting a balance itself", async () => {
    db.onrampEvent.findUnique.mockResolvedValue({
      id: Buffer.alloc(16),
      processedAt: null,
      eventType: "onramp.transaction.success",
      payload: JSON.parse(raw.toString()),
    });
    db.onrampSession.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(sessionRow());
    db.onrampEvent.update.mockResolvedValue({});
    await processOnrampEvent(Buffer.alloc(16));
    expect(db.onrampSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "success",
          sessionRef: "tx-new",
          txHash: `0x${"cd".repeat(32)}`,
          usdcAmount: 23_760_000n,
        }),
      })
    );
    expect(db.paymentEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refType: "onramp" }) })
    );
    expect(db.onrampEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ error: null }) })
    );
  });
});
