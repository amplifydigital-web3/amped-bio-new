import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { render } from "@react-email/render";
import { prisma, type NotificationJob } from "@repo/database";
import { MESSAGE_LIMITS } from "@repo/constants";
import { env } from "../../env";
import { getRedisClient } from "../../utils/cache";
import { deliverEmail } from "../../utils/email/transport";
import { uuidv7 } from "../../utils/uuid-v7";
import MessageReminderTemplate from "../../utils/email/MessageReminderTemplate";
import { hexToId, idToHex } from "../analytics/ids";
import { decryptMessageBody } from "../crypto/messageBody";
import { isLive, publish } from "../realtime/bus";
import { emailOffUrl, messageNotificationPrefs } from "./bell";
import { hasSubscription, pushConfigured, sendPush, type PushPayload } from "./push";
import { isDigestPayload, runDigest } from "../library/newContent";

/**
 * Push and email jobs (Build Board #2 r4, PR M4, spec 7.2 "after commit" and 7.4).
 *
 * A message to someone whose app is closed queues a push now. Every message queues one
 * email check at +30 minutes per conversation; it sends only if the message is still
 * unread, at most once per conversation every 6 hours and 3 a day. Muted conversations,
 * blocked members and turned off preferences get nothing.
 *
 * Jobs are claimed with a conditional updateMany (the Telegram loop pattern), so two
 * instances never run the same job. A Redis lock keeps the polling to one instance.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const JOB_MAX_ATTEMPTS = 5;
const STALE_MS = 2 * 60 * 1000;

type MessageJobPayload = { conversationId: string; messageId: string; senderId: number };
type BroadcastJobPayload = { broadcastId: number; creatorUserId: number };

async function enqueue(
  channel: "push" | "email",
  userId: number,
  payload: object,
  runAfter: Date,
  dedupeKey: string | null = null
) {
  await prisma.notificationJob.create({
    data: { id: uuidv7(), channel, userId, payload, runAfter, dedupeKey },
  });
}

/**
 * Unique while an email check is PENDING; the claim clears it. Two messages sent at the
 * same moment both try to insert, and the unique index lets only one through.
 */
