import { z } from "zod";
import { prisma } from "@repo/database";
import { router, privateProcedure } from "./trpc";
import { hexToId } from "../services/analytics/ids";
import {
  listBell,
  markSeen,
  messageNotificationPrefs,
  setMessageNotificationPrefs,
  unseenCount,
} from "../services/notifications/bell";

const hexId = z.string().regex(/^[0-9a-f]{32}$/);

/**
 * The bell (Amped Messages #2 r4, PR M4, spec 7.4 item 1) and account notification
 * settings. RNS name reminders are on unless turned off;
 * the setting lives on the global NotificationPreference row (creatorUserId 0).
 */
export const notificationsRouter = router({
  /** Latest 20 bell rows, newest first, with the actor's name and handle. */
  list: privateProcedure.query(({ ctx }) => listBell(ctx.user!.sub)),

  /** Unseen rows for the bell badge, capped at 100 (the badge shows 99+). */
  unseenCount: privateProcedure.query(async ({ ctx }) => ({
    count: await unseenCount(ctx.user!.sub),
  })),

  /** Mark rows seen; no ids marks every unseen row (opening the bell). */
  markSeen: privateProcedure
    .input(z.object({ ids: z.array(hexId).max(50).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      await markSeen(ctx.user!.sub, input?.ids?.map(hexToId));
      return { ok: true };
    }),

  /** Message push and reminder emails (Account, Messages). */
  messagePrefs: privateProcedure.query(({ ctx }) => messageNotificationPrefs(ctx.user!.sub)),

  setMessagePrefs: privateProcedure
    .input(z.object({ push: z.boolean().optional(), email: z.boolean().optional() }))
    .mutation(({ ctx, input }) => setMessageNotificationPrefs(ctx.user!.sub, input)),

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
