import { adminProcedure, router } from "../trpc";
import { env } from "../../env";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AVAILABLE_CHAINS } from "@ampedbio/web3";
import { prisma } from "../../services/DB";
import { AFFILIATES_CHAIN_ID, SITE_SETTINGS } from "@ampedbio/constants";

export const affiliateAdminRouter = router({
  getAffiliateWalletInfo: adminProcedure.query(async () => {
    if (!env.AFFILIATES_PRIVATE_KEY) {
      return {
        success: false,
        error: "Affiliate wallet not configured",
      };
    }

    try {
      // Create account from private key
      const account = privateKeyToAccount(env.AFFILIATES_PRIVATE_KEY as `0x${string}`);

      const balances: Array<{
        chainId: number;
        chainName: string;
        currency: string;
        balance: bigint;
        formattedBalance: string;
        remainingReferrals: number;
      }> = [];

      const affiliateChain = AVAILABLE_CHAINS.find(c => c.id === AFFILIATES_CHAIN_ID);

      if (!affiliateChain) {
        return {
          success: false,
          error: `Chain ID ${AFFILIATES_CHAIN_ID} not found in supported chains`,
        };
      }

      try {
        // Create public client for fetching blockchain data
        const publicClient = createPublicClient({
          chain: affiliateChain,
          transport: http(affiliateChain.rpcUrls.default.http[0]),
        });

        // Get wallet balance with timeout
        const balancePromise = publicClient.getBalance({ address: account.address });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout while fetching balance")), 5000)
        );
        const balance = await Promise.race([balancePromise, timeoutPromise]);

        // Get reward amounts from SiteSettings
        const [referrerRewardSetting, refereeRewardSetting] = await Promise.all([
          prisma.siteSettings.findUnique({
            where: { setting_key: SITE_SETTINGS.AFFILIATE_REFERRER_REWARD },
          }),
          prisma.siteSettings.findUnique({
            where: { setting_key: SITE_SETTINGS.AFFILIATE_REFEREE_REWARD },
          }),
        ]);

        const referrerReward = referrerRewardSetting?.setting_value
          ? Number(referrerRewardSetting.setting_value)
          : null;
        const refereeReward = refereeRewardSetting?.setting_value
          ? Number(refereeRewardSetting.setting_value)
          : null;

        // Calculate total reward per referral if both are configured
        let remainingReferrals = 0;
        if (referrerReward !== null && refereeReward !== null) {
          const totalRewardPerReferral = referrerReward + refereeReward;
          if (totalRewardPerReferral > 0) {
            const balanceInEther = Number(balance) / 1e18;
            remainingReferrals = Math.floor(balanceInEther / totalRewardPerReferral);
          }
        }

        balances.push({
          chainId: affiliateChain.id,
          chainName: affiliateChain.name,
          currency: affiliateChain.nativeCurrency.symbol,
          balance,
          formattedBalance: balance.toString(),
          remainingReferrals,
        });
      } catch (chainError) {
        console.warn(`Could not fetch balance for chain ${affiliateChain.name}:`, chainError);
        balances.push({
          chainId: affiliateChain.id,
          chainName: affiliateChain.name,
          currency: affiliateChain.nativeCurrency.symbol,
          balance: BigInt(0),
          formattedBalance: "N/A",
          remainingReferrals: 0,
        });
      }

      return {
        success: true,
        address: account.address,
        balances,
      };
    } catch (error) {
      console.error("Error getting affiliate wallet info:", error);
      return {
        success: false,
        error: "Failed to get affiliate wallet information",
      };
    }
  }),

  getAffiliateStats: adminProcedure.query(async () => {
    try {
      const [totalReferrals, rewardedReferrals, pendingReferrals, recentReferrals] =
        await Promise.all([
          prisma.referral.count(),
          prisma.referral.count({
            where: {
              txid: { not: null },
            },
          }),
          prisma.referral.count({
            where: {
              txid: null,
            },
          }),
          prisma.referral.findMany({
            include: {
              referrer: {
                select: {
                  name: true,
                  email: true,
                },
              },
              referred: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          }),
        ]);

      return {
        totalReferrals,
        rewardedReferrals,
        pendingReferrals,
        recentReferrals: recentReferrals.map(r => ({
          id: r.id,
          referrerName: r.referrer.name || r.referrer.email,
          referredName: r.referred.name || r.referred.email,
          createdAt: r.createdAt,
          txid: r.txid,
        })),
      };
    } catch (error) {
      console.error("Error getting affiliate stats:", error);
      throw error;
    }
  }),
});
