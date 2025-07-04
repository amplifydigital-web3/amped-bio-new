import { publicProcedure, router } from "./trpc";
import { onelinkParamSchema } from "../schemas/onelink.schema";
import { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { getFileUrl } from "../utils/fileUrlResolver";
import { ThemeConfig } from "@ampedbio/constants";

const prisma = new PrismaClient();

const appRouter = router({
  getOnelink: publicProcedure.input(onelinkParamSchema).query(async opts => {
    console.group("🔗 GET ONELINK REQUEST");
    console.info("📥 Received request for onelink");
    const { onelink } = opts.input;
    console.info(`🔍 Looking up onelink: ${onelink}`);

    try {
      console.info("🔄 Querying database for user");
      const user = await prisma.user.findUnique({
        where: {
          onelink: onelink,
        },
      });
      console.info(`🔍 User lookup result: ${user ? "✅ Found" : "❌ Not found"}`);

      if (user === null) {
        console.info(`⚠️ Onelink not found: ${onelink}`);
        console.groupEnd();
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Onelink not found: ${onelink}`,
        });
      }

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
        })

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
      const resolvedImageUrl = await getFileUrl({ legacyImageField: image, imageFileId: image_file_id });

      const result = { user: { name, email, description, image: resolvedImageUrl }, theme, blocks };
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
