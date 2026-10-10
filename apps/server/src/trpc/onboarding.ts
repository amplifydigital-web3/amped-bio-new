import { z } from "zod";
import { privateProcedure, router } from "./trpc";
import { prisma } from "@repo/database";
import { uuidv7 } from "../utils/uuid-v7";
import { graceEndsAt } from "../utils/verificationGrace";

/**
 * First run setup checklist on Home (Screen Review 015 I08). The URL, share,
 * dismissed and completed moments live on `user_onboarding`; the photo, block
 * and theme steps derive from the user's own data, so progress follows the
 * creator across devices and is never kept in browser storage.
 */

// Accounts created before the checklist shipped get a record on first read.
// Their URL counts as confirmed, so only the steps they have not done show.
async function getOrCreateRecord(userId: number) {
  const existing = await prisma.userOnboarding.findUnique({ where: { user_id: userId } });
  if (existing) return existing;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { created_at: true },
  });
  return prisma.userOnboarding.upsert({
    where: { user_id: userId },
    create: {
      id: uuidv7(),
      user_id: userId,
      url_confirmed_at: user?.created_at ?? new Date(),
    },
    update: {},
  });
}

const PUBLISH_CARD_SNOOZE_DAYS = 30;

export function isPublishCardSnoozed(dismissedAt: Date | null, now = new Date()): boolean {
  if (!dismissedAt) return false;
  return now.getTime() - dismissedAt.getTime() < PUBLISH_CARD_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
}

async function readStatus(userId: number) {
  const [record, user, blockCount] = await Promise.all([
    getOrCreateRecord(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        handle: true,
        email: true,
        email_verified: true,
        created_at: true,
        image: true,
        image_file_id: true,
        theme: true,
        page_status: true,
      },
    }),
    prisma.block.count({ where: { user_id: userId } }),
  ]);

  const steps = {
    url: !!record.url_confirmed_at,
    photo: !!user?.image_file_id || !!user?.image,
    block: blockCount > 0,
    theme: !!user?.theme,
    share: !!record.shared_at,
  };
  const allDone = Object.values(steps).every(Boolean);

  // The checklist retires the first time every step is done (015 I10)
  let completedAt = record.completed_at;
  if (allDone && !completedAt) {
    completedAt = new Date();
    await prisma.userOnboarding.update({
      where: { user_id: userId },
      data: { completed_at: completedAt },
    });
  }

  return {
    handle: user?.handle ?? "",
    email: user?.email ?? "",
    emailVerified: !!user?.email_verified,
    // Verification grace (Rob, 2026-10-10): when an unverified account must
    // verify to keep using gated features. Null once verified.
    verifyBy: user && !user.email_verified ? graceEndsAt(user).toISOString() : null,
    steps,
    dismissed: !!record.checklist_dismissed_at,
    // True only on the visit that finished the last step; later visits hide it
    justCompleted: allDone && !record.completed_at,
    completed: !!completedAt,
    analyticsCardDismissed: !!record.analytics_card_dismissed_at,
    // QA-008: an unpublished page shows the Make your own page card instead of
    // the checklist. Not now hides the card for PUBLISH_CARD_SNOOZE_DAYS.
    pageStatus: user?.page_status ?? "PUBLISHED",
    publishCardDismissed: isPublishCardSnoozed(record.publish_card_dismissed_at),
  };
}

const markInput = z.object({
  moment: z.enum([
    "urlConfirmed",
    "shared",
    "checklistDismissed",
    "analyticsCardDismissed",
    "publishCardDismissed",
  ]),
  // Undo of Hide checklist clears the moment instead of setting it
  clear: z.boolean().optional(),
});

const COLUMN = {
  urlConfirmed: "url_confirmed_at",
  shared: "shared_at",
  checklistDismissed: "checklist_dismissed_at",
  analyticsCardDismissed: "analytics_card_dismissed_at",
  publishCardDismissed: "publish_card_dismissed_at",
} as const;

export const onboardingRouter = router({
  status: privateProcedure.query(({ ctx }) => readStatus(ctx.user!.sub)),

  mark: privateProcedure.input(markInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    await getOrCreateRecord(userId);
    await prisma.userOnboarding.update({
      where: { user_id: userId },
      data: { [COLUMN[input.moment]]: input.clear ? null : new Date() },
    });
    return readStatus(userId);
  }),
});
