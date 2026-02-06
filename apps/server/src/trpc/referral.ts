import { router, privateProcedure } from "./trpc";
import { z } from "zod";
import { prisma } from "../services/DB";
import { TRPCError } from "@trpc/server";

export const referralRouter = router({
  myReferrals: privateProcedure
    .input(
      z.object({
        page: z.number().optional().default(1),
        limit: z.number().optional().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      const safePage = Math.max(input.page, 1);
      const safeLimit = Math.min(input.limit, 50);

      const [referrals, total] = await Promise.all([
        prisma.referral.findMany({
          where: { referrerId: userId },
          select: {
            id: true,
            txid: true,
            referred: {
              select: {
                id: true,
                name: true,
                email: true,
                handle: true,
                created_at: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (safePage - 1) * safeLimit,
          take: safeLimit,
        }),
        prisma.referral.count({ where: { referrerId: userId } }),
      ]);

      return {
        referrals: referrals.map(r => ({
          ...r.referred,
          txid: r.txid,
          referralId: r.id,
        })),
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      };
    }),

  myReferrer: privateProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.sub;

    const referral = await prisma.referral.findFirst({
      where: { referredId: userId },
      include: {
        referrer: {
          select: {
            id: true,
            name: true,
            email: true,
            handle: true,
          },
        },
      },
    });

    if (!referral) {
      return null;
    }

    return {
      id: referral.id,
      txid: referral.txid,
      referrer: referral.referrer,
      createdAt: referral.createdAt,
    };
  }),

  referralStats: privateProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.sub;

    const [totalReferrals, recentReferrals] = await Promise.all([
      prisma.referral.count({ where: { referrerId: userId } }),
      prisma.referral.findMany({
        where: { referrerId: userId },
        include: {
          referred: {
            select: {
              id: true,
              name: true,
              created_at: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    return {
      totalReferrals,
      recentReferrals: recentReferrals.map(r => ({
        id: r.referred.id,
        name: r.referred.name,
        createdAt: r.createdAt,
      })),
    };
  }),

  claimReferralReward: privateProcedure
    .input(
      z.object({
        referralId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;

      const referral = await prisma.referral.findUnique({
        where: { id: input.referralId },
        select: {
          id: true,
          referrerId: true,
          referredId: true,
          txid: true,
        },
      });

      if (!referral) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Referral not found",
        });
      }

      if (referral.referrerId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to claim this referral reward",
        });
      }

      if (referral.txid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Referral reward has already been claimed",
        });
      }

      const [referrerWallet, refereeWallet] = await Promise.all([
        prisma.userWallet.findFirst({
          where: { userId: referral.referrerId },
          select: { address: true },
        }),
        prisma.userWallet.findFirst({
          where: { userId: referral.referredId },
          select: { address: true },
        }),
      ]);

      if (!referrerWallet) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Your wallet is not linked",
        });
      }

      if (!refereeWallet) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Referee has not linked their wallet yet",
        });
      }

      const { sendReferralRewards } = await import("../services/referralRewards");

      const result = await sendReferralRewards(
        referrerWallet.address as `0x${string}`,
        refereeWallet.address as `0x${string}`
      );

      if (!result.success || !result.txid) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Failed to send referral rewards",
        });
      }

      await prisma.referral.update({
        where: { id: referral.id },
        data: { txid: result.txid },
      });

      return {
        success: true,
        txid: result.txid,
      };
    }),
});
