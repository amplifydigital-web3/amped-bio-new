import { router, privateProcedure } from "./trpc";
import { z } from "zod";
import { prisma } from "../services/DB";

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
        referrals: referrals.map(r => r.referred),
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
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
});
