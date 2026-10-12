import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@repo/database";
import { privateProcedure, router } from "../trpc";
import { enforceRateLimits } from "../../utils/rateLimit";
import { canMessage } from "../../services/messaging/access";
import {
  fanBlock,
  fanThread,
  fanUnblock,
  markRead,
  reportThread,
  sendFanMessage,
} from "../../services/messaging/threads";
import {
  creatorViews,
  listFanThreads,
  threadMessages,
  unreadTotals,
} from "../../services/messaging/views";
import { idToHex } from "../../services/analytics/ids";
import {
  bodySchema,
  cursorSchema,
  idSchema,
  idempotencyKeySchema,
  refusalMessage,
  reportSchema,
  toTrpcError,
} from "./shared";

/**
 * messaging.fan (Build Board #2, spec 3.4): the fan's side of a conversation, for the
 * web inbox and the Message me button. The same door as the bot path.
 */
export const messagingFanRouter = router({
  /** Can the caller write to this creator now, and if not, why (copy included). */
  canMessage: privateProcedure
    .input(z.object({ creatorUserId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const creator = await prisma.user.findUnique({
        where: { id: input.creatorUserId },
        select: { name: true },
      });
      if (!creator) throw new TRPCError({ code: "NOT_FOUND", message: "Creator not found." });
      const verdict = await canMessage(ctx.user!.sub, input.creatorUserId);
      if (verdict.allowed) return { allowed: true as const, rule: verdict.rule };
      return {
        allowed: false as const,
        reason: verdict.reason,
        rule: verdict.rule,
        message: refusalMessage(verdict.reason, creator.name || "This creator"),
      };
    }),

  listThreads: privateProcedure
    .input(z.object({ cursor: cursorSchema }))
    .query(({ ctx, input }) => listFanThreads(ctx.user!.sub, input)),

  unreadCount: privateProcedure.query(async ({ ctx }) => {
    return { count: (await unreadTotals(ctx.user!.sub)).asFan };
  }),

  getThread: privateProcedure
    .input(z.object({ threadId: idSchema, before: cursorSchema }))
    .query(async ({ ctx, input }) => {
      try {
        const thread = await fanThread(ctx.user!.sub, input.threadId);
        const [page, creators] = await Promise.all([
          threadMessages(thread.id, input.before),
          creatorViews([thread.creatorUserId]),
        ]);
        if (!input.before) await markRead("fan", thread.id);
        // A failed copy to the fan's own Telegram is not the fan's concern on the web
        const messages = page.messages.map(({ failedReason: _failed, ...message }) => message);
        return {
          id: idToHex(thread.id),
          status: thread.status,
          creator: creators.get(thread.creatorUserId) ?? null,
          messages,
          olderCursor: page.olderCursor,
        };
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  send: privateProcedure
    .input(
      z.object({
        creatorUserId: z.number().int().positive(),
        body: bodySchema,
        idempotencyKey: idempotencyKeySchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      await enforceRateLimits(
        [{ key: `dm-send:${userId}`, limit: 30, windowSeconds: 60 }],
        "Too many messages at once. Wait a minute."
      );
      try {
        const { message, threadId } = await sendFanMessage({
          fanUserId: userId,
          creatorUserId: input.creatorUserId,
          body: input.body,
          channel: "WEB",
          idempotencyKey: input.idempotencyKey,
        });
        return {
          id: idToHex(message.id),
          threadId: idToHex(threadId),
          createdAt: message.createdAt,
        };
      } catch (error) {
        return toTrpcError(error, input.creatorUserId);
      }
    }),

  block: privateProcedure
    .input(z.object({ threadId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        await fanBlock(ctx.user!.sub, input.threadId);
        return { ok: true };
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  unblock: privateProcedure
    .input(z.object({ threadId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        await fanUnblock(ctx.user!.sub, input.threadId);
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
      await fanThread(userId, input.threadId);
      await reportThread({ reporterUserId: userId, ...input });
      return { ok: true };
    } catch (error) {
      return toTrpcError(error);
    }
  }),
});
