import { z } from "zod";

// Local schema for theme config - simple validation to avoid deep type instantiation
const simpleThemeConfigSchema = z.record(z.any()).optional();

// Schema for the theme object in editTheme endpoint
export const editThemeSchema = z.object({
  theme: z.object({
    name: z.string().min(1, "Theme name is required"),
    description: z.string().optional(),
    share_level: z.string(),
    share_config: z.any(),
    config: simpleThemeConfigSchema,
  }),
});
