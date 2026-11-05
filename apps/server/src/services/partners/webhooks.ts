import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma, type Prisma } from "@repo/database";
import { uuidv7 } from "../../utils/uuid-v7";
import { env } from "../../env";
import { createSecretBox } from "../crypto/secretBox";
import { recordMerchantAudit } from "../merchants/audit";

/**
 * Signed webhooks to merchants (Build Board #66, AB-4; partner spec 8).
 *
 * Header `Amped-Signature: t={unix seconds},v1={hex}`, HMAC SHA-256 with the endpoint secret over
 * `t + "." + raw body`. The receiver rejects a timestamp more than 5 minutes off and dedupes on
 * event_id. A delivery that does not get a 2xx within 10 seconds is retried at 1 min, 5 min,
 * 30 min, 2 h, 6 h, then every 12 h until 72 h after the event. The payments worker runs the
 * deliveries and claims each one first, so two API processes never send the same attempt.
 */

export const WEBHOOK_EVENTS = [
  "order.paid",
  "order.finalized",
  "order.refunded",
  "order.expired",
  "payout_wallet.changed",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const SIGNATURE_HEADER = "Amped-Signature";
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const TIMEOUT_MS = 10_000;
const FIRST_RETRIES_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];
const LATER_RETRY_MS = 12 * 3_600_000;
const GIVE_UP_MS = 72 * 3_600_000;
const CLAIM_MS = 60_000;

export class WebhookError extends Error {}

const box = createSecretBox(
  "merchant-webhook",
  () => env.MERCHANT_SECRET_BOX_KEY || env.BETTER_AUTH_SECRET,
  "MERCHANT_SECRET_BOX_KEY"
);

export function signWebhook(secret: string, timestamp: number, rawBody: string): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

/** The receiver side, as the reference receiver in docs/partners does it. Exported for tests. */
export function verifyWebhook(
  secret: string,
  header: string,
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return false;
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signWebhook(secret, t, rawBody).split("v1=")[1]!, "hex");
  const given = Buffer.from(parts.v1, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The delay before attempt n+1 (n attempts made), or null to give up. Exported for tests. */
export function nextDelayMs(attemptsMade: number, sinceEventMs: number): number | null {
  const delay = FIRST_RETRIES_MS[attemptsMade - 1] ?? LATER_RETRY_MS;
  if (sinceEventMs + delay > GIVE_UP_MS) return null;
  return delay;
}

function validUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WebhookError("Enter a full https URL.");
  }
  if (url.protocol !== "https:") throw new WebhookError("Webhook URLs use https.");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/.test(url.hostname)) {
    throw new WebhookError("Use a public URL.");
  }
  return url.toString();
}

/** Adds an endpoint. The signing secret is returned once. */
export async function addEndpoint(input: {
  merchantId: Buffer;
  actorId: number;
  url: string;
  events?: WebhookEvent[];
}) {
  const url = validUrl(input.url);
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const id = uuidv7();
  await prisma.webhookEndpoint.create({
    data: {
      id,
      merchantId: input.merchantId,
      url,
      secretBox: box.encrypt(secret)!,
      events: (input.events ?? [...WEBHOOK_EVENTS]) as Prisma.InputJsonValue,
      createdById: input.actorId,
    },
  });
  await recordMerchantAudit(input.merchantId, input.actorId, "webhook.added", { url });
  return { id: id.toString("hex"), secret };
}

export async function rotateSecret(merchantId: Buffer, endpointId: Buffer, actorId: number) {
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const updated = await prisma.webhookEndpoint.updateMany({
    where: { id: endpointId, merchantId },
    data: { secretBox: box.encrypt(secret)! },
  });
  if (updated.count !== 1) throw new WebhookError("Endpoint not found.");
  await recordMerchantAudit(merchantId, actorId, "webhook.secret_rotated", {
    id: endpointId.toString("hex"),
  });
  return { secret };
}

export async function disableEndpoint(merchantId: Buffer, endpointId: Buffer, actorId: number) {
  const updated = await prisma.webhookEndpoint.updateMany({
    where: { id: endpointId, merchantId },
    data: { status: "disabled" },
  });
  if (updated.count !== 1) throw new WebhookError("Endpoint not found.");
  await recordMerchantAudit(merchantId, actorId, "webhook.disabled", {
    id: endpointId.toString("hex"),
  });
}

