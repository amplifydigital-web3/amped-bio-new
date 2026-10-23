import { prisma } from "@repo/database";
import { router, privateProcedure } from "./trpc";

/**
 * Home Get tREVO, Invite creators stat strip: counts across every referral,
 * so the strip stays right while the referral list is paged. A set txid is
 * claimed or processing.
 */
export const referralInviteRouter = router({
  stats: privateProcedure.query(async ({ ctx }) => {
    const referrerId = ctx.user!.sub;
    const [joined, claimed] = await Promise.all([
      prisma.referral.count({ where: { referrerId } }),
      prisma.referral.count({ where: { referrerId, txid: { not: null } } }),
    ]);
    return { joined, claimed, unclaimed: Math.max(0, joined - claimed) };
  }),
});
