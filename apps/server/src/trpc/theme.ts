import { privateProcedure, publicProcedure, router } from "./trpc";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { s3Service } from "../services/S3Service";
import { themeConfigSchema } from "@ampedbio/constants";
import { getFileUrl } from "../utils/fileUrlResolver";

const prisma = new PrismaClient();

// Schema for theme ID parameter
const themeIdSchema = z.object({
  id: z.number(),
});

// Schema for category ID parameter
const categoryIdSchema = z.object({
  id: z.number(),
});

// Schema for theme object using the imported theme config schema
const themeObjectSchema = z.object({
  name: z.string().min(1, "Theme name is required"),
  description: z.string().optional(),
  share_level: z.string(),
  share_config: z.any(),
  config: themeConfigSchema.optional(),
});

// Schema for applying theme to user
const applyThemeSchema = z.object({
  themeId: z.number(),
  theme: themeObjectSchema.optional(),
});

export const themeRouter = router({
  // Edit/Create theme (authenticated users only)
  editTheme: privateProcedure
    .input(
      z.object({
        id: z.number(),
        theme: themeObjectSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, theme } = input;
      const user_id = ctx.user.id;
      
      // The theme object is now properly validated using the shared schema
      const { name, description, share_level, share_config, config } = theme;

      try {
        // If id is 0, create a new theme
        if (Number(id) === 0) {
          const result = await prisma.theme.create({
            data: {
              user_id,
              name,
              description,
              share_level,
              share_config: share_config as any,
              config: config as any,
            },
          });

          return result;
        }

        // Check if the theme exists first
        const themeExists = await prisma.theme.findUnique({
          where: {
            id: Number(id),
          },
        });

        if (themeExists === null) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Theme not found: ${id}`,
          });
        }

        // Check if the theme belongs to the user
        if (themeExists.user_id !== user_id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to edit this theme",
          });
        }

        const existingTheme = themeExists;

        // Check if there's an existing background in the theme config that needs to be deleted
        const existingConfig = (existingTheme.config as Record<string, any>) || {};
        const newConfig = (config as Record<string, any>) || {};

        // Check if the background has changed
        const existingBackground = existingConfig.background?.value;
        const newBackground = newConfig.background?.value;

        if (
          existingBackground &&
          newBackground !== existingBackground &&
          typeof existingBackground === "string"
        ) {
          // Extract the file key from the existing background URL
          const backgroundFileKey = s3Service.extractFileKeyFromUrl(existingBackground);

          // Check if the file belongs to this user and theme, and delete it if it does
          if (
            backgroundFileKey &&
            s3Service.isThemeOwnerFile({
              fileKey: backgroundFileKey,
              themeId: Number(id),
              userId: user_id,
            })
          ) {
            try {
              console.info(
                "[INFO] Deleting previous theme background during theme update",
                JSON.stringify({ backgroundFileKey, themeId: Number(id), userId: user_id })
              );
              await s3Service.deleteFile(backgroundFileKey);
            } catch (deleteError) {
              // Log the error and fail the whole operation
              console.error("Failed to delete previous background during theme update:", deleteError);
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `Failed to delete previous background file: ${backgroundFileKey}`,
              });
            }
          }
        }

        const result = await prisma.theme.update({
          where: { id: Number(id) },
          data: {
            name,
            description,
            share_level,
            share_config: share_config as any,
            config: config as any,
          },
        });

        return result;
      } catch (error) {
        console.error("error", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Server error",
        });
      }
    }),

  // Get theme by ID (public access)
  getTheme: publicProcedure.input(themeIdSchema).query(async ({ input }) => {
    const { id } = input;

    try {
      const result = await prisma.theme.findUnique({
        where: {
          id: Number(id),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              image_file_id: true,
            },
          },
          thumbnailImage: true,
        },
      });

      if (result === null) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Theme not found: ${id}`,
        });
      }

      // Resolve image URLs
      const resolvedUserImage = result.user 
        ? await getFileUrl({ imageField: result.user.image, imageFileId: result.user.image_file_id })
        : null;

      const resolvedThumbnailImage = result.thumbnailImage 
        ? await getFileUrl({ imageField: null, imageFileId: result.thumbnailImage.id })
        : null;

      return {
        ...result,
        user: result.user ? {
          ...result.user,
          image: resolvedUserImage,
        } : null,
        thumbnailImage: result.thumbnailImage ? {
          ...result.thumbnailImage,
          url: resolvedThumbnailImage,
        } : null,
      };
    } catch (error) {
      console.error("error", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Delete theme (authenticated users only)
  deleteTheme: privateProcedure.input(themeIdSchema).mutation(async ({ ctx, input }) => {
    const { id } = input;
    const user_id = ctx.user.id;

    try {
      const theme = await prisma.theme.findUnique({
        where: {
          id: Number(id),
          user_id: user_id,
        },
      });

      if (theme === null) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Theme not found: ${id}`,
        });
      }

      const result = await prisma.theme.delete({
        where: {
          id: Number(id),
          user_id: user_id,
        },
      });

      return result;
    } catch (error) {
      console.error("error", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Get user's themes (authenticated users only)
  getUserThemes: privateProcedure.query(async ({ ctx }) => {
    const user_id = ctx.user.id;

    try {
      const themes = await prisma.theme.findMany({
        where: {
          user_id: user_id,
        },
        orderBy: {
          updated_at: "desc",
        },
        include: {
          thumbnailImage: true,
        },
      });

      // Resolve image URLs for all themes
      const themesWithResolvedImages = await Promise.all(
        themes.map(async (theme) => ({
          ...theme,
          thumbnailImage: theme.thumbnailImage ? {
            ...theme.thumbnailImage,
            url: await getFileUrl({ imageField: null, imageFileId: theme.thumbnailImage.id }),
          } : null,
        }))
      );

      return themesWithResolvedImages;
    } catch (error) {
      console.error("error", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Get all theme categories (public access)
  getThemeCategories: publicProcedure.query(async () => {
    try {
      const categories = await prisma.themeCategory.findMany({
        orderBy: {
          name: "asc",
        },
        include: {
          categoryImage: true,
        },
      });

      // Resolve image URLs for all categories
      const categoriesWithResolvedImages = await Promise.all(
        categories.map(async (category) => ({
          ...category,
          categoryImage: category.categoryImage ? {
            ...category.categoryImage,
            url: await getFileUrl({ imageField: null, imageFileId: category.categoryImage.id }),
          } : null,
        }))
      );

      return categoriesWithResolvedImages;
    } catch (error) {
      console.error("error", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Get themes by category ID (public access)
  getThemesByCategory: publicProcedure
    .input(categoryIdSchema)
    .query(async ({ input }) => {
      const { id } = input;

      try {
        const category = await prisma.themeCategory.findUnique({
          where: {
            id: Number(id),
          },
          include: {
            categoryImage: true,
          },
        });

        if (category === null) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Theme category not found: ${id}`,
          });
        }

        const themes = await prisma.theme.findMany({
          where: {
            category_id: Number(id),
            share_level: {
              not: "private", // Only return public/shared themes
            },
          },
          orderBy: {
            updated_at: "desc",
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                image_file_id: true,
              },
            },
            thumbnailImage: true,
          },
        });

        // Resolve image URLs for all themes and users
        const themesWithResolvedImages = await Promise.all(
          themes.map(async (theme) => ({
            ...theme,
            user: theme.user ? {
              ...theme.user,
              image: await getFileUrl({ imageField: theme.user.image, imageFileId: theme.user.image_file_id }),
            } : null,
            thumbnailImage: theme.thumbnailImage ? {
              ...theme.thumbnailImage,
              url: await getFileUrl({ imageField: null, imageFileId: theme.thumbnailImage.id }),
            } : null,
          }))
        );

        // Resolve category image URL
        const resolvedCategoryImageFile = category.categoryImage ? {
          ...category.categoryImage,
          url: await getFileUrl({ imageField: null, imageFileId: category.categoryImage.id }),
        } : null;

        return {
          category: {
            ...category,
            categoryImage: resolvedCategoryImageFile,
          },
          themes: themesWithResolvedImages,
        };
      } catch (error) {
        console.error("error", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Server error",
        });
      }
    }),

  // Get all collections/theme categories (public access)
  getCollections: publicProcedure.query(async () => {
    try {
      const categories = await prisma.themeCategory.findMany({
        orderBy: {
          name: "asc",
        },
        include: {
          categoryImage: true,
          _count: {
            select: {
              themes: {
                where: {
                  share_level: {
                    not: "private", // Only count public/shared themes
                  },
                },
              },
            },
          },
        },
      });

      // Resolve image URLs for all categories and transform to Collection format
      const collectionsWithResolvedImages = await Promise.all(
        categories.map(async (category) => ({
          id: category.id.toString(),
          name: category.name,
          description: category.description || "",
          themeCount: category._count.themes,
          isServer: true,
          categoryImage: category.categoryImage ? {
            ...category.categoryImage,
            url: await getFileUrl({ imageField: null, imageFileId: category.categoryImage.id }),
          } : null,
        }))
      );

      return collectionsWithResolvedImages;
    } catch (error) {
      console.error("error", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Apply theme to user (authenticated users only)
  applyTheme: privateProcedure
    .input(applyThemeSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { themeId, theme } = input;

      try {
        let themeToApply;
        let themeIdToStore = themeId;

        if (themeId === 0) {
          // Hardcoded theme - user passed theme data
          if (!theme) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Theme data is required when themeId is 0",
            });
          }

          // Check if user already has a theme
          const existingUserTheme = await prisma.theme.findFirst({
            where: {
              user_id: userId,
            },
          });

          if (existingUserTheme) {
            // Update existing user theme
            const updatedTheme = await prisma.theme.update({
              where: {
                id: existingUserTheme.id,
              },
              data: {
                name: theme.name,
                description: theme.description,
                share_level: theme.share_level,
                share_config: theme.share_config as any,
                config: theme.config as any,
                updated_at: new Date(),
              },
            });
            
            themeToApply = updatedTheme;
            themeIdToStore = updatedTheme.id;
          } else {
            // Create new theme for user
            const newTheme = await prisma.theme.create({
              data: {
                user_id: userId,
                name: theme.name,
                description: theme.description,
                share_level: theme.share_level,
                share_config: theme.share_config as any,
                config: theme.config as any,
              },
            });
            
            themeToApply = newTheme;
            themeIdToStore = newTheme.id;
          }
        } else {
          // Marketplace theme - check if it exists and is a server theme
          const existingTheme = await prisma.theme.findUnique({
            where: {
              id: Number(themeId),
            },
          });

          if (existingTheme === null) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Theme not found: ${themeId}`,
            });
          }

          if (existingTheme.user_id !== null) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Only marketplace themes can be applied",
            });
          }

          themeToApply = existingTheme;
          themeIdToStore = themeId;
        }

        // Update user's theme
        const updatedUser = await prisma.user.update({
          where: {
            id: userId,
          },
          data: {
            theme: themeIdToStore.toString(),
            updated_at: new Date(),
          },
        });

        return {
          success: true,
          message: "Theme applied successfully",
          themeId: themeIdToStore,
          themeName: themeToApply.name,
        };
      } catch (error) {
        console.error("Error applying theme:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to apply theme",
        });
      }
    }),
});