export async function listEndpoints(merchantId: Buffer) {
  const rows = await prisma.webhookEndpoint.findMany({
    where: { merchantId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(e => ({
    id: Buffer.from(e.id).toString("hex"),
    url: e.url,
    events: e.events as string[],
    status: e.status,
  }));
}

export async function listDeliveries(merchantId: Buffer, limit = 50) {
  const rows = await prisma.webhookDelivery.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(d => ({
    id: Buffer.from(d.id).toString("hex"),
    eventId: d.eventId,
    type: d.type,
    orderRef: d.orderRef,
    attempt: d.attempt,
    status: d.status,
    responseCode: d.responseCode,
    nextAttemptAt: d.status === "pending" ? d.nextAttemptAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
  }));
}

/** Queues one event for every active endpoint of the merchant that takes it. */
export async function emitMerchantEvent(
  merchantId: Uint8Array,
  type: WebhookEvent,
  data: Record<string, unknown>,
  now = new Date()
): Promise<number> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { merchantId: Buffer.from(merchantId), status: "active" },
    select: { id: true, events: true },
  });
  let queued = 0;
  for (const endpoint of endpoints) {
    if (!(endpoint.events as string[]).includes(type)) continue;
    const id = uuidv7();
    const eventId = `evt_${id.toString("hex")}`;
    const orderRef =
      typeof (data.order as { order_ref?: unknown } | undefined)?.order_ref === "string"
        ? (data.order as { order_ref: string }).order_ref
        : null;
    await prisma.webhookDelivery.create({
      data: {
        id,
        endpointId: endpoint.id,
        merchantId: Buffer.from(merchantId),
        eventId,
        type,
        orderRef,
        payload: {
          event_id: eventId,
          type,
          created_at: now.toISOString(),
          data,
        } as Prisma.InputJsonValue,
        nextAttemptAt: now,
      },
    });
    queued += 1;
  }
  return queued;
}

/** Sends a delivery again now: a failed one gets one more attempt; a pending one moves up. */
export async function replayDelivery(merchantId: Buffer, deliveryId: Buffer, now = new Date()) {
  const updated = await prisma.webhookDelivery.updateMany({
    where: { id: deliveryId, merchantId },
    data: { status: "pending", nextAttemptAt: now, claimedUntil: null },
  });
  if (updated.count !== 1) throw new WebhookError("Delivery not found.");
}

export type Poster = (
  url: string,
  body: string,
  headers: Record<string, string>
) => Promise<{ status: number }>;

const fetchPoster: Poster = async (url, body, headers) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      body,
      headers,
      signal: controller.signal,
      redirect: "manual",
    });
    return { status: res.status };
  } finally {
    clearTimeout(timer);
  }
};

let poster: Poster = fetchPoster;

/** Test seam. */
export function setWebhookPosterForTests(next: Poster | null) {
  poster = next ?? fetchPoster;
}

/** Sends due deliveries. Run by the payments worker while the partnerApi flag is on. */
export async function deliverDueWebhooks(now = new Date(), batch = 20): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({
    where: {
      status: "pending",
      nextAttemptAt: { lte: now },
      OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: batch,
  });
  let sent = 0;
  for (const row of due) {
    const claimed = await prisma.webhookDelivery.updateMany({
      where: {
        id: row.id,
        status: "pending",
        OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
      },
      data: { claimedUntil: new Date(now.getTime() + CLAIM_MS) },
    });
    if (claimed.count !== 1) continue;
    const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: row.endpointId } });
    const secret = endpoint ? box.decrypt(endpoint.secretBox) : null;
    const attempt = row.attempt + 1;
    let status: number | null = null;
    let error: string | null = null;
    if (!endpoint || endpoint.status !== "active" || !secret) {
      error = "endpoint_unavailable";
    } else {
      const body = JSON.stringify(row.payload);
      const t = Math.floor(now.getTime() / 1000);
      try {
        const res = await poster(endpoint.url, body, {
          "content-type": "application/json",
          "user-agent": "Amped.Bio-Webhooks/1",
          [SIGNATURE_HEADER]: signWebhook(secret, t, body),
        });
        status = res.status;
      } catch (err) {
        error = err instanceof Error ? err.message.slice(0, 200) : "request_failed";
      }
    }
    if (status !== null && status >= 200 && status < 300) {
      await prisma.webhookDelivery.update({
        where: { id: row.id },
        data: {
          status: "delivered",
          attempt,
          responseCode: status,
          deliveredAt: now,
          claimedUntil: null,
          lastError: null,
        },
      });
      sent += 1;
      continue;
    }
    const delay = nextDelayMs(attempt, now.getTime() - row.createdAt.getTime());
    await prisma.webhookDelivery.update({
      where: { id: row.id },
      data: {
        attempt,
        responseCode: status,
        lastError: error,
        claimedUntil: null,
        ...(delay === null
          ? { status: "failed" }
          : { nextAttemptAt: new Date(now.getTime() + delay) }),
      },
    });
  }
  return sent;
}
