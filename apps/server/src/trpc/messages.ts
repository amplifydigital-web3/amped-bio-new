import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@repo/database";
import {
  MESSAGE_LIMITS,
  MESSAGE_REFUSALS,
  MESSAGE_RULE_KINDS,
  type MessageRefusalReason,
} from "@repo/constants";
import { privateProcedure, router } from "./trpc";
import { enforceRateLimits } from "../utils/rateLimit";
import { hexToId, idToHex } from "../services/analytics/ids";
import {
  DirectInputError,
  DirectRefusal,
  acceptRequest,
  canSendDirect,
  clearForMe,
  conversationPage,
  deleteRequest,
  directSettings,
  listConversations,
  markRead,
  report,
  searchPeople,
  sendDirect,
  setArchived,
  setBlocked,
  setMuted,
  unreadSummary,
  unsend,
} from "../services/messaging/direct";

/**
 * messages.* (Build Board #2 r4, PR M2, spec 7.5). Amped Messages for every signed in
 * account. Ids reach clients as 32 character hex (UUID v7). Message bodies are never
 * logged. Realtime events (M3) and push and email (M4) hook in after each mutation.
 */

const idSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/, "Invalid id")
  .transform(hexToId);

const INPUT_COPY: Record<DirectInputError["code"], { code: TRPCError["code"]; message: string }> = {
  empty: { code: "BAD_REQUEST", message: "Write a message first." },
  too_long: {
    code: "BAD_REQUEST",
    message: `Messages can be up to ${MESSAGE_LIMITS.bodyMax.toLocaleString("en-US")} characters.`,
  },
  not_found: { code: "NOT_FOUND", message: "This conversation is not available." },
  unsend_window: {
    code: "PRECONDITION_FAILED",
    message: `You can unsend a message for ${MESSAGE_LIMITS.unsendWindowMinutes} minutes after sending it.`,
  },
  not_yours: { code: "FORBIDDEN", message: "You can only unsend your own messages." },
};

async function handleOf(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { handle: true } });
  return user?.handle ?? "this account";
}

export function refusalText(reason: MessageRefusalReason, handle: string) {
  return MESSAGE_REFUSALS[reason](handle);
}

/** Map service errors to tRPC errors with product copy. Rethrows anything else. */
async function toTrpc(error: unknown, recipientId?: number): Promise<never> {
  if (error instanceof DirectRefusal) {
    const handle = recipientId === undefined ? "this account" : await handleOf(recipientId);
    throw new TRPCError({
      code: error.reason === "sender_cap" ? "TOO_MANY_REQUESTS" : "FORBIDDEN",
      message: refusalText(error.reason, handle),
      cause: error,
    });
  }
  if (error instanceof DirectInputError) {
    throw new TRPCError({ ...INPUT_COPY[error.code], cause: error });
  }
  throw error;
}

async function guard<T>(fn: () => Promise<T>, recipientId?: number): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return toTrpc(error, recipientId);
  }
}

async function recipientByHandle(handle: string) {
  const user = await prisma.user.findFirst({
    where: { handle: handle.replace(/^@/, "").toLowerCase() },
    select: { id: true, name: true, handle: true },
  });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "No account with that handle." });
  return user;
}

const folderSchema = z.enum(["PRIMARY", "REQUESTS"]);
const conversationInput = z.object({ conversationId: idSchema });

