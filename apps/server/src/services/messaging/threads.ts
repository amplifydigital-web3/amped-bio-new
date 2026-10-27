import { Prisma, prisma, type MessageChannel, type MessageReportReason } from "@repo/database";
import { TELEGRAM_BOT_STRINGS, TELEGRAM_LIMITS } from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { idToHex } from "../analytics/ids";
import { findByUserId, isReachable } from "../telegram/accounts";
import { isTelegramConfigured } from "../telegram/client";
import { emitTelegramEvent } from "../telegram/events";
import { enqueueOutbox, type OutboxWriter } from "../telegram/loop";
import {
  MessagingRefusal,
  canMessage,
  checkCreatorReportThreshold,
  checkFanBlockThreshold,
} from "./access";

/**
 * Messaging on Telegram (Build Board #2), phase 1, spec 3.4, 3.5 and 3.9. Every write to
 * a conversation goes through here, from the web routers and from the bot alike:
 * store the message, keep the thread's counters, and queue the Telegram copy for the
 * other side. Amped is the system of record; a message exists here before any
 * Telegram send is attempted.
 */

export type MessagingInputCode = "empty" | "too_long" | "not_found" | "thread_closed";

export class MessagingInputError extends Error {
  constructor(readonly code: MessagingInputCode) {
    super(`messaging_${code}`);
  }
}

export type DmDirection = "creator" | "fan";
export type DmPayload = { messageId: string; to: DmDirection };

/** Plain text, trimmed, 1 to TELEGRAM_LIMITS.messageBodyMax characters. */
export function normalizeBody(body: string): string {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) throw new MessagingInputError("empty");
  if (text.length > TELEGRAM_LIMITS.messageBodyMax) throw new MessagingInputError("too_long");
  return text;
}

/** Queue the Telegram copy of a message, in the same transaction that stored it. */
async function queueDelivery(db: OutboxWriter, messageId: Uint8Array, to: DmDirection) {
  if (!isTelegramConfigured()) return;
  const payload: DmPayload = { messageId: idToHex(messageId), to };
  await enqueueOutbox("dm", payload, { refId: messageId }, db);
}

async function existingByKey(threadId: Uint8Array, idempotencyKey?: string) {
  if (!idempotencyKey) return null;
  return prisma.message.findUnique({
    where: { threadId_idempotencyKey: { threadId, idempotencyKey } },
  });
}

/**
 * A fan writes to a creator (spec 3.5 steps 2 to 4). Runs the access check, creates
 * the thread on first contact, stores the message and queues the creator's copy.
 * Throws MessagingRefusal with the reason when the door is closed.
 */
export async function sendFanMessage(input: {
  fanUserId: number;
  creatorUserId: number;
  body: string;
  channel: MessageChannel;
  tgMessageId?: bigint | null;
  idempotencyKey?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const body = normalizeBody(input.body);

  const verdict = await canMessage(input.fanUserId, input.creatorUserId, now);
  if (!verdict.allowed) {
    emitTelegramEvent("dm_refused", { reason: verdict.reason });
    throw new MessagingRefusal(verdict.reason, verdict.rule);
  }
  if (verdict.threadId) {
    const repeat = await existingByKey(verdict.threadId, input.idempotencyKey);
    if (repeat) return { message: repeat, threadId: verdict.threadId, newThread: false };
  }

  const result = await prisma
    .$transaction(async tx => {
      let threadId: Uint8Array;
      let newThread = false;
      if (verdict.threadId) {
        threadId = verdict.threadId;
      } else {
        threadId = uuidv7();
        try {
          await tx.messageThread.create({
            data: {
              id: threadId,
              creatorUserId: input.creatorUserId,
              fanUserId: input.fanUserId,
            },
          });
          newThread = true;
        } catch (error) {
          // Two first messages at once: the other one created the thread
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
            throw error;
          }
          const existing = await tx.messageThread.findUniqueOrThrow({
            where: {
              creatorUserId_fanUserId: {
                creatorUserId: input.creatorUserId,
                fanUserId: input.fanUserId,
              },
            },
            select: { id: true },
          });
          threadId = existing.id;
        }
      }
      const message = await tx.message.create({
        data: {
          id: uuidv7(),
          threadId,
          sender: "FAN",
          channel: input.channel,
          body,
          idempotencyKey: input.idempotencyKey ?? null,
          tgMessageId: input.tgMessageId ?? null,
        },
      });
      // A fan who closed the thread opens it again by writing
      await tx.messageThread.update({
        where: { id: threadId },
        data: {
          lastMessageAt: now,
          fanReadAt: now,
          fanUnread: 0,
          creatorUnread: { increment: 1 },
        },
      });
      await tx.messageThread.updateMany({
        where: { id: threadId, status: "BLOCKED_BY_FAN" },
        data: { status: "OPEN", blockedAt: null },
      });
      await queueDelivery(tx, message.id, "creator");
      return { message, threadId, newThread };
    })
    .catch(async error => {
      // A concurrent retry with the same key lost the unique index: return the winner
      if (
        verdict.threadId &&
        input.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const repeat = await existingByKey(verdict.threadId, input.idempotencyKey);
        if (repeat) return { message: repeat, threadId: verdict.threadId, newThread: false };
      }
      throw error;
    });

  if (result.newThread) {
    emitTelegramEvent("dm_thread_started", {
      channel: input.channel,
      rule_kind: verdict.rule,
    });
  }
  emitTelegramEvent("dm_message_sent", { sender: "FAN", channel: input.channel });
  return result;
}

