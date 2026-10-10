import { Prisma, prisma, type TelegramInbox, type TelegramOutbox } from "@repo/database";
import { GrammyError } from "grammy";
import { TELEGRAM_LIMITS } from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { getTelegramBot, isTelegramConfigured } from "./client";

/**
 * Messaging on Telegram (Build Board #2), spec 3.5 and decision 13.
 *
 * The sender loop is the repo's outbox pattern (services/broadcast/index.ts) applied
 * to Telegram. It runs inside the API process, started from bootstrap.ts, and drains
 * two tables:
 *
 * - telegram_inbox: raw webhook updates written by POST /webhooks/telegram. Replayed
 *   to `bot.handleUpdate` oldest first, one at a time, so updates for one chat never
 *   overtake each other.
 * - telegram_outbox: everything the bot sends or does, in priority order (dm 0,
 *   notice 1, group 2, broadcast 3) and never before `runAfter`.
 *
 * Every row is claimed with a conditional updateMany so two API instances never run
 * the same job. A claim older than TELEGRAM_LIMITS.jobStaleMs is treated as abandoned
 * and resumed. A job that fails TELEGRAM_LIMITS.jobMaxAttempts times is marked FAILED.
 * A 429 from Telegram moves the job's `runAfter` by retry_after instead of counting an
 * attempt (acceptance 16: a restart mid delivery never sends twice, because a sent
 * message is marked DONE in the same tick that sent it and a claimed row is not
 * re-sent until the stale window passes).
 *
 * Handlers for outbox kinds register from later PRs through `registerOutboxHandler`.
 * This PR ships the loop with no handlers: a row of an unknown kind fails fast with
 * `no_handler` so nothing sits silently.
 */

export const OUTBOX_PRIORITY = {
  dm: 0,
  notice: 1,
  group_check: 2,
  group_action: 2,
  broadcast: 3,
} as const;
export type OutboxKind = keyof typeof OUTBOX_PRIORITY;

export type OutboxHandler = (job: TelegramOutbox) => Promise<void>;
const outboxHandlers = new Map<string, OutboxHandler>();

export function registerOutboxHandler(kind: OutboxKind, handler: OutboxHandler) {
  outboxHandlers.set(kind, handler);
}

/** Test seam. */
export function clearOutboxHandlersForTests() {
  outboxHandlers.clear();
}

export type EnqueueOptions = {
  chatId?: bigint | number | null;
  refId?: Buffer | null;
  deliveryId?: number | null;
  runAfter?: Date;
};

/** Queue one bot action. Returns the row id. */
export async function enqueueOutbox(
  kind: OutboxKind,
  payload: Prisma.InputJsonValue,
  options: EnqueueOptions = {}
): Promise<Buffer> {
  const id = uuidv7();
  await prisma.telegramOutbox.create({
    data: {
      id,
      kind,
      priority: OUTBOX_PRIORITY[kind],
      chatId:
        options.chatId === undefined || options.chatId === null ? null : BigInt(options.chatId),
      refId: options.refId ?? null,
      deliveryId: options.deliveryId ?? null,
      payload,
      runAfter: options.runAfter ?? new Date(),
    },
  });
  return id;
}

function staleBefore(now = new Date()) {
  return new Date(now.getTime() - TELEGRAM_LIMITS.jobStaleMs);
}

/** Rows a loop may take: pending, or claimed longer ago than the stale window. */
function claimableWhere(
  now: Date
): Prisma.TelegramOutboxWhereInput & Prisma.TelegramInboxWhereInput {
  return {
    attempts: { lt: TELEGRAM_LIMITS.jobMaxAttempts },
    OR: [{ status: "PENDING" }, { status: "CLAIMED", claimedAt: { lt: staleBefore(now) } }],
  };
}

/**
 * Take the next outbox job. The conditional updateMany is the lock: only the caller
 * whose update changed one row owns the job.
 */
export async function claimNextOutbox(now = new Date()): Promise<TelegramOutbox | null> {
  const candidates = await prisma.telegramOutbox.findMany({
    where: { ...claimableWhere(now), runAfter: { lte: now } },
    orderBy: [{ priority: "asc" }, { runAfter: "asc" }, { createdAt: "asc" }],
    take: 5,
  });
  for (const candidate of candidates) {
    const claimed = await prisma.telegramOutbox.updateMany({
      where: { id: candidate.id, status: candidate.status, claimedAt: candidate.claimedAt },
      data: { status: "CLAIMED", claimedAt: now, attempts: { increment: 1 } },
    });
    if (claimed.count === 1) {
      return { ...candidate, status: "CLAIMED", claimedAt: now, attempts: candidate.attempts + 1 };
    }
  }
  return null;
}

export async function claimNextInbox(now = new Date()): Promise<TelegramInbox | null> {
  const candidates = await prisma.telegramInbox.findMany({
    where: claimableWhere(now),
    orderBy: [{ createdAt: "asc" }],
    take: 5,
  });
  for (const candidate of candidates) {
    const claimed = await prisma.telegramInbox.updateMany({
      where: { id: candidate.id, status: candidate.status, claimedAt: candidate.claimedAt },
      data: { status: "CLAIMED", claimedAt: now, attempts: { increment: 1 } },
    });
    if (claimed.count === 1) {
      return { ...candidate, status: "CLAIMED", claimedAt: now, attempts: candidate.attempts + 1 };
    }
  }
  return null;
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.slice(0, 255);
}

