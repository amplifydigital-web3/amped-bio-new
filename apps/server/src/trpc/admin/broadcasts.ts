import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma, prisma } from "@repo/database";
import { adminProcedure, router } from "../trpc";
import { checkRejectionThreshold, enqueueBroadcast, pauseSender } from "../../services/broadcast";

const listSelect = {
  id: true,
  title: true,
  body: true,
  status: true,
  reviewReason: true,
  reviewNote: true,
  flaggedTerms: true,
  createdAt: true,
  completedAt: true,
  recipientEstimate: true,
  recipientCount: true,
  creator: { select: { id: true, name: true, handle: true, email: true } },
  pool: { select: { id: true, name: true, chainId: true } },
  _count: { select: { reports: true } },
} as const;

/** Flag phrases as plain strings, so clients never see the raw JSON column. */
function shape<T extends { flaggedTerms: Prisma.JsonValue }>({ flaggedTerms, ...rest }: T) {
  const flags = Array.isArray(flaggedTerms)
    ? [
        ...new Set(
          flaggedTerms
            .map(f => String((f as { phrase?: unknown } | null)?.phrase ?? ""))
            .filter(Boolean)
        ),
      ]
    : [];
  return { ...rest, flags };
}

/** Another admin already acted on the broadcast, or it never was in review. */
function notInReview(action: "approved" | "rejected") {
  return new TRPCError({
    code: "CONFLICT",
    message: `Only a broadcast in review can be ${action}. It may have been reviewed already.`,
  });
}

/**
 * admin.broadcasts (spec section 3.4). Review of first sends, follow-up on
 * flagged sends (warn only), reports, and the invite-only pilot.
 */
export const broadcastsAdminRouter = router({
  /** First sends waiting for review. */
  reviewQueue: adminProcedure.query(async () =>
    (
      await prisma.broadcast.findMany({
        where: { status: "IN_REVIEW" },
        orderBy: { createdAt: "asc" },
        select: listSelect,
      })
    ).map(shape)
  ),

  /** Sent broadcasts that matched the word list. The creator confirmed and sent. */
  flagged: adminProcedure.query(async () =>
    (
      await prisma.broadcast.findMany({
        where: {
          flaggedTerms: { not: Prisma.DbNull },
          status: { in: ["SENDING", "SENT", "REJECTED"] },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: listSelect,
      })
    ).map(shape)
  ),

  /** Broadcasts with at least one report, with counts by reason. */
  reported: adminProcedure.query(async () => {
    const rows = await prisma.broadcast.findMany({
      where: { reports: { some: {} } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { ...listSelect, reports: { select: { reason: true, note: true, createdAt: true } } },
    });
    return rows.map(shape);
  }),

  approve: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      // Claim the row with a status guard so two admins cannot both approve
      // (or approve and reject) the same broadcast. QA-019.
      await prisma.$transaction(async tx => {
        const claimed = await tx.broadcast.updateMany({
          where: { id: input.id, status: "IN_REVIEW" },
          data: {
            status: "QUEUED",
            queuedAt: new Date(),
            reviewedById: ctx.user!.sub,
            reviewedAt: new Date(),
          },
        });
        if (claimed.count === 0) throw notInReview("approved");
        const b = await tx.broadcast.findUniqueOrThrow({
          where: { id: input.id },
          select: { creatorUserId: true },
        });
        await tx.broadcastSenderStatus.upsert({
          where: { userId: b.creatorUserId },
          create: { userId: b.creatorUserId, firstApprovedAt: new Date() },
          update: { firstApprovedAt: new Date() },
        });
      });
      enqueueBroadcast(input.id);
      return { ok: true };
    }),

  reject: adminProcedure
    .input(z.object({ id: z.number().int(), note: z.string().trim().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const updated = await prisma.broadcast.updateMany({
        where: { id: input.id, status: "IN_REVIEW" },
        data: {
          status: "REJECTED",
          reviewNote: input.note,
          reviewedById: ctx.user!.sub,
          reviewedAt: new Date(),
        },
      });
      if (updated.count === 0) throw notInReview("rejected");
      const b = await prisma.broadcast.findUnique({
        where: { id: input.id },
        select: { creatorUserId: true },
      });
      const paused = b ? await checkRejectionThreshold(b.creatorUserId) : false;
      return { ok: true, paused };
    }),

  /** Take a sent broadcast out of every inbox. The delivery rows stay for the record. */
  remove: adminProcedure
    .input(z.object({ id: z.number().int(), note: z.string().trim().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const updated = await prisma.broadcast.updateMany({
        where: { id: input.id, status: { in: ["SENDING", "SENT"] } },
        data: {
          status: "REJECTED",
          reviewNote: input.note,
          reviewedById: ctx.user!.sub,
          reviewedAt: new Date(),
        },
      });
      if (updated.count === 0)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a sent broadcast can be removed.",
        });
      return { ok: true };
    }),

  senders: adminProcedure.query(async () => {
    const rows = await prisma.broadcastSenderStatus.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    const users = await prisma.user.findMany({
      where: { id: { in: rows.map(r => r.userId) } },
      select: { id: true, name: true, handle: true, email: true },
    });
    const byId = new Map(users.map(u => [u.id, u]));
    return rows.map(r => ({ ...r, user: byId.get(r.userId) ?? null }));
  }),

  /** Invite a pool owner to the pilot, by handle or email. */
  invite: adminProcedure
    .input(z.object({ who: z.string().trim().min(1) }))
    .mutation(async ({ input }) => {
      const who = input.who.replace(/^@/, "");
      const user = await prisma.user.findFirst({
        where: { OR: [{ handle: who }, { email: who }] },
        select: { id: true, wallet: { select: { creatorPools: { select: { id: true } } } } },
      });
      if (!user)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No account with that handle or email.",
        });
      if (!user.wallet?.creatorPools.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "That account does not own a pool.",
        });
      }
      await prisma.broadcastSenderStatus.upsert({
        where: { userId: user.id },
        create: { userId: user.id, invitedAt: new Date() },
        update: { invitedAt: new Date() },
      });
      return { ok: true, userId: user.id };
    }),

  revokeInvite: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ input }) => {
      await prisma.broadcastSenderStatus.updateMany({
        where: { userId: input.userId },
        data: { invitedAt: null },
      });
      return { ok: true };
    }),

  pause: adminProcedure
    .input(z.object({ userId: z.number().int(), reason: z.string().trim().min(1).max(255) }))
    .mutation(async ({ input }) => {
      await pauseSender(input.userId, input.reason);
      return { ok: true };
    }),

  resume: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ input }) => {
      await prisma.broadcastSenderStatus.updateMany({
        where: { userId: input.userId },
        data: { pausedAt: null, pausedReason: null },
      });
      return { ok: true };
    }),
});