/** The creator's thread, or not_found. Never another creator's. */
export async function creatorThread(creatorUserId: number, threadId: Uint8Array) {
  const thread = await prisma.messageThread.findFirst({ where: { id: threadId, creatorUserId } });
  if (!thread) throw new MessagingInputError("not_found");
  return thread;
}

/** The fan's thread, or not_found. */
export async function fanThread(fanUserId: number, threadId: Uint8Array) {
  const thread = await prisma.messageThread.findFirst({ where: { id: threadId, fanUserId } });
  if (!thread) throw new MessagingInputError("not_found");
  return thread;
}

/**
 * A creator answers a fan (spec 3.5, creator reply on the web or in Telegram). The
 * thread must be open: a block from either side stops replies too (acceptance 9).
 */
export async function sendCreatorReply(input: {
  creatorUserId: number;
  threadId: Uint8Array;
  body: string;
  channel: MessageChannel;
  tgMessageId?: bigint | null;
  idempotencyKey?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const body = normalizeBody(input.body);
  const thread = await creatorThread(input.creatorUserId, input.threadId);
  const repeat = await existingByKey(thread.id, input.idempotencyKey);
  if (repeat) return { message: repeat, threadId: thread.id };
  if (thread.status !== "OPEN") throw new MessagingInputError("thread_closed");

  const firstReply =
    (await prisma.message.count({ where: { threadId: thread.id, sender: "CREATOR" } })) === 0;

  const message = await prisma
    .$transaction(async tx => {
      const created = await tx.message.create({
        data: {
          id: uuidv7(),
          threadId: thread.id,
          sender: "CREATOR",
          channel: input.channel,
          body,
          idempotencyKey: input.idempotencyKey ?? null,
          tgMessageId: input.tgMessageId ?? null,
        },
      });
      await tx.messageThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: now,
          creatorReadAt: now,
          creatorUnread: 0,
          fanUnread: { increment: 1 },
        },
      });
      await queueDelivery(tx, created.id, "fan");
      return created;
    })
    .catch(async error => {
      // A concurrent retry with the same key lost the unique index: return the winner
      if (
        input.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const repeat = await existingByKey(thread.id, input.idempotencyKey);
        if (repeat) return repeat;
      }
      throw error;
    });

  emitTelegramEvent("dm_message_sent", { sender: "CREATOR", channel: input.channel });
  if (firstReply) {
    const hours = (now.getTime() - thread.createdAt.getTime()) / 3_600_000;
    emitTelegramEvent("dm_reply_latency", { hours: Math.round(hours * 10) / 10 });
  }
  return { message, threadId: thread.id };
}

/** Send one plain notice to a user's Telegram, when the bot may write to them. */
async function noticeTo(userId: number, text: string) {
  if (!isTelegramConfigured()) return;
  const account = await findByUserId(userId);
  if (!isReachable(account)) return;
  await enqueueOutbox("notice", { text }, { chatId: account!.telegramUserId });
}

/**
 * A creator blocks a thread (spec 3.4). Delivery stops both ways; the fan is told once.
 * Feeds the fan pause threshold (spec 3.9).
 */