export function emailDedupeKey(userId: number, conversationId: string): string {
  return `email:${userId}:${conversationId}`;
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

// ------------------------------------------------------------------ scheduling

/**
 * After a message commits. Push when the recipient has a device, push on, and no open
 * app; one pending email check per conversation. Never throws.
 */
export async function scheduleMessageNotifications(input: {
  senderId: number;
  recipientId: number;
  conversationId: Uint8Array;
  messageId: Uint8Array;
  notificationId: Uint8Array | null;
  muted: boolean;
  now?: Date;
}) {
  try {
    const now = input.now ?? new Date();
    if (input.notificationId) {
      await publish(input.recipientId, {
        type: "notification.new",
        notificationId: idToHex(input.notificationId),
      });
    }
    if (input.muted) return;
    const payload: MessageJobPayload = {
      conversationId: idToHex(input.conversationId),
      messageId: idToHex(input.messageId),
      senderId: input.senderId,
    };
    const prefs = await messageNotificationPrefs(input.recipientId);
    if (
      prefs.push &&
      pushConfigured() &&
      !(await isLive(input.recipientId)) &&
      (await hasSubscription(input.recipientId))
    ) {
      await enqueue("push", input.recipientId, payload, now);
    }
    if (prefs.email) {
      // One pending check per conversation: a duplicate insert hits the unique dedupeKey
      try {
        await enqueue(
          "email",
          input.recipientId,
          payload,
          new Date(now.getTime() + MESSAGE_LIMITS.emailReminderAfterMinutes * 60_000),
          emailDedupeKey(input.recipientId, payload.conversationId)
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
  } catch (error) {
    console.warn("[notifications] schedule failed:", (error as Error).message);
  }
}

/**
 * Bell rows (and pushes) for a delivered broadcast (spec msg-broadcast). One row per
 * recipient, grouped by broadcast. Called after the fan out; never fails the broadcast.
 */
export async function notifyBroadcastDelivered(broadcastId: number, now = new Date()) {
  try {
    const broadcast = await prisma.broadcast.findUnique({
      where: { id: broadcastId },
      select: { id: true, creatorUserId: true },
    });
    if (!broadcast) return 0;
    const groupKey = `broadcast:${broadcast.id}`;
    const deliveries = await prisma.broadcastDelivery.findMany({
      where: { broadcastId },
      select: { userId: true },
    });
    const existing = new Set(
      (
        await prisma.notification.findMany({
          where: { groupKey, userId: { in: deliveries.map(d => d.userId) } },
          select: { userId: true },
        })
      ).map(n => n.userId)
    );
    const fresh = deliveries.map(d => d.userId).filter(id => !existing.has(id));
    for (let i = 0; i < fresh.length; i += 500) {
      await prisma.notification.createMany({
        data: fresh.slice(i, i + 500).map(userId => ({
          id: uuidv7(),
          userId,
          kind: "BROADCAST" as const,
          actorId: broadcast.creatorUserId,
          refId: null,
          groupKey,
          createdAt: now,
        })),
      });
    }
    const withDevices = pushConfigured()
      ? await prisma.pushSubscription.findMany({
          where: { userId: { in: fresh } },
          select: { userId: true },
          distinct: ["userId"],
        })
      : [];
    const payload: BroadcastJobPayload = { broadcastId, creatorUserId: broadcast.creatorUserId };
    for (const userId of new Set(withDevices.map(d => d.userId))) {
      const prefs = await messageNotificationPrefs(userId);
      if (prefs.push && !(await isLive(userId))) await enqueue("push", userId, payload, now);
    }
    for (const userId of fresh) await publish(userId, { type: "unread.changed" });
    return fresh.length;
  } catch (error) {
    console.error(`[notifications] broadcast ${broadcastId} bell rows failed:`, error);
    return 0;
  }
}

// ------------------------------------------------------------------ previews

/** True when the sender's page carries any 18+ label (a block or a content item). */
async function senderIsAdult(senderId: number): Promise<boolean> {
  const [content, blocks] = await Promise.all([
    prisma.contentItem.count({ where: { userId: senderId, adult: true } }),
    prisma.block.findMany({ where: { user_id: senderId }, select: { config: true } }),
  ]);
  return content > 0 || blocks.some(b => (b.config as { adult?: unknown } | null)?.adult === true);
}

/**
 * Push text (spec 7.4 item 2): title "@handle"; body "Sent you a message" for a request
 * or an 18+ sender, otherwise the first 80 characters. Null when nothing should be sent.
 */
export async function messagePushPayload(
  userId: number,
  payload: MessageJobPayload
): Promise<PushPayload | null> {
  const conversationId = hexToId(payload.conversationId);
  const [member, message, sender] = await Promise.all([
    prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { folder: true, state: true, acceptedAt: true, mutedUntil: true, lastReadAt: true },
    }),
    prisma.directMessage.findUnique({ where: { id: hexToId(payload.messageId) } }),
    prisma.user.findUnique({
      where: { id: payload.senderId },
      select: { handle: true, block: true },
    }),
  ]);
  if (!member || member.state !== "ACTIVE" || !message || message.unsentAt) return null;
  if (member.mutedUntil && member.mutedUntil > new Date()) return null;
  if (member.lastReadAt && member.lastReadAt >= message.createdAt) return null;
  if (!sender || sender.block !== "no") return null;
  const request = member.folder === "REQUESTS" && !member.acceptedAt;
  const hidden = request || (await senderIsAdult(payload.senderId));
  const text = hidden ? null : decryptMessageBody(message.bodyEnc);
  const body = !text
    ? "Sent you a message"
    : text.length > 80
      ? `${text.slice(0, 79).trimEnd()}…`
      : text;
  return {
    title: `@${sender.handle ?? "someone"}`,
    body,
    url: `/inbox/${payload.conversationId}`,
    tag: `conv-${payload.conversationId}`,
  };
}

async function broadcastPushPayload(payload: BroadcastJobPayload): Promise<PushPayload | null> {
  const [broadcast, creator] = await Promise.all([
    prisma.broadcast.findUnique({ where: { id: payload.broadcastId }, select: { title: true } }),
    prisma.user.findUnique({ where: { id: payload.creatorUserId }, select: { handle: true } }),
  ]);
  if (!broadcast || !creator) return null;
  return {
    title: `@${creator.handle ?? "creator"}`,
    body: `New broadcast: ${broadcast.title}`.slice(0, 100),
    url: `/inbox?tab=broadcast&id=${payload.broadcastId}`,
    tag: `bc-${payload.broadcastId}`,
  };
}

// ------------------------------------------------------------------ email

/** Why an email check sent nothing, or "sent". */
export type EmailOutcome =
  | "sent"
  | "read"
  | "off"
  | "muted"
  | "gone"
  | "no_email"
  | "conversation_limit"
  | "daily_limit";

export async function runEmailCheck(
  userId: number,
  payload: MessageJobPayload,
  now = new Date()
): Promise<EmailOutcome> {
  const conversationId = hexToId(payload.conversationId);
  const [member, user, prefs, sender] = await Promise.all([
    prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { folder: true, state: true, acceptedAt: true, mutedUntil: true, unread: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, email_verified: true, block: true },
    }),
    messageNotificationPrefs(userId),
    prisma.user.findUnique({
      where: { id: payload.senderId },
      select: { name: true, handle: true, block: true },
    }),
  ]);
  if (!prefs.email) return "off";
  if (!member || member.state !== "ACTIVE" || !sender || sender.block !== "no") return "gone";
  if (member.mutedUntil && member.mutedUntil > now) return "muted";
  if (member.unread === 0) return "read";
  if (!user || user.block !== "no" || !user.email || !user.email_verified) return "no_email";

  const recent = await prisma.notificationJob.findMany({
    where: {
      userId,
      channel: "email",
      status: "DONE",
      error: null,
      doneAt: { gte: new Date(now.getTime() - DAY) },
    },
    select: { payload: true, doneAt: true },
  });
  if (recent.length >= MESSAGE_LIMITS.emailRemindersPerDay) return "daily_limit";
  const windowStart = now.getTime() - MESSAGE_LIMITS.emailReminderPerConversationHours * HOUR;
  if (
    recent.some(
      j =>
        (j.payload as MessageJobPayload | null)?.conversationId === payload.conversationId &&
        (j.doneAt?.getTime() ?? 0) >= windowStart
    )
  ) {
    return "conversation_limit";
  }

  const request = member.folder === "REQUESTS" && !member.acceptedAt;
  const handle = sender.handle ?? "someone";
  const inboxUrl = new URL(
    request ? "/inbox?tab=requests" : `/inbox/${payload.conversationId}`,
    env.APP_URL
  ).toString();
  const html = await render(
    MessageReminderTemplate({
      handle,
      name: sender.name || `@${handle}`,
      request,
      count: member.unread,
      inboxUrl,
      offUrl: emailOffUrl(userId),
      settingsUrl: new URL("/account?open=messages", env.APP_URL).toString(),
      privacyUrl: new URL("/privacy", env.LANDINGPAGE_URL).toString(),
    })
  );
  await deliverEmail({
    to: [user.email],
    subject: request ? "You have a message request on Amped.Bio" : `New message from @${handle}`,
    html,
  });
  return "sent";
}

