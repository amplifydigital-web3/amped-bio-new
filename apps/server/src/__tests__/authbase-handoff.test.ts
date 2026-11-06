/**
 * AB-3 handoff (Build Board #66, spec 3.6 and 3.7): order webhooks follow the payment. A merchant
 * order queues order.paid at the first confirmation; a creator's sale sends nothing; a failure to
 * queue never breaks the payment.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  found: null as null | { merchantId: Buffer; order: { order_ref: string } },
  emitted: [] as { type: string; data: unknown }[],
  throws: false,
}));

vi.mock("../services/partners/orders", () => ({
  orderForEvent: vi.fn(async () => {
    if (state.throws) throw new Error("db down");
    return state.found;
  }),
}));
vi.mock("../services/partners/webhooks", () => ({
  emitMerchantEvent: vi.fn(async (_m: Buffer, type: string, data: unknown) => {
    state.emitted.push({ type, data });
    return 1;
  }),
}));

import { notifyMerchantOrder } from "../services/partners/orderEvents";

beforeEach(() => {
  state.found = { merchantId: Buffer.alloc(16, 1), order: { order_ref: "ab" } };
  state.emitted = [];
  state.throws = false;
});

describe("notifyMerchantOrder", () => {
  it("queues each event with the order for a merchant order", async () => {
    await notifyMerchantOrder(Buffer.alloc(16, 9), ["order.paid", "order.finalized"]);
    expect(state.emitted.map(e => e.type)).toEqual(["order.paid", "order.finalized"]);
    expect(state.emitted[0]!.data).toEqual({ order: { order_ref: "ab" } });
  });

  it("sends nothing for a creator's sale and never throws", async () => {
    state.found = null;
    await notifyMerchantOrder(Buffer.alloc(16, 9), ["order.paid"]);
    expect(state.emitted).toHaveLength(0);
    state.throws = true;
    await expect(notifyMerchantOrder(Buffer.alloc(16, 9), ["order.paid"])).resolves.toBeUndefined();
  });
});
