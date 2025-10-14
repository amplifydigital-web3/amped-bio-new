import { z } from "zod";

// Define the unified schema for banner data (storage and presentation format)
export const bannerSchema = z.object({
  text: z.string().default("Notice"),
  type: z.enum(["info", "warning", "success", "error"]).default("info"), // Banner type
  enabled: z.boolean().default(false), // Controls if the banner is enabled
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
    .optional(), // Optional panel to redirect to
});

// Export the inferred type for Zod validation (this will be compatible with the shared interface)
export type BannerData = z.infer<typeof bannerSchema>;
