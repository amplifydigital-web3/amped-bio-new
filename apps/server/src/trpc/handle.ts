import { publicProcedure, privateProcedure, router } from "./trpc";
import { TRPCError } from "@trpc/server";
import { getFileUrl } from "../utils/fileUrlResolver";
import { ThemeConfig } from "@ampedbio/constants";
import { prisma } from "../services/DB";
import { z } from "zod";
import { HANDLE_MIN_LENGTH, HANDLE_REGEX } from "@ampedbio/constants";
import { env } from "../env";

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
        email,
        description,
        image,
        image_file_id,
      } = user;

      const theme = await prisma.theme.findUnique({
        where: {
          id: Number(theme_id),
        },
      });

      const themeConfig = theme?.config as ThemeConfig | undefined;

      if (themeConfig && themeConfig.background?.fileId) {
        themeConfig.background.value = await getFileUrl({
          legacyImageField: null,
          imageFileId: themeConfig.background.fileId,
        });

        (theme as any)!.config = themeConfig;
      }

      const blocks = await prisma.block.findMany({
        where: {
          user_id: Number(user_id),
        },
      });

      const resolvedImageUrl = await getFileUrl({
        legacyImageField: image,
        imageFileId: image_file_id,
      });

      // Validate revoName on-chain: check expiry and ownership
      const walletAddress = user.wallet?.address ?? null;
      let resolvedRevoName: string | null = revo_name ?? null;
      let revoNameStatus: "active" | "expired" | "taken" | null = resolvedRevoName
        ? "active"
        : null;

      if (resolvedRevoName) {
        const SUBGRAPH_URL = env.SUBGRAPH_URL;
        if (!SUBGRAPH_URL) {
          // No subgraph URL configured — cannot validate ownership/expiry, clear the name
          console.warn("[revoName] SUBGRAPH_URL not configured, clearing revoName");
          resolvedRevoName = null;
          revoNameStatus = null;
        } else {
          try {
            const labelName = resolvedRevoName.split(".")[0];
            const res = await fetch(SUBGRAPH_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
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

            const details = json?.data?.revoNames?.[0];

            if (!details) {
              resolvedRevoName = null;
              revoNameStatus = null;
            } else {
              const expiryTimestamp = Number(details.expiryDateWithGrace);
              const nowInSeconds = Math.floor(Date.now() / 1000);
              if (expiryTimestamp > 0 && expiryTimestamp < nowInSeconds) {
                resolvedRevoName = null;
                revoNameStatus = "expired";
              } else if (
                walletAddress &&
                details.owner &&
                details.owner.toLowerCase() !== walletAddress.toLowerCase()
              ) {
                resolvedRevoName = null;
                revoNameStatus = "taken";
              }
            }
          } catch (err) {
            console.warn("[revoName] Subgraph validation failed, clearing revoName:", err);
            resolvedRevoName = null;
            revoNameStatus = null;
          }
        }
      }

      const result = {
        user: {
          id: user_id,
          name,
          email,
          revoName: resolvedRevoName,
          revoNameStatus,
          originalRevoName: revo_name ?? null,
          description,
          image: resolvedImageUrl,
        },
        theme,
        blocks,
        hasCreatorPool,
      };

      return result;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),
});

export default appRouter;
