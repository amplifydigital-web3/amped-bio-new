import { publicProcedure, router } from "./trpc";
import { prisma } from "../services/DB";
import { bannerSchema } from "../schemas/banner";
import { z } from "zod";

export const publicSettingsRouter = router({
  getBanner: publicProcedure
    .input(z.void()) // Define empty input
    .output(bannerSchema.nullable())
    .query(async () => {
      // Look for a dashboard banner setting in the database (using the consistent key)
      const banner = await prisma.siteSettings.findUnique({
        where: { setting_key: "dashboard_banner" },
      });
      
      if (!banner) {
        // If no banner exists, return null
        return null;
      }
      
      // Parse the banner setting value which should be JSON in the standard format
      try {
        const bannerData = JSON.parse(banner.setting_value);
        
        // Check if banner is enabled, return null if not enabled
        if (!bannerData.enabled) {
          return null;
        }
        
        // Map 'path' to 'url' and 'text' to 'message' for the frontend component
        const result = {
          ...bannerData,
          url: bannerData.path,  // Map path to url for frontend
          message: bannerData.text, // Map text to message for frontend
          autoHide: false  // Fixed value - never auto-hide
        };
        
        // Validate the final data against our schema
        return bannerSchema.parse(result);
      } catch (error) {
        // If parsing fails, return null to indicate no valid banner
        console.error('Error parsing banner setting:', error);
        return null;
      }
    }),

  getFaucetStatus: publicProcedure.query(async () => {
    const faucetStatus = await prisma.siteSettings.findUnique({
      where: { setting_key: "faucet_enabled" },
    });
    return faucetStatus?.setting_value === "true";
  }),
});
