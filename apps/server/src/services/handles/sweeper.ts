import { isSystemReservedHandle, matchReservedIn } from "@repo/constants";
import { prisma } from "@repo/database";
import { writeAudit } from "../adminAudit";
import { bumpReservedVersion } from "../reservedHandles";
import { renameAccount } from "./notices";

/**
 * Reserved handles sweeper (Build Board D2, spec section 5). Every 15 minutes:
 * renames accounts whose notice deadline passed, deletes reserved rows past
 * their end date and redirects past theirs, and applies the retention in
 * section 7.11. Each action writes an audit row with actorId null.
 *
 * Every row is claimed with a conditional write (updateMany or deleteMany on
 * the row's current state), the same lock the Telegram outbox uses: only the
 * instance whose write changed the row acts on it, so two instances never act
 * twice and Redis is not needed.
 */
export const HANDLE_SWEEP_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Notices and redirects are deleted 30 days after they end (spec 7.11) */
const ENDED_RETENTION_DAYS = 30;
/** Handle audit rows are moderation records, kept 5 years (spec 7.11) */
const AUDIT_RETENTION_DAYS = 5 * 365;
const BATCH = 100;

export type SweepResult = {
  renamed: number;
  choseNew: number;
  cancelled: number;
  failed: number;
  rowsExpired: number;
  redirectsEnded: number;
};

type DueNotice = {
  id: Uint8Array;
  userId: number;
  reservedWord: string;
  tier: "SYSTEM" | "ADMIN";
  oldHandle: string;
};

type Outcome = "renamed" | "choseNew" | "cancelled" | "skipped";

/** Renames one account on its deadline, after checking again that it still must move */
export async function renameDueNotice(notice: DueNotice, now = new Date()): Promise<Outcome> {
  return prisma.$transaction(
    async tx => {
      const claimed = await tx.handleNotice.updateMany({
        where: { id: notice.id, state: "NOTICE_SENT", deadline: { lte: now } },
        data: { state: "RENAMED" },
      });
      if (claimed.count !== 1) return "skipped";

      const user = await tx.user.findUnique({
        where: { id: notice.userId },
        select: { handle: true },
      });
      const handle = user?.handle?.toLowerCase() ?? null;
      if (handle !== notice.oldHandle) {
        await tx.handleNotice.update({
          where: { id: notice.id },
          data: { state: "CHOSE_NEW", deadline: null },
        });
        return "choseNew";
      }

      let stillReserved: boolean;
      if (notice.tier === "SYSTEM") {
        stillReserved = isSystemReservedHandle(handle);
      } else {
        const row = await tx.reservedHandle.findUnique({ where: { word: notice.reservedWord } });
        const live = row !== null && (row.expiresAt === null || row.expiresAt > now);
        stillReserved =
          live &&
          row.assignedUserId !== notice.userId &&
          matchReservedIn(handle, [{ ...row, id: "row" }], now).reserved;
      }
      if (!stillReserved) {
        await tx.handleNotice.update({
          where: { id: notice.id },
          data: { state: "CANCELLED", deadline: null },
        });
        await writeAudit(tx, {
          actorId: null,
          action: "handle.notice.cancelled",
          targetUserId: notice.userId,
          subject: notice.reservedWord,
          reason: "The word is no longer reserved for this account",
        });
        return "cancelled";
      }

      await renameAccount(tx, {
        userId: notice.userId,
        oldHandle: handle,
        word: notice.reservedWord,
        actorId: null,
        reason: "Notice deadline passed",
      });
      await tx.handleNotice.update({ where: { id: notice.id }, data: { deadline: null } });
      return "renamed";
    },
    { timeout: 30_000 }
  );
}

async function renameDue(now: Date, result: SweepResult) {
  const due = await prisma.handleNotice.findMany({
    where: { state: "NOTICE_SENT", deadline: { lte: now } },
    orderBy: { deadline: "asc" },
    take: BATCH,
    select: { id: true, userId: true, reservedWord: true, tier: true, oldHandle: true },
  });
  for (const notice of due) {
    try {
      const outcome = await renameDueNotice(notice, now);
      if (outcome !== "skipped") result[outcome] += 1;
    } catch (error) {
      console.error("[reserved-handles] rename failed", error);
      // The transaction rolled back, so the notice is NOTICE_SENT again
      const marked = await prisma.handleNotice.updateMany({
        where: { id: notice.id, state: "NOTICE_SENT" },
        data: { state: "FAILED" },
      });
      result.failed += marked.count;
    }
  }
}