// ------------------------------------------------------------------ the loop

/** Next job due now, claimed for this caller only. */
export async function claimNextJob(now = new Date()): Promise<NotificationJob | null> {
  const staleBefore = new Date(now.getTime() - STALE_MS);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await prisma.notificationJob.findFirst({
      where: {
        runAfter: { lte: now },
        OR: [{ status: "PENDING" }, { status: "CLAIMED", claimedAt: { lt: staleBefore } }],
      },
      orderBy: [{ runAfter: "asc" }],
    });
    if (!candidate) return null;
    const claimed = await prisma.notificationJob.updateMany({
      where: { id: candidate.id, status: candidate.status, claimedAt: candidate.claimedAt },
      // Free the dedupe slot: a message after this point queues a fresh check
      data: { status: "CLAIMED", claimedAt: now, attempts: { increment: 1 }, dedupeKey: null },
    });
    if (claimed.count === 1) {
      return {
        ...candidate,
        status: "CLAIMED",
        claimedAt: now,
        attempts: candidate.attempts + 1,
        dedupeKey: null,
      };
    }
  }
  return null;
}

/**
 * Run one claimed job to completion. A skipped email is DONE with the reason in error.
 * Channels: push, email (message reminders) and digest (Fan Library daily email, FL-6).
 */
