import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { HANDLE_MIN_LENGTH, HANDLE_REGEX } from "@repo/constants";
import type { Prisma } from "@repo/database";

/**
 * The one rule set for a handle chosen by its owner. Account, Public URL
 * (handle.redeem) and the publish sheet (user.publishPage, QA-008) both use
 * it, so a handle is checked the same way wherever it is set.
 */
export const HANDLE_TAKEN_MESSAGE = "This handle is already taken";

export const newHandleSchema = z
  .string()
  .transform(value => (value.startsWith("@") ? value.substring(1) : value)) // Normalize by removing @ prefix if present
  .pipe(
    z
      .string()
      .min(HANDLE_MIN_LENGTH, `Name must be at least ${HANDLE_MIN_LENGTH} characters`)
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
