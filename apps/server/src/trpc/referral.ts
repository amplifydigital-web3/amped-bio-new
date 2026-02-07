import { router, privateProcedure } from "./trpc";
import { z } from "zod";
import { prisma } from "../services/DB";
import { TRPCError } from "@trpc/server";

const PROCESSING_TXID = "0x0000000000000000000000000000000000000000000";

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

      console.log(`[REFERRAL_CLAIM_ATTEMPT] userId=${userId}, referralId=${input.referralId}`);

      try {
        const result = await prisma.$transaction(async tx => {
          console.log(
            `[REFERRAL_CLAIM_TRANSACTION_START] userId=${userId}, referralId=${input.referralId}`
          );

          const referral = await tx.referral.findUnique({
            where: { id: input.referralId },
            select: {
              id: true,
              referrerId: true,
              referredId: true,
              txid: true,
            },
          });

          if (!referral) {
            console.log(`[REFERRAL_NOT_FOUND] userId=${userId}, referralId=${input.referralId}`);
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Referral not found",
            });
          }

          if (referral.referrerId !== userId) {
            console.log(
              `[REFERRAL_UNAUTHORIZED_CLAIM] userId=${userId}, referralId=${input.referralId}, referrerId=${referral.referrerId}`
            );
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You are not authorized to claim this referral reward",
            });
          }

          if (referral.txid && referral.txid !== PROCESSING_TXID) {
            console.log(
              `[REFERRAL_ALREADY_CLAIMED] userId=${userId}, referralId=${input.referralId}, txid=${referral.txid}`
            );
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                referral.txid === PROCESSING_TXID
                  ? "Referral reward is being processed"
                  : "Referral reward has already been claimed",
            });
          }

          console.log(
            `[REFERRAL_VALIDATION_PASSED] userId=${userId}, referralId=${input.referralId}`
          );

          const [referrerWallet, refereeWallet] = await Promise.all([
            tx.userWallet.findFirst({
              where: { userId: referral.referrerId },
              select: { address: true },
            }),
            tx.userWallet.findFirst({
              where: { userId: referral.referredId },
              select: { address: true },
            }),
          ]);

          if (!referrerWallet) {
            console.log(
              `[REFERRAL_NO_REFERRER_WALLET] userId=${userId}, referralId=${input.referralId}`
            );
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Your wallet is not linked",
            });
          }

          if (!refereeWallet) {
            console.log(
              `[REFERRAL_NO_REFEREE_WALLET] userId=${userId}, referralId=${input.referralId}`
            );
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Referee has not linked their wallet yet",
            });
          }

          console.log(
            `[REFERRAL_WALLETS_FOUND] userId=${userId}, referralId=${input.referralId}, referrerWallet=${referrerWallet.address}, refereeWallet=${refereeWallet.address}`
          );

          console.log(
            `[REFERRAL_SETTING_PROCESSING_TXID] userId=${userId}, referralId=${input.referralId}, txid=${PROCESSING_TXID}`
          );

          await tx.referral.update({
            where: { id: referral.id },
            data: { txid: PROCESSING_TXID },
          });

          console.log(
            `[REFERRAL_PROCESSING_TXID_SET] userId=${userId}, referralId=${input.referralId}`
          );

          const { sendReferralRewards } = await import("../services/referralRewards");

          const rewardResult = await sendReferralRewards(
            referrerWallet.address as `0x${string}`,
            refereeWallet.address as `0x${string}`
          );

          if (!rewardResult.success || !rewardResult.txid) {
            console.log(
              `[REFERRAL_REWARD_SEND_FAILED] userId=${userId}, referralId=${input.referralId}, error=${rewardResult.error}`
            );
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: rewardResult.error || "Failed to send referral rewards",
            });
          }

          await tx.referral.update({
            where: { id: referral.id },
            data: { txid: rewardResult.txid },
          });

          console.log(
            `[REFERRAL_REWARD_CLAIMED] userId=${userId}, referralId=${input.referralId}, txid=${rewardResult.txid}`
          );

          return {
            success: true,
            txid: rewardResult.txid,
          };
        });

        console.log(
          `[REFERRAL_CLAIM_SUCCESS] userId=${userId}, referralId=${input.referralId}, txid=${result.txid}`
        );

        return result;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.log(
          `[REFERRAL_CLAIM_ERROR] userId=${userId}, referralId=${input.referralId}, error=${error instanceof Error ? error.message : "Unknown error"}`
        );

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to claim referral reward",
        });
      }
    }),
});
