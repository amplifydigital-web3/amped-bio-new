import { adminProcedure, router } from "./trpc";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

const prisma = new PrismaClient();

// Schema definitions for various admin queries and mutations
const DateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const PaginationSchema = z.object({
  page: z.number().default(1),
  limit: z.number().default(10)
});

const UserFilterSchema = z.object({
  search: z.string().optional(),
  role: z.string().optional(),
  blocked: z.boolean().optional(),
});

const UserSearchSchema = z.object({
  query: z.string().min(2, "Search query must be at least 2 characters"),
});

const BlockTypeFilterSchema = z.object({
  type: z.string().optional()
});

const UserUpdateSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.string().optional(),
  block: z.enum(["yes", "no"]).optional(),
});

// Theme creation schema
const ThemeCreateSchema = z.object({
  share_level: z.string().optional(),
  share_config: z.any().optional(),
  name: z.string().optional(),
  description: z.string().optional(), // add description
  config: z.any().optional(),
  category_id: z.number().nullable().optional()
});

// Theme category schemas
const ThemeCategoryCreateSchema = z.object({
  name: z.string().min(1, "Category name is required"),
  title: z.string().min(1, "Category title is required"),
  category: z.string().min(1, "Category identifier is required")
});

export const adminRouter = router({
  // User Management
  getUsers: adminProcedure
    .input(z.object({
      ...PaginationSchema.shape,
      ...UserFilterSchema.shape
    }))
    .query(async ({ input }) => {
      const { page, limit, search, role, blocked } = input;
      const skip = (page - 1) * limit;
      
      // Build filter conditions
      const where = {
        ...(search ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { onelink: { contains: search } }
          ]
        } : {}),
        ...(role ? { role } : {}),
        ...(blocked !== undefined ? { block: blocked ? "yes" : "no" } : {})
      };
      
      // Get users with pagination
      const users = await prisma.user.findMany({
        skip,
        take: limit,
        where,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          onelink: true,
          role: true,
          block: true,
          created_at: true,
          updated_at: true,
          image: true,
          reward_business_id: true,
          _count: {
            select: {
              blocks: true,
              themes: true
            }
          }
        }
      });
      
      // Get total count for pagination
      const totalUsers = await prisma.user.count({ where });
      
      return {
        users,
        pagination: {
          total: totalUsers,
          pages: Math.ceil(totalUsers / limit),
          page,
          limit
        }
      };
    }),
    
  getUserDetails: adminProcedure
    .input(z.object({
      userId: z.number()
    }))
    .query(async ({ input }) => {
      const { userId } = input;
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          blocks: {
            orderBy: { order: 'asc' }
          },
          themes: true,
          _count: {
            select: {
              blocks: true,
              themes: true
            }
          }
        }
      });
      
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found"
        });
      }
      
      return user;
    }),
    
  updateUser: adminProcedure
    .input(UserUpdateSchema)
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      
      try {
        const updatedUser = await prisma.user.update({
          where: { id },
          data: {
            ...data,
            updated_at: new Date()
          },
          select: {
            id: true,
            name: true,
            email: true,
            onelink: true,
            role: true,
            block: true
          }
        });
        
        return updatedUser;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update user"
        });
      }
    }),
  
  // Block Management & Statistics
  getBlockStats: adminProcedure
    .input(DateRangeSchema.optional())
    .query(async ({ input }) => {
      const startDate = input?.startDate ? new Date(input.startDate) : undefined;
      const endDate = input?.endDate ? new Date(input.endDate) : undefined;
      
      // Build date filter if provided
      const dateFilter = {};
      if (startDate && endDate) {
        Object.assign(dateFilter, {
          created_at: {
            gte: startDate,
            lte: endDate
          }
        });
      } else if (startDate) {
        Object.assign(dateFilter, {
          created_at: {
            gte: startDate
          }
        });
      } else if (endDate) {
        Object.assign(dateFilter, {
          created_at: {
            lte: endDate
          }
        });
      }
      
      // Get total count
      const totalBlocks = await prisma.block.count({
        where: dateFilter
      });
      
      // Get count of blocks created today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const blocksCreatedToday = await prisma.block.count({
        where: {
          created_at: {
            gte: today
          }
        }
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
        by: ['type'],
        _sum: {
          clicks: true
        },
        orderBy: {
          _sum: {
            clicks: 'desc'
          }
        },
        take: 5
      });
      
      // Format the result to match expected structure
      const popularBlockTypes = popularBlockTypesData.map(item => ({
        type: item.type,
        totalClicks: item._sum.clicks || 0
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
    .input(z.object({
      ...PaginationSchema.shape,
      ...BlockTypeFilterSchema.shape
    }))
    .query(async ({ input }) => {
      const { page, limit, type } = input;
      const skip = (page - 1) * limit;
      
      const where = type ? { type } : {};
      
      const blocks = await prisma.block.findMany({
        where,
        skip,
        take: limit,
        orderBy: { clicks: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              onelink: true
            }
          }
        }
      });
      
      const totalBlocks = await prisma.block.count({ where });
      
      return {
        blocks,
        pagination: {
          total: totalBlocks,
          pages: Math.ceil(totalBlocks / limit),
          page,
          limit
        }
      };
    }),
  
  // Theme Management
  getThemeStats: adminProcedure
    .input(DateRangeSchema.optional())
    .query(async ({ input }) => {
      const startDate = input?.startDate ? new Date(input.startDate) : undefined;
      const endDate = input?.endDate ? new Date(input.endDate) : undefined;
      
      // Build date filter if provided
      const dateFilter = {};
      if (startDate && endDate) {
        Object.assign(dateFilter, {
          created_at: {
            gte: startDate,
            lte: endDate
          }
        });
      } else if (startDate) {
        Object.assign(dateFilter, {
          created_at: {
            gte: startDate
          }
        });
      } else if (endDate) {
        Object.assign(dateFilter, {
          created_at: {
            lte: endDate
          }
        });
      }
      
      // Get total count
      const totalThemes = await prisma.theme.count({
        where: dateFilter
      });
      
      // Get themes created today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const themesCreatedToday = await prisma.theme.count({
        where: {
          created_at: {
            gte: today
          }
        }
      });
      
      // Get share level distribution
      const shareDistributionData = await prisma.theme.groupBy({
        by: ['share_level'],
        _count: {
          id: true
        }
      });
      
      // Format the share_level distribution data
      const shareDistribution = shareDistributionData.map(item => ({
        share_level: item.share_level,
        count: item._count.id
      }));
      
      return {
        totalThemes,
        themesCreatedToday,
        shareDistribution,
      };
    }),
  
  // Dashboard Stats (aggregation of multiple metrics)
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
          gte: lastWeek
        }
      }
    });
    
    // Count users with reward program
    const rewardProgramUsers = await prisma.user.count({
      where: {
        reward_business_id: {
          not: null,
        }
      }
    });
    
    // Percentage of users with a reward program
    const rewardProgramPercentage = totalUsers > 0 ? (rewardProgramUsers / totalUsers) * 100 : 0;
    
    // Block statistics
    const totalBlocks = await prisma.block.count();
    const blocksCreatedToday = await prisma.block.count({
      where: {
        created_at: {
          gte: today
        }
      }
    });
    const mostPopularBlockType = await prisma.block.groupBy({
      by: ['type'],
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 1
    });
    
    // Calculate average blocks per user
    const averageBlocksPerUser = totalUsers > 0 ? totalBlocks / totalUsers : 0;
    
    return {
      userStats: {
        totalUsers,
        newThisWeek,
        rewardProgramUsers,
        rewardProgramPercentage: parseFloat(rewardProgramPercentage.toFixed(1))
      },
      blockStats: {
        totalBlocks,
        blocksCreatedToday,
        averageBlocksPerUser: parseFloat(averageBlocksPerUser.toFixed(1)),
        mostPopularBlockType: mostPopularBlockType.length > 0 ? mostPopularBlockType[0].type : null
      }
    };
  }),
  
  // Get top performing onelinks
  getTopOnelinks: adminProcedure
    .input(z.object({
      limit: z.number().default(5)
    }))
    .query(async ({ input }) => {
      const { limit } = input;
      
      // Get users with their blocks aggregated by clicks
      const usersWithBlockStats = await prisma.user.findMany({
        where: {
          onelink: {
            not: null
          },
          blocks: {
            some: {}
          }
        },
        take: limit,
        select: {
          id: true,
          name: true,
          onelink: true,
          blocks: {
            select: {
              clicks: true
            }
          }
        },
        orderBy: {
          blocks: {
            _count: 'desc'
          }
        }
      });
      
      // Calculate total clicks for each onelink
      const topOnelinks = usersWithBlockStats.map(user => {
        const totalClicks = user.blocks.reduce((sum: number, block: { clicks: number }) => sum + block.clicks, 0);
        return {
          userId: user.id,
          name: user.name,
          onelink: user.onelink,
          totalClicks,
          blockCount: user.blocks.length
        };
      }).sort((a, b) => b.totalClicks - a.totalClicks);
      
      return topOnelinks;
    }),
  
  // Search users by email or name
  searchUsers: adminProcedure
    .input(UserSearchSchema)
    .query(async ({ input }) => {
      const { query } = input;
      const limit = 10;
      
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: query } },
            { name: { contains: query } }
          ]
        },
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          onelink: true,
          role: true,
          block: true,
          image: true,
          created_at: true,
          _count: {
            select: {
              blocks: true,
              themes: true
            }
          }
        }
      });
      
      return users;
    }),
    
  createTheme: adminProcedure
    .input(ThemeCreateSchema)
    .mutation(async ({ input }) => {
      try {
        const theme = await prisma.theme.create({
          data: {
            user_id: undefined, // Admin themes have no user_id
            share_level: input.share_level ?? 'private',
            share_config: input.share_config,
            name: input.name,
            description: input.description,
            config: input.config,
            category_id: input.category_id
          }
        });
        return theme;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create theme'
        });
      }
    }),
    
  // Theme Category Management
  getThemeCategories: adminProcedure
    .query(async () => {
      try {
        const categories = await prisma.themeCategory.findMany({
          orderBy: { created_at: 'desc' },
          include: {
            _count: {
              select: {
                themes: true
              }
            }
          }
        });
        return categories;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch theme categories'
        });
      }
    }),
    
  createThemeCategory: adminProcedure
    .input(ThemeCategoryCreateSchema)
    .mutation(async ({ input }) => {
      try {
        const category = await prisma.themeCategory.create({
          data: {
            name: input.name,
            title: input.title,
            category: input.category
          }
        });
        return category;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create theme category'
        });
      }
    }),
});