export async function creatorBlock(creatorUserId: number, threadId: Uint8Array, now = new Date()) {
  const thread = await creatorThread(creatorUserId, threadId);
  // Never clobber the fan's block: a non-open thread already stops delivery both ways
  if (thread.status !== "OPEN") return thread;
  const updated = await prisma.messageThread.update({
    where: { id: thread.id },
    data: { status: "BLOCKED_BY_CREATOR", blockedAt: now },
  });
  const creator = await prisma.user.findUnique({
    where: { id: creatorUserId },
    select: { name: true },
  });
  await noticeTo(thread.fanUserId, TELEGRAM_BOT_STRINGS.blockedByCreator(creator?.name ?? ""));
  emitTelegramEvent("dm_blocked", { by: "creator" });
  await checkFanBlockThreshold(thread.fanUserId, now);
  return updated;
}

export async function creatorUnblock(creatorUserId: number, threadId: Uint8Array) {
  const thread = await creatorThread(creatorUserId, threadId);
  if (thread.status !== "BLOCKED_BY_CREATOR") return thread;
  return prisma.messageThread.update({
    where: { id: thread.id },
    data: { status: "OPEN", blockedAt: null },
  });
}

/** A fan closes a thread. Their next message to the creator opens it again. */
export async function fanBlock(fanUserId: number, threadId: Uint8Array, now = new Date()) {
  const thread = await fanThread(fanUserId, threadId);
  if (thread.status !== "OPEN") return thread;
  const updated = await prisma.messageThread.update({
    where: { id: thread.id },
    data: { status: "BLOCKED_BY_FAN", blockedAt: now },
  });
  emitTelegramEvent("dm_blocked", { by: "fan" });
  return updated;
}

export async function fanUnblock(fanUserId: number, threadId: Uint8Array) {
  const thread = await fanThread(fanUserId, threadId);
  if (thread.status !== "BLOCKED_BY_FAN") return thread;
  return prisma.messageThread.update({
    where: { id: thread.id },
    data: { status: "OPEN", blockedAt: null },
  });
}

/** Creator mute: Telegram forwards pause; the inbox keeps every message. days 0 unmutes. */
export async function creatorMute(
  creatorUserId: number,
  threadId: Uint8Array,
  days: 0 | 7 | 30,
  now = new Date()
) {
  const thread = await creatorThread(creatorUserId, threadId);
  return prisma.messageThread.update({
    where: { id: thread.id },
    data: { mutedUntil: days === 0 ? null : new Date(now.getTime() + days * 86_400_000) },
  });
}

/**
 * Report a thread or one message in it (spec 3.9). Either side may report. A fan's
 * report counts toward the creator pause threshold; every report reaches Admin.
 */
export async function reportThread(input: {
  reporterUserId: number;
  threadId: Uint8Array;
  messageId?: Uint8Array | null;
  reason: MessageReportReason;
  note?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const thread = await prisma.messageThread.findFirst({
    where: {
      id: input.threadId,
      OR: [{ creatorUserId: input.reporterUserId }, { fanUserId: input.reporterUserId }],
    },
  });
  if (!thread) throw new MessagingInputError("not_found");
  if (input.messageId) {
    const message = await prisma.message.findFirst({
      where: { id: input.messageId, threadId: thread.id },
      select: { id: true },
    });
    if (!message) throw new MessagingInputError("not_found");
  }
  const report = await prisma.messageReport.create({
    data: {
      id: uuidv7(),
      threadId: thread.id,
      messageId: input.messageId ?? null,
      reporterUserId: input.reporterUserId,
      reason: input.reason,
      note: input.note?.trim() ? input.note.trim().slice(0, 500) : null,
    },
  });
  emitTelegramEvent("dm_reported", { reason: input.reason });
  if (input.reporterUserId === thread.fanUserId) {
    await checkCreatorReportThreshold(thread.creatorUserId, now);
  }
  return report;
}

/** Opening a thread clears that side's unread count. */
export async function markRead(side: DmDirection, threadId: Uint8Array, now = new Date()) {
  await prisma.messageThread.update({
    where: { id: threadId },
    data:
      side === "creator"
        ? { creatorReadAt: now, creatorUnread: 0 }
        : { fanReadAt: now, fanUnread: 0 },
  });
}
