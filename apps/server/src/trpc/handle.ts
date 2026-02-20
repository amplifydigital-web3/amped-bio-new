import { publicProcedure, privateProcedure, router } from "./trpc";
import { TRPCError } from "@trpc/server";
import { getFileUrl } from "../utils/fileUrlResolver";
import { ThemeConfig } from "@ampedbio/constants";
import { prisma } from "../services/DB";
import { z } from "zod";
import { HANDLE_MIN_LENGTH, HANDLE_REGEX } from "@ampedbio/constants";

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
      });

      if (user === null) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Handle not found: ${handle}`,
        });
      }

      const hasCreatorPool = false; // Placeholder - we need to determine this differently since pools are now related to wallet

      const { theme: theme_id, id: user_id, name, email, description, image, image_file_id } = user;

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

      const result = {
        user: { id: user_id, name, email, description, image: resolvedImageUrl },
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
