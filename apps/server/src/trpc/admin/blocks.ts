import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { DateRangeSchema, PaginationSchema, BlockTypeFilterSchema } from "./schemas";
import { prisma } from "../../services/DB";

export const blocksRouter = router({
  getBlockStats: adminProcedure.input(DateRangeSchema.optional()).query(async ({ input }) => {
    const startDate = input?.startDate ? new Date(input.startDate) : undefined;
    const endDate = input?.endDate ? new Date(input.endDate) : undefined;

    // Build date filter if provided
    const dateFilter = {};
    if (startDate && endDate) {
      Object.assign(dateFilter, {
        created_at: {
          gte: startDate,
          lte: endDate,
        },
      });
    } else if (startDate) {
      Object.assign(dateFilter, {
        created_at: {
          gte: startDate,
        },
      });
    } else if (endDate) {
      Object.assign(dateFilter, {
        created_at: {
          lte: endDate,
        },
      });
    }

    // Get total count
    const totalBlocks = await prisma.block.count({
      where: dateFilter,
    });

    // Get count of blocks created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const blocksCreatedToday = await prisma.block.count({
      where: {
        created_at: {
          gte: today,
        },
      },
    });

    // Get blocks by type
    const blocksByType = await prisma.$queryRaw`
        SELECT type, COUNT(*) as count
        FROM blocks
        GROUP BY type
        ORDER BY count DESC
      `;

    // Get total users for average calculation
    const totalUsers = await prisma.user.count();

    // Calculate average blocks per user
    const averageBlocksPerUser = totalUsers > 0 ? totalBlocks / totalUsers : 0;

    // Get most popular block types with click count
    const popularBlockTypesData = await prisma.block.groupBy({
      by: ["type"],
      _sum: {
        clicks: true,
      },
      orderBy: {
        _sum: {
          clicks: "desc",
        },
      },
      take: 5,
    });

    // Format the result to match expected structure
    const popularBlockTypes = popularBlockTypesData.map(item => ({
      type: item.type,
      totalClicks: item._sum.clicks || 0,
    }));

    return {
      totalBlocks,
      blocksCreatedToday,
      averageBlocksPerUser,
      blocksByType,
      popularBlockTypes,
    };
  }),

  getBlocksByType: adminProcedure
    .input(
      z.object({
        ...PaginationSchema.shape,
        ...BlockTypeFilterSchema.shape,
      })
    )
    .query(async ({ input }) => {
      const { page, limit, type } = input;
      const skip = (page - 1) * limit;

      const where = type ? { type } : {};

      const blocks = await prisma.block.findMany({
        where,
        skip,
        take: limit,
        orderBy: { clicks: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              onelink: true,
            },
          },
        },
      });

      const totalBlocks = await prisma.block.count({ where });

      return {
        blocks,
        pagination: {
          total: totalBlocks,
          pages: Math.ceil(totalBlocks / limit),
          page,
          limit,
        },
      };
    }),
});
