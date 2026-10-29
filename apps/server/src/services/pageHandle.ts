import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH, HANDLE_REGEX } from "@repo/constants";
import type { Prisma } from "@repo/database";
import { holderMayKeep, matchReserved } from "./reservedHandles";

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
 * it is assigned to `userId`. Format and length are checked by the input
 * schemas before this runs.
 */
export async function assertHandleAllowed(handle: string, userId?: number): Promise<void> {
  const match = await matchReserved(handle);
  if (match.reserved && !holderMayKeep(match, userId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: HANDLE_RESERVED_MESSAGE });
  }
}

type UserWriter = UserReader & {
  user: {
    update(args: {
      where: { id: number };
      data: Prisma.UserUpdateInput;
      select: { id: true };
    }): PromiseLike<{ id: number }>;
  };
};

/**
 * Every handle write goes through here (spec 4.10): the reserved check, the
 * taken check, then the write. `extra` carries other fields written in the
 * same update, such as page_status on publish.
 */
export async function changeHandle(
  db: UserWriter,
  userId: number,
  handle: string,
  extra: Prisma.UserUpdateInput = {}
): Promise<void> {
  await assertHandleAllowed(handle, userId);
  await assertHandleAvailable(db, handle, userId);
  await db.user.update({
    where: { id: userId },
    data: { ...extra, handle },
    select: { id: true },
  });
}
