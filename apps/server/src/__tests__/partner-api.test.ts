/**
 * AB-4 Partner API (Build Board #66, docs/partners): key format and scope, webhook signature
 * and timestamp, the retry schedule, delivery with a claim, and fulfillment reports (a verified
 * report with the wrong tier is refused).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  keys: [] as Record<string, unknown>[],
  merchant: { id: Buffer.alloc(16, 1), status: "active" } as Record<string, unknown> | null,
  endpoints: [] as Record<string, unknown>[],
  deliveries: [] as Record<string, any>[],
  purchase: null as Record<string, any> | null,
  offers: [] as Record<string, unknown>[],
}));

vi.mock("@repo/database", () => ({
  Prisma: {},
  prisma: {
    merchantApiKey: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => state.keys.push(data)),
      findUnique: vi.fn(
        async ({ where }: { where: { keyHash: string } }) =>
          state.keys.find(k => k.keyHash === where.keyHash) ?? null
      ),
      update: vi.fn(),
    },
    merchant: { findUnique: vi.fn(async () => state.merchant) },
    merchantAuditLog: { create: vi.fn() },
    webhookEndpoint: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        state.endpoints.push({ status: "active", ...data })
      ),
      findMany: vi.fn(async () => state.endpoints),
      findUnique: vi.fn(async () => state.endpoints[0] ?? null),
    },
    webhookDelivery: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        state.deliveries.push({
          attempt: 0,
          status: "pending",
          claimedUntil: null,
          createdAt: data.nextAttemptAt,
          ...data,
        })
      ),
      findMany: vi.fn(async () => state.deliveries.filter(d => d.status === "pending")),
      updateMany: vi.fn(async ({ where, data }: { where: { id: Buffer }; data: object }) => {
        const row = state.deliveries.find(d => d.id.equals(where.id) && d.status === "pending");
        if (row) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: Buffer }; data: object }) =>
        Object.assign(state.deliveries.find(d => d.id.equals(where.id))!, data)
      ),
    },
    purchase: {
      findUnique: vi.fn(async () => state.purchase),
      update: vi.fn(async ({ data }: { data: object }) => Object.assign(state.purchase!, data)),
    },
    offer: { findMany: vi.fn(async () => state.offers) },
  },
}));

import { env } from "../env";
import { authenticateKey, createApiKey } from "../services/partners/keys";
import {
  deliverDueWebhooks,
  addEndpoint,
  emitMerchantEvent,
  nextDelayMs,
  setWebhookPosterForTests,
  signWebhook,
  verifyWebhook,
} from "../services/partners/webhooks";
import { OrderError, reportFulfillment } from "../services/partners/orders";

const MERCHANT = Buffer.alloc(16, 1);
const MIN = 60_000;
const HOUR = 60 * MIN;

beforeEach(() => {
  state.keys = [];
  state.endpoints = [];
  state.deliveries = [];
  state.merchant = { id: MERCHANT, status: "active" };
  state.offers = [{ id: Buffer.alloc(16, 5), externalCode: "STANDARD" }];
  state.purchase = {
    id: Buffer.alloc(16, 9),
    merchantId: MERCHANT,
    offerId: Buffer.alloc(16, 5),
    buyerUserId: 7,
    payer: "0x1111111111111111111111111111111111111111",
    amount: 10_000_000n,
    fee: 2_000_000n,
    split: {
      recipients: [
        { to: "0x2222222222222222222222222222222222222222", bps: 8000, role: 4 },
        { to: "0x3333333333333333333333333333333333333333", bps: 2000, role: 1 },
      ],
      validBefore: "0",
      signature: "0x",
    },
    status: "confirmed_soft",
    chainId: 84532,
    txHash: null,
    blockNumber: null,
    fulfillmentState: "paid",
    rnsName: "robert.revotest.eth",
    createdAt: new Date(),
    softConfirmedAt: new Date(),
    confirmedAt: null,
    refundedAt: null,
    accessUntil: null,
  };
  Object.assign(env, { APP_ENV: "staging", MERCHANT_SECRET_BOX_KEY: "test-key" });
  setWebhookPosterForTests(null);
});

describe("API keys", () => {
  it("makes a test key on staging, shows it once and authenticates it for its merchant", async () => {
    const { key } = await createApiKey({
      merchantId: MERCHANT,
      actorId: 1,
      name: "Server",
      mode: "test",
    });
    expect(key).toMatch(/^ab_test_[0-9a-f]{48}$/);
    expect(JSON.stringify(state.keys)).not.toContain(key);
    expect((await authenticateKey(`Bearer ${key}`))?.merchantId.equals(MERCHANT)).toBe(true);
    expect(await authenticateKey(`Bearer ab_test_${"0".repeat(48)}`)).toBeNull();
    expect(await authenticateKey(undefined)).toBeNull();
  });

  it("refuses a live key off production and a suspended merchant", async () => {
    await expect(
      createApiKey({ merchantId: MERCHANT, actorId: 1, name: "Server", mode: "live" })
    ).rejects.toThrow("production");
    const { key } = await createApiKey({
      merchantId: MERCHANT,
      actorId: 1,
      name: "Server",
      mode: "test",
    });
    state.merchant = { id: MERCHANT, status: "suspended" };
    expect(await authenticateKey(`Bearer ${key}`)).toBeNull();
  });
});

describe("webhook signatures", () => {
  it("verifies its own signature and refuses a changed body, another secret or an old timestamp", () => {
    const now = 1_800_000_000;
    const body = '{"event_id":"evt_1"}';
    const header = signWebhook("whsec_a", now, body);
    expect(verifyWebhook("whsec_a", header, body, now)).toBe(true);
    expect(verifyWebhook("whsec_a", header, body + " ", now)).toBe(false);
    expect(verifyWebhook("whsec_b", header, body, now)).toBe(false);
    expect(verifyWebhook("whsec_a", header, body, now + 301)).toBe(false);
  });

  it("retries at 1 min, 5 min, 30 min, 2 h, 6 h, then every 12 h, and gives up after 72 h", () => {
    expect([1, 2, 3, 4, 5].map(n => nextDelayMs(n, 0))).toEqual([
      MIN,
      5 * MIN,
      30 * MIN,
      2 * HOUR,
      6 * HOUR,
    ]);
    expect(nextDelayMs(6, 10 * HOUR)).toBe(12 * HOUR);
    expect(nextDelayMs(9, 61 * HOUR)).toBeNull();
  });
});

describe("delivery", () => {
  it("signs and sends; a 503 schedules the next attempt; a 200 delivers", async () => {
    const { secret } = await addEndpoint({
      merchantId: MERCHANT,
      actorId: 1,
      url: "https://authbase.test/webhooks/amped",
    });
    const now = new Date("2026-11-05T12:00:00Z");
    expect(
      await emitMerchantEvent(MERCHANT, "order.paid", { order: { order_ref: "ab" } }, now)
    ).toBe(1);
    const seen: { body: string; signature: string }[] = [];
    setWebhookPosterForTests(async (_url, body, headers) => {
      seen.push({ body, signature: headers["Amped-Signature"]! });
      return { status: seen.length === 1 ? 503 : 200 };
    });
    await deliverDueWebhooks(now);
    expect(state.deliveries[0]).toMatchObject({ status: "pending", attempt: 1, responseCode: 503 });
    expect(state.deliveries[0]!.nextAttemptAt.getTime()).toBe(now.getTime() + MIN);
    expect(
      verifyWebhook(secret, seen[0]!.signature, seen[0]!.body, Math.floor(now.getTime() / 1000))
    ).toBe(true);

    await deliverDueWebhooks(new Date(now.getTime() + MIN));
    expect(state.deliveries[0]).toMatchObject({ status: "delivered", attempt: 2 });
  });

  it("refuses a webhook URL that is not public https", async () => {
    await expect(
      addEndpoint({ merchantId: MERCHANT, actorId: 1, url: "http://authbase.test" })
    ).rejects.toThrow("https");
    await expect(
      addEndpoint({ merchantId: MERCHANT, actorId: 1, url: "https://localhost/x" })
    ).rejects.toThrow("public");
  });
});

describe("fulfillment reports", () => {
  const ref = Buffer.alloc(16, 9).toString("hex");

  it("moves the order through started and in_review, then verified with the right tier, which closes it", async () => {
    await reportFulfillment(MERCHANT, ref, { state: "started" });
    expect(state.purchase!.fulfillmentState).toBe("started");
    await expect(
      reportFulfillment(MERCHANT, ref, { state: "verified", tier: "ENHANCED" })
    ).rejects.toBeInstanceOf(OrderError);
    const done = await reportFulfillment(MERCHANT, ref, { state: "verified", tier: "STANDARD" });
    expect(done.fulfillment_state).toBe("verified");
    expect(state.purchase!.accessUntil).toBeInstanceOf(Date);
    await expect(reportFulfillment(MERCHANT, ref, { state: "started" })).rejects.toThrow(
      "already verified"
    );
  });

  it("needs a reason for not_passed and keeps attempts inside 3; another merchant's order is unknown", async () => {
    await expect(reportFulfillment(MERCHANT, ref, { state: "not_passed" })).rejects.toThrow(
      "reason"
    );
    await expect(
      reportFulfillment(MERCHANT, ref, {
        state: "not_passed",
        reason: "Blurry photo",
        attempts_used: 4,
      })
    ).rejects.toThrow("0 to 3");
    await expect(reportFulfillment(Buffer.alloc(16, 2), ref, { state: "started" })).rejects.toThrow(
      "Unknown order"
    );
  });

  it("shows the merchant and platform shares in the order", async () => {
    const order = await reportFulfillment(MERCHANT, ref, { state: "in_review" });
    expect(order.shares).toEqual([
      {
        role: "merchant",
        to: "0x2222222222222222222222222222222222222222",
        amount_units: "8000000",
      },
      {
        role: "platform",
        to: "0x3333333333333333333333333333333333333333",
        amount_units: "2000000",
      },
    ]);
    expect(order).toMatchObject({
      status: "paid",
      product_code: "STANDARD",
      amped_user_id: "7",
      rns_name: "robert.revotest.eth",
    });
  });
});
