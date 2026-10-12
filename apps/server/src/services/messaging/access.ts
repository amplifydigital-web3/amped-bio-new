import { prisma, type CreatorMessagingSettings, type DmRuleKind } from "@repo/database";
import { TELEGRAM_LIMITS } from "@repo/constants";
import { env } from "../../env";
import { creatorPoolIds, evaluateRule, type RuleRefusal } from "../telegram/rules";

/**
 * Messaging on Telegram (Build Board #2), phase 1, spec 3.3, 3.8 and 3.9. Who may write
 * to a creator right now. The bot path and the web path call the same check, so the
 * door is one door.
 *
 * Order of checks: the creator takes messages at all, the fan may send at all, the
 * thread is not blocked, the creator's rule, then the caps. The first failure is the
 * reason; reasons map to copy in TELEGRAM_APP_STRINGS.messagingRefusals and
 * TELEGRAM_BOT_STRINGS. No reason ever carries an amount.
 */

export type MessagingRefusalReason =
  | "disabled"
  | "blocked"
  | "not_follower"
  | "not_member"
  | "not_pool_fan"
  | "stake_below"
  | "cap_reached"
  | "sender_cap"
  | "sender_paused";

export class MessagingRefusal extends Error {
  constructor(
    readonly reason: MessagingRefusalReason,
    readonly rule: DmRuleKind | null = null
  ) {
    super(`messaging_refused_${reason}`);
  }
}

export type CanMessageResult =
  | { allowed: true; rule: DmRuleKind; threadId: Uint8Array | null }
  | { allowed: false; reason: MessagingRefusalReason; rule: DmRuleKind | null };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export async function getCreatorSettings(userId: number) {
  return prisma.creatorMessagingSettings.findUnique({ where: { userId } });
}

/** Fan messages are on for this creator: switched on, not paused, invited in the pilot. */
export function settingsOpen(settings: CreatorMessagingSettings | null): boolean {
  if (!settings || !settings.enabled || settings.pausedAt) return false;
  if (env.MESSAGING_INVITE_ONLY && !settings.invitedAt) return false;
  return true;
}

/** A fan's sending is paused by an admin (no end) or by the block threshold (24 hours). */
export async function senderPaused(userId: number, now = new Date()): Promise<boolean> {
  const status = await prisma.messagingSenderStatus.findUnique({ where: { userId } });
  if (!status?.pausedAt) return false;
  return status.pausedUntil === null || status.pausedUntil > now;
}

function ruleReason(rule: DmRuleKind, refusal: RuleRefusal): MessagingRefusalReason {
  if (refusal === "no_pool") return rule === "STAKE_MIN" ? "stake_below" : "not_pool_fan";
  return refusal;
}

/** Messages a fan sent to one creator, or to anyone, since `since`. */
export async function fanSendCount(fanUserId: number, since: Date, creatorUserId?: number) {
  return prisma.message.count({
    where: {
      sender: "FAN",
      createdAt: { gte: since },
      thread: { fanUserId, ...(creatorUserId === undefined ? {} : { creatorUserId }) },
    },
  });
}

/** Threads started with a creator in the last 24 hours, for dailyNewThreadCap. */
export async function newThreadCount(creatorUserId: number, now = new Date()) {
  return prisma.messageThread.count({
    where: { creatorUserId, createdAt: { gte: new Date(now.getTime() - DAY) } },
  });
}

/**
 * May `fanUserId` write to `creatorUserId` now? Read only. `sendFanMessage` calls it
 * again right before the insert.
 */
