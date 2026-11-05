import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@repo/database";
import {
  BROADCAST_AUDIENCES,
  BROADCAST_LIMITS,
  BROADCAST_UI,
  EMAIL_VERIFICATION_GRACE_BROADCASTS,
  audienceHasPool,
  checkBroadcastContent,
} from "@repo/constants";
import { privateProcedure, router } from "../trpc";
import { countSentBroadcasts, enqueueBroadcast, getQuota } from "../../services/broadcast";
import { audienceCounts, resolveAudience } from "../../services/broadcast/audience";
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

/** The caller's own pool on this chain, or null. */
function poolOn(userId: number, chainId: string) {
  return prisma.creatorPool.findFirst({
    where: { chainId, wallet: { userId } },
    select: { id: true, name: true },
  });
}

/**
 * broadcast.creator: the composer and sent list (Inbox, Broadcast tab; M9). Spec
 * docs/features/messaging.md 7.5 and 8.6. Any creator with followers or a pool can send.
 * Every procedure resolves the pool from the caller's own wallet, so a creator can only
 * reach their own broadcasts and their own stakers.
 */
export const broadcastCreatorRouter = router({
  /** Everything the Broadcasts tab needs to decide what to show. */
  overview: privateProcedure
    .input(z.object({ chainId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      const pool = await poolOn(userId, input.chainId);
      const [quota, status, user, sentTotal, counts, last] = await Promise.all([
        getQuota(userId),
        prisma.broadcastSenderStatus.findUnique({ where: { userId } }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email_verified: true, created_at: true },
        }),
        countSentBroadcasts(userId),
        audienceCounts(userId, pool?.id ?? null),
        prisma.broadcast.findFirst({
          where: { creatorUserId: userId },
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, status: true, audienceKind: true, createdAt: true },
        }),
      ]);
      // Verification grace (Rob, 2026-10-10): a new creator sends without a
      // verified email for 30 days or EMAIL_VERIFICATION_GRACE_BROADCASTS sends
      const verification = verificationGate(
        // created_at at the epoch fails closed: an unknown user never rides the grace period
        user ?? { email_verified: false, created_at: new Date(0) },
        { milestoneReached: sentTotal >= EMAIL_VERIFICATION_GRACE_BROADCASTS }
      );
      return {
        pool,
        // Pool stakers, kept under its old name for the My Pool card
        members: counts.pool,
        counts,
        last,
        quota,
        creatorName: user?.name ?? "",
        emailVerified: verification.verified,
        verification,
        graceSendsLeft: verification.verified
          ? null
          : Math.max(0, EMAIL_VERIFICATION_GRACE_BROADCASTS - sentTotal),
        // The invite pilot ended in PR M2 (msg-invite); pauses still stop sending
        canSend: !status?.pausedAt,
        paused: !!status?.pausedAt,
      };
    }),

  /** Same check the composer runs as the creator types. Warn only. */
  checkContent: privateProcedure
    .input(z.object({ title: z.string().max(500), body: z.string().max(20000) }))
    .query(({ input }) => ({ flags: checkBroadcastContent(input.title, input.body) })),

  /** Pool stakers, followers, and both deduplicated (spec 7.5). */
  audienceCounts: privateProcedure
    .input(z.object({ chainId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pool = await poolOn(ctx.user!.sub, input.chainId);
      return { hasPool: !!pool, ...(await audienceCounts(ctx.user!.sub, pool?.id ?? null)) };
    }),

  send: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
        /** M9: pool stakers, followers, or both. Older clients send no audience. */
        audience: z.enum(BROADCAST_AUDIENCES).default("POOL_MEMBERS"),
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

      // The pool is needed only when the audience includes it (M9)
      const pool = audienceHasPool(input.audience) ? await ownedPool(userId, input.chainId) : null;
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
      // Two concurrent sends can both read the count before either enqueues, so the
      // 3rd send can occasionally become a 4th. Bounded by the quota; do not "fix"
      // with a transaction without knowing this is accepted.
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
      if (status?.pausedAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Broadcasting is paused for your account while Amped reviews it.",
        });
      }
      // Early answer for the common case. The binding check runs again below,
      // under a lock, right before the insert.
      if (quota.leftToday <= 0) throw quotaExceeded(quota);

      const audience = await resolveAudience(input.audience, userId, pool?.id ?? null);
      const recipients = audience.userIds.length;
      if (recipients === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: BROADCAST_UI.emptyAudience[input.audience],
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
              poolId: pool?.id ?? null,
              audienceKind: input.audience,
              title: input.title,
              body: input.body,
              idempotencyKey: input.idempotencyKey,
              flaggedTerms: flags.length ? storedFlags(flags) : undefined,
              status: firstSend ? "IN_REVIEW" : "QUEUED",
              reviewReason: firstSend ? "first_send" : null,
              queuedAt: firstSend ? null : now,
              recipientEstimate: recipients,
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

  /** The creator's broadcasts to every audience, newest first, with totals (M9). */
  list: privateProcedure
    .input(z.object({ chainId: z.string().optional() }).optional())
    .query(async ({ ctx }) => {
      const userId = ctx.user!.sub;
      const rows = await prisma.broadcast.findMany({
        where: { creatorUserId: userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          status: true,
          audienceKind: true,
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
          audienceKind: true,
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
