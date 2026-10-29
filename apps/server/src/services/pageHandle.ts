import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH, HANDLE_REGEX } from "@repo/constants";
import type { Prisma } from "@repo/database";
import { holderMayKeep, matchReserved } from "./reservedHandles";
import { writeAudit, type Tx } from "./adminAudit";
import { uuidv7 } from "../utils/uuid-v7";

/**
 * The one rule set for a handle chosen by its owner. Account, Public URL
 * (handle.redeem) and the publish sheet (user.publishPage, QA-008) both use
 * it, so a handle is checked the same way wherever it is set.
 */
export const HANDLE_TAKEN_MESSAGE = "This handle is already taken";
// Reserved handles (Build Board D2): the clients match on "reserved"
export const HANDLE_RESERVED_MESSAGE = "This handle is reserved";

export const newHandleSchema = z
  .string()
  .transform(value => (value.startsWith("@") ? value.substring(1) : value)) // Normalize by removing @ prefix if present
  .pipe(
    z
      .string()
      .min(HANDLE_MIN_LENGTH, `Name must be at least ${HANDLE_MIN_LENGTH} characters`)
      .max(HANDLE_MAX_LENGTH, `Name must be at most ${HANDLE_MAX_LENGTH} characters`)
      .regex(HANDLE_REGEX, "Name can only contain letters, numbers, underscores and hyphens")
      .transform(value => value.toLowerCase()) // Force lowercase for storage
  );

// The plain client and a transaction client both fit, extended or not
type UserReader = {
  user: {
    findFirst(args: {
      where: Prisma.UserWhereInput;
      select: { id: true };
    }): PromiseLike<{ id: number } | null>;
  };
};

/**
 * Throws BAD_REQUEST when another account holds the handle in any case.
 * `exceptUserId` lets an owner keep the handle they already hold.
 */
export async function assertHandleAvailable(
  db: UserReader,
  handle: string,
  exceptUserId?: number
): Promise<void> {
  const existing = await db.user.findFirst({
    where: {
      OR: [{ handle }, { handle: handle.toLowerCase() }, { handle: handle.toUpperCase() }],
      ...(exceptUserId !== undefined ? { NOT: { id: exceptUserId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new TRPCError({ code: "BAD_REQUEST", message: HANDLE_TAKEN_MESSAGE });
  }
}

/**
 * Reserved handles (docs/features/reserved-handles.md, 4.2). Throws BAD_REQUEST
 * with HANDLE_RESERVED_MESSAGE for a system word, and for an admin word unless
 * it is assigned to `userId` or an admin exempted this account. Format and
 * length are checked by the input schemas before this runs.
 */
export async function assertHandleAllowed(handle: string, userId?: number): Promise<void> {
  const match = await matchReserved(handle);
  if (match.reserved && !(await holderMayKeep(match, userId, handle))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: HANDLE_RESERVED_MESSAGE });
  }
}

/** How long an old handle answers 307 after a rename (decision R1) */
export const HANDLE_REDIRECT_DAYS = 90;

export type ChangeHandleOptions = {
  /** Other fields written in the same update, such as page_status on publish */
  extra?: Prisma.UserUpdateInput;
  /** Admin assign: the caller assigns this reserved word to the account */
  skipReservedCheck?: boolean;
  /** Keep the old handle as a 90 day redirect to the account */
  redirectOld?: boolean;
  /**
   * Who changed it. "self" closes the account's open notices as CHOSE_NEW;
   * admin and sweeper renames set the notice state themselves.
   */
  source?: "self" | "admin" | "system";
};

export type ChangeHandleResult = { oldHandle: string | null; changed: boolean };

/**
 * Every handle write goes through here (spec 4.10 and 7.5): the reserved
 * check, the taken check, the write, then in the same transaction:
 * - a redirect from the new handle is deleted, so claiming an old handle ends
 *   its redirect;
 * - the old handle optionally becomes a 90 day redirect;
 * - an assigned word the account no longer holds is unassigned (the word stays
 *   reserved), with one `handle.unassign` audit row;
 * - on a change by the owner, open notices for the old handle close as
 *   CHOSE_NEW.
 * The landing page renders per request (force-dynamic), so there is no cache
 * to revalidate.
 */
export async function changeHandle(
  db: Tx,
  userId: number,
  handle: string,
  options: ChangeHandleOptions = {}
): Promise<ChangeHandleResult> {
  const { extra = {}, skipReservedCheck = false, redirectOld = false, source = "self" } = options;
  if (!skipReservedCheck) await assertHandleAllowed(handle, userId);
  await assertHandleAvailable(db, handle, userId);

  const user = await db.user.findUnique({ where: { id: userId }, select: { handle: true } });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
  const oldHandle = user.handle?.toLowerCase() ?? null;

  await db.user.update({ where: { id: userId }, data: { ...extra, handle }, select: { id: true } });
  if (oldHandle === handle) return { oldHandle, changed: false };

  await db.handleRedirect.deleteMany({ where: { oldHandle: handle } });

  if (redirectOld && oldHandle) {
    const endsAt = new Date(Date.now() + HANDLE_REDIRECT_DAYS * 24 * 60 * 60 * 1000);
    await db.handleRedirect.upsert({
      where: { oldHandle },
      create: { id: uuidv7(), oldHandle, userId, endsAt },
      update: { userId, endsAt, hits: 0 },
    });
  }

  const assigned = await db.reservedHandle.findUnique({
    where: { assignedUserId: userId },
    select: { id: true, word: true },
  });
  if (assigned && assigned.word !== handle) {
    await db.reservedHandle.update({
      where: { id: assigned.id },
      data: { assignedUserId: null },
    });
    await writeAudit(db, {
      actorId: null,
      action: "handle.unassign",
      targetUserId: userId,
      subject: assigned.word,
      reason: "The account changed its handle",
      before: { assignedUserId: userId, handle: oldHandle },
      after: { assignedUserId: null, handle },
    });
  }

  if (source === "self" && oldHandle) {
    await db.handleNotice.updateMany({
      where: { userId, oldHandle, state: { in: ["NOTICE_SENT", "FAILED"] } },
      data: { state: "CHOSE_NEW" },
    });
  }

  return { oldHandle, changed: true };
}
