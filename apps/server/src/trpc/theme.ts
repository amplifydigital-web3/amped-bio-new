/**
 * THEME MANAGEMENT ROUTER
 *
 * This router handles user theme management operations:
 * - Creating and editing user's own themes
 * - Deleting user's own themes
 * - Getting user's theme list for their dashboard
 * - Applying themes to user profile
 *
 * All methods require authentication and work with the authenticated user's themes.
 * For public theme browsing/gallery operations, see themeGallery.ts
 *
 * Theme Engine v2 TE-4a (spec 3.9): saves of a look record its history
 * (services/theme/looks.ts), and the looks procedures (looks, createLook,
 * duplicate, rename, history, restore) run behind the themeSharing flag.
 */

import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { s3Service } from "../services/S3Service";
import { themeConfigSchema } from "@repo/constants";
import { getFileUrl } from "../utils/fileUrlResolver";
import { prisma } from "@repo/database";
import { isFeatureOn } from "../services/featureFlags";
import {
  LOOK_LIMIT,
  LOOK_NAME_MAX,
  VERSION_LIMIT,
  applicableThemeId,
  assertLookRoom,
  cleanLookName,
  configVersion,
  copyName,
  currentLookId,
  ownLook,
  recordVersion,
  versionIdFromHex,
  versionIdSchema,
  versionIdToHex,
} from "../services/theme/looks";

/** Looks and sharing ship behind the themeSharing site setting flag (spec 3.13). */
function requireSharing(): void {
  if (!isFeatureOn("themeSharing")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Looks are not available yet" });
  }
}

const lookNameSchema = z
  .string()
  .transform(cleanLookName)
  .pipe(z.string().min(1, "Name your look").max(LOOK_NAME_MAX));

