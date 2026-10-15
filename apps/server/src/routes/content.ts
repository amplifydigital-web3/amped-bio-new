import express, { Router, type Request, type Response } from "express";
import {
  CONTENT_CALLBACK_SIGNATURE_HEADER,
  STREAM_WEBHOOK_SIGNATURE_HEADER,
  contentProcessedCallbackSchema,
} from "@repo/constants";
import { env } from "../env";
import { verifyStreamWebhookSignature } from "../services/cloudflare/stream";
import { verifyProcessorCallback } from "../services/cloudflare/mediaToken";
import {
  applyProcessorCallback,
  applyStreamWebhook,
  type StreamWebhookBody,
} from "../services/content/state";

/**
 * Content system (Build Board #20), PR 2. Spec 3.5 steps 4 and 5.
 *
 * POST /webhooks/cloudflare-stream   Stream tells us a video is ready or failed.
 * POST /internal/content/processed   The processor Worker (PR 4) reports a step.
 *
 * Both are signed over the exact request bytes, so they are mounted in
 * services/API.ts before the global JSON parser and read the raw body here.
 * Neither depends on CONTENT_UPLOADS_ENABLED: videos and files already in flight
 * must still finish when uploads are paused. Each answers 404 until its secret is
 * set, so an unconfigured environment exposes nothing.
 */

const RAW_BODY_LIMIT = "256kb";

function rawText(req: Request): Buffer {
  return Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
}

export async function handleStreamWebhook(req: Request, res: Response) {
  if (!env.CF_STREAM_WEBHOOK_SECRET) {
    res.status(404).end();
    return;
  }
  const raw = rawText(req);
  const header = req.headers[STREAM_WEBHOOK_SIGNATURE_HEADER] as string | undefined;
  if (!verifyStreamWebhookSignature(raw, header, env.CF_STREAM_WEBHOOK_SECRET)) {
    res.status(401).end();
    return;
  }
  let body: StreamWebhookBody;
  try {
    body = JSON.parse(raw.toString("utf8")) as StreamWebhookBody;
  } catch {
    // Signed but not JSON: nothing to retry
    res.status(200).end();
    return;
  }
  // A database error answers 500 so Stream retries
  const result = await applyStreamWebhook(body);
  res.status(200).json({ result });
}

export async function handleProcessorCallback(req: Request, res: Response) {
  if (!env.CONTENT_PROCESSOR_SECRET) {
    res.status(404).end();
    return;
  }
  const raw = rawText(req);
  const header = req.headers[CONTENT_CALLBACK_SIGNATURE_HEADER] as string | undefined;
  if (!verifyProcessorCallback(raw, header, env.CONTENT_PROCESSOR_SECRET)) {
    res.status(401).end();
    return;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({ error: "invalid_json" });
    return;
  }
  const parsed = contentProcessedCallbackSchema.safeParse(json);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const result = await applyProcessorCallback(parsed.data);
  if (result === "not_found") {
    res.status(404).json({ result });
    return;
  }
  res.status(200).json({ result });
}

function wrap(handler: (req: Request, res: Response) => Promise<void>, label: string) {
  return (req: Request, res: Response) => {
    void handler(req, res).catch(error => {
      console.error(`[content] ${label} failed`, error);
      if (!res.headersSent) res.status(500).end();
    });
  };
}

export const streamWebhookRouter: Router = Router();
streamWebhookRouter.post(
  "/",
  express.raw({ type: "*/*", limit: RAW_BODY_LIMIT }),
  wrap(handleStreamWebhook, "stream webhook")
);

export const contentCallbackRouter: Router = Router();
contentCallbackRouter.post(
  "/",
  express.raw({ type: "*/*", limit: RAW_BODY_LIMIT }),
  wrap(handleProcessorCallback, "processor callback")
);
