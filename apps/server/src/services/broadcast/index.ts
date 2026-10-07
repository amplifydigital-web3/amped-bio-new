/**
 * Creator Pool Broadcast (Build Board #1), phase 1: Amped inbox only.
 * Spec: docs/features/creator-pool-broadcast.md, sections 3.5 to 3.8.
 *
 * Phase 1 has no email, so fan-out is one set of database inserts per
 * broadcast. It runs in the API process right after a broadcast is queued, and
 * a sweeper resumes any broadcast left QUEUED or SENDING after a restart. Every
 * step is idempotent: delivery rows are unique per broadcast and member, and a
 * broadcast is claimed with a conditional status update. BullMQ arrives in
 * phase 2 with per-recipient email jobs, where rate limiting needs a queue.
 */
import { Prisma, prisma } from "@repo/database";
import { BROADCAST_LIMITS, BROADCAST_PAUSE_RULES } from "@repo/constants";

const CHUNK = 1000;
/** A SENDING broadcast untouched this long is treated as abandoned and resumed. */
const STALE_MS = 5 * 60 * 1000;
const SWEEP_MS = 60 * 1000;
/** Fan-out runs allowed per broadcast before it is marked FAILED (QA-034). */
export const BROADCAST_MAX_SEND_ATTEMPTS = 5;

/** Members of a pool: a positive stake in the StakedPool mirror, not suspended, not the owner. */
export async function memberUserIds(poolId: number, ownerUserId: number): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ userId: number }>>(Prisma.sql`
    SELECT DISTINCT uw.userId AS userId
    FROM staked_pools sp
    JOIN user_wallets uw ON sp.userWalletId = uw.id
    JOIN users u ON u.id = uw.userId
    WHERE sp.poolId = ${poolId}
      AND CAST(sp.stakeAmount AS DECIMAL(65,0)) > 0
      AND u.block = 'no'
      AND uw.userId <> ${ownerUserId}
  `);
  return rows.map(r => Number(r.userId));
}

export async function countMembers(poolId: number, ownerUserId: number): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint | number }>>(Prisma.sql`
    SELECT COUNT(DISTINCT uw.userId) AS n
    FROM staked_pools sp
    JOIN user_wallets uw ON sp.userWalletId = uw.id
    JOIN users u ON u.id = uw.userId
    WHERE sp.poolId = ${poolId}
      AND CAST(sp.stakeAmount AS DECIMAL(65,0)) > 0
      AND u.block = 'no'
      AND uw.userId <> ${ownerUserId}
  `);
  return Number(rows[0]?.n ?? 0);
}

/** Statuses that count against the send quota. Rejected and canceled sends do not. */
const COUNTED: Prisma.BroadcastWhereInput["status"] = {
  in: ["IN_REVIEW", "QUEUED", "SENDING", "SENT"],
};

export async function getQuota(
  userId: number,
  now = new Date(),
  db: Pick<typeof prisma, "broadcast" | "broadcastSenderStatus"> = prisma
) {
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const [day, week, status] = await Promise.all([
    db.broadcast.count({
      where: { creatorUserId: userId, status: COUNTED, createdAt: { gte: dayAgo } },
    }),
    db.broadcast.count({
      where: { creatorUserId: userId, status: COUNTED, createdAt: { gte: weekAgo } },
    }),
    db.broadcastSenderStatus.findUnique({ where: { userId } }),
  ]);
  return {
    usedToday: day,
    usedThisWeek: week,
    leftToday: Math.max(
      0,
      Math.min(BROADCAST_LIMITS.perDay - day, BROADCAST_LIMITS.perWeek - week)
    ),
    leftThisWeek: Math.max(0, BROADCAST_LIMITS.perWeek - week),
    paused: !!status?.pausedAt,
    nextSendReviewed: !status?.firstApprovedAt,
    invited: !!status?.invitedAt,
  };
}

/** Pause a sender, pending admin review. Idempotent. */
export async function pauseSender(userId: number, reason: string) {
  await prisma.broadcastSenderStatus.upsert({
    where: { userId },
    create: { userId, pausedAt: new Date(), pausedReason: reason },
    update: { pausedAt: new Date(), pausedReason: reason },
  });
}

/** Section 3.8: pause when reports on one broadcast reach 1% of recipients, minimum 3. */
export async function checkReportThreshold(broadcastId: number) {
  const b = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    select: { creatorUserId: true, recipientCount: true, _count: { select: { reports: true } } },
  });
  if (!b) return false;
  const reports = b._count.reports;
  const threshold = Math.max(
    BROADCAST_PAUSE_RULES.reportMin,
    Math.ceil(b.recipientCount * BROADCAST_PAUSE_RULES.reportShare)
  );
  if (reports < threshold) return false;
  await pauseSender(b.creatorUserId, `Reports reached ${reports} on broadcast ${broadcastId}`);
  return true;
}

