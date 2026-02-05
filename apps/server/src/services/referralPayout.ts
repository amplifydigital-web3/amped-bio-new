import { prisma } from "./DB";

/**
 * Check and automatically pay referral rewards for a user who just linked their wallet.
 * This function handles both scenarios:
 * 1. User is the referrer (they referred someone) - check if referee has wallet
 * 2. User is the referred (someone referred them) - check if referrer has wallet
 *
 * Rewards are only sent if:
 * - Both parties have linked wallets
 * - The referral hasn't been paid yet (txid is null)
 *
 * @param userId - The user ID who just linked their wallet
 */
export async function checkAndPayReferralForUser(userId: number): Promise<void> {
  try {
    // Find all referrals where this user participates (as referrer OR referred)
    const referrals = await prisma.referral.findMany({
      where: {
        OR: [{ referrerId: userId }, { referredId: userId }],
        txid: null, // Only get unpaid referrals
      },
      include: {
        referrer: {
          select: {
            id: true,
            name: true,
          },
        },
        referred: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (referrals.length === 0) {
      console.log(`No unpaid referrals found for user ${userId}`);
      return;
    }

    console.log(`Found ${referrals.length} unpaid referral(s) for user ${userId}`);

    // Process each unpaid referral
    for (const referral of referrals) {
      try {
        // Get wallet addresses for both parties
        const [referrerWallet, refereeWallet] = await Promise.all([
          prisma.userWallet.findFirst({
            where: { userId: referral.referrerId },
          }),
          prisma.userWallet.findFirst({
            where: { userId: referral.referredId },
          }),
        ]);

        // Only send rewards if both parties have linked wallets
        if (!referrerWallet || !refereeWallet) {
          console.log(
            `Referral ${referral.id}: Cannot pay rewards - ` +
            `referrer wallet: ${referrerWallet ? "yes" : "no"}, ` +
            `referee wallet: ${refereeWallet ? "yes" : "no"}`
          );
          continue;
        }

        // Double-check that txid is still null (prevent race conditions)
        const freshReferral = await prisma.referral.findUnique({
          where: { id: referral.id },
          select: { txid: true },
        });

        if (freshReferral?.txid) {
          console.log(`Referral ${referral.id}: Already paid, skipping`);
          continue;
        }

        // Import reward sending function dynamically
        const { sendReferralRewards, updateReferralTxid } = await import("./referralRewards");

        console.log(
          `Referral ${referral.id}: Sending rewards - ` +
          `referrer: ${referrerWallet.address}, referee: ${refereeWallet.address}`
        );

        // Send rewards
        const result = await sendReferralRewards(
          referrerWallet.address as `0x${string}`,
          refereeWallet.address as `0x${string}`
        );

        if (result.success && result.txid) {
          // Update referral record with transaction hash
          await updateReferralTxid(referral.id, result.txid);
          console.log(`Referral ${referral.id}: Rewards sent successfully - txid: ${result.txid}`);
        } else {
          console.error(
            `Referral ${referral.id}: Failed to send rewards - ${result.error || "Unknown error"}`
          );
        }
      } catch (error) {
        // Log error but continue processing other referrals
        console.error(`Error processing referral ${referral.id}:`, error);
      }
    }
  } catch (error) {
    console.error("Error in checkAndPayReferralForUser:", error);
    throw error;
  }
}
