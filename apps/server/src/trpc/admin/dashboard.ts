import { adminProcedure, router } from "../trpc";
import { prisma } from "../../services/DB";

export const dashboardRouter = router({
  getDashboardStats: adminProcedure.query(async () => {
    // Today's date for filtering
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Last week's date for filtering
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    lastWeek.setHours(0, 0, 0, 0);

    // User statistics
    const totalUsers = await prisma.user.count();
    const newThisWeek = await prisma.user.count({
      where: {
        created_at: {
          gte: lastWeek,
        },
      },
    });

    // Count users with reward program
    const rewardProgramUsers = await prisma.user.count({
      where: {
        reward_business_id: {
          not: null,
        },
      },
    });

    // Percentage of users with a reward program
    const rewardProgramPercentage = totalUsers > 0 ? (rewardProgramUsers / totalUsers) * 100 : 0;

    // Block statistics
    const totalBlocks = await prisma.block.count();
    const blocksCreatedToday = await prisma.block.count({
      where: {
        created_at: {
          gte: today,
        },
      },
    });
    const mostPopularBlockType = await prisma.block.groupBy({
      by: ["type"],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      take: 1,
    });

    // Calculate average blocks per user
    const averageBlocksPerUser = totalUsers > 0 ? totalBlocks / totalUsers : 0;

    return {
      userStats: {
        totalUsers,
        newThisWeek,
        rewardProgramUsers,
        rewardProgramPercentage: parseFloat(rewardProgramPercentage.toFixed(1)),
      },
      blockStats: {
        totalBlocks,
        blocksCreatedToday,
        averageBlocksPerUser: parseFloat(averageBlocksPerUser.toFixed(1)),
        mostPopularBlockType: mostPopularBlockType.length > 0 ? mostPopularBlockType[0].type : null,
      },
    };
  }),
});
