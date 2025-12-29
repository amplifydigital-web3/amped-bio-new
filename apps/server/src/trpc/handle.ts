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

export const redeemHandleSchema = z.object({
  newHandle: handleBaseSchema,
});

const appRouter = router({
  // Check if a handle is available for use
  checkAvailability: publicProcedure.input(handleParamSchema).query(async ({ input }) => {
    console.group("🔍 CHECK HANDLE REQUEST (tRPC)");
    console.info("📥 Received request to check handle availability");
    const { handle } = input;
    console.info(`🔍 Checking availability for: ${handle}`);

    try {
      console.info("🔄 Querying database to count matching handles");
      const count = await prisma.user.count({
        where: {
          handle: handle,
        },
      });
      console.info(`🔢 Count result: ${count}`);

      const available = count === 0;
      console.info(
        `${available ? "✅" : "❌"} Handle "${handle}" is ${available ? "available" : "taken"}`
      );
      console.groupEnd();

      return {
        available,
        handle,
      };
    } catch (error) {
      console.error("❌ ERROR in checkHandle", error);
      console.groupEnd();
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Redeem/change a user's handle
  redeem: privateProcedure.input(redeemHandleSchema).mutation(async ({ ctx, input }) => {
    console.group("🔄 REDEEM HANDLE REQUEST (tRPC)");
    console.info("📥 Received request to redeem handle");

    const { newHandle } = input;
    const userId = ctx.user!.sub;

    try {
      // Get current handle for logging purposes
      const currentUser = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          handle: true,
        },
      });

      const currentHandle = currentUser?.handle;
      console.info(
        `🔄 User ${userId} requesting to change handle from "${currentHandle}" to "${newHandle}"`
      );

      // Check if the new handle is available
      const existingHandle = await prisma.user.findUnique({
        where: {
          handle: newHandle,
        },
      });

      if (existingHandle) {
        console.info(`❌ Handle "${newHandle}" is already taken`);
        console.groupEnd();
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This handle is already taken",
        });
      }

      // Update the user's handle
      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          handle: newHandle,
        },
      });

      console.info(`✅ Handle successfully updated to "${newHandle}"`);
      console.groupEnd();

      return {
        success: true,
        message: "Handle updated successfully",
        handle: newHandle,
      };
    } catch (error) {
      console.error("❌ ERROR in redeemHandle", error);
      console.groupEnd();
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  getHandle: publicProcedure.input(handleParamSchema).query(async opts => {
    console.group("🔗 GET HANDLE REQUEST");
    console.info("📥 Received request for handle");
    const { handle } = opts.input;
    console.info(`🔍 Looking up handle: ${handle}`);

    try {
      console.info("🔄 Querying database for user");
      const user = await prisma.user.findUnique({
        where: {
          handle: handle,
        },
      });
      console.info(`🔍 User lookup result: ${user ? "✅ Found" : "❌ Not found"}`);

      if (user === null) {
        console.info(`⚠️ Handle not found: ${handle}`);
        console.groupEnd();
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
      console.info(`👤 User data extracted - Name: ${name}, ID: ${user_id}, Theme ID: ${theme_id}`);

      console.info(`🎨 Fetching theme with ID: ${theme_id}`);
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

        console.info(`🎨 Resolved theme background file URL: ${themeConfig.background.value}`);

        (theme as any)!.config = themeConfig;
      }

      console.info(`🎨 Theme fetch result: ${theme ? "✅ Found" : "❌ Not found"}`);

      console.info(`📦 Fetching blocks for user ID: ${user_id}`);
      const blocks = await prisma.block.findMany({
        where: {
          user_id: Number(user_id),
        },
      });
      console.info(`📦 Blocks fetched: ${blocks.length} blocks found`);

      // Resolve user image URL using the helper function
      const resolvedImageUrl = await getFileUrl({
        legacyImageField: image,
        imageFileId: image_file_id,
      });

      const result = {
        user: { id: user_id, name, email, revoName: revo_name, description, image: resolvedImageUrl },
        theme,
        blocks,
        hasCreatorPool,
      };
      console.info("🔄 Preparing response with user data, theme, and blocks");

      console.info("✅ Successfully processed handle request");
      console.groupEnd();

      return result;
    } catch (error) {
      console.error("❌ ERROR in getHandle", error);
      console.groupEnd();
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),
});

export default appRouter;
