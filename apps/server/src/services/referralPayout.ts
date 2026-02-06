import { prisma } from "./DB";

/**
 * Process referral reward immediately after a user links their wallet.
 * This function only checks if the user was referred by someone and sends rewards
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
  await prisma.$transaction(async tx => {
    // Single query with SELECT FOR UPDATE to lock the referral record
    // Only fetch referral where this user is the referee (was referred by someone)
    const referral = await tx.referral.findFirst({
      where: {
        referredId: userId,
        txid: null,
      },
      select: {
        id: true,
        referrerId: true,
        referredId: true,
        txid: true,
      },
    });

    if (!referral) {
      console.log(`No unpaid referral found for user ${userId} as referee`);
      return;
    }

    // Get wallet addresses for both parties in a single query
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

    // Only send rewards if both parties have linked wallets
    if (!referrerWallet || !refereeWallet) {
      console.log(
        `Referral ${referral.id}: Cannot pay - ` +
          `referrer wallet: ${referrerWallet ? "yes" : "no"}, ` +
          `referee wallet: ${refereeWallet ? "yes" : "no"}`
      );
      return;
    }

    // Double-check txid is still null (locked record ensures no race condition)
    const freshReferral = await tx.referral.findUnique({
      where: { id: referral.id },
      select: { txid: true },
    });

    if (freshReferral?.txid) {
      console.log(`Referral ${referral.id}: Already paid, skipping`);
      return;
    }

    // Import and use the reward sending service
    const { sendReferralRewards, updateReferralTxid } = await import("./referralRewards");

    console.log(
      `Referral ${referral.id}: Sending rewards - ` +
        `referrer: ${referrerWallet.address}, referee: ${refereeWallet.address}`
    );

    // Send rewards via blockchain
    const result = await sendReferralRewards(
      referrerWallet.address as `0x${string}`,
      refereeWallet.address as `0x${string}`
    );

    if (result.success && result.txid) {
      // Update referral record with transaction hash within the same transaction
      await tx.referral.update({
        where: { id: referral.id },
        data: { txid: result.txid },
      });
      console.log(`Referral ${referral.id}: Rewards sent successfully - txid: ${result.txid}`);
    } else {
      console.error(
        `Referral ${referral.id}: Failed to send rewards - ${result.error || "Unknown error"}`
      );
    }
  });
}