async function expireRows(now: Date, result: SweepResult) {
  const due = await prisma.reservedHandle.findMany({
    where: { expiresAt: { lte: now } },
    take: BATCH,
  });
  for (const row of due) {
    await prisma.$transaction(async tx => {
      const deleted = await tx.reservedHandle.deleteMany({
        where: { id: row.id, expiresAt: { lte: now } },
      });
      if (deleted.count !== 1) return;
      await tx.handleNotice.updateMany({
        where: { reservedWord: row.word, state: { in: ["NOTICE_SENT", "FAILED"] } },
        data: { state: "CANCELLED", deadline: null },
      });
      await writeAudit(tx, {
        actorId: null,
        action: "handle.expired",
        targetUserId: row.assignedUserId,
        subject: row.word,
        reason: "End date passed",
        before: {
          word: row.word,
          kind: row.kind,
          category: row.category,
          reason: row.reason,
          expiresAt: row.expiresAt,
          assignedUserId: row.assignedUserId,
        },
      });
      result.rowsExpired += 1;
    });
  }
}

async function endRedirects(now: Date, result: SweepResult) {
  // A live route always wins in Next.js, so a redirect whose old word became
  // a system word is ended too (spec section 5)
  const candidates = await prisma.handleRedirect.findMany({
    orderBy: { endsAt: "asc" },
    take: 1000,
    select: { id: true, oldHandle: true, userId: true, endsAt: true },
  });
  const due = candidates
    .filter(row => row.endsAt <= now || isSystemReservedHandle(row.oldHandle))
    .slice(0, BATCH);
  for (const row of due) {
    await prisma.$transaction(async tx => {
      const deleted = await tx.handleRedirect.deleteMany({ where: { id: row.id } });
      if (deleted.count !== 1) return;
      await writeAudit(tx, {
        actorId: null,
        action: "handle.redirect.expired",
        targetUserId: row.userId,
        subject: row.oldHandle,
        reason: row.endsAt <= now ? "End date passed" : "The old handle is now a system word",
      });
      result.redirectsEnded += 1;
    });
  }
}

async function applyRetention(now: Date) {
  await prisma.handleNotice.deleteMany({
    where: {
      state: { in: ["CHOSE_NEW", "CANCELLED", "RENAMED"] },
      updatedAt: { lt: new Date(now.getTime() - ENDED_RETENTION_DAYS * DAY_MS) },
    },
  });
  await prisma.adminAuditLog.deleteMany({
    where: {
      action: { startsWith: "handle." },
      createdAt: { lt: new Date(now.getTime() - AUDIT_RETENTION_DAYS * DAY_MS) },
    },
  });
}

export async function sweepReservedHandles(now = new Date()): Promise<SweepResult> {
  const result: SweepResult = {
    renamed: 0,
    choseNew: 0,
    cancelled: 0,
    failed: 0,
    rowsExpired: 0,
    redirectsEnded: 0,
  };
  await expireRows(now, result);
  if (result.rowsExpired > 0) await bumpReservedVersion();
  await renameDue(now, result);
  await endRedirects(now, result);
  await applyRetention(now);
  return result;
}

let sweeper: NodeJS.Timeout | null = null;
export function startReservedHandlesSweeper() {
  if (sweeper || process.env.NODE_ENV === "test") return;
  const run = () =>
    void sweepReservedHandles()
      .then(result => {
        const acted = Object.values(result).some(count => count > 0);
        if (acted) console.log("[reserved-handles] sweep", result);
      })
      .catch(error => console.error("[reserved-handles] sweep failed", error));
  setTimeout(run, 30_000).unref();
  sweeper = setInterval(run, HANDLE_SWEEP_MS);
  sweeper.unref();
}
