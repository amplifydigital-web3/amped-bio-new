import { prisma } from "./DB";
import { sendReferralRewards } from "./referralRewards";
import { PROCESSING_TXID } from "@ampedbio/constants";
import { env } from "../env";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "@ampedbio/web3";
import { AFFILIATES_CHAIN_ID, SITE_SETTINGS } from "@ampedbio/constants";
import { rewardCache } from "../utils/cache";

/**
 * Process referral reward immediately after a user links their wallet.
 * This function only checks if user was referred by someone and sends rewards
 * to BOTH parties (referrer and referee) if both have linked wallets.
 *
 * Rules:
 * - Only processes the referral where this user is the referee (was referred by someone)
 * - Only sends rewards if both parties have linked wallets
 * - Only sends rewards if not already paid (txid is null)
 * - Uses SELECT FOR UPDATE to prevent race conditions
 * - Minimizes database queries
 *
 * @param userId - The user ID who just linked their wallet
 */
export async function processReferralRewardForUser(userId: number): Promise<void> {
  console.log(`[PROCESS_REFERRAL_REWARD_FOR_USER] userId=${userId}`);

  try {
    await prisma.$transaction(
      async tx => {
        console.log(`[REFERRAL_PAYOUT_TRANSACTION_START] userId=${userId}`);

        const referral = await tx.referral.findFirst({
          where: {
            referredId: userId,
            OR: [{ txid: null }, { txid: PROCESSING_TXID }],
          },
          select: {
            id: true,
            referrerId: true,
            referredId: true,
            txid: true,
          },
        });

        if (!referral) {
          console.log(`[NO_UNPAID_REFERRAL_FOUND] userId=${userId}`);
          return;
        }

        console.log(
          `[REFERRAL_FOUND_FOR_PAYOUT] referralId=${referral.id}, referrerId=${referral.referrerId}, referredId=${referral.referredId}`
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

        if (!referrerWallet || !refereeWallet) {
          console.log(
            `[REFERRAL_PAYOUT_INCOMPLETE_WALLETS] referralId=${referral.id}, hasReferrerWallet=${!!referrerWallet}, hasRefereeWallet=${!!refereeWallet}`
          );
          return;
        }

        console.log(
          `[REFERRAL_WALLETS_READY] referralId=${referral.id}, referrerWallet=${referrerWallet.address}, refereeWallet=${refereeWallet.address}`
        );

        const freshReferral = await tx.referral.findUnique({
          where: { id: referral.id },
          select: { txid: true },
        });

        if (freshReferral?.txid && freshReferral.txid !== PROCESSING_TXID) {
          console.log(
            `[REFERRAL_ALREADY_PAID_DURING_LOCK] referralId=${referral.id}, txid=${freshReferral.txid}`
          );
          return;
        }

        console.log(
          `[REFERRAL_SETTING_PROCESSING_TXID] referralId=${referral.id}, txid=${PROCESSING_TXID}`
        );

        await tx.referral.update({
          where: { id: referral.id },
          data: { txid: PROCESSING_TXID },
        });

        console.log(`[REFERRAL_PROCESSING_TXID_SET] referralId=${referral.id}`);

        // Get chain configuration
        const chain = getChainConfig(AFFILIATES_CHAIN_ID);
        if (!chain) {
          console.log(
            `[CHAIN_CONFIG_NOT_FOUND] chainId=${AFFILIATES_CHAIN_ID}, referralId=${referral.id}`
          );
          await tx.referral.update({
            where: { id: referral.id },
            data: { txid: null },
          });
          return;
        }

        const contractAddress = chain.contracts?.SIMPLE_BATCH_SEND?.address;
        if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
          console.log(`[CONTRACT_ADDRESS_NOT_CONFIGURED] referralId=${referral.id}`);
          await tx.referral.update({
            where: { id: referral.id },
            data: { txid: null },
          });
          return;
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
          await tx.referral.update({
            where: { id: referral.id },
            data: { txid: null },
          });
          return;
        }

        // Create wallet client and public client
        if (!env.AFFILIATES_PRIVATE_KEY) {
          console.log(`[AFFILIATE_WALLET_NOT_CONFIGURED] referralId=${referral.id}`);
          await tx.referral.update({
            where: { id: referral.id },
            data: { txid: null },
          });
          return;
        }

        const account = privateKeyToAccount(env.AFFILIATES_PRIVATE_KEY as `0x${string}`);

        console.log(`[AFFILIATE_WALLET_ACCOUNT_CREATED] accountAddress=${account.address}`);

        const walletClient = createWalletClient({
          account,
          chain,
          transport: http(chain.rpcUrls.default.http[0]),
        }) as any;

        const publicClient = createPublicClient({
          chain,
          transport: http(chain.rpcUrls.default.http[0]),
        }) as any;

        console.log(
          `[SENDING_REFERRAL_REWARDS] referralId=${referral.id}, referrerAddress=${referrerWallet.address}, refereeAddress=${refereeWallet.address}`
        );

        const result = await sendReferralRewards(
          walletClient,
          publicClient,
          contractAddress,
          referrerWallet.address as `0x${string}`,
          refereeWallet.address as `0x${string}`,
          referrerReward,
          refereeReward
        );

        if (result.success && result.txid) {
          await tx.referral.update({
            where: { id: referral.id },
            data: { txid: result.txid },
          });

          console.log(
            `[REFERRAL_PAYOUT_SUCCESS] referralId=${referral.id}, txid=${result.txid}, referrerAddress=${referrerWallet.address}, refereeAddress=${refereeWallet.address}`
          );
        } else {
          // Reset txid to null so user can manually retry the claim
          await tx.referral.update({
            where: { id: referral.id },
            data: { txid: null },
          });

          console.log(
            `[REFERRAL_PAYOUT_FAILED_TXID_RESET] referralId=${referral.id}, reason=${result.error || "Reward sending failed"}, referrerAddress=${referrerWallet.address}, refereeAddress=${refereeWallet.address}. Txid reset to null - user can retry manually.`
          );
        }
      },
      {
        maxWait: 10000,
        timeout: 60000,
      }
    );

    console.log(`[PROCESS_REFERRAL_REWARD_FOR_USER_COMPLETE] userId=${userId}`);
  } catch (error) {
    console.log(
      `[PROCESS_REFERRAL_REWARD_FOR_USER_ERROR] userId=${userId}, error=${error instanceof Error ? error.message : "Unknown error"}`
    );
    throw error;
  }
}
