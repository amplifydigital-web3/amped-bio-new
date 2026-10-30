import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@repo/database";
import { DM_RULE_KINDS, TELEGRAM_APP_STRINGS, TELEGRAM_LIMITS } from "@repo/constants";
import { privateProcedure, router } from "../trpc";
import { env } from "../../env";
import { enforceRateLimits } from "../../utils/rateLimit";
import { getCreatorSettings } from "../../services/messaging/access";
import {
  creatorBlock,
  creatorMute,
  creatorThread,
  creatorUnblock,
  markRead,
  reportThread,
  sendCreatorReply,
} from "../../services/messaging/threads";
import {
  fanViews,
  listCreatorThreads,
  threadMessages,
  unreadTotals,
} from "../../services/messaging/views";
import { findByUserId, isReachable } from "../../services/telegram/accounts";
import { creatorPoolIds } from "../../services/telegram/rules";
import { emitTelegramEvent } from "../../services/telegram/events";
import { idToHex } from "../../services/analytics/ids";
import {
  bodySchema,
  cursorSchema,
  idSchema,
  idempotencyKeySchema,
  reportSchema,
  toTrpcError,
} from "./shared";

const E = TELEGRAM_APP_STRINGS.messagingSettingsErrors;

function precondition(message: string) {
  return new TRPCError({ code: "PRECONDITION_FAILED", message });
}

/**
 * messaging.creator (Build Board #2, spec 3.4): the creator's Fan messages settings
 * (tg3, row 114) and inbox (tg2, row 113). Every procedure acts on the caller's own
 * settings and threads.
 */