/** What to do with a job after its handler threw. */
export function failureDisposition(
  error: unknown,
  attempts: number,
  now = new Date()
): { status: "PENDING" | "FAILED"; runAfter: Date; countsAsAttempt: boolean } {
  if (error instanceof GrammyError && error.error_code === 429) {
    const retryAfter = Number(error.parameters?.retry_after ?? 5);
    const seconds = Math.min(Math.max(retryAfter, 1), 300);
    return {
      status: "PENDING",
      runAfter: new Date(now.getTime() + seconds * 1000),
      countsAsAttempt: false,
    };
  }
  if (attempts >= TELEGRAM_LIMITS.jobMaxAttempts) {
    return { status: "FAILED", runAfter: now, countsAsAttempt: true };
  }
  const backoff = Math.min(2 ** attempts, 60) * 1000;
  return { status: "PENDING", runAfter: new Date(now.getTime() + backoff), countsAsAttempt: true };
}

/** Run one claimed outbox job to completion. Exported for tests. */
export async function runOutboxJob(
  job: TelegramOutbox,
  now = new Date()
): Promise<"done" | "failed" | "retry"> {
  const handler = outboxHandlers.get(job.kind);
  if (!handler) {
    await prisma.telegramOutbox.update({
      where: { id: job.id },
      data: { status: "FAILED", error: "no_handler", doneAt: now },
    });
    return "failed";
  }
  try {
    await handler(job);
    await prisma.telegramOutbox.update({
      where: { id: job.id },
      data: { status: "DONE", doneAt: now, error: null },
    });
    return "done";
  } catch (error) {
    const next = failureDisposition(error, job.attempts, now);
    await prisma.telegramOutbox.update({
      where: { id: job.id },
      data: {
        status: next.status,
        runAfter: next.runAfter,
        error: errorText(error),
        // A 429 is Telegram's pacing, not a failure: give the attempt back
        ...(next.countsAsAttempt ? {} : { attempts: { decrement: 1 } }),
        ...(next.status === "FAILED" ? { doneAt: now } : {}),
      },
    });
    if (next.status === "FAILED") {
      console.error(
        `[telegram] outbox ${job.kind} failed after ${job.attempts} attempts: ${errorText(error)}`
      );
      return "failed";
    }
    return "retry";
  }
}

/** Replay one webhook update to the bot. Exported for tests. */
export async function runInboxJob(
  job: TelegramInbox,
  now = new Date()
): Promise<"done" | "failed" | "retry"> {
  const bot = getTelegramBot();
  try {
    if (bot) {
      if (!bot.isInited()) await bot.init();
      await bot.handleUpdate(job.payload as never);
    }
    await prisma.telegramInbox.update({
      where: { id: job.id },
      data: { status: "DONE", doneAt: now, error: null },
    });
    return "done";
  } catch (error) {
    const next = failureDisposition(error, job.attempts, now);
    await prisma.telegramInbox.update({
      where: { id: job.id },
      data: {
        status: next.status,
        error: errorText(error),
        ...(next.countsAsAttempt ? {} : { attempts: { decrement: 1 } }),
        ...(next.status === "FAILED" ? { doneAt: now } : {}),
      },
    });
    return next.status === "FAILED" ? "failed" : "retry";
  }
}

/** One pass: inbox first (fans are waiting), then outbox by priority. Returns rows handled. */
export async function drainOnce(limit = 20, now = new Date()): Promise<number> {
  let handled = 0;
  for (let i = 0; i < limit; i += 1) {
    const update = await claimNextInbox(now);
    if (!update) break;
    await runInboxJob(update, now);
    handled += 1;
  }
  for (let i = 0; i < limit; i += 1) {
    const job = await claimNextOutbox(now);
    if (!job) break;
    await runOutboxJob(job, now);
    handled += 1;
  }
  return handled;
}

/** Drop idempotency rows and finished inbox rows past the retention window (spec 3.3). */
export async function purgeTelegramLogs(now = new Date()): Promise<number> {
  const before = new Date(
    now.getTime() - TELEGRAM_LIMITS.updateRetentionDays * 24 * 60 * 60 * 1000
  );
  const [log, inbox] = await Promise.all([
    prisma.telegramUpdateLog.deleteMany({ where: { receivedAt: { lt: before } } }),
    prisma.telegramInbox.deleteMany({
      where: { status: { in: ["DONE", "FAILED"] }, createdAt: { lt: before } },
    }),
  ]);
  return log.count + inbox.count;
}

const TICK_MS = 1000;
const PURGE_MS = 60 * 60 * 1000;
let ticker: NodeJS.Timeout | null = null;
let purger: NodeJS.Timeout | null = null;
let draining = false;

export function startTelegramLoop() {
  if (ticker || process.env.NODE_ENV === "test") return;
  if (!isTelegramConfigured()) return;
  const tick = async () => {
    if (draining) return;
    draining = true;
    try {
      await drainOnce();
    } catch (error) {
      console.error("[telegram] loop tick failed", error);
    } finally {
      draining = false;
    }
  };
  ticker = setInterval(() => void tick(), TICK_MS);
  ticker.unref();
  purger = setInterval(
    () => void purgeTelegramLogs().catch(error => console.error("[telegram] purge failed", error)),
    PURGE_MS
  );
  purger.unref();
  console.log("[telegram] sender loop started");
}

export function stopTelegramLoop() {
  if (ticker) clearInterval(ticker);
  if (purger) clearInterval(purger);
  ticker = null;
  purger = null;
}