export const messagesRouter = router({
  /** Inbox list for Primary or Requests, newest first. */
  list: privateProcedure
    .input(
      z.object({
        folder: folderSchema.default("PRIMARY"),
        archived: z.boolean().default(false),
        filter: z.enum(["all", "unread", "members", "poolFans", "followers"]).default("all"),
        cursor: z.string().datetime().nullish(),
      })
    )
    .query(({ ctx, input }) => listConversations({ userId: ctx.user!.sub, ...input })),

  /** One page of a conversation, newest first. */
  get: privateProcedure
    .input(z.object({ conversationId: idSchema, before: idSchema.nullish() }))
    .query(({ ctx, input }) =>
      guard(() =>
        conversationPage({
          userId: ctx.user!.sub,
          conversationId: input.conversationId,
          before: input.before ?? null,
        })
      )
    ),

  /** Unread conversations (rail badge) and the Requests count. */
  unread: privateProcedure.query(({ ctx }) => unreadSummary(ctx.user!.sub)),

  /** May I message @handle, and where would it land? Never reveals a stake amount. */
  canMessage: privateProcedure
    .input(z.object({ handle: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const recipient = await recipientByHandle(input.handle);
      const verdict = await canSendDirect(ctx.user!.sub, recipient.id);
      if (verdict.allowed) {
        return {
          allowed: true as const,
          folder: verdict.folder,
          conversationId: verdict.conversationId ? idToHex(verdict.conversationId) : null,
          person: recipient,
        };
      }
      return {
        allowed: false as const,
        reason: verdict.reason,
        message: refusalText(verdict.reason, recipient.handle ?? "this account"),
        person: recipient,
      };
    }),

  /** Send one message. A repeat with the same idempotency key returns the first. */
  send: privateProcedure
    .input(
      z
        .object({
          to: z.string().min(1).max(64).optional(),
          conversationId: idSchema.optional(),
          body: z
            .string()
            .min(1)
            .max(MESSAGE_LIMITS.bodyMax + 200),
          idempotencyKey: z.string().min(8).max(64).optional(),
        })
        .refine(v => !!v.to !== !!v.conversationId, "Give a handle or a conversation, not both.")
    )
    .mutation(async ({ ctx, input }) => {
      const senderId = ctx.user!.sub;
      await enforceRateLimits(
        [{ key: `msg-send:${senderId}`, limit: 30, windowSeconds: 60 }],
        "Too many messages at once. Wait a minute."
      );
      let recipientId: number;
      if (input.to) {
        recipientId = (await recipientByHandle(input.to)).id;
      } else {
        const other = await prisma.conversationMember.findFirst({
          where: {
            conversationId: input.conversationId!,
            userId: { not: senderId },
            conversation: { members: { some: { userId: senderId } } },
          },
          select: { userId: true },
        });
        if (!other) throw new TRPCError(INPUT_COPY.not_found);
        recipientId = other.userId;
      }
      const sent = await guard(
        () =>
          sendDirect({
            senderId,
            recipientId,
            body: input.body,
            idempotencyKey: input.idempotencyKey,
          }),
        recipientId
      );
      return {
        messageId: idToHex(sent.messageId),
        conversationId: idToHex(sent.conversationId),
        folder: sent.folder,
        repeat: sent.repeat,
        // Warn only: the composer shows the financial promise notice (spec 4.4 item 4)
        flagged: sent.flaggedTerms.length > 0,
      };
    }),

  accept: privateProcedure
    .input(conversationInput)
    .mutation(({ ctx, input }) => guard(() => acceptRequest(ctx.user!.sub, input.conversationId))),

  deleteRequest: privateProcedure
    .input(conversationInput)
    .mutation(({ ctx, input }) => guard(() => deleteRequest(ctx.user!.sub, input.conversationId))),

  read: privateProcedure
    .input(z.object({ conversationId: idSchema, messageId: idSchema.nullish() }))
    .mutation(({ ctx, input }) =>
      guard(() => markRead(ctx.user!.sub, input.conversationId, input.messageId ?? null))
    ),

  unsend: privateProcedure
    .input(z.object({ messageId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const result = await guard(() => unsend(ctx.user!.sub, input.messageId));
      return { conversationId: idToHex(result.conversationId) };
    }),

  /** Delete for me: hides the history up to now for the caller only. */
  clear: privateProcedure
    .input(conversationInput)
    .mutation(({ ctx, input }) => guard(() => clearForMe(ctx.user!.sub, input.conversationId))),

  mute: privateProcedure
    .input(
      z.object({
        conversationId: idSchema,
        hours: z.union([z.literal(8), z.literal(168)]).nullable(),
      })
    )
    .mutation(({ ctx, input }) => {
      // null mutes until unmuted: stored as a far date so one column covers both
      const until =
        input.hours === null
          ? new Date("9999-12-31T00:00:00Z")
          : new Date(Date.now() + input.hours * 3600_000);
      return guard(() => setMuted(ctx.user!.sub, input.conversationId, until));
    }),

  unmute: privateProcedure
    .input(conversationInput)
    .mutation(({ ctx, input }) => guard(() => setMuted(ctx.user!.sub, input.conversationId, null))),

  archive: privateProcedure
    .input(z.object({ conversationId: idSchema, archived: z.boolean() }))
    .mutation(({ ctx, input }) =>
      guard(() => setArchived(ctx.user!.sub, input.conversationId, input.archived))
    ),

  block: privateProcedure.input(conversationInput).mutation(async ({ ctx, input }) => {
    await guard(() => setBlocked(ctx.user!.sub, input.conversationId, true));
    return { ok: true };
  }),

  unblock: privateProcedure.input(conversationInput).mutation(async ({ ctx, input }) => {
    await guard(() => setBlocked(ctx.user!.sub, input.conversationId, false));
    return { ok: true };
  }),

  report: privateProcedure
    .input(
      z.object({
        conversationId: idSchema,
        messageId: idSchema.optional(),
        reason: z.enum(["SPAM", "HARASSMENT", "FINANCIAL_PROMISE", "OTHER"]),
        note: z.string().max(500).optional(),
        alsoBlock: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimits(
        [{ key: `msg-report:${ctx.user!.sub}`, limit: 10, windowSeconds: 86_400 }],
        "You have sent the most reports allowed today. Try again tomorrow."
      );
      await guard(() => report({ userId: ctx.user!.sub, ...input }));
      return { ok: true };
    }),

  /** People search over the caller's conversations. Message text is searched client side. */
  search: privateProcedure
    .input(z.object({ q: z.string().min(2).max(64) }))
    .query(async ({ ctx, input }) => {
      await enforceRateLimits(
        [{ key: `msg-search:${ctx.user!.sub}`, limit: 60, windowSeconds: 60 }],
        "Too many searches at once. Wait a minute."
      );
      return searchPeople(ctx.user!.sub, input.q);
    }),

  settings: router({
    get: privateProcedure.query(({ ctx }) => directSettings(ctx.user!.sub)),
    set: privateProcedure
      .input(
        z.object({
          // Paid members arrive with Memberships (#25); refused until then
          ruleKind: z
            .enum(MESSAGE_RULE_KINDS)
            .refine(k => k !== "PAID_MEMBER", "Memberships are not live yet."),
          stakeMin: z
            .string()
            .regex(/^\d+(\.\d{1,18})?$/)
            .nullish(),
          dailyNewThreadCap: z
            .number()
            .int()
            .min(1)
            .max(MESSAGE_LIMITS.dailyNewThreadCapMax)
            .optional(),
          readReceipts: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user!.sub;
        if (input.ruleKind === "STAKE_MIN" && !input.stakeMin) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Set a minimum stake." });
        }
        const data = {
          ruleKind: input.ruleKind,
          stakeMin: input.ruleKind === "STAKE_MIN" ? input.stakeMin! : null,
          ...(input.dailyNewThreadCap !== undefined
            ? { dailyNewThreadCap: input.dailyNewThreadCap }
            : {}),
          ...(input.readReceipts !== undefined ? { readReceipts: input.readReceipts } : {}),
        };
        await prisma.messagingSettings.upsert({
          where: { userId },
          create: { userId, ...data },
          update: data,
        });
        return directSettings(userId);
      }),
  }),
});