/** Section 3.8: pause after 2 rejected broadcasts in 30 days. */
export async function checkRejectionThreshold(userId: number) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const rejected = await prisma.broadcast.count({
    where: { creatorUserId: userId, status: "REJECTED", reviewedAt: { gte: since } },
  });
  if (rejected < BROADCAST_PAUSE_RULES.rejectionsIn30Days) return false;
  await pauseSender(userId, `${rejected} broadcasts rejected in 30 days`);
  return true;
}

/**
 * Freeze the audience into delivery rows. Claims the broadcast with a
 * conditional update so two runs never fan out the same broadcast at once.
 */
export async function processBroadcast(
  broadcastId: number
): Promise<"sent" | "skipped" | "failed"> {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const claimed = await prisma.broadcast.updateMany({
    where: {
      id: broadcastId,
      sendAttempts: { lt: BROADCAST_MAX_SEND_ATTEMPTS },
      OR: [{ status: "QUEUED" }, { status: "SENDING", updatedAt: { lt: staleBefore } }],
    },
    data: { status: "SENDING", startedAt: new Date(), sendAttempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "skipped";

  const b = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    select: { id: true, poolId: true, creatorUserId: true, sendAttempts: true },
  });
  if (!b || b.poolId === null) {
    await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: "FAILED" } });
    return "failed";
  }

  try {
    const userIds = await memberUserIds(b.poolId, b.creatorUserId);
    for (let i = 0; i < userIds.length; i += CHUNK) {
      await prisma.broadcastDelivery.createMany({
        data: userIds.slice(i, i + CHUNK).map(userId => ({
          broadcastId: b.id,
          userId,
          emailStatus: "NOT_ELIGIBLE" as const,
          emailSkipReason: "phase1_inbox_only",
        })),
        skipDuplicates: true,
      });
      // Keep the claim fresh on large pools so the sweeper does not take it over
      await prisma.broadcast.update({ where: { id: b.id }, data: { startedAt: new Date() } });
    }
    const recipientCount = await prisma.broadcastDelivery.count({ where: { broadcastId: b.id } });
    await prisma.broadcast.update({
      where: { id: b.id },
      data: { status: "SENT", recipientCount, completedAt: new Date() },
    });
    console.log(`[broadcast] ${b.id} delivered to ${recipientCount} inboxes`);
    return "sent";
  } catch (error) {
    console.error(
      `[broadcast] fan-out failed for ${b.id} (attempt ${b.sendAttempts} of ${BROADCAST_MAX_SEND_ATTEMPTS})`,
      error
    );
    if (b.sendAttempts >= BROADCAST_MAX_SEND_ATTEMPTS) {
      // Out of attempts: stop retrying. Delivery rows already written stay.
      await prisma.broadcast.update({
        where: { id: b.id },
        data: { status: "FAILED", completedAt: new Date() },
      });
    }
    // Otherwise leave it SENDING; the sweeper resumes it once the claim is stale
    return "failed";
  }
}

/**
 * Mark FAILED any stale SENDING broadcast that already used every attempt, for
 * example when the process died mid fan-out on the last attempt.
 */
async function failExhausted() {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const failed = await prisma.broadcast.updateMany({
    where: {
      status: "SENDING",
      updatedAt: { lt: staleBefore },
      sendAttempts: { gte: BROADCAST_MAX_SEND_ATTEMPTS },
    },
    data: { status: "FAILED", completedAt: new Date() },
  });
  if (failed.count > 0) {
    console.error(`[broadcast] ${failed.count} broadcast(s) failed after max attempts`);
  }
  return failed.count;
}

/** Run fan-out without blocking the request that queued it. */
export function enqueueBroadcast(broadcastId: number) {
  setImmediate(() => {
    void processBroadcast(broadcastId).catch(error =>
      console.error(`[broadcast] fan-out crashed for ${broadcastId}`, error)
    );
  });
}

/** Resume broadcasts left QUEUED, or SENDING past the stale window. */
export async function sweepBroadcasts() {
  await failExhausted();
  const staleBefore = new Date(Date.now() - STALE_MS);
  const pending = await prisma.broadcast.findMany({
    where: {
      sendAttempts: { lt: BROADCAST_MAX_SEND_ATTEMPTS },
      OR: [{ status: "QUEUED" }, { status: "SENDING", updatedAt: { lt: staleBefore } }],
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 50,
  });
  for (const { id } of pending) await processBroadcast(id);
  return pending.length;
}

let sweeper: NodeJS.Timeout | null = null;
export function startBroadcastSweeper() {
  if (sweeper || process.env.NODE_ENV === "test") return;
  const run = () =>
    void sweepBroadcasts().catch(error => console.error("[broadcast] sweep failed", error));
  setTimeout(run, 10_000);
  sweeper = setInterval(run, SWEEP_MS);
  sweeper.unref();
}
