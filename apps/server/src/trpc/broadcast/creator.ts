import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@repo/database";
import {
  BROADCAST_LIMITS,
  EMAIL_VERIFICATION_GRACE_BROADCASTS,
  checkBroadcastContent,
} from "@repo/constants";
import { privateProcedure, router } from "../trpc";
import { env } from "../../env";
import {
  countMembers,
  countSentBroadcasts,
  enqueueBroadcast,
  getQuota,
} from "../../services/broadcast";
import { verificationGate } from "../../utils/verificationGrace";
import { bodySchema, ownedPool, storedFlags, titleSchema } from "./shared";

type Quota = Awaited<ReturnType<typeof getQuota>>;

function quotaExceeded(quota: Quota) {
  return new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message:
      quota.usedThisWeek >= BROADCAST_LIMITS.perWeek
        ? `You have sent ${BROADCAST_LIMITS.perWeek} broadcasts this week. You can send again in a few days.`
        : `You have sent ${BROADCAST_LIMITS.perDay} broadcasts today. You can send again tomorrow.`,
  });
}

/**
 * broadcast.creator: the pool owner's composer and sent list (My Pool,
 * Broadcasts tab). Spec section 3.4. Every procedure resolves the pool from
 * the caller's own wallet, so a creator can only reach their own broadcasts.
 */
