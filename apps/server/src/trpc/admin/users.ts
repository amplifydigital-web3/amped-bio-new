import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getFileUrl } from "../../utils/fileUrlResolver";
import { PaginationSchema, UserFilterSchema, UserSearchSchema, UserUpdateSchema } from "./schemas";
import { prisma } from "../../services/DB";

export const usersRouter = router({
  getUsers: adminProcedure
    .input(
      z.object({
        ...PaginationSchema.shape,
        ...UserFilterSchema.shape,
        sortBy: z.string().optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const { page, limit, search, role, blocked, sortBy, sortDirection } = input;
      const skip = (page - 1) * limit;

      // Build filter conditions
      const where = {
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { email: { contains: search } },
                { handle: { contains: search } },
                { wallet: { address: { contains: search } } },
              ],
            }
          : {}),
        ...(role ? { role } : {}),
        ...(blocked !== undefined ? { block: blocked ? "yes" : "no" } : {}),
      };

      const totalUsers = await prisma.user.count({ where });
      let users;

      if (sortBy === "totalClicks") {
        const usersMatchingFilter = await prisma.user.findMany({
          where,
          select: { id: true },
        });
        const userIds = usersMatchingFilter.map(u => u.id);

        const blockAggregations = await prisma.block.groupBy({
          by: ["user_id"],
          where: { user_id: { in: userIds } },
          _sum: { clicks: true },
        });

        const clicksMap = new Map(
          blockAggregations.map(agg => [agg.user_id, agg._sum.clicks || 0])
        );

        userIds.forEach(id => {
          if (!clicksMap.has(id)) {
            clicksMap.set(id, 0);
          }
        });

        const sortedUserIds = userIds.sort((a, b) => {
          const clicksA = clicksMap.get(a) || 0;
          const clicksB = clicksMap.get(b) || 0;
          if (sortDirection === "asc") {
            return clicksA - clicksB;
          }
          return clicksB - clicksA;
        });

        const paginatedUserIds = sortedUserIds.slice(skip, skip + limit);

        users = await prisma.user.findMany({
          where: { id: { in: paginatedUserIds } },
          select: {
            id: true,
            name: true,
            email: true,
            handle: true,
            role: true,
            block: true,
            created_at: true,
            updated_at: true,
            image: true,
            image_file_id: true,
            reward_business_id: true,
            wallet: true,
            _count: {
              select: {
                blocks: true,
                themes: true,
              },
            },
          },
        });

        users.sort((a, b) => paginatedUserIds.indexOf(a.id) - paginatedUserIds.indexOf(b.id));
      } else {
        const orderBy = sortBy
          ? sortBy === "blocks" || sortBy === "themes"
            ? {
                [sortBy]: {
                  _count: sortDirection || "desc",
                },
              }
            : { [sortBy]: sortDirection || "desc" }
          : { created_at: "desc" };

        users = await prisma.user.findMany({
          skip,
          take: limit,
          where,
          orderBy: orderBy as any, // Using as any to bypass strict type checking for dynamic orderBy
          select: {
            id: true,
            name: true,
            email: true,
            handle: true,
            role: true,
            block: true,
            created_at: true,
            updated_at: true,
            image: true,
            image_file_id: true,
            reward_business_id: true,
            wallet: true,
            _count: {
              select: {
                blocks: true,
                themes: true,
              },
            },
          },
        });
      }

      // Resolve image URLs for all users
      const usersWithResolvedImages = await Promise.all(
        users.map(async user => ({
          ...user,
          image: await getFileUrl({
            legacyImageField: user.image,
            imageFileId: user.image_file_id,
          }),
        }))
      );

      // Get user IDs for fetching click counts
      const userIds = users.map(user => user.id);

      // Get total clicks for each user
      const clickCounts = await prisma.block.groupBy({
        by: ["user_id"],
        where: {
          user_id: {
            in: userIds,
          },
        },
        _sum: {
          clicks: true,
        },
      });

      // Create a map for easy lookup
      const clicksMap = new Map(clickCounts.map(count => [count.user_id, count._sum.clicks || 0]));

      // Combine user data with click counts
      const usersWithClicks = usersWithResolvedImages.map(user => ({
        ...user,
        totalClicks: clicksMap.get(user.id) || 0,
      }));

      return {
        users: usersWithClicks,
        pagination: {
          total: totalUsers,
          pages: Math.ceil(totalUsers / limit),
          page,
          limit,
        },
      };
    }),

  getUserDetails: adminProcedure
    .input(
      z.object({
        userId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const { userId } = input;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          blocks: {
            orderBy: { order: "asc" },
          },
          themes: true,
          _count: {
            select: {
              blocks: true,
              themes: true,
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Resolve the user's image URL
      const resolvedImageUrl = await getFileUrl({
        legacyImageField: user.image,
        imageFileId: user.image_file_id,
      });

      return {
        ...user,
        image: resolvedImageUrl,
      };
    }),

  updateUser: adminProcedure.input(UserUpdateSchema).mutation(async ({ input }) => {
    const { id, ...data } = input;

    try {
      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          ...data,
          updated_at: new Date(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          handle: true,
          role: true,
          block: true,
        },
      });

      return updatedUser;
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update user",
      });
    }
  }),

  searchUsers: adminProcedure.input(UserSearchSchema).query(async ({ input }) => {
    const { query } = input;
    const limit = 10;

    const users = await prisma.user.findMany({
      where: {
        OR: [{ email: { contains: query } }, { name: { contains: query } }],
      },
      take: limit,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        handle: true,
        role: true,
        block: true,
        image: true,
        created_at: true,
        _count: {
          select: {
            blocks: true,
            themes: true,
          },
        },
      },
    });

    return users;
  }),

  getTopHandles: adminProcedure
    .input(
      z.object({
        limit: z.number().default(5),
      })
    )
    .query(async ({ input }) => {
      const { limit } = input;

      // Get top users by total block clicks
      const topBlocks = await prisma.block.groupBy({
        by: ["user_id"],
        _sum: {
          clicks: true,
        },
        orderBy: {
          _sum: {
            clicks: "desc",
          },
        },
        take: limit,
      });

      if (topBlocks.length === 0) {
        return [];
      }

      // Get user details for the top users
      const userIds = topBlocks.map(block => block.user_id);
      const users = await prisma.user.findMany({
        where: {
          id: {
            in: userIds,
          },
        },
        include: {
          _count: {
            select: {
              blocks: true,
            },
          },
        },
      });

      // Create a map for easy lookup
      const userMap = new Map(users.map(user => [user.id, user]));

      // Combine the data, preserving the order from topBlocks
      const topHandles = topBlocks
        .map(block => {
          const user = userMap.get(block.user_id);
          if (!user || !user.handle) {
            return null;
          }
          return {
            userId: user.id,
            name: user.name,
            handle: user.handle,
            totalClicks: block._sum.clicks || 0,
            blockCount: user._count.blocks,
          };
        })
        .filter(Boolean);

      return topHandles;
    }),
});
