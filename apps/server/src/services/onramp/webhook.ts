import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, prisma } from "@repo/database";
import { ONRAMP_FINAL_STATUSES, ONRAMP_LIMITS } from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { toCents, toUsdcUnits } from "./amounts";
import { PROVIDER, applyOnrampUpdate, mapCoinbaseStatus, type OnrampUpdate } from "./sessions";

/**
 * Coinbase Onramp webhooks (Build Board #5, spec 3.5). CDP signs every
 * delivery in X-Hook0-Signature: t=<unix seconds>, v0=<hex HMAC-SHA256 of
 * "{t}.{raw body}"> keyed with the subscription secret. We verify v0 over the
 * raw bytes, refuse anything older than five minutes, store the event once per
 * X-Event-Id, answer 200 and process it after the response.
 *
 * The webhook moves a session's status. It never credits a balance: the
 * indexer writes the PaymentEvent when the USDC Transfer lands on Base.
 */

export const SIGNATURE_HEADER = "x-hook0-signature";
const MAX_AGE_MS = 5 * 60 * 1000;

export function signatureFields(header: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq > 0) fields.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return fields;
}

export function signPayload(secret: string, timestamp: string, raw: Buffer): string {
  return createHmac("sha256", secret).update(`${timestamp}.`, "utf8").update(raw).digest("hex");
}

export function verifyOnrampSignature(
  raw: Buffer,
  header: string | undefined,
  secret: string,
  now = Date.now()
): boolean {
  if (!header || !secret) return false;
  const fields = signatureFields(header);
  const timestamp = fields.get("t");
  const given = fields.get("v0");
  if (!timestamp || !given || !/^\d+$/.test(timestamp) || !/^[0-9a-f]+$/i.test(given)) return false;
  if (Math.abs(now - Number(timestamp) * 1000) > MAX_AGE_MS) return false;
  const expected = Buffer.from(signPayload(secret, timestamp, raw), "hex");
  const provided = Buffer.from(given, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function eventIdOf(header: unknown, raw: Buffer): string {
  if (typeof header === "string" && header.trim()) return header.trim().slice(0, 128);
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

type Payload = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * One delivery in our words. Headless orders carry orderId and an
 * ONRAMP_ORDER_STATUS_*; hosted transactions carry transactionId and an
 * ONRAMP_TRANSACTION_STATUS_*. Some deliveries nest the record under data.
 */
export function normalizeOnrampEvent(
  body: Payload,
  eventType: string | null
):
  | (OnrampUpdate & {
      partnerUserRef: string | null;
      partnerOrderRef: string | null;
      kind: "order" | "transaction";
    })
  | null {
  const record = (body.data && typeof body.data === "object" ? body.data : body) as Payload;
  const orderId = text(record.orderId);
  const transactionId = text(record.transactionId) ?? text(record.transaction_id);
  const ref = orderId ?? transactionId;
  const type = (eventType ?? text(body.eventType) ?? "").toLowerCase();
  let status = mapCoinbaseStatus(text(record.status));
  if (!status) {
    if (type.endsWith(".success")) status = "success";
    else if (type.endsWith(".failed")) status = "failed";
    else if (type.endsWith(".created") || type.endsWith(".updated")) status = "processing";
  }
  if (!status) return null;
  return {
    kind: orderId ? "order" : "transaction",
    ref,
    status,
    txHash: text(record.txHash) ?? text(record.tx_hash),
    usdcAmount: toUsdcUnits(record.purchaseAmount as never),
    fiatCents: toCents(record.paymentTotal as never),
    failureCode:
      status === "failed"
        ? (text(record.failureReason) ?? text(record.errorCode) ?? "coinbase_failed").slice(0, 64)
        : null,
    partnerUserRef: text(record.partnerUserRef) ?? text(record.partner_user_ref),
    partnerOrderRef: text(record.partnerOrderRef),
  };
}

/** Stores the delivery once. Returns the row id, or null for a replay. */
export async function recordOnrampEvent(
  eventId: string,
  eventType: string,
  payload: Payload
): Promise<Buffer | null> {
  const id = uuidv7();
  try {
    await prisma.onrampEvent.create({
      data: {
        id,
        provider: PROVIDER,
        eventId,
        eventType: eventType.slice(0, 64),
        payload: payload as Prisma.InputJsonObject,
      },
    });
    return id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return null;
    throw error;
  }
}

/**
 * Finds the session a delivery belongs to: by Coinbase's id first; for a hosted
 * transaction not yet seen, the fan's oldest open Coinbase account session
 * started in the last two hours with the same partnerUserRef.
 */
async function sessionFor(update: NonNullable<ReturnType<typeof normalizeOnrampEvent>>) {
  if (update.ref) {
    const known = await prisma.onrampSession.findFirst({
      where: { provider: PROVIDER, sessionRef: update.ref },
    });
    if (known) return known;
  }
  // Apple Pay and Google Pay orders carry our session id as partnerOrderRef
  if (
    update.kind === "order" &&
    update.partnerOrderRef &&
    /^[0-9a-f]{32}$/.test(update.partnerOrderRef)
  ) {
    const own = await prisma.onrampSession.findFirst({
      where: { id: Buffer.from(update.partnerOrderRef, "hex"), provider: PROVIDER },
    });
    if (own) return own;
  }
  if (update.kind !== "transaction" || !update.partnerUserRef) return null;
  return prisma.onrampSession.findFirst({
    where: {
      provider: PROVIDER,
      mode: "coinbase_account",
      partnerUserRef: update.partnerUserRef,
      sessionRef: null,
      status: { notIn: [...ONRAMP_FINAL_STATUSES] },
      createdAt: { gte: new Date(Date.now() - ONRAMP_LIMITS.sessionTtlMinutes * 60_000) },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Applies one stored delivery to its session. Safe to run twice. */
export async function processOnrampEvent(eventRowId: Buffer): Promise<void> {
  const event = await prisma.onrampEvent.findUnique({ where: { id: eventRowId } });
  if (!event || event.processedAt) return;
  try {
    const update = normalizeOnrampEvent(event.payload as Payload, event.eventType);
    const session = update ? await sessionFor(update) : null;
    if (update && session) await applyOnrampUpdate(session, update);
    await prisma.onrampEvent.update({
      where: { id: eventRowId },
      data: {
        processedAt: new Date(),
        sessionId: session ? Buffer.from(session.id) : null,
        error: !update ? "unrecognized" : !session ? "no_session" : null,
      },
    });
  } catch (error) {
    console.error("[onramp] webhook processing failed", error);
    await prisma.onrampEvent
      .update({
        where: { id: eventRowId },
        data: { error: String((error as Error)?.message ?? error).slice(0, 255) },
      })
      .catch(() => {});
  }
}