export async function runJob(job: NotificationJob, now = new Date()): Promise<string> {
  try {
    let outcome: string;
    if (job.channel === "push") {
      const payload = job.payload as MessageJobPayload & BroadcastJobPayload;
      const push =
        "broadcastId" in payload && payload.broadcastId
          ? await broadcastPushPayload(payload)
          : await messagePushPayload(job.userId, payload);
      if (!push) {
        outcome = "skipped";
      } else {
        const result = await sendPush(job.userId, push);
        outcome = result.sent > 0 ? "sent" : "no_device";
      }
    } else if (job.channel === "digest") {
      // Fan Library daily email (FL-6). A bad payload is skipped, not retried.
      outcome = isDigestPayload(job.payload)
        ? await runDigest(job.userId, job.payload, now)
        : "skipped";
    } else {
      outcome = await runEmailCheck(job.userId, job.payload as MessageJobPayload, now);
    }
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: { status: "DONE", doneAt: now, error: outcome === "sent" ? null : outcome },
    });
    return outcome;
  } catch (error) {
    const message = ((error as Error).message ?? "error").slice(0, 255);
    const last = job.attempts >= JOB_MAX_ATTEMPTS;
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: last
        ? { status: "FAILED", doneAt: now, error: message }
        : {
            status: "PENDING",
            claimedAt: null,
            error: message,
            // 1, 2, 4, 8 minutes
            runAfter: new Date(now.getTime() + 60_000 * 2 ** (job.attempts - 1)),
          },
    });
    return last ? "failed" : "retry";
  }
}

export async function drainJobs(limit = 50, now = new Date()): Promise<number> {
  let ran = 0;
  while (ran < limit) {
    const job = await claimNextJob(now);
    if (!job) break;
    await runJob(job, now);
    ran += 1;
  }
  return ran;
}

/** Delete finished jobs after 30 days; the daily email limit reads the last 24 hours. */
export async function purgeJobs(now = new Date()): Promise<number> {
  const result = await prisma.notificationJob.deleteMany({
    where: {
      status: { in: ["DONE", "FAILED"] },
      doneAt: { lt: new Date(now.getTime() - 30 * DAY) },
    },
  });
  return result.count;
}

const TICK_MS = 2000;
const LOCK_KEY = "lock:notification-loop";
let ticker: NodeJS.Timeout | null = null;
let purger: NodeJS.Timeout | null = null;
let draining = false;

/**
 * Lock owner, unique per process. `process.pid` is the same (often 1) in every
 * container, which let every instance believe it held the lock.
 */
export const LOCK_OWNER = `${hostname()}:${process.pid}:${randomUUID()}`;

// Extend the lock only while this process still owns it (atomic get and pexpire)
const REFRESH_LOCK_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0`;

let lockErrorLogged = false;

/**
 * One instance polls at a time; the claim is still safe if two do. Without Redis (local
 * development, one process) the loop runs. When Redis is configured but fails, the lock
 * cannot be confirmed and this fails closed: no drain until Redis answers again.
 */
export async function holdNotificationLock(): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true;
  try {
    const ttl = TICK_MS * 3;
    const ok = await redis.set(LOCK_KEY, LOCK_OWNER, "PX", ttl, "NX");
    const held =
      ok === "OK" ||
      Number(await redis.eval(REFRESH_LOCK_SCRIPT, 1, LOCK_KEY, LOCK_OWNER, ttl)) === 1;
    lockErrorLogged = false;
    return held;
  } catch (error) {
    if (!lockErrorLogged) {
      console.warn(
        "[notifications] lock unavailable, pausing the job loop:",
        (error as Error).message
      );
      lockErrorLogged = true;
    }
    return false;
  }
}

export function startNotificationLoop() {
  if (ticker || process.env.NODE_ENV === "test") return;
  const tick = async () => {
    if (draining) return;
    draining = true;
    try {
      if (await holdNotificationLock()) await drainJobs();
    } catch (error) {
      console.error("[notifications] loop tick failed", error);
    } finally {
      draining = false;
    }
  };
  ticker = setInterval(() => void tick(), TICK_MS);
  ticker.unref();
  purger = setInterval(() => void purgeJobs().catch(() => undefined), HOUR);
  purger.unref();
  console.log("[notifications] job loop started");
}

export function stopNotificationLoop() {
  if (ticker) clearInterval(ticker);
  if (purger) clearInterval(purger);
  ticker = null;
  purger = null;
}