export async function canMessage(
  fanUserId: number,
  creatorUserId: number,
  now = new Date()
): Promise<CanMessageResult> {
  if (fanUserId === creatorUserId) return { allowed: false, reason: "disabled", rule: null };

  const [creator, settings, fan] = await Promise.all([
    prisma.user.findUnique({
      where: { id: creatorUserId },
      select: { page_status: true, block: true },
    }),
    getCreatorSettings(creatorUserId),
    prisma.user.findUnique({ where: { id: fanUserId }, select: { block: true } }),
  ]);
  if (
    !creator ||
    creator.block !== "no" ||
    creator.page_status !== "PUBLISHED" ||
    !settingsOpen(settings)
  ) {
    return { allowed: false, reason: "disabled", rule: settings?.ruleKind ?? null };
  }
  const rule = settings!.ruleKind;
  if (!fan || fan.block !== "no" || (await senderPaused(fanUserId, now))) {
    return { allowed: false, reason: "sender_paused", rule };
  }

  const [thread, followBlock] = await Promise.all([
    prisma.messageThread.findUnique({
      where: { creatorUserId_fanUserId: { creatorUserId, fanUserId } },
      select: { id: true, status: true },
    }),
    prisma.followBlock.findUnique({
      where: { creator_id_user_id: { creator_id: creatorUserId, user_id: fanUserId } },
      select: { creator_id: true },
    }),
  ]);
  if (thread?.status === "BLOCKED_BY_CREATOR" || followBlock) {
    return { allowed: false, reason: "blocked", rule };
  }

  const verdict = await evaluateRule(
    rule,
    {
      creatorUserId,
      poolIds:
        rule === "POOL_MEMBER" || rule === "STAKE_MIN" || rule === "FOLLOWER"
          ? await creatorPoolIds(creatorUserId)
          : [],
      stakeMin: settings!.stakeMin,
    },
    fanUserId
  );
  if (!verdict.allowed) return { allowed: false, reason: ruleReason(rule, verdict.reason), rule };

  const [perCreator, perDay] = await Promise.all([
    fanSendCount(fanUserId, new Date(now.getTime() - HOUR), creatorUserId),
    fanSendCount(fanUserId, new Date(now.getTime() - DAY)),
  ]);
  if (
    perCreator >= TELEGRAM_LIMITS.fanSendsPerCreatorPerHour ||
    perDay >= TELEGRAM_LIMITS.fanSendsPerDay
  ) {
    return { allowed: false, reason: "sender_cap", rule };
  }
  if (!thread && (await newThreadCount(creatorUserId, now)) >= settings!.dailyNewThreadCap) {
    return { allowed: false, reason: "cap_reached", rule };
  }
  return { allowed: true, rule, threadId: thread?.id ?? null };
}

/**
 * Spec 3.9: a fan blocked by 3 creators in 7 days stops sending for 24 hours. Called
 * after a creator blocks a thread. Returns true when a pause was set.
 */
export async function checkFanBlockThreshold(fanUserId: number, now = new Date()) {
  const blocks = await prisma.messageThread.count({
    where: {
      fanUserId,
      status: "BLOCKED_BY_CREATOR",
      blockedAt: { gte: new Date(now.getTime() - 7 * DAY) },
    },
  });
  if (blocks < 3) return false;
  const status = await prisma.messagingSenderStatus.findUnique({ where: { userId: fanUserId } });
  // An admin pause without an end date outranks the automatic one
  if (status?.pausedAt && status.pausedUntil === null) return false;
  await prisma.messagingSenderStatus.upsert({
    where: { userId: fanUserId },
    create: {
      userId: fanUserId,
      pausedAt: now,
      pausedUntil: new Date(now.getTime() + DAY),
      pausedReason: `Blocked by ${blocks} creators in 7 days`,
    },
    update: {
      pausedAt: now,
      pausedUntil: new Date(now.getTime() + DAY),
      pausedReason: `Blocked by ${blocks} creators in 7 days`,
    },
  });
  return true;
}

/**
 * Spec 3.9: pause a creator's Fan messages when fan reports on their threads reach 1%
 * of their threads active in 7 days, minimum 5. Called after a fan reports.
 */
export async function checkCreatorReportThreshold(creatorUserId: number, now = new Date()) {
  const since = new Date(now.getTime() - 7 * DAY);
  const [reports, threads] = await Promise.all([
    prisma.messageReport.count({
      where: {
        createdAt: { gte: since },
        thread: { creatorUserId },
        reporterUserId: { not: creatorUserId },
      },
    }),
    prisma.messageThread.count({ where: { creatorUserId, lastMessageAt: { gte: since } } }),
  ]);
  if (reports < Math.max(5, Math.ceil(threads * 0.01))) return false;
  const settings = await getCreatorSettings(creatorUserId);
  if (!settings || settings.pausedAt) return false;
  await prisma.creatorMessagingSettings.update({
    where: { userId: creatorUserId },
    data: { pausedAt: now, pausedReason: `${reports} fan reports in 7 days` },
  });
  return true;
}
