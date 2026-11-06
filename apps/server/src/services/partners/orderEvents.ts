import { emitMerchantEvent, type WebhookEvent } from "./webhooks";
import { orderForEvent } from "./orders";

/**
 * Order webhooks from the payment lifecycle (Build Board #66, AB-3; spec 3.7, partner spec 8.1).
 * Called after a Purchase moves: order.paid at the first confirmation (M5), order.finalized at
 * final depth, order.refunded when the Refunded log lands. A creator's sale is not a merchant
 * order and sends nothing. Never throws: a failed queue is logged and the payment goes on.
 */
export async function notifyMerchantOrder(purchaseId: Uint8Array, types: WebhookEvent[]) {
  try {
    const found = await orderForEvent(purchaseId);
    if (!found) return;
    for (const type of types) {
      await emitMerchantEvent(found.merchantId, type, { order: found.order });
    }
  } catch (error) {
    console.error(
      "[partners] order webhook not queued",
      Buffer.from(purchaseId).toString("hex"),
      error
    );
  }
}
