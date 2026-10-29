/**
 * Playback position per account (Fan Library #26 phase A, spec 3.4). The shared
 * player writes every 10 seconds of play, on pause and when the page hides; any
 * device the fan signs in on resumes from it.
 *
 * Writes from a viewer who may not open the item are ignored, not refused, so a
 * fan who lost access mid play gets no error loop. Reads never say whether an
 * item exists: an unknown or closed item simply has no position.
 */
import { TRPCError } from "@trpc/server";
import { prisma } from "@repo/database";
import {
  CONTENT_PROGRESS,
  contentPlayCompleted,
  contentProgressGetSchema,
  contentProgressSetSchema,
  type ContentProgress,
} from "@repo/constants";
import { privateProcedure, router } from "./trpc";
import { hitRateLimit } from "../utils/rateLimit";
import { uuidv7 } from "../utils/uuid-v7";
import { openDecision } from "../services/content/access";

export const progressRouter = router({
  get: privateProcedure
    .input(contentProgressGetSchema)
    .query(async ({ ctx, input }): Promise<ContentProgress | null> => {
      const item = await prisma.contentItem.findUnique({
        where: { publicId: input.publicId },
        select: { id: true },
      });
      if (!item) return null;
      const row = await prisma.viewerProgress.findUnique({
        where: { userId_contentItemId: { userId: ctx.user!.sub, contentItemId: item.id } },
      });
      if (!row) return null;
      return {
        positionMs: row.positionMs,
        durationMs: row.durationMs,
        completed: row.completed,
        updatedAt: row.updatedAt.toISOString(),
      };
    }),

  set: privateProcedure.input(contentProgressSetSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    const hits = await hitRateLimit(`progress:${userId}:${input.publicId}`, 60);
    if (hits > CONTENT_PROGRESS.setPerMinute) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Try again in a minute.",
      });
    }

    const item = await prisma.contentItem.findUnique({
      where: { publicId: input.publicId },
      include: { user: { select: { page_status: true, block: true } } },
    });
    if (!item || !openDecision(item, item.user, { userId })) return { saved: false };

    const durationMs = input.durationMs ?? item.durationMs ?? null;
    const positionMs = durationMs ? Math.min(input.positionMs, durationMs) : input.positionMs;
    const completed = input.completed || contentPlayCompleted(positionMs, durationMs);
    const now = new Date();
    await prisma.viewerProgress.upsert({
      where: { userId_contentItemId: { userId, contentItemId: item.id } },
      create: {
        id: uuidv7(),
        userId,
        contentItemId: item.id,
        positionMs,
        durationMs,
        completed,
        lastPlayedAt: now,
      },
      update: { positionMs, durationMs, completed, lastPlayedAt: now },
    });
    return { saved: true };
  }),
});
