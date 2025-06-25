import { adminProcedure, router } from "../trpc";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getFileUrl } from "../../utils/fileUrlResolver";
import { uploadedFileService } from "../../services/UploadedFileService";
import { s3Service } from "../../services/S3Service";
import { 
  DateRangeSchema, 
  PaginationSchema, 
  ThemeCreateSchema, 
  ThemeCategoryCreateSchema,
  ThemeCategoryToggleVisibilitySchema
} from "./schemas";

const prisma = new PrismaClient();

export const themesRouter = router({
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
    
  createTheme: adminProcedure
    .input(ThemeCreateSchema)
    .mutation(async ({ input }) => {
      try {
        const theme = await prisma.theme.create({
          data: {
            user_id: undefined, // Admin themes have no user_id
            share_level: 'public', // Admin themes are always public
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
    
  getThemeCategories: adminProcedure
    .query(async () => {
      try {
        const categories = await prisma.themeCategory.findMany({
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            name: true,
            title: true,
            category: true,
            description: true,
            visible: true,
            image_file_id: true,
            created_at: true,
            updated_at: true,
            _count: {
              select: {
                themes: true
              }
            }
          }
        });

        // Resolve image URLs for all categories
        const categoriesWithResolvedImages = await Promise.all(
          categories.map(async (category) => ({
            ...category,
            image: await getFileUrl({ legacyImageField: null, imageFileId: category.image_file_id })
          }))
        );

        return categoriesWithResolvedImages;
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
            category: input.category,
            description: input.description
          }
        });
        return category;
      } catch (error: any) {
        console.error('Failed to create theme category:', error);
        
        // Handle Prisma unique constraint violations
        if (error.code === 'P2002') {
          const field = error.meta?.target || 'field';
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A category with this ${field} already exists. Please choose a different ${field}.`
          });
        }
        
        // Handle other database errors
        if (error.code && error.code.startsWith('P')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Database error: ${error.message}`
          });
        }
        
        // Generic fallback
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create theme category: ${error.message || 'Unknown error'}`
        });
      }
    }),
    
  getThemes: adminProcedure
    .input(z.object({
      ...PaginationSchema.shape,
      category_id: z.number().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { page, limit, category_id, search } = input;
      const skip = (page - 1) * limit;
      
      // Build filter conditions - only admin themes (user_id is null)
      const where = {
        user_id: null, // Only admin themes
        ...(category_id ? { category_id } : {}),
        ...(search ? {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } }
          ]
        } : {})
      };
      
      try {
        // Get themes with pagination
        const themes = await prisma.theme.findMany({
          skip,
          take: limit,
          where,
          orderBy: { updated_at: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                image_file_id: true,
              }
            },
            category: {
              select: {
                id: true,
                name: true,
                title: true,
              }
            },
            thumbnailImage: true,
          }
        });

        // Resolve image URLs for all themes and users
        const themesWithResolvedImages = await Promise.all(
          themes.map(async (theme) => ({
            ...theme,
            user: theme.user ? {
              ...theme.user,
              image: await getFileUrl({ legacyImageField: theme.user.image, imageFileId: theme.user.image_file_id }),
            } : null,
            thumbnailImage: theme.thumbnailImage ? {
              ...theme.thumbnailImage,
              url: await getFileUrl({ legacyImageField: null, imageFileId: theme.thumbnailImage.id }),
            } : null,
          }))
        );

        // Get total count for pagination
        const totalThemes = await prisma.theme.count({ where });
        
        return {
          themes: themesWithResolvedImages,
          pagination: {
            total: totalThemes,
            pages: Math.ceil(totalThemes / limit),
            page,
            limit
          }
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch themes'
        });
      }
    }),

  deleteTheme: adminProcedure
    .input(z.object({
      id: z.number()
    }))
    .mutation(async ({ input }) => {
      const { id } = input;
      
      try {
        // First, check if the theme exists and get all related file information
        const theme = await prisma.theme.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            user_id: true,
            thumbnail_file_id: true,
            config: true
          }
        });

        if (!theme) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Theme not found'
          });
        }

        // Check if any users are currently using this theme
        // This checks both the theme field (for theme name/identifier) and user-created themes
        const usersUsingTheme = await prisma.user.findMany({
          where: {
            OR: [
              { theme: theme.name }, // Users using theme by name
              { theme: id.toString() } // Users using theme by ID
            ]
          },
          select: {
            id: true,
            name: true,
            email: true,
            onelink: true
          }
        });

        if (usersUsingTheme.length > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Cannot delete theme. It is currently being used by ${usersUsingTheme.length} user(s). Please ensure no users are using this theme before deleting it.`,
            cause: {
              usersUsingTheme: usersUsingTheme
            }
          });
        }

        // Collect files to delete
        const filesToDelete: number[] = [];
        let deletionErrors: string[] = [];

        // Add thumbnail file ID if it exists
        if (theme.thumbnail_file_id) {
          filesToDelete.push(theme.thumbnail_file_id);
        }

        // Check for background file in theme config
        if (theme.config && typeof theme.config === 'object') {
          const config = theme.config as any;
          if (config.background?.fileId && typeof config.background.fileId === 'number') {
            filesToDelete.push(config.background.fileId);
          }
        }

        // Delete all associated files from S3 and database
        for (const fileId of filesToDelete) {
          try {
            // Get file information first
            const uploadedFile = await uploadedFileService.getFileById(fileId);
            
            if (uploadedFile) {
              // Delete from S3
              await s3Service.deleteFile(uploadedFile.s3_key);
              
              // Mark file as deleted in database
              await uploadedFileService.deleteFile(fileId);
              
              console.info(`[INFO] Successfully deleted file for theme ${id}:`, {
                fileId,
                s3Key: uploadedFile.s3_key
              });
            }
          } catch (fileDeleteError: any) {
            const errorMessage = `Failed to delete file ${fileId}: ${fileDeleteError.message || 'Unknown error'}`;
            deletionErrors.push(errorMessage);
            console.error(`[ERROR] ${errorMessage}`, fileDeleteError);
          }
        }

        // If there were any file deletion errors, fail the entire operation
        if (deletionErrors.length > 0) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to delete theme files: ${deletionErrors.join('; ')}`,
            cause: {
              deletionErrors,
              filesAttempted: filesToDelete
            }
          });
        }

        // Delete the theme from database
        const deletedTheme = await prisma.theme.delete({
          where: { id },
          select: {
            id: true,
            name: true,
            description: true
          }
        });

        return {
          success: true,
          message: `Theme "${deletedTheme.name}" has been successfully deleted`,
          deletedTheme,
          deletedFiles: filesToDelete.length
        };
      } catch (error: any) {
        // Re-throw TRPCError as is
        if (error instanceof TRPCError) {
          throw error;
        }
        
        // Handle Prisma errors
        if (error.code === 'P2025') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Theme not found'
          });
        }
        
        // Handle other database errors
        if (error.code && error.code.startsWith('P')) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Database error: ${error.message}`
          });
        }
        
        // Generic fallback
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete theme: ${error.message || 'Unknown error'}`
        });
      }
    }),

  toggleThemeCategoryVisibility: adminProcedure
    .input(ThemeCategoryToggleVisibilitySchema)
    .mutation(async ({ input }) => {
      const { id, visible } = input;
      
      try {
        const updatedCategory = await prisma.themeCategory.update({
          where: { id },
          data: { visible },
          select: {
            id: true,
            name: true,
            title: true,
            visible: true
          }
        });

        return {
          success: true,
          message: `Category "${updatedCategory.title}" visibility updated to ${visible ? 'visible' : 'hidden'}`,
          category: updatedCategory
        };
      } catch (error: any) {
        console.error('Failed to update theme category visibility:', error);
        
        if (error.code === 'P2025') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Theme category not found'
          });
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to update category visibility: ${error.message || 'Unknown error'}`
        });
      }
    }),
});
