import { publicProcedure, router } from "./trpc";
import { prisma } from "../services/DB";
import { z } from "zod";

export const publicSettingsRouter = router({
  getBanner: publicProcedure
    .input(z.void()) // Define empty input
    .output(
      z
        .object({
          message: z.string(),
          type: z.enum(["info", "warning", "success", "error"]),
          panel: z
            .enum([
              "home",
              "profile",
              "reward",
              "gallery",
              "blocks",
              "rewardPools",
              "createRewardPool",
              "leaderboard",
              "rns",
              "wallet",
              "pay",
              "account",
            ])
            .optional(),
        })
        .nullable()
    )
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

        // Check if banner has meaningful content, return null if empty
        if (!bannerData.text?.trim()) {
          return null;
        }

        // Map 'text' to 'message' for the frontend component
        const result = {
          message: bannerData.text, // Map text to message for frontend
          type: bannerData.type || "info", // Default to 'info' if type is null or empty
          panel: bannerData.panel, // Include panel field if present
        };

        return result;
      } catch (error) {
        // If parsing fails, return null to indicate no valid banner
        console.error("Error parsing banner setting:", error);
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