// Schema for theme ID parameter
const themeIdSchema = z.object({
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

// Schema for applying theme to user. lookId (TE-4a): the look a themeId 0
// apply writes to; without it, the applied look (services/theme/looks.ts).
const applyThemeSchema = z.object({
  themeId: z.number(),
  theme: themeObjectSchema.optional(),
  lookId: z.number().int().positive().optional(),
});

export const themeRouter = router({
  // =============================================================================
  // USER THEME MANAGEMENT METHODS (authenticated users managing their own themes)
  // =============================================================================

  // Edit/Create user's own theme (authenticated users only)
  editTheme: privateProcedure
    .input(
      z.object({
        id: z.number(),
        theme: themeObjectSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, theme } = input;
      const user_id = ctx.user!.sub;

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
              kind: "look",
              config_version: configVersion(config),
            },
          });
          await recordVersion(result.id, config, { force: true });

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
        const existingConfig = (existingTheme.config as unknown as Record<string, any>) || {};
        const newConfig = (config as unknown as Record<string, any>) || {};

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
              console.error(
                "Failed to delete previous background during theme update:",
                deleteError
              );
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
            config_version: configVersion(config),
          },
        });
        // TE-4a: autosave builds the look's history, one version per session
        await recordVersion(result.id, config);

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

  // Delete user's own theme (authenticated users only)
  deleteTheme: privateProcedure.input(themeIdSchema).mutation(async ({ ctx, input }) => {
    const { id } = input;
    const user_id = ctx.user!.sub;

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

  // Get user's own themes (authenticated users only - for theme management dashboard)
  getUserThemes: privateProcedure.query(async ({ ctx }) => {
    const user_id = ctx.user!.sub;

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
        themes.map(async theme => ({
          ...theme,
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

      return themesWithResolvedImages;
    } catch (error) {
      console.error("error", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Apply theme to user (authenticated users only)
  applyTheme: privateProcedure.input(applyThemeSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    const { themeId, theme, lookId } = input;

    try {
      // Applying a theme never deletes files. The creator's previous background
      // (uploaded image or video) is left in place so the previous theme can be
      // restored, and because the same file can still be referenced by the
      // creator's own theme row that is about to be overwritten below.
      // Unreferenced uploads should be removed by a separate cleanup job, not here.

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

        // TE-4a: write to the look the editor names, else the applied look,
        // else the look edited last (was findFirst, which picked any row)
        const targetId = lookId ? (await ownLook(userId, lookId)).id : await currentLookId(userId);

        if (targetId) {
          // Update existing user theme
          const updatedTheme = await prisma.theme.update({
            where: {
              id: targetId,
            },
            data: {
              name: theme.name,
              description: theme.description,
              share_level: theme.share_level,
              share_config: theme.share_config as any,
              config: theme.config as any,
              config_version: configVersion(theme.config),
              updated_at: new Date(),
            },
          });
          // An apply is a deliberate change: its own version, so it can be restored
          await recordVersion(updatedTheme.id, theme.config, { force: true });

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
              kind: "look",
              config_version: configVersion(theme.config),
            },
          });
          await recordVersion(newTheme.id, theme.config, { force: true });

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
      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          theme: themeIdToStore,
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

  // ===========================================================================
  // LOOKS AND HISTORY (TE-4a, spec 3.9, decision 7). Behind themeSharing.
  // ===========================================================================

  /** The creator's looks, newest edit first, with the limit and the applied look. */
  looks: privateProcedure.query(async ({ ctx }) => {
    requireSharing();
    const userId = ctx.user!.sub;
    const [rows, user] = await Promise.all([
      prisma.theme.findMany({
        where: { user_id: userId, kind: "look" },
        orderBy: [{ updated_at: "desc" }, { id: "desc" }],
        select: {
          id: true,
          name: true,
          config: true,
          config_version: true,
          created_at: true,
          updated_at: true,
          _count: { select: { versions: true } },
        },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { theme: true } }),
    ]);
    return {
      limit: LOOK_LIMIT,
      count: rows.length,
      appliedId: user?.theme ?? null,
      looks: rows.map(({ _count, ...row }) => ({ ...row, versions: _count.versions })),
    };
  }),

  /** Save as new look (board 04): stores a config as a new look and applies it. */
  createLook: privateProcedure
    .input(z.object({ name: lookNameSchema, config: themeConfigSchema }))
    .mutation(async ({ ctx, input }) => {
      requireSharing();
      const userId = ctx.user!.sub;
      await assertLookRoom(userId);
      const look = await prisma.theme.create({
        data: {
          user_id: userId,
          name: input.name,
          share_level: "private",
          share_config: {},
          config: input.config as any,
          kind: "look",
          config_version: configVersion(input.config),
        },
      });
      await recordVersion(look.id, input.config, { force: true });
      await prisma.user.update({ where: { id: userId }, data: { theme: look.id } });
      return { id: look.id, name: look.name };
    }),

  /** Duplicate (My looks tile menu): a copy named with a counter. Not applied. */
  duplicate: privateProcedure.input(themeIdSchema).mutation(async ({ ctx, input }) => {
    requireSharing();
    const userId = ctx.user!.sub;
    const source = await ownLook(userId, input.id);
    await assertLookRoom(userId);
    const taken = await prisma.theme.findMany({
      where: { user_id: userId, kind: "look" },
      select: { name: true },
    });
    const name = copyName(
      source.name ?? "My look",
      taken.map(t => t.name ?? "")
    );
    const copy = await prisma.theme.create({
      data: {
        user_id: userId,
        name,
        description: source.description,
        share_level: "private",
        share_config: {},
        config: (source.config ?? {}) as any,
        kind: "look",
        config_version: source.config_version,
      },
    });
    await recordVersion(copy.id, source.config ?? {}, { force: true });
    return { id: copy.id, name };
  }),

  /** Rename (My looks tile menu), 40 characters. */
  rename: privateProcedure
    .input(z.object({ id: z.number(), name: lookNameSchema }))
    .mutation(async ({ ctx, input }) => {
      requireSharing();
      await ownLook(ctx.user!.sub, input.id);
      await prisma.theme.update({ where: { id: input.id }, data: { name: input.name } });
      return { id: input.id, name: input.name };
    }),

  /** The last 20 versions of a look, newest first. */
  history: privateProcedure.input(themeIdSchema).query(async ({ ctx, input }) => {
    requireSharing();
    await ownLook(ctx.user!.sub, input.id);
    const versions = await prisma.themeVersion.findMany({
      where: { themeId: input.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: VERSION_LIMIT,
      select: { id: true, config: true, createdAt: true },
    });
    return {
      themeId: input.id,
      versions: versions.map(v => ({ ...v, id: versionIdToHex(v.id) })),
    };
  }),

  /**
   * Restore: the version's config becomes the look's config as a new version
   * (so the restore itself can be undone), and the look is applied.
   */
  restore: privateProcedure
    .input(z.object({ id: z.number(), versionId: versionIdSchema }))
    .mutation(async ({ ctx, input }) => {
      requireSharing();
      const userId = ctx.user!.sub;
      await ownLook(userId, input.id);
      const version = await prisma.themeVersion.findUnique({
        where: { id: versionIdFromHex(input.versionId) },
      });
      if (!version || version.themeId !== input.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }
      await prisma.theme.update({
        where: { id: input.id },
        data: { config: version.config as any, config_version: configVersion(version.config) },
      });
      await recordVersion(input.id, version.config, { force: true });
      await prisma.user.update({ where: { id: userId }, data: { theme: input.id } });
      return { id: input.id, versionId: input.versionId };
    }),
});
