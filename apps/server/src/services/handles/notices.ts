import {
  generatedHandleBase,
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  matchReservedIn,
  type AdminReservedRow,
} from "@repo/constants";
import { prisma } from "@repo/database";
import { writeAudit, type Tx } from "../adminAudit";
import { changeHandle } from "../pageHandle";
import { reservedRowsForGenerators } from "../reservedHandles";
import { sendHandleNotice } from "../../utils/email/email";
import { uuidv7 } from "../../utils/uuid-v7";

/** Notice length before the rename (decision R1) */
export const NOTICE_DAYS = 14;
/** Extend adds this many days, at most twice per account (spec 7.6) */
export const EXTEND_DAYS = 7;
export const MAX_EXTENSIONS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export type NoticeTier = "SYSTEM" | "ADMIN";

/** An email to send once the transaction that decided it has committed */
export type PendingNoticeEmail = {
  noticeId: Buffer;
  userId: number;
  handle: string;
  fallbackHandle: string;
  deadline: Date;
};

async function isTaken(db: Tx, handle: string, exceptUserId: number): Promise<boolean> {
  const user = await db.user.findFirst({
    where: { handle, NOT: { id: exceptUserId } },
    select: { id: true },
  });
  return user !== null;
}

/**
 * The generated form a renamed account moves to (spec 4.6 and section 5):
 * the old handle without a reserved prefix, then a numeric suffix until the
 * result is free and matches no reserved row. `extraRows` holds rows written
 * in this transaction that the matcher cache has not seen yet.
 */
export async function renameTarget(
  db: Tx,
  userId: number,
  oldHandle: string,
  extraRows: AdminReservedRow[] = []
): Promise<string> {
  const rows = [...(await reservedRowsForGenerators()), ...extraRows];
  const base = generatedHandleBase(oldHandle, rows, {
    minLength: HANDLE_MIN_LENGTH,
    maxLength: HANDLE_MAX_LENGTH,
  });
  const usable = async (candidate: string) =>
    candidate !== oldHandle &&
    !matchReservedIn(candidate, rows).reserved &&
    !(await isTaken(db, candidate, userId));

  if (await usable(base)) return base;
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    if (await usable(candidate)) return candidate;
  }
  return `${base}${Date.now()}`;
}

/**
 * Renames an account away from a reserved word, with a 90 day redirect from
 * the old handle (decision R1). Writes one `handle.rename` audit row.
 */
export async function renameAccount(
  db: Tx,
  options: {
    userId: number;
    oldHandle: string;
    word: string;
    actorId: number | null;
    reason: string;
    extraRows?: AdminReservedRow[];
  }
): Promise<string> {
  const target = await renameTarget(db, options.userId, options.oldHandle, options.extraRows);
  await changeHandle(db, options.userId, target, {
    skipReservedCheck: true,
    redirectOld: true,
    source: options.actorId === null ? "system" : "admin",
  });
  await writeAudit(db, {
    actorId: options.actorId,
    action: "handle.rename",
    targetUserId: options.userId,
    subject: options.word,
    reason: options.reason,
    before: { handle: options.oldHandle },
    after: { handle: target },
  });
  return target;
}

/**
 * Starts the notice flow for one account that holds a reserved word (spec
 * section 5). An account with no published page is renamed at once, with no
 * email. A published page gets a 14 day notice; its email is returned for the
 * caller to send after commit.
 */
export async function startNotice(
  db: Tx,
  options: {
    userId: number;
    word: string;
    tier: NoticeTier;
    actorId: number | null;
    reason: string;
    extraRows?: AdminReservedRow[];
  }
): Promise<PendingNoticeEmail | null> {
  const user = await db.user.findUnique({
    where: { id: options.userId },
    select: { handle: true, page_status: true },
  });
  if (!user?.handle) return null;
  const oldHandle = user.handle.toLowerCase();

  if (user.page_status !== "PUBLISHED") {
    await renameAccount(db, {
      userId: options.userId,
      oldHandle,
      word: options.word,
      actorId: options.actorId,
      reason: options.reason,
      extraRows: options.extraRows,
    });
    await db.handleNotice.upsert({
      where: { userId_reservedWord: { userId: options.userId, reservedWord: options.word } },
      create: {
        id: uuidv7(),
        userId: options.userId,
        reservedWord: options.word,
        tier: options.tier,
        state: "RENAMED",
        oldHandle,
        deadline: null,
      },
      update: { tier: options.tier, state: "RENAMED", oldHandle, deadline: null },
    });
    return null;
  }

  const deadline = new Date(Date.now() + NOTICE_DAYS * DAY_MS);
  const notice = await db.handleNotice.upsert({
    where: { userId_reservedWord: { userId: options.userId, reservedWord: options.word } },
    create: {
      id: uuidv7(),
      userId: options.userId,
      reservedWord: options.word,
      tier: options.tier,
      state: "NOTICE_SENT",
      oldHandle,
      deadline,
    },
    update: {
      tier: options.tier,
      state: "NOTICE_SENT",
      oldHandle,
      deadline,
      extensions: 0,
    },
    select: { id: true },
  });
  await writeAudit(db, {
    actorId: options.actorId,
    action: "handle.notice.start",
    targetUserId: options.userId,
    subject: options.word,
    reason: options.reason,
    after: { handle: oldHandle, deadline },
  });
  return {
    noticeId: Buffer.from(notice.id),
    userId: options.userId,
    handle: oldHandle,
    fallbackHandle: await renameTarget(db, options.userId, oldHandle, options.extraRows),
    deadline,
  };
}

/**
 * Sends notice emails after commit. A send that throws marks the notice
 * FAILED, so it shows on the Holders tab with Retry. Never throws.
 */
export async function sendNoticeEmails(emails: PendingNoticeEmail[]): Promise<void> {
  for (const pending of emails) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: pending.userId },
        select: { email: true },
      });
      if (!user?.email) throw new Error("Account has no email");
      await sendHandleNotice(user.email, {
        handle: pending.handle,
        fallbackHandle: pending.fallbackHandle,
        deadline: pending.deadline,
      });
    } catch (error) {
      console.error(`[reserved-handles] notice email failed for user ${pending.userId}`, error);
      await prisma.handleNotice
        .updateMany({
          where: { id: pending.noticeId, state: "NOTICE_SENT" },
          data: { state: "FAILED" },
        })
        .catch(() => undefined);
    }
  }
}
