/**
 * THEME GALLERY ROUTER
 *
 * This router handles public theme gallery and marketplace operations:
 * - Browsing public themes by category
 * - Getting theme details for public viewing
 * - Listing theme categories and collections
 * - Getting theme counts and metadata for gallery display
 *
 * All methods are public and don't require authentication.
 * For user theme management operations, see theme.ts
 */

import { publicProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getFileUrl } from "../utils/fileUrlResolver";
import { prisma } from "../services/DB";

// Schema for theme ID parameter
const themeIdSchema = z.object({
  id: z.number(),
});

// Schema for category ID parameter
const categoryIdSchema = z.object({
  id: z.number(),
});

export const themeGalleryRouter = router({
  // Get theme by ID (public access for viewing marketplace themes)
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
        ? await getFileUrl({
            legacyImageField: result.user.image,
            imageFileId: result.user.image_file_id,
          })
        : null;

      const resolvedThumbnailImage = result.thumbnailImage
        ? await getFileUrl({ legacyImageField: null, imageFileId: result.thumbnailImage.id })
        : null;

      return {
        ...result,
        user: result.user
          ? {
              ...result.user,
              image: resolvedUserImage,
            }
          : null,
        thumbnailImage: result.thumbnailImage
          ? {
              ...result.thumbnailImage,
              url: resolvedThumbnailImage,
            }
          : null,
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

  // Get themes by category ID (public access for gallery browsing)
  getThemesByCategory: publicProcedure.input(categoryIdSchema).query(async ({ input }) => {
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
        themes.map(async theme => ({
          ...theme,
          user: theme.user
            ? {
                ...theme.user,
                image: await getFileUrl({
                  legacyImageField: theme.user.image,
                  imageFileId: theme.user.image_file_id,
                }),
              }
            : null,
          thumbnailImage: theme.thumbnailImage
            ? {
                ...theme.thumbnailImage,
                url: await getFileUrl({
                  legacyImageField: null,
                  imageFileId: theme.thumbnailImage.id,
                }),
              }
            : null,
        }))
      );

      // Resolve category image URL
      const resolvedCategoryImageFile = category.categoryImage
        ? {
            ...category.categoryImage,
            url: await getFileUrl({
              legacyImageField: null,
              imageFileId: category.categoryImage.id,
            }),
          }
        : null;

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

  // Get all collections/theme categories (public access for main gallery page)
  getCollections: publicProcedure.query(async () => {
    try {
      const categories = await prisma.themeCategory.findMany({
        where: {
          visible: true, // Only return visible categories for public access
        },
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
        categories.map(async category => ({
          id: category.id.toString(),
          name: category.name,
          description: category.description || "",
          themeCount: category._count.themes,
          isServer: true,
          categoryImage: category.categoryImage
            ? {
                ...category.categoryImage,
                url: await getFileUrl({
                  legacyImageField: null,
                  imageFileId: category.categoryImage.id,
                }),
              }
            : null,
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
});
