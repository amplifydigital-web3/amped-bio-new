import { publicProcedure, privateProcedure, router } from "./trpc";
import { TRPCError } from "@trpc/server";
import { getFileUrl } from "../utils/fileUrlResolver";
import { ThemeConfig } from "@repo/constants";
import { prisma } from "@repo/database";
import { z } from "zod";
import { HANDLE_MIN_LENGTH, HANDLE_REGEX, sanitizeRichText } from "@repo/constants";
import { sanitizeBlockConfig } from "../utils/sanitizeBlockConfig";
import { logger } from "better-auth";
import { getPublicTrackingPixels } from "./trackingPixels";
import { indexableUserWhere, isUserIndexable } from "../utils/indexable";
import {
  computeRnsIdentity,
  parseRnsDisplay,
  type PublicRnsIdentity,
} from "../services/rnsIdentity";

export const SITEMAP_MAX_PAGE_SIZE = 10000;

// Create a base schema for handle validation
export const handleBaseSchema = z
  .string()
  .transform(value => (value.startsWith("@") ? value.substring(1) : value)) // Normalize by removing @ prefix if present
  .transform(value => value.toLowerCase()) // Normalize to lowercase for case-insensitive lookup
  .pipe(
    z
      .string()
      .min(HANDLE_MIN_LENGTH, `Name must be at least ${HANDLE_MIN_LENGTH} characters`)
      .regex(HANDLE_REGEX, "Name can only contain letters, numbers, underscores and hyphens")
  );

// Use the base schema in specific contexts
export const handleParamSchema = z.object({
  handle: handleBaseSchema,
});

// Load the user's theme and resolve its background file into a public URL
async function getPublicTheme(themeId: number) {
  const theme = await prisma.theme.findUnique({
    where: {
      id: themeId,
    },
  });

  if (!theme) return null;

  const themeConfig = theme.config as ThemeConfig | undefined;

  if (themeConfig && themeConfig.background?.fileId) {
    themeConfig.background.value = await getFileUrl({
      legacyImageField: null,
      imageFileId: themeConfig.background.fileId,
    });
  }

  // Return a clean DTO instead of the raw Prisma row (no relations) so the
  // tRPC output stays shallow and type-safe for consumers
  return { id: theme.id, name: theme.name, config: themeConfig ?? null };
}

// Unwrap an optional result: log the failure and fall back instead of failing the request
function settledOrFallback<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
  if (result.status === "fulfilled") return result.value;
  console.error(`[getHandle] ${label} failed, using fallback:`, result.reason);
  return fallback;
}

