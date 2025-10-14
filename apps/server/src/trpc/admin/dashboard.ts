import { adminProcedure, router } from "../trpc";
import { prisma } from "../../services/DB";
import { z } from "zod";
import { bannerSchema } from "../../schemas/banner";

export const dashboardRouter = router({
  getDashboardStats: adminProcedure.query(async () => {
    // Today's date for filtering
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Last week's date for filtering
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    lastWeek.setHours(0, 0, 0, 0);

    // Two weeks ago date for filtering
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    twoWeeksAgo.setHours(0, 0, 0, 0);

    // Last month's date for filtering
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setHours(0, 0, 0, 0);

    // Two months ago date for filtering
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    twoMonthsAgo.setHours(0, 0, 0, 0);

    // This week's date for filtering
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    thisWeek.setHours(0, 0, 0, 0);

    // This month's date for filtering
    const thisMonth = new Date();
    thisMonth.setDate(1); // First day of current month
    thisMonth.setHours(0, 0, 0, 0);

    // First day of last month
    const firstDayOfLastMonth = new Date();
    firstDayOfLastMonth.setMonth(firstDayOfLastMonth.getMonth() - 1);
    firstDayOfLastMonth.setDate(1);
    firstDayOfLastMonth.setHours(0, 0, 0, 0);

    // Last day of last month
    const lastDayOfLastMonth = new Date();
    lastDayOfLastMonth.setDate(1); // First day of current month
    lastDayOfLastMonth.setHours(0, 0, 0, 0);
    lastDayOfLastMonth.setDate(lastDayOfLastMonth.getDate() - 1); // Last day of previous month

    // User statistics
    const totalUsers = await prisma.user.count();
    const newThisWeek = await prisma.user.count({
      where: {
        created_at: {
          gte: lastWeek,
        },
      },
    });

    // Users last week
    const usersLastWeek = await prisma.user.count({
      where: {
        created_at: {
          gte: twoWeeksAgo,
          lt: lastWeek,
        },
      },
    });

    // Count active users based on valid refresh tokens
    const activeUsers = await prisma.refreshToken.count({
      where: {
        expiresAt: {
          gte: new Date(), // Valid (not expired) refresh tokens
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

    // Blocks created last week
    const blocksCreatedLastWeek = await prisma.block.count({
      where: {
        created_at: {
          gte: lastWeek,
          lt: today,
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

    // Click statistics
    // Total clicks across all blocks
    const totalClicksResult = await prisma.block.aggregate({
      _sum: {
        clicks: true,
      },
    });
    const totalClicks = totalClicksResult._sum.clicks || 0;

    // Clicks this week
    const clicksThisWeekResult = await prisma.block.aggregate({
      _sum: {
        clicks: true,
      },
      where: {
        updated_at: {
          gte: thisWeek,
        },
      },
    });
    const clicksThisWeek = clicksThisWeekResult._sum.clicks || 0;

    // Clicks last week
    const clicksLastWeekResult = await prisma.block.aggregate({
      _sum: {
        clicks: true,
      },
      where: {
        updated_at: {
          gte: lastWeek,
          lt: thisWeek,
        },
      },
    });
    const clicksLastWeek = clicksLastWeekResult._sum.clicks || 0;

    // Clicks this month
    const clicksThisMonthResult = await prisma.block.aggregate({
      _sum: {
        clicks: true,
      },
      where: {
        updated_at: {
          gte: thisMonth,
        },
      },
    });
    const clicksThisMonth = clicksThisMonthResult._sum.clicks || 0;

    // Clicks last month
    const clicksLastMonthResult = await prisma.block.aggregate({
      _sum: {
        clicks: true,
      },
      where: {
        updated_at: {
          gte: firstDayOfLastMonth,
          lte: lastDayOfLastMonth,
        },
      },
    });
    const clicksLastMonth = clicksLastMonthResult._sum.clicks || 0;

    return {
      userStats: {
        totalUsers,
        newThisWeek,
        usersLastWeek,
        activeUsers,
        rewardProgramUsers,
        rewardProgramPercentage: parseFloat(rewardProgramPercentage.toFixed(1)),
      },
      blockStats: {
        totalBlocks,
        blocksCreatedToday,
        blocksCreatedLastWeek,
        averageBlocksPerUser: parseFloat(averageBlocksPerUser.toFixed(1)),
        mostPopularBlockType: mostPopularBlockType.length > 0 ? mostPopularBlockType[0].type : null,
        // Click statistics
        totalClicks,
        clicksThisWeek,
        clicksLastWeek,
        clicksThisMonth,
        clicksLastMonth,
      },
    };
  }),

  getBanner: adminProcedure.query(async () => {
    const banner = await prisma.siteSettings.findUnique({
      where: { setting_key: "dashboard_banner" },
    });

    if (!banner) {
      // Return an empty banner object if none exists
      const emptyBanner = {
        text: "",
        path: "",
        enabled: false,
      };
      return JSON.stringify(emptyBanner);
    }

    // Validate and return the existing banner
    try {
      const bannerData = JSON.parse(banner.setting_value);

      return JSON.stringify(bannerData);
    } catch (error) {
      // If parsing fails, return an empty banner object
      const emptyBanner = {
        text: "",
        path: "",
        enabled: false,
      };
      return JSON.stringify(emptyBanner);
    }
  }),

  updateBanner: adminProcedure
    .input(
      z.object({
        bannerObject: bannerSchema,
      })
    )
    .mutation(async ({ input }) => {
      return prisma.siteSettings.upsert({
        where: { setting_key: "dashboard_banner" },
        update: {
          setting_value: JSON.stringify(input.bannerObject),
          value_type: "JSON",
        },
        create: {
          setting_key: "dashboard_banner",
          setting_value: JSON.stringify(input.bannerObject),
          value_type: "JSON",
        },
      });
    }),

  updateBannerEnabled: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      // Get the current banner configuration
      const currentBanner = await prisma.siteSettings.findUnique({
        where: { setting_key: "dashboard_banner" },
      });

      let bannerData = {
        text: "Notice",
        path: "",
        type: "info",
        enabled: false,
      };

      // If there's an existing banner configuration, parse it and update only the enabled property
      if (currentBanner) {
        try {
          bannerData = JSON.parse(currentBanner.setting_value);
        } catch (error) {
          // If parsing fails, use the default banner data
        }
      }

      // Update the enabled property
      bannerData.enabled = input.enabled;

      // Save the updated banner configuration
      return prisma.siteSettings.upsert({
        where: { setting_key: "dashboard_banner" },
        update: {
          setting_value: JSON.stringify(bannerData),
          value_type: "JSON",
        },
        create: {
          setting_key: "dashboard_banner",
          setting_value: JSON.stringify(bannerData),
          value_type: "JSON",
        },
      });
    }),
});
