import { TRPCError } from "@trpc/server";
import { Prisma, prisma } from "@repo/database";
import { uuidv7 } from "../utils/uuid-v7";
import { enforceRateLimits } from "../utils/rateLimit";
import { assertHandleAvailable, HANDLE_TAKEN_MESSAGE } from "./pageHandle";

/**
 * QA-008: an account made from Follow starts with an unpublished page. Its
 * owner publishes it in one deliberate step, with the URL they choose, and can
 * unpublish it later. Follows are never touched by either step.
 */

export type PageStatus = "PUBLISHED" | "UNPUBLISHED";

export type PageVisibilityResult = {
  handle: string;
  pageStatus: PageStatus;
  /** False when the call changed nothing (publishing twice is a no-op). */
  changed: boolean;
};

/** Same shape as the follow limits: a short burst window and a daily cap. */
async function limitVisibilityWrites(userId: number) {
  await enforceRateLimits(
    [
      { key: `page-visibility:min:${userId}`, limit: 10, windowSeconds: 60 },
      { key: `page-visibility:day:${userId}`, limit: 50, windowSeconds: 24 * 60 * 60 },
    ],
    "Too many changes. Try again in a minute."
  );
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Sets the owner's page to PUBLISHED. When `handle` is given and differs from
 * the current one, it is checked like Account, Public URL and stored in the
 * same transaction, so a taken handle publishes nothing. The URL step of the
 * setup checklist counts as done once the page is live.
 */
export async function publishPage(userId: number, handle?: string): Promise<PageVisibilityResult> {
  await limitVisibilityWrites(userId);

  try {
    return await prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { handle: true, page_status: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });

      const current = user.handle?.toLowerCase() ?? null;
      const next = handle ?? current;
      if (!next) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a URL first." });
      }

      const handleChanges = next !== current;
      if (handleChanges) await assertHandleAvailable(tx, next, userId);

      if (user.page_status === "PUBLISHED" && !handleChanges) {
        return { handle: next, pageStatus: "PUBLISHED", changed: false };
      }

      await tx.user.update({
        where: { id: userId },
        data: { page_status: "PUBLISHED", ...(handleChanges ? { handle: next } : {}) },
      });

      const record = await tx.userOnboarding.findUnique({
        where: { user_id: userId },
        select: { url_confirmed_at: true },
      });
      if (!record) {
        await tx.userOnboarding.create({
          data: { id: uuidv7(), user_id: userId, url_confirmed_at: new Date() },
        });
      } else if (!record.url_confirmed_at) {
        await tx.userOnboarding.update({
          where: { user_id: userId },
          data: { url_confirmed_at: new Date() },
        });
      }

      return { handle: next, pageStatus: "PUBLISHED", changed: true };
    });
  } catch (error) {
    // Two accounts raced for the same handle: the unique index decides
    if (isUniqueViolation(error)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: HANDLE_TAKEN_MESSAGE });
    }
    throw error;
  }
}

/**
 * Sets the owner's page to UNPUBLISHED. The page reads as not found and leaves
 * Explore and the sitemap. Followers and follows stay as they are.
 */
export async function unpublishPage(userId: number): Promise<PageVisibilityResult> {
  await limitVisibilityWrites(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { handle: true, page_status: true },
  });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });

  if (user.page_status === "UNPUBLISHED") {
    return { handle: user.handle ?? "", pageStatus: "UNPUBLISHED", changed: false };
  }
  await prisma.user.update({ where: { id: userId }, data: { page_status: "UNPUBLISHED" } });
  return { handle: user.handle ?? "", pageStatus: "UNPUBLISHED", changed: true };
}
