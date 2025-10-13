import { publicProcedure, router } from "./trpc";
import { prisma } from "../services/DB";
import { z } from "zod";

// Define the schema for banner data
const bannerSchema = z.object({
  message: z.string().optional().default("Notice"),
  type: z.enum(["info", "warning", "success", "error"]).optional().default("info"),
  url: z.string().optional(),
  autoHide: z.boolean().optional().default(false),
});

export const publicSettingsRouter = router({
  getBanner: publicProcedure
    .input(z.void()) // Define empty input
    .output(bannerSchema.nullable())
    .query(async () => {
      // Look for a public banner setting in the database
      const banner = await prisma.siteSettings.findUnique({
        where: { setting_key: "public_banner" },
      });
      
      if (!banner) {
        // If no public banner exists, return null
        return null;
      }
      
      // Parse the banner setting value which should be JSON
      try {
        const bannerData = JSON.parse(banner.setting_value);
        // Validate the parsed data against our schema
        return bannerSchema.parse(bannerData);
      } catch (error) {
        // If parsing fails, return null to indicate no valid banner
        console.error('Error parsing banner setting:', error);
        return null;
      }
    }),
});