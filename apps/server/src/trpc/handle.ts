import { publicProcedure, privateProcedure, router } from "./trpc";
import { TRPCError } from "@trpc/server";
import { getFileUrl } from "../utils/fileUrlResolver";
import { ThemeConfig } from "@repo/constants";
import { prisma } from "@repo/database";
import { z } from "zod";
import { HANDLE_MIN_LENGTH, HANDLE_REGEX } from "@repo/constants";
import { env } from "../env";
import { logger } from "better-auth";
import { getPublicTrackingPixels } from "./trackingPixels";

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

const RevoNameSubgraphSchema = z.object({
  data: z.object({
    revoNames: z.array(
      z.object({
        expiryDateWithGrace: z.string(),
        owner: z.string(),
      })
    ),
  }),
});

type RevoNameStatus = "active" | "expired" | "taken" | null;

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

// Validate revoName on-chain: check expiry and ownership
async function validateRevoName(
  revoName: string | null,
  walletAddress: string | null
): Promise<{ revoName: string | null; status: RevoNameStatus }> {
  const cleared = { revoName: null, status: null };

  if (!revoName) return cleared;

  const SUBGRAPH_URL = env.SUBGRAPH_URL;
  if (!SUBGRAPH_URL) {
    // No subgraph URL configured — cannot validate ownership/expiry, clear the name
    console.warn("[revoName] SUBGRAPH_URL not configured, clearing revoName");
    return cleared;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const labelName = revoName.split(".")[0];
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        query: `query ($l: String!) { revoNames(where: { labelName: $l }) { expiryDateWithGrace owner } }`,
        variables: { l: labelName },
      }),
    });

    if (!res.ok) {
      throw new Error(`Subgraph responded with status ${res.status}`);
    }

    const json = await res.json();

    if (json?.errors?.length) {
      console.warn("[revoName] Subgraph returned GraphQL errors:", json.errors);
    }

    const parsed = RevoNameSubgraphSchema.safeParse(json);
    if (!parsed.success) {
      console.warn("[revoName] Subgraph returned invalid data:", parsed.error.flatten());
      return cleared;
    }

    const details = parsed.data.data.revoNames[0];
    if (!details) return cleared;

    const expiryTimestamp = Number(details.expiryDateWithGrace);
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (expiryTimestamp > 0 && expiryTimestamp < nowInSeconds) {
      return { revoName: null, status: "expired" };
    }
    if (walletAddress && details.owner.toLowerCase() !== walletAddress.toLowerCase()) {
      return { revoName: null, status: "taken" };
    }

    return { revoName, status: "active" };
  } catch (err) {
    console.warn("[revoName] Subgraph validation failed, clearing revoName:", err);
    return cleared;
  } finally {
    clearTimeout(timeout);
  }
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

      if (user === null) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Handle not found: ${handle}`,
        });
      }

      const hasCreatorPool = false; // Placeholder - we need to determine this differently since pools are now related to wallet

      const {
        theme: theme_id,
        id: user_id,
        name,
        revo_name,
        description,
        image,
        image_file_id,
      } = user;

      const [themeResult, blocksResult, imageResult, revoNameResult, trackingPixelsResult] =
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
          validateRevoName(revo_name ?? null, user.wallet?.address ?? null),
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
        config: block.config,
        created_at: block.created_at,
        updated_at: block.updated_at,
      }));

      const revoName = settledOrFallback(
        revoNameResult,
        { revoName: null, status: null },
        "revoName validation"
      );

      const result = {
        user: {
          id: user_id,
          name,
          // Email is private. It is never part of a public profile response.
          revoName: revoName.revoName,
          revoNameStatus: revoName.status,
          originalRevoName: revo_name ?? null,
          description,
          image: settledOrFallback(imageResult, null, "profile image URL"),
        },
        theme: themeResult.value,
        blocks: publicBlocks,
        hasCreatorPool,
        trackingPixels: settledOrFallback(trackingPixelsResult, null, "tracking pixels"),
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
});

export default appRouter;
