import { z } from "zod";
import { prisma } from "@repo/database";
import { router, privateProcedure } from "./trpc";

/**
 * Account notification settings. RNS name reminders are on unless turned off;
 * the setting lives on the global NotificationPreference row (creatorUserId 0).
 */
export const notificationsRouter = router({
  rnsReminders: privateProcedure.query(async ({ ctx }) => {
    const row = await prisma.notificationPreference.findUnique({
      where: { userId_creatorUserId: { userId: ctx.user!.sub, creatorUserId: 0 } },
      select: { rnsRemindersEnabled: true },
    });
    return { enabled: row?.rnsRemindersEnabled !== false };
  }),

  setRnsReminders: privateProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      await prisma.notificationPreference.upsert({
        where: { userId_creatorUserId: { userId, creatorUserId: 0 } },
        create: { userId, creatorUserId: 0, rnsRemindersEnabled: input.enabled },
        update: { rnsRemindersEnabled: input.enabled },
      });
      return { enabled: input.enabled };
    }),
});
