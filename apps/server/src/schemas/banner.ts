import { z } from "zod";

// Define the unified schema for banner data (storage and presentation format)
export const bannerSchema = z.object({
  text: z.string().optional().default("Notice"),
  path: z.string().optional().default(""), // Path for navigation
  type: z.enum(["info", "warning", "success", "error"]).default("info"), // Banner type (info, warning, success, error)
  enabled: z.boolean().default(false), // Controls if the banner is enabled
});

// Define the input schema for admin banner updates
export const bannerInputSchema = z.object({
  text: z.string().optional(),
  path: z.string().optional(),
  enabled: z.boolean().optional(),
});

export type BannerData = z.infer<typeof bannerSchema>;