export const messagingCreatorRouter = router({
  /** Settings and what is missing to turn Fan messages on. */
  getSettings: privateProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.sub;
    const [settings, user, account, poolIds] = await Promise.all([
      getCreatorSettings(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: { page_status: true, email_verified: true },
      }),
      findByUserId(userId),
      creatorPoolIds(userId),
    ]);
    return {
      enabled: settings?.enabled ?? false,
      ruleKind: settings?.ruleKind ?? "FOLLOWER",
      stakeMin: settings?.stakeMin ?? null,
      dailyNewThreadCap: settings?.dailyNewThreadCap ?? TELEGRAM_LIMITS.dailyNewThreadCapDefault,
      replyFromTelegram: settings?.replyFromTelegram ?? true,
      paused: !!settings?.pausedAt,
      requirements: {
        published: user?.page_status === "PUBLISHED",
        emailVerified: !!user?.email_verified,
        telegramLinked: !!account,
        telegramReachable: isReachable(account),
        hasPool: poolIds.length > 0,
        invited: !env.MESSAGING_INVITE_ONLY || !!settings?.invitedAt,
      },
    };
  }),

  setSettings: privateProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        ruleKind: z.enum(DM_RULE_KINDS),
        stakeMin: z
          .string()
          .regex(/^\d{1,30}$/)
          .nullish(),
        dailyNewThreadCap: z
          .number()
          .int()
          .min(1)
          .max(TELEGRAM_LIMITS.dailyNewThreadCapMax)
          .optional(),
        replyFromTelegram: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      const [settings, user, account, poolIds] = await Promise.all([
        getCreatorSettings(userId),
        prisma.user.findUnique({
          where: { id: userId },
          select: { page_status: true, email_verified: true },
        }),
        findByUserId(userId),
        creatorPoolIds(userId),
      ]);
      const replyFromTelegram = input.replyFromTelegram ?? settings?.replyFromTelegram ?? true;

      if (input.ruleKind === "PAID_MEMBER") throw precondition(E.paidMembers);
      if ((input.ruleKind === "POOL_MEMBER" || input.ruleKind === "STAKE_MIN") && !poolIds.length) {
        throw precondition(E.needsPool);
      }
      const stakeMin =
        input.ruleKind === "STAKE_MIN" ? (input.stakeMin ?? "").replace(/^0+/, "") : null;
      if (input.ruleKind === "STAKE_MIN" && !stakeMin) throw precondition(E.stakeMin);

      // Spec 3.8: a published page, a verified email and a linked Telegram to turn it on
      if (input.enabled) {
        if (user?.page_status !== "PUBLISHED") throw precondition(E.notPublished);
        if (!user?.email_verified) throw precondition(E.emailNotVerified);
        if (!account) throw precondition(E.notLinked);
        // Linked, but Start was never pressed in the bot or the bot is blocked
        if (replyFromTelegram && !isReachable(account)) throw precondition(E.botNotStarted);
        if (env.MESSAGING_INVITE_ONLY && !settings?.invitedAt) throw precondition(E.notInvited);
        if (settings?.pausedAt) throw precondition(E.paused);
      }

      const data = {
        enabled: input.enabled,
        ruleKind: input.ruleKind,
        stakeMin,
        dailyNewThreadCap:
          input.dailyNewThreadCap ??
          settings?.dailyNewThreadCap ??
          TELEGRAM_LIMITS.dailyNewThreadCapDefault,
        replyFromTelegram,
      };
      await prisma.creatorMessagingSettings.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      if (settings?.ruleKind !== input.ruleKind || settings?.enabled !== input.enabled) {
        emitTelegramEvent("dm_rule_set", { rule_kind: input.ruleKind, enabled: input.enabled });
      }
      return { ok: true };
    }),

  listThreads: privateProcedure
    .input(
      z.object({
        filter: z.enum(["all", "unread", "blocked"]).default("all"),
        cursor: cursorSchema,
      })
    )
    .query(({ ctx, input }) => listCreatorThreads(ctx.user!.sub, input)),

  unreadCount: privateProcedure.query(async ({ ctx }) => {
    return { count: (await unreadTotals(ctx.user!.sub)).asCreator };
  }),

  /** One thread, newest messages, and marks it read for the creator. */
  getThread: privateProcedure
    .input(z.object({ threadId: idSchema, before: cursorSchema }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      try {
        const thread = await creatorThread(userId, input.threadId);
        const [page, fans] = await Promise.all([
          threadMessages(thread.id, input.before),
          fanViews(userId, [thread.fanUserId]),
        ]);
        if (!input.before) await markRead("creator", thread.id);
        return {
          id: idToHex(thread.id),
          status: thread.status,
          muted: !!thread.mutedUntil && thread.mutedUntil > new Date(),
          fan: fans.get(thread.fanUserId) ?? null,
          ...page,
        };
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  reply: privateProcedure
    .input(z.object({ threadId: idSchema, body: bodySchema, idempotencyKey: idempotencyKeySchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      await enforceRateLimits(
        [{ key: `dm-reply:${userId}`, limit: 60, windowSeconds: 60 }],
        "Too many replies at once. Wait a minute."
      );
      try {
        const { message } = await sendCreatorReply({
          creatorUserId: userId,
          threadId: input.threadId,
          body: input.body,
          channel: "WEB",
          idempotencyKey: input.idempotencyKey,
        });
        return { id: idToHex(message.id), createdAt: message.createdAt };
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  block: privateProcedure
    .input(z.object({ threadId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        await creatorBlock(ctx.user!.sub, input.threadId);
        return { ok: true };
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  unblock: privateProcedure
    .input(z.object({ threadId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        await creatorUnblock(ctx.user!.sub, input.threadId);
        return { ok: true };
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  /** days 0 unmutes. */
  mute: privateProcedure
    .input(
      z.object({ threadId: idSchema, days: z.union([z.literal(0), z.literal(7), z.literal(30)]) })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await creatorMute(ctx.user!.sub, input.threadId, input.days);
        return { ok: true };
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  report: privateProcedure.input(reportSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    await enforceRateLimits(
      [{ key: `dm-report:${userId}`, limit: 20, windowSeconds: 3600 }],
      "Too many reports. Try again later."
    );
    try {
      await creatorThread(userId, input.threadId);
      await reportThread({ reporterUserId: userId, ...input });
      return { ok: true };
    } catch (error) {
      return toTrpcError(error);
    }
  }),
});
