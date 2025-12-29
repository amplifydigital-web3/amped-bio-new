import { publicProcedure, privateProcedure, router } from "./trpc";
import { TRPCError } from "@trpc/server";
import { getFileUrl } from "../utils/fileUrlResolver";
import { ThemeConfig } from "@ampedbio/constants";
import { prisma } from "../services/DB";
import { z } from "zod";
import { ONELINK_MIN_LENGTH, ONELINK_REGEX } from "@ampedbio/constants";

// Create a base schema for onelink validation
export const onelinkBaseSchema = z
  .string()
  .transform(value => (value.startsWith("@") ? value.substring(1) : value)) // Normalize by removing @ prefix if present
  .pipe(
    z
      .string()
      .min(ONELINK_MIN_LENGTH, `Name must be at least ${ONELINK_MIN_LENGTH} characters`)
      .regex(ONELINK_REGEX, "Name can only contain letters, numbers, underscores and hyphens")
  );

// Use the base schema in specific contexts
export const onelinkParamSchema = z.object({
  onelink: onelinkBaseSchema,
});

export const redeemOnelinkSchema = z.object({
  newOnelink: onelinkBaseSchema,
});

const appRouter = router({
  // Check if a handle is available for use
  checkAvailability: publicProcedure.input(onelinkParamSchema).query(async ({ input }) => {
    console.group("🔍 CHECK HANDLE REQUEST (tRPC)");
    console.info("📥 Received request to check handle availability");
    const { onelink } = input;
    console.info(`🔍 Checking availability for: ${onelink}`);

    try {
      console.info("🔄 Querying database to count matching handles");
      const count = await prisma.user.count({
        where: {
          handle: onelink,
        },
      });
      console.info(`🔢 Count result: ${count}`);

      const available = count === 0;
      console.info(
        `${available ? "✅" : "❌"} Handle "${onelink}" is ${available ? "available" : "taken"}`
      );
      console.groupEnd();

      return {
        available,
        onelink,
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
  redeem: privateProcedure.input(redeemOnelinkSchema).mutation(async ({ ctx, input }) => {
    console.group("🔄 REDEEM HANDLE REQUEST (tRPC)");
    console.info("📥 Received request to redeem handle");

    const { newOnelink } = input;
    const userId = ctx.user.sub;

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
        `🔄 User ${userId} requesting to change handle from "${currentHandle}" to "${newOnelink}"`
      );

      // Check if the new handle is available
      const existingHandle = await prisma.user.findUnique({
        where: {
          handle: newOnelink,
        },
      });

      if (existingHandle) {
        console.info(`❌ Handle "${newOnelink}" is already taken`);
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
          handle: newOnelink,
        },
      });

      console.info(`✅ Handle successfully updated to "${newOnelink}"`);
      console.groupEnd();

      return {
        success: true,
        message: "Handle updated successfully",
        onelink: newOnelink,
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

  getOnelink: publicProcedure.input(onelinkParamSchema).query(async opts => {
    console.group("🔗 GET HANDLE REQUEST");
    console.info("📥 Received request for handle");
    const { onelink } = opts.input;
    console.info(`🔍 Looking up handle: ${onelink}`);

    try {
      console.info("🔄 Querying database for user");
      const user = await prisma.user.findUnique({
        where: {
          handle: onelink,
        },
      });
      console.info(`🔍 User lookup result: ${user ? "✅ Found" : "❌ Not found"}`);

      if (user === null) {
        console.info(`⚠️ Handle not found: ${onelink}`);
        console.groupEnd();
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Handle not found: ${onelink}`,
        });
      }

      const hasCreatorPool = false; // Placeholder - we need to determine this differently since pools are now related to wallet

      const { theme: theme_id, id: user_id, name, email, description, image, image_file_id } = user;
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

        theme!.config = themeConfig;
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
        user: { name, email, description, image: resolvedImageUrl },
        theme,
        blocks,
        hasCreatorPool,
      };
      console.info("🔄 Preparing response with user data, theme, and blocks");

      console.info("✅ Successfully processed onelink request");
      console.groupEnd();

      return result;
    } catch (error) {
      console.error("❌ ERROR in getOnelink", error);
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