export const broadcastCreatorRouter = router({
  /** Everything the Broadcasts tab needs to decide what to show. */
  overview: privateProcedure
    .input(z.object({ chainId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      const pool = await prisma.creatorPool.findFirst({
        where: { chainId: input.chainId, wallet: { userId } },
        select: { id: true, name: true },
      });
      const [quota, status, user, sentTotal] = await Promise.all([
        getQuota(userId),
        prisma.broadcastSenderStatus.findUnique({ where: { userId } }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email_verified: true, created_at: true },
        }),
        countSentBroadcasts(userId),
      ]);
      const members = pool ? await countMembers(pool.id, userId) : 0;
      // Verification grace (Rob, 2026-10-10): a new creator sends without a
      // verified email for 30 days or EMAIL_VERIFICATION_GRACE_BROADCASTS sends
      const verification = verificationGate(
        user ?? { email_verified: false, created_at: new Date() },
        { milestoneReached: sentTotal >= EMAIL_VERIFICATION_GRACE_BROADCASTS }
      );
      return {
        pool,
        members,
        quota,
        creatorName: user?.name ?? "",
        emailVerified: verification.verified,
        verification,
        graceSendsLeft: verification.verified
          ? null
          : Math.max(0, EMAIL_VERIFICATION_GRACE_BROADCASTS - sentTotal),
        // Pilot gate: the tab shows a waitlist line until an admin invites the owner
        canSend: !env.BROADCAST_INVITE_ONLY || !!status?.invitedAt,
        paused: !!status?.pausedAt,
      };
    }),

  /** Same check the composer runs as the creator types. Warn only. */
  checkContent: privateProcedure
    .input(z.object({ title: z.string().max(500), body: z.string().max(20000) }))
    .query(({ input }) => ({ flags: checkBroadcastContent(input.title, input.body) })),

  send: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
        title: titleSchema,
        body: bodySchema,
        idempotencyKey: z.string().min(8).max(64),
        /** The creator saw the word list warning and chose to send anyway */
        confirmFlags: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;

      // A repeat with the same key returns the first result (acceptance 4)
      const existing = await prisma.broadcast.findUnique({
        where: {
          creatorUserId_idempotencyKey: {
            creatorUserId: userId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: { id: true, status: true },
      });
      if (existing) return existing;

      const pool = await ownedPool(userId, input.chainId);
      const [user, status, quota, sentTotal] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { email_verified: true, block: true, created_at: true },
        }),
        prisma.broadcastSenderStatus.findUnique({ where: { userId } }),
        getQuota(userId),
        countSentBroadcasts(userId),
      ]);

      if (!user || user.block !== "no") {
        throw new TRPCError({ code: "FORBIDDEN", message: "This account cannot send broadcasts." });
      }
      // Verification grace (Rob, 2026-10-10): the email must be verified once
      // the account is 30 days old or has sent EMAIL_VERIFICATION_GRACE_BROADCASTS
      const verification = verificationGate(user, {
        milestoneReached: sentTotal >= EMAIL_VERIFICATION_GRACE_BROADCASTS,
      });
      if (verification.required) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            verification.reason === "milestone"
              ? `You have sent ${EMAIL_VERIFICATION_GRACE_BROADCASTS} broadcasts. Confirm your email to keep sending.`
              : "Confirm your email to send broadcasts.",
        });
      }
      if (env.BROADCAST_INVITE_ONLY && !status?.invitedAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Broadcasts are invite only for now." });
      }
      if (status?.pausedAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Broadcasting is paused for your account while Amped reviews it.",
        });
      }
      // Early answer for the common case. The binding check runs again below,
      // under a lock, right before the insert.
      if (quota.leftToday <= 0) throw quotaExceeded(quota);

      const members = await countMembers(pool.id, userId);
      if (members === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Your pool has no members yet.",
        });
      }

      // Warn only (Rob, 2026-10-04): a flag never holds the broadcast, but the
      // creator must have seen it and the phrases are kept for admin follow-up.
      const flags = checkBroadcastContent(input.title, input.body);
      if (flags.length > 0 && !input.confirmFlags) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Your message uses words from the broadcast word list. Review them before you send.",
        });
      }

      // Each creator's first broadcast is reviewed by an admin (spec decision 4)
      const firstSend = !status?.firstApprovedAt;
      const now = new Date();
      try {
        // QA-022: count and insert in one transaction while holding a row lock
        // on the sender's users row, so parallel sends from one creator run one
        // at a time and the second one sees the first one's row.
        const broadcast = await prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
          const fresh = await getQuota(userId, now, tx);
          if (fresh.leftToday <= 0) throw quotaExceeded(fresh);
          return tx.broadcast.create({
            data: {
              creatorUserId: userId,
              poolId: pool.id,
              audienceKind: "ALL_MEMBERS",
              title: input.title,
              body: input.body,
              idempotencyKey: input.idempotencyKey,
              flaggedTerms: flags.length ? storedFlags(flags) : undefined,
              status: firstSend ? "IN_REVIEW" : "QUEUED",
              reviewReason: firstSend ? "first_send" : null,
              queuedAt: firstSend ? null : now,
              recipientEstimate: members,
            },
            select: { id: true, status: true },
          });
        });
        if (broadcast.status === "QUEUED") enqueueBroadcast(broadcast.id);
        return broadcast;
      } catch (error) {
        // Two concurrent calls with one key: return the row the other call wrote.
        // This also covers the second call failing the locked quota check.
        const raced = await prisma.broadcast.findUnique({
          where: {
            creatorUserId_idempotencyKey: {
              creatorUserId: userId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          select: { id: true, status: true },
        });
        if (raced) return raced;
        throw error;
      }
    }),

  /** Withdraw a broadcast that is still waiting for review. */
  cancel: privateProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await prisma.broadcast.updateMany({
        where: { id: input.id, creatorUserId: ctx.user!.sub, status: "IN_REVIEW" },
        data: { status: "CANCELED" },
      });
      if (updated.count === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a broadcast waiting for review can be withdrawn.",
        });
      }
      return { ok: true };
    }),

  /** The creator's broadcasts for this pool, newest first, with totals. */
  list: privateProcedure.input(z.object({ chainId: z.string() })).query(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    const pool = await prisma.creatorPool.findFirst({
      where: { chainId: input.chainId, wallet: { userId } },
      select: { id: true },
    });
    if (!pool) return [];
    const rows = await prisma.broadcast.findMany({
      where: { creatorUserId: userId, poolId: pool.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        reviewReason: true,
        reviewNote: true,
        flaggedTerms: true,
        createdAt: true,
        completedAt: true,
        recipientEstimate: true,
        recipientCount: true,
        _count: { select: { reports: true } },
      },
    });
    return rows.map(({ _count, flaggedTerms, ...b }) => ({
      ...b,
      reports: _count.reports,
      flagged: !!flaggedTerms,
    }));
  }),

  /** Totals only (spec decision 7). Never who read or reported. */
  getStats: privateProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const b = await prisma.broadcast.findFirst({
        where: { id: input.id, creatorUserId: ctx.user!.sub },
        select: {
          id: true,
          title: true,
          body: true,
          status: true,
          reviewNote: true,
          flaggedTerms: true,
          createdAt: true,
          completedAt: true,
          recipientEstimate: true,
          recipientCount: true,
          pool: { select: { name: true } },
        },
      });
      if (!b) throw new TRPCError({ code: "NOT_FOUND", message: "Broadcast not found." });
      const [read, reports] = await Promise.all([
        prisma.broadcastDelivery.count({ where: { broadcastId: b.id, readAt: { not: null } } }),
        prisma.broadcastReport.count({ where: { broadcastId: b.id } }),
      ]);
      const { flaggedTerms, ...rest } = b;
      const flagged = Array.isArray(flaggedTerms)
        ? [
            ...new Set(
              flaggedTerms
                .map(f => String((f as { phrase?: unknown }).phrase ?? ""))
                .filter(Boolean)
            ),
          ]
        : [];
      return { ...rest, flagged, read, reports };
    }),
});
