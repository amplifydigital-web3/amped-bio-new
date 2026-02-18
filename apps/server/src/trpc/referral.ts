import { router, privateProcedure, publicProcedure } from "./trpc";
import { z } from "zod";
import { prisma } from "../services/DB";
import { TRPCError } from "@trpc/server";
import {
  sendReferralRewards,
  findReferralTransaction,
  checkPairAlreadySent,
} from "../services/referralRewards";
import { env } from "../env";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http } from "viem";
import { getChainConfig } from "@ampedbio/web3";
import { AFFILIATES_CHAIN_ID, SITE_SETTINGS, PROCESSING_TXID } from "@ampedbio/constants";
import { rewardCache } from "../utils/cache";

export const referralRouter = router({
  getReferrerInfo: publicProcedure
    .input(
      z.object({
        userId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const referrer = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          handle: true,
          name: true,
        },
      });

      if (!referrer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Referrer not found",
        });
      }

      // Get referee reward amount from site settings
      const rewardSettings = await prisma.siteSettings.findMany({
        where: {
          setting_key: SITE_SETTINGS.AFFILIATE_REFEREE_REWARD,
        },
      });

      const refereeReward = Number(rewardSettings[0]?.setting_value || 0);

      return {
        handle: referrer.handle,
        name: referrer.name,
        refereeReward,
      };
    }),

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
        const result = await prisma.$transaction(
          async tx => {
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

            // Check if pair has already been sent rewards on-chain
            const chain = getChainConfig(AFFILIATES_CHAIN_ID);
            if (!chain) {
              console.log(
                `[CHAIN_CONFIG_NOT_FOUND] chainId=${AFFILIATES_CHAIN_ID}, userId=${userId}, referralId=${input.referralId}`
              );
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Chain configuration not found",
              });
            }

            const contractAddress = chain.contracts?.SIMPLE_BATCH_SEND?.address;
            if (
              !contractAddress ||
              contractAddress === "0x0000000000000000000000000000000000000000"
            ) {
              console.log(
                `[CONTRACT_ADDRESS_NOT_CONFIGURED] userId=${userId}, referralId=${input.referralId}`
              );
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Contract address not configured",
              });
            }

            const publicClient = createPublicClient({
              chain,
              transport: http(chain.rpcUrls.default.http[0]),
            }) as any;

            console.log(
              `[CHECKING_PAIR_STATUS_BEFORE_SEND] referrer=${referrerWallet.address}, referee=${refereeWallet.address}`
            );

            const pairAlreadySent = await checkPairAlreadySent(
              publicClient,
              contractAddress,
              referrerWallet.address as `0x${string}`,
              refereeWallet.address as `0x${string}`
            );

            if (pairAlreadySent) {
              console.log(
                `[REFERRAL_PAIR_ALREADY_SENT_ON_CHAIN] userId=${userId}, referralId=${input.referralId}`
              );

              // Try to find the transaction on-chain if we don't have it
              const txSearchResult = await findReferralTransaction(
                refereeWallet.address as `0x${string}`
              );

              if (txSearchResult.txid) {
                console.log(
                  `[REFERRAL_TXID_FOUND_ON_CHAIN] userId=${userId}, referralId=${input.referralId}, txid=${txSearchResult.txid}`
                );

                // Update database with found txid
                await tx.referral.update({
                  where: { id: referral.id },
                  data: { txid: txSearchResult.txid },
                });

                return {
                  success: true,
                  txid: txSearchResult.txid,
                };
              }

              // If we can't find the transaction, that's okay - the pair was sent
              console.log(
                `[REFERRAL_TXID_NOT_FOUND_BUT_PAIR_SENT] userId=${userId}, referralId=${input.referralId}`
              );
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "This referral has already been claimed",
              });
            }

            // Get reward amounts from cache or database
            const REWARDS_CACHE_KEY = "referral_rewards";
            const cachedRewards = rewardCache.get(REWARDS_CACHE_KEY);

            let referrerReward: number | null;
            let refereeReward: number | null;

            if (cachedRewards) {
              console.log(
                `[REWARDS_CACHE_HIT] referrerReward=${cachedRewards.referrerReward}, refereeReward=${cachedRewards.refereeReward}`
              );
              referrerReward = cachedRewards.referrerReward;
              refereeReward = cachedRewards.refereeReward;
            } else {
              // Query database
              const rewardSettings = await prisma.siteSettings.findMany({
                where: {
                  setting_key: {
                    in: [
                      SITE_SETTINGS.AFFILIATE_REFERRER_REWARD,
                      SITE_SETTINGS.AFFILIATE_REFEREE_REWARD,
                    ],
                  },
                },
              });

              const referrerRewardSetting = rewardSettings.find(
                s => s.setting_key === SITE_SETTINGS.AFFILIATE_REFERRER_REWARD
              );
              const refereeRewardSetting = rewardSettings.find(
                s => s.setting_key === SITE_SETTINGS.AFFILIATE_REFEREE_REWARD
              );

              referrerReward = referrerRewardSetting?.setting_value
                ? Number(referrerRewardSetting.setting_value)
                : null;
              refereeReward = refereeRewardSetting?.setting_value
                ? Number(refereeRewardSetting.setting_value)
                : null;

              // Save to cache
              rewardCache.set(REWARDS_CACHE_KEY, { referrerReward, refereeReward });
              console.log(`[REWARDS_CACHE_MISS] Cached rewards for 60000ms`);
            }

            if (
              referrerReward === null ||
              refereeReward === null ||
              referrerReward <= 0 ||
              refereeReward <= 0
            ) {
              console.log(
                `[INVALID_REWARD_AMOUNTS] referralId=${referral.id}, referrerReward=${referrerReward}, refereeReward=${refereeReward}`
              );
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Reward amounts not configured",
              });
            }

            // Create wallet client
            if (!env.AFFILIATES_PRIVATE_KEY) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Affiliate wallet not configured",
              });
            }

            const account = privateKeyToAccount(env.AFFILIATES_PRIVATE_KEY as `0x${string}`);

            console.log(`[AFFILIATE_WALLET_ACCOUNT_CREATED] accountAddress=${account.address}`);

            const walletClient = createWalletClient({
              account,
              chain,
              transport: http(chain.rpcUrls.default.http[0]),
            }) as any;

            const rewardResult = await sendReferralRewards(
              walletClient,
              publicClient,
              contractAddress,
              referrerWallet.address as `0x${string}`,
              refereeWallet.address as `0x${string}`,
              referrerReward,
              refereeReward
            );

            if (!rewardResult.success || !rewardResult.txid) {
              console.log(
                `[REFERRAL_REWARD_SEND_FAILED] userId=${userId}, referralId=${input.referralId}, error=${rewardResult.error}`
              );
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  rewardResult.error || "Failed to send referral rewards. Please try again later.",
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
          },
          {
            maxWait: 10000,
            timeout: 60000,
          }
        );

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

  getAffiliateWalletBalance: publicProcedure.query(async () => {
    try {
      const chain = getChainConfig(AFFILIATES_CHAIN_ID);
      if (!chain || !env.AFFILIATES_PRIVATE_KEY) {
        return {
          hasBalance: false,
          balance: "0",
          requiredAmount: 0,
          currency: "ETH",
        };
      }

      const account = privateKeyToAccount(env.AFFILIATES_PRIVATE_KEY as `0x${string}`);
      const publicClient = createPublicClient({
        chain,
        transport: http(chain.rpcUrls.default.http[0]),
      });

      // Get reward values (now with cache)
      const rewardSettings = await prisma.siteSettings.findMany({
        where: {
          setting_key: {
            in: [SITE_SETTINGS.AFFILIATE_REFERRER_REWARD, SITE_SETTINGS.AFFILIATE_REFEREE_REWARD],
          },
        },
      });

      const referrerReward = Number(
        rewardSettings.find(s => s.setting_key === SITE_SETTINGS.AFFILIATE_REFERRER_REWARD)
          ?.setting_value || 0
      );
      const refereeReward = Number(
        rewardSettings.find(s => s.setting_key === SITE_SETTINGS.AFFILIATE_REFEREE_REWARD)
          ?.setting_value || 0
      );
      const requiredAmount = referrerReward + refereeReward;

      const balance = await publicClient.getBalance({ address: account.address });
      const balanceInEther = Number(balance) / 1e18;

      return {
        hasBalance: balanceInEther >= requiredAmount,
        balance: balanceInEther.toFixed(4),
        requiredAmount,
        currency: chain.nativeCurrency.symbol,
      };
    } catch (error) {
      console.error("Error getting affiliate wallet balance:", error);
      return {
        hasBalance: false,
        balance: "0",
        requiredAmount: 0,
        currency: "ETH",
      };
    }
  }),
});
