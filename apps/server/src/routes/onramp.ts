import express, { Router, type Request, type Response } from "express";
import { env } from "../env";
import { hitRateLimit } from "../utils/rateLimit";
import {
  SIGNATURE_HEADER,
  eventIdOf,
  processOnrampEvent,
  recordOnrampEvent,
  verifyOnrampSignature,
} from "../services/onramp/webhook";

/**
 * Buy USDC through Coinbase (Build Board #5), spec 3.5.
 *
 * POST /webhooks/coinbase-onramp
 *
 * The CDP webhook subscription for onramp.transaction.* posts here. The route
 * verifies the X-Hook0-Signature over the raw body, stores the event once per
 * X-Event-Id, answers 200 at once and applies it to the session afterwards.
 * Mounted in services/API.ts before the global JSON parser, like the other
 * signed webhooks. A bad signature gets 401 and nothing is stored.
 */

const onrampWebhookRouter: Router = Router();

/** Requests per second from one address before the route answers 429. */
const WEBHOOK_RATE_PER_SECOND = 50;

export async function handleOnrampWebhook(req: Request, res: Response) {
  if (!env.ONRAMP_ENABLED || !env.CDP_ONRAMP_WEBHOOK_SECRET) {
    res.status(404).end();
    return;
  }
  const address = req.ip || "unknown";
  if ((await hitRateLimit(`onramp-webhook:${address}`, 1)) > WEBHOOK_RATE_PER_SECOND) {
    res.status(429).end();
    return;
  }
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const header = req.headers[SIGNATURE_HEADER];
  if (
    !verifyOnrampSignature(
      raw,
      Array.isArray(header) ? header[0] : header,
      env.CDP_ONRAMP_WEBHOOK_SECRET
    )
  ) {
    res.status(401).end();
    return;
  }
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("not an object");
    payload = parsed as Record<string, unknown>;
  } catch {
    // Signed but not JSON: answer 200 so CDP does not retry it forever
    res.status(200).end();
    return;
  }
  const eventType =
    (typeof req.headers["x-event-type"] === "string" && req.headers["x-event-type"]) ||
    (typeof payload.eventType === "string" ? payload.eventType : "unknown");
  const eventRowId = await recordOnrampEvent(
    eventIdOf(req.headers["x-event-id"], raw),
    eventType,
    payload
  );
  res.status(200).end();
  if (eventRowId) {
    setImmediate(() => {
      void processOnrampEvent(eventRowId);
    });
  }
}

onrampWebhookRouter.post("/", express.raw({ type: "*/*", limit: "64kb" }), (req, res) => {
  void handleOnrampWebhook(req, res).catch(error => {
    console.error("[onramp] webhook crashed", error);
    // 500 makes CDP retry, which is what we want when the database is down
    if (!res.headersSent) res.status(500).end();
  });
});

export default onrampWebhookRouter;
