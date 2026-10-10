import express, { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { Prisma, prisma } from "@repo/database";
import { TELEGRAM_LIMITS } from "@repo/constants";
import { env } from "../env";
import { getRedisClient } from "../utils/cache";
import { hitRateLimit } from "../utils/rateLimit";
import { uuidv7 } from "../utils/uuid-v7";

/**
 * Messaging on Telegram (Build Board #2), spec 3.4.
 *
 * POST /webhooks/telegram
 *
 * Telegram calls this for every update once setWebhook points here. The request
 * does three things and nothing else: check the secret header, drop duplicates,
 * write the raw update to telegram_inbox. The sender loop (services/telegram/loop.ts)
 * does the work. Answering fast matters: Telegram retries slow webhooks and queues
 * behind them (acceptance 4: 200 within 1 second under a 1,000 update burst).
 *
 * Mounted in services/API.ts before the global JSON parser with its own body limit,
 * the same way /api/analytics owns its body parsing. The edge allows only Telegram's
 * source ranges (TELEGRAM_WEBHOOK_SOURCE_RANGES) to reach this path.
 */

const telegramRouter: Router = Router();

const WEBHOOK_HEADER = "x-telegram-bot-api-secret-token";
/** Requests per second from one address before the route answers 429. */
const WEBHOOK_RATE_PER_SECOND = 100;

export function secretMatches(given: unknown, expected: string): boolean {
  if (typeof given !== "string" || expected.length === 0) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Chat id from the update kinds we handle, for per chat ordering in the loop. */
export function chatIdOf(update: Record<string, unknown>): bigint | null {
  const candidates = [
    "message",
    "edited_message",
    "callback_query",
    "my_chat_member",
    "chat_member",
    "chat_join_request",
    "message_reaction",
  ];
  for (const key of candidates) {
    const part = update[key] as Record<string, unknown> | undefined;
    if (!part) continue;
    const chat = (part.chat ?? (part.message as Record<string, unknown> | undefined)?.chat) as
      | { id?: number | string }
      | undefined;
    if (chat?.id !== undefined) return BigInt(chat.id);
    const from = part.from as { id?: number | string } | undefined;
    if (key === "callback_query" && from?.id !== undefined) return BigInt(from.id);
  }
  const inline = (update.inline_query ?? update.chosen_inline_result) as
    | { from?: { id?: number | string } }
    | undefined;
  if (inline?.from?.id !== undefined) return BigInt(inline.from.id);
  return null;
}

/**
 * True when this update id was not seen before. Redis SETNX is the fast path; the
 * telegram_update_log unique key is the durable one, so a Redis outage never lets a
 * duplicate through.
 */
export async function recordUpdateId(updateId: bigint): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const set = await redis.set(
        `tg:upd:${updateId}`,
        "1",
        "EX",
        TELEGRAM_LIMITS.updateDedupeHours * 3600,
        "NX"
      );
      if (set === null) return false;
    } catch {
      // Fall through to the table
    }
  }
  try {
    await prisma.telegramUpdateLog.create({ data: { updateId } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

export async function handleTelegramWebhook(req: Request, res: Response) {
  if (!env.TELEGRAM_ENABLED) {
    res.status(404).end();
    return;
  }
  if (!secretMatches(req.headers[WEBHOOK_HEADER], env.TELEGRAM_WEBHOOK_SECRET)) {
    res.status(401).end();
    return;
  }
  const address =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown";
  const hits = await hitRateLimit(`tg-webhook:${address}`, 1);
  if (hits > WEBHOOK_RATE_PER_SECOND) {
    res.status(429).end();
    return;
  }

  const update = req.body as Record<string, unknown> | undefined;
  const rawId = update?.update_id;
  if (!update || (typeof rawId !== "number" && typeof rawId !== "string")) {
    // Not an update. Answer 200 so Telegram does not retry a malformed body forever.
    res.status(200).end();
    return;
  }
  const updateId = BigInt(rawId);

  try {
    const fresh = await recordUpdateId(updateId);
    if (fresh) {
      await prisma.telegramInbox.create({
        data: {
          id: uuidv7(),
          updateId,
          chatId: chatIdOf(update),
          payload: update as Prisma.InputJsonObject,
        },
      });
    }
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      console.error("[telegram] webhook write failed", error);
      // 500 makes Telegram retry, which is what we want when the database is down
      res.status(500).end();
      return;
    }
  }
  res.status(200).end();
}

telegramRouter.post("/", express.json({ limit: "64kb" }), (req, res) => {
  void handleTelegramWebhook(req, res).catch(error => {
    console.error("[telegram] webhook crashed", error);
    if (!res.headersSent) res.status(500).end();
  });
});

export default telegramRouter;
