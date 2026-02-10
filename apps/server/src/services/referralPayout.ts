import { prisma } from "./DB";
import { sendReferralRewards } from "./referralRewards";
import { PROCESSING_TXID } from "../constants";

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
    await prisma.$transaction(async tx => {
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

      console.log(
        `[SENDING_REFERRAL_REWARDS] referralId=${referral.id}, referrerAddress=${referrerWallet.address}, refereeAddress=${refereeWallet.address}`
      );

      const result = await sendReferralRewards(
        referrerWallet.address as `0x${string}`,
        refereeWallet.address as `0x${string}`
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
        console.log(
          `[REFERRAL_PAYOUT_SKIPPED] referralId=${referral.id}, reason=${result.error || "Reward sending failed"}, referrerAddress=${referrerWallet.address}, refereeAddress=${refereeWallet.address}. Referral remains unpaid and can be retried later.`
        );
      }
    });

    console.log(`[PROCESS_REFERRAL_REWARD_FOR_USER_COMPLETE] userId=${userId}`);
  } catch (error) {
    console.log(
      `[PROCESS_REFERRAL_REWARD_FOR_USER_ERROR] userId=${userId}, error=${error instanceof Error ? error.message : "Unknown error"}`
    );
    throw error;
  }
}
