import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getFileUrl } from "../../utils/fileUrlResolver";
import { 
  PaginationSchema, 
  UserFilterSchema, 
  UserSearchSchema, 
  UserUpdateSchema 
} from "./schemas";
import { prisma } from "../../services/DB";

export const usersRouter = router({
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
          image_file_id: true,
          reward_business_id: true,
          _count: {
            select: {
              blocks: true,
              themes: true
            }
          }
        }
      });
      
      // Resolve image URLs for all users
      const usersWithResolvedImages = await Promise.all(
        users.map(async (user) => ({
          ...user,
          image: await getFileUrl({ legacyImageField: user.image, imageFileId: user.image_file_id })
        }))
      );
      
      // Get total count for pagination
      const totalUsers = await prisma.user.count({ where });
      
      return {
        users: usersWithResolvedImages,
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

      // Resolve the user's image URL
      const resolvedImageUrl = await getFileUrl({ legacyImageField: user.image, imageFileId: user.image_file_id });
      
      return {
        ...user,
        image: resolvedImageUrl
      };
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
});
