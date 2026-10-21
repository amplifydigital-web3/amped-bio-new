/**
 * USDC-5 Buy USDC through Coinbase, Apple Pay and Google Pay (Build Board #5).
 * Headless Onramp in embedded order mode. Spec docs/features/usdc-wallet-onramp.md
 * decisions 5, 6 and 11, 3.5, 3.7 step 3 and acceptance 9 and 12. The database,
 * Coinbase and the Base RPC are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
    onrampUserAuth: { findUnique: fn(), upsert: fn(), deleteMany: fn() },
    paymentEvent: { findFirst: fn(), updateMany: fn() },
    siteSettings: { findUnique: fn() },
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

import { env } from "../env";
import { CdpError } from "../services/usdc/cdp";
import { setPaymentClientForTests } from "../services/usdc/chain";
import { setOnrampApiForTests, type OnrampApi } from "../services/onramp/coinbase";
import { decryptOnrampToken, encryptOnrampToken } from "../services/onramp/secret";
import {
  clearOnrampCachesForTests,
  createWalletPayOrder,
  onrampFrameEvent,
  onrampOptions,
  onrampQuote,
  onrampStatus,
  paymentLinkFor,
  quoteFromOrder,
} from "../services/onramp/sessions";
import { normalizeOnrampEvent, processOnrampEvent } from "../services/onramp/webhook";

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
  createOnrampOrder: vi.fn(),
  getOnrampOrder: vi.fn(),
} satisfies Record<keyof OnrampApi, unknown>;

const chain = { getTransactionReceipt: vi.fn() };

function orderResponse(overrides: Record<string, unknown> = {}) {
  return {
    order: {
      orderId: "ord_123",
      status: "ONRAMP_ORDER_STATUS_PENDING_AUTH",
      paymentTotal: "25.00",
      paymentSubtotal: "24.10",
      paymentCurrency: "USD",
      purchaseAmount: "24.100000",
      purchaseCurrency: "USDC",
      destinationNetwork: "base",
      fees: [{ type: "FEE_TYPE_EXCHANGE", amount: "0.90", currency: "USD" }],
      exchangeRate: "1",
    },
    paymentLink: { url: "https://pay.coinbase.com/v2/api-onramp/apple-pay?token=x" },
    userAuthToken: "uat_new",
    ...overrides,
  };
}

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
  db.onrampUserAuth.findUnique.mockResolvedValue(null);
  db.onrampUserAuth.upsert.mockResolvedValue({});
  db.onrampUserAuth.deleteMany.mockResolvedValue({ count: 0 });
  api.createOnrampOrder.mockResolvedValue(orderResponse());
});

describe("options", () => {
  it("offers Apple Pay and Google Pay in a US state, with Coinbase's guest limits", async () => {
    const options = await onrampOptions(NY, null, NOW.getTime());
    expect(options.paths.apple_pay).toMatchObject({ available: true, minCents: 500 });
    // Buy Options gives no guest limit here, so the 500 USD fallback applies
    expect(options.paths.apple_pay.maxCents).toBe(50_000);
    // Buy Config lists a guest method but not Google Pay: Coinbase ruled it out
    expect(options.paths.google_pay.available).toBe(false);
    expect(options.paths.coinbase_account.available).toBe(true);
  });

  it("never offers them outside the US", async () => {
    const options = await onrampOptions({ country: "GB", subdivision: null }, null, NOW.getTime());
    expect(options.paths.apple_pay.available).toBe(false);
    expect(options.paths.apple_pay.reason).toMatch(/US/);
    expect(options.paths.coinbase_account.available).toBe(true);
  });
});

describe("quote", () => {
  it("prices Apple Pay with the Order API isQuote, without agreement or token", async () => {
    const result = await onrampQuote(
      7,
      { cents: 2500, mode: "apple_pay", region: NY },
      NOW.getTime()
    );
    const body = api.createOnrampOrder.mock.calls[0]![0];
    expect(body).toMatchObject({
      isQuote: true,
      paymentMethod: "GUEST_CHECKOUT_APPLE_PAY",
      paymentAmount: "25.00",
      destinationAddress: WALLET,
      destinationNetwork: "base",
      purchaseCurrency: "USDC",
      domain: "app.staging.amped.bio",
    });
    expect(body.agreementAcceptedAt).toBeUndefined();
    expect(body.userAuthToken).toBeUndefined();
    expect(result.quote.paymentTotal).toBe("25.00");
    expect(result.quote.coinbaseFee).toBe("0.90");
    expect(api.createOnrampSession).not.toHaveBeenCalled();
  });

  it("falls back to Coinbase's session quote when the Order API will not price", async () => {
    api.createOnrampOrder.mockRejectedValueOnce(new CdpError(400, "invalid_request", "no"));
    await onrampQuote(7, { cents: 2500, mode: "apple_pay", region: NY }, NOW.getTime());
    expect(api.createOnrampSession.mock.calls[0]![0].paymentMethod).toBe("APPLE_PAY");
  });

  it("refuses Google Pay where Coinbase ruled it out", async () => {
    await expect(
      onrampQuote(7, { cents: 2500, mode: "google_pay", region: NY }, NOW.getTime())
    ).rejects.toThrow("not offered");
  });
});

describe("createWalletPayOrder", () => {
  const input = {
    cents: 2500,
    mode: "apple_pay" as const,
    region: NY,
    agreementAcceptedAt: new Date(NOW.getTime() - 30_000),
    clientIp: "203.0.113.9",
  };

  it("creates the embedded order and returns the sandbox payment link", async () => {
    const result = await createWalletPayOrder(7, input, NOW);
    const body = api.createOnrampOrder.mock.calls[0]![0];
    expect(body).toMatchObject({
      paymentMethod: "GUEST_CHECKOUT_APPLE_PAY",
      partnerOrderRef: result.sessionId,
      partnerUserRef: "sandbox-ob_abc",
      clientIp: "203.0.113.9",
      domain: "app.staging.amped.bio",
    });
    // Embedded mode: Coinbase collects the agreement in its own flow
    expect(body).not.toHaveProperty("agreementAcceptedAt");
    // Embedded mode: no phone or email from us
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("phoneNumber");
    expect(body.isQuote).toBeUndefined();
    expect(result.paymentLinkUrl).toContain("useApplePaySandbox=true");
    expect(db.onrampSession.create.mock.calls[0]![0].data).toMatchObject({
      mode: "apple_pay",
      status: "created",
      sandbox: true,
    });
    // Coinbase's orderId lands on the session
    const refUpdate = db.onrampSession.update.mock.calls.find(
      ([call]) => (call as { data: { sessionRef?: string } }).data.sessionRef
    );
    expect(refUpdate![0].data.sessionRef).toBe("ord_123");
  });

  it("stores Coinbase's token encrypted for 60 days", async () => {
    await createWalletPayOrder(7, input, NOW);
    const saved = db.onrampUserAuth.upsert.mock.calls[0]![0];
    expect(saved.create.tokenEnc).not.toContain("uat_new");
    expect(decryptOnrampToken(saved.create.tokenEnc)).toBe("uat_new");
    expect(saved.create.expiresAt.getTime() - NOW.getTime()).toBe(60 * 86_400_000);
  });

  it("sends a returning fan's live token so Coinbase skips verification", async () => {
    db.onrampUserAuth.findUnique.mockResolvedValue({
      userId: 7,
      provider: "coinbase",
      tokenEnc: encryptOnrampToken("uat_old"),
      expiresAt: new Date(NOW.getTime() + 86_400_000),
    });
    await createWalletPayOrder(7, input, NOW);
    expect(api.createOnrampOrder.mock.calls[0]![0].userAuthToken).toBe("uat_old");
  });

  it("drops an expired token and orders without it", async () => {
    db.onrampUserAuth.findUnique.mockResolvedValue({
      userId: 7,
      provider: "coinbase",
      tokenEnc: encryptOnrampToken("uat_old"),
      expiresAt: new Date(NOW.getTime() - 1),
    });
    await createWalletPayOrder(7, input, NOW);
    expect(db.onrampUserAuth.deleteMany).toHaveBeenCalledWith({ where: { userId: 7 } });
    expect(api.createOnrampOrder.mock.calls[0]![0].userAuthToken).toBeUndefined();
  });

  it("retries once without a token Coinbase turns down", async () => {
    db.onrampUserAuth.findUnique.mockResolvedValue({
      userId: 7,
      provider: "coinbase",
      tokenEnc: encryptOnrampToken("uat_old"),
      expiresAt: new Date(NOW.getTime() + 86_400_000),
    });
    api.createOnrampOrder
      .mockRejectedValueOnce(new CdpError(401, "unauthorized", "token"))
      .mockResolvedValueOnce(orderResponse());
    await createWalletPayOrder(7, input, NOW);
    expect(api.createOnrampOrder).toHaveBeenCalledTimes(2);
    expect(api.createOnrampOrder.mock.calls[1]![0].userAuthToken).toBeUndefined();
  });

  it("needs a fresh agreement", async () => {
    await expect(
      createWalletPayOrder(
        7,
        { ...input, agreementAcceptedAt: new Date(NOW.getTime() - 3 * 3600_000) },
        NOW
      )
    ).rejects.toThrow("Accept Coinbase's terms");
    expect(api.createOnrampOrder).not.toHaveBeenCalled();
  });

  it("records a Coinbase failure on the session", async () => {
    api.createOnrampOrder.mockRejectedValueOnce(new CdpError(503, "unavailable", "down"));
    await expect(createWalletPayOrder(7, input, NOW)).rejects.toThrow("Coinbase did not answer");
    expect(db.onrampSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "failed", failureCode: "coinbase_503" } })
    );
  });

  it("refuses outside the US", async () => {
    await expect(
      createWalletPayOrder(7, { ...input, region: { country: "GB", subdivision: null } }, NOW)
    ).rejects.toThrow("not offered");
  });
});

describe("frame events and order status", () => {
  it("moves to processing on commit_success and to failed with Coinbase's code", async () => {
    db.onrampSession.findFirst.mockResolvedValue(
      sessionRow({ mode: "apple_pay", sessionRef: "ord_123", status: "pending_payment" })
    );
    let view = await onrampFrameEvent(7, SESSION_HEX, "commit_success");
    expect(view.status).toBe("processing");
    view = await onrampFrameEvent(7, SESSION_HEX, "error", "ERROR_CODE_GUEST_TRANSACTION_LIMIT");
    expect(view.status).toBe("failed");
    expect(view.failureCode).toBe("ERROR_CODE_GUEST_TRANSACTION_LIMIT");
  });

  it("does not store an arbitrary code", async () => {
    db.onrampSession.findFirst.mockResolvedValue(sessionRow({ mode: "google_pay" }));
    const view = await onrampFrameEvent(7, SESSION_HEX, "error", "<script>");
    expect(view.failureCode).toBe("frame_error");
  });

  it("ignores frame events for a Coinbase account session", async () => {
    db.onrampSession.findFirst.mockResolvedValue(sessionRow());
    await expect(onrampFrameEvent(7, SESSION_HEX, "commit_success")).rejects.toThrow(
      "Unknown purchase"
    );
  });

  it("reads the order from Coinbase while it is open", async () => {
    db.onrampSession.findFirst.mockResolvedValue(
      sessionRow({ mode: "apple_pay", sessionRef: "ord_123", status: "processing" })
    );
    api.getOnrampOrder.mockResolvedValue({
      order: {
        orderId: "ord_123",
        status: "ONRAMP_ORDER_STATUS_COMPLETED",
        txHash: `0x${"ab".repeat(32)}`,
        purchaseAmount: "24.1",
      },
    });
    const view = await onrampStatus(7, SESSION_HEX, NOW);
    expect(api.getOnrampOrder).toHaveBeenCalledWith("ord_123");
    expect(view.status).toBe("success");
    expect(view.txHash).toBe(`0x${"ab".repeat(32)}`);
    expect(api.getOnrampTransactions).not.toHaveBeenCalled();
  });
});

describe("webhook for orders", () => {
  it("finds the session by partnerOrderRef when the orderId is new", async () => {
    const payload = {
      eventType: "onramp.transaction.success",
      orderId: "ord_999",
      partnerOrderRef: SESSION_HEX,
      status: "ONRAMP_ORDER_STATUS_COMPLETED",
    };
    expect(normalizeOnrampEvent(payload, "onramp.transaction.success")).toMatchObject({
      kind: "order",
      partnerOrderRef: SESSION_HEX,
      status: "success",
    });
    db.onrampEvent.findUnique.mockResolvedValue({
      id: Buffer.alloc(16),
      payload,
      eventType: "onramp.transaction.success",
      processedAt: null,
    });
    db.onrampSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sessionRow({ mode: "apple_pay" }));
    db.onrampEvent.update.mockResolvedValue({});
    await processOnrampEvent(Buffer.alloc(16));
    expect(db.onrampSession.findFirst.mock.calls[1]![0].where.id).toEqual(
      Buffer.from(SESSION_HEX, "hex")
    );
    expect(db.onrampEvent.update.mock.calls.at(-1)![0].data.error).toBeNull();
  });
});

describe("helpers", () => {
  it("adds the sandbox flag only in sandbox", () => {
    expect(paymentLinkFor("https://pay.coinbase.com/x?a=1", "google_pay")).toContain(
      "useGooglePaySandbox=true"
    );
    env.ONRAMP_SANDBOX = false;
    expect(paymentLinkFor("https://pay.coinbase.com/x?a=1", "apple_pay")).toBe(
      "https://pay.coinbase.com/x?a=1"
    );
  });

  it("reads an order into Coinbase's quote shape, or nothing without figures", () => {
    expect(quoteFromOrder({ orderId: "o", status: "x" })).toBeUndefined();
    expect(
      quoteFromOrder({ orderId: "o", status: "x", paymentTotal: "10", purchaseAmount: "9.5" })
    ).toMatchObject({ paymentSubtotal: "10", paymentCurrency: "USD", fees: [] });
  });

  it("refuses a tampered token", () => {
    const sealed = encryptOnrampToken("uat");
    expect(decryptOnrampToken(`${sealed.slice(0, -4)}AAAA`)).toBeNull();
  });
});