const appRouter = router({
  // Check if a handle is available for use
  checkAvailability: publicProcedure.input(handleParamSchema).query(async ({ input }) => {
    const { handle } = input;

    try {
      const count = await prisma.user.count({
        where: {
          OR: [
            { handle: handle },
            { handle: handle.toLowerCase() },
            { handle: handle.toUpperCase() },
          ],
        },
      });

      const available = count === 0;

      return {
        available,
        handle,
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Redeem/change a user's handle
  redeem: privateProcedure
    .input(
      z.object({
        newHandle: z
          .string()
          .transform(value => (value.startsWith("@") ? value.substring(1) : value)) // Normalize by removing @ prefix if present
          .pipe(
            z
              .string()
              .min(HANDLE_MIN_LENGTH, `Name must be at least ${HANDLE_MIN_LENGTH} characters`)
              .regex(
                HANDLE_REGEX,
                "Name can only contain letters, numbers, underscores and hyphens"
              )
              .transform(value => value.toLowerCase()) // Force lowercase for storage
          ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { newHandle } = input;
      const userId = ctx.user!.sub;

      try {
        const existingHandle = await prisma.user.findFirst({
          where: {
            OR: [
              { handle: newHandle },
              { handle: newHandle.toLowerCase() },
              { handle: newHandle.toUpperCase() },
            ],
          },
        });

        if (existingHandle) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This handle is already taken",
          });
        }

        await prisma.user.update({
          where: {
            id: userId,
          },
          data: {
            handle: newHandle,
          },
        });

        return {
          success: true,
          message: "Handle updated successfully",
          handle: newHandle,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Server error",
        });
      }
    }),

  getHandle: publicProcedure.input(handleParamSchema).query(async opts => {
    const { handle } = opts.input;

    try {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { handle: handle },
            { handle: handle.toLowerCase() },
            { handle: handle.toUpperCase() },
          ],
        },
        include: { wallet: true },
      });

      // Fan Graph (#22): an account made from Follow has no public page until
      // its owner publishes one, so its handle reads as not found.
      if (user === null || user.page_status !== "PUBLISHED") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Handle not found: ${handle}`,
        });
      }

      // Screen Review 039 I03: the page's View pool needs the creator's pool.
      // Pools belong to the wallet; take the newest listed pool with an address.
      const creatorPool = user.wallet
        ? await prisma.creatorPool.findFirst({
            where: {
              walletId: user.wallet.id,
              poolAddress: { not: null },
              OR: [{ hidden: false }, { hidden: null }],
            },
            orderBy: { id: "desc" },
            select: { poolAddress: true },
          })
        : null;
      const creatorPoolAddress = creatorPool?.poolAddress ?? null;
      const hasCreatorPool = creatorPoolAddress !== null;

      const {
        theme: theme_id,
        id: user_id,
        name,
        revo_name,
        rns_display,
        description,
        image,
        image_file_id,
      } = user;

      const [themeResult, blocksResult, imageResult, identityResult, trackingPixelsResult] =
        await Promise.allSettled([
          getPublicTheme(Number(theme_id)),
          prisma.block.findMany({
            where: {
              user_id: Number(user_id),
            },
          }),
          getFileUrl({
            legacyImageField: image,
            imageFileId: image_file_id,
          }),
          // 108 I02, 109 I01: the binding and the owner's limits are applied
          // here, so a hidden field never reaches a visitor
          computeRnsIdentity({
            storedName: revo_name ?? null,
            wallet: user.wallet?.address ?? null,
            display: parseRnsDisplay(rns_display),
          }),
          getPublicTrackingPixels(user_id),
        ]);

      // Theme and blocks are the profile itself, so their failures are fatal
      if (themeResult.status === "rejected") throw themeResult.reason;
      if (blocksResult.status === "rejected") throw blocksResult.reason;

      const publicBlocks = blocksResult.value.map(block => ({
        id: block.id,
        user_id: block.user_id,
        type: block.type,
        order: block.order,
        clicks: block.clicks,
        config: sanitizeBlockConfig(block.type, block.config),
        created_at: block.created_at,
        updated_at: block.updated_at,
      }));

      // Any failure shows no chip (fails closed)
      const identity: PublicRnsIdentity =
        identityResult.status === "fulfilled" ? identityResult.value.identity : null;
      if (identityResult.status === "rejected") {
        console.error("[getHandle] RNS identity failed, showing no chip:", identityResult.reason);
      }

      const result = {
        user: {
          id: user_id,
          name,
          // Email is private. It is never part of a public profile response.
          // 109 I01: the RNS chip and what the owner allows in the sheet. The
          // name's private status lives in rns.getMyPageIdentity (108 I02).
          identity,
          // Sanitized on read as well as on save, so bios stored before the sanitizer are safe
          description: sanitizeRichText(description),
          image: settledOrFallback(imageResult, null, "profile image URL"),
        },
        theme: themeResult.value,
        blocks: publicBlocks,
        hasCreatorPool,
        creatorPoolAddress,
        trackingPixels: settledOrFallback(trackingPixelsResult, null, "tracking pixels"),
        indexable: isUserIndexable(user, publicBlocks.length),
      };

      return result;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error(`[getHandle] failed for handle "${handle}":`, error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Number of profiles that may be listed in the sitemap
  getSitemapCount: publicProcedure.query(async () => {
    try {
      const total = await prisma.user.count({ where: indexableUserWhere });
      return { total };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // One page of indexable profiles for the sitemap. Returns public data only.
  getSitemapEntries: publicProcedure
    .input(
      z.object({
        page: z.number().int().min(0),
        pageSize: z.number().int().min(1).max(SITEMAP_MAX_PAGE_SIZE),
      })
    )
    .query(async ({ input }) => {
      const { page, pageSize } = input;

      try {
        const users = await prisma.user.findMany({
          where: indexableUserWhere,
          orderBy: { id: "asc" },
          skip: page * pageSize,
          take: pageSize,
          select: { id: true, handle: true, created_at: true, updated_at: true },
        });

        if (users.length === 0) return [];

        const latestBlocks = await prisma.block.groupBy({
          by: ["user_id"],
          where: { user_id: { in: users.map(user => user.id) } },
          _max: { updated_at: true, created_at: true },
        });

        const latestBlockByUser = new Map<number, Date>();
        for (const row of latestBlocks) {
          const candidates = [row._max.updated_at, row._max.created_at].filter(
            (date): date is Date => date !== null
          );
          if (candidates.length > 0) {
            latestBlockByUser.set(
              row.user_id,
              new Date(Math.max(...candidates.map(date => date.getTime())))
            );
          }
        }

        return users
          .filter((user): user is typeof user & { handle: string } => user.handle !== null)
          .map(user => {
            const dates = [user.created_at, user.updated_at, latestBlockByUser.get(user.id)].filter(
              (date): date is Date => date !== null && date !== undefined
            );
            const lastModified = new Date(Math.max(...dates.map(date => date.getTime())));
            return { handle: user.handle.toLowerCase(), lastModified: lastModified.toISOString() };
          });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Server error",
        });
      }
    }),
});

export default appRouter;
