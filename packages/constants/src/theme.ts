import { z } from "zod";

// Background schema matching the Background interface from collections
const backgroundSchema = z.object({
  type: z.enum(["color", "image", "video"]),
  value: z.string().nullable(),
  id: z.string().optional(),
  label: z.string().optional(),
  thumbnail: z.string().optional(),
  fileId: z.number().optional(),
});

// Schema for theme configuration with proper validation
export const themeConfigSchema = z.object({
  buttonStyle: z.number().optional(),
  containerStyle: z.number().optional(),
  background: backgroundSchema.optional(),
  buttonColor: z.string().optional(),
  containerColor: z.string().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.string().optional(),
  fontColor: z.string().optional(),
  transparency: z.number().optional(),
  buttonEffect: z.number().optional(),
  particlesEffect: z.number().optional(),
  heroEffect: z.number().optional(),
});

// Schema for the theme object in editTheme endpoint
export const editThemeSchema = z.object({
  theme: z.object({
    name: z.string().min(1, "Theme name is required"),
    description: z.string().optional(),
    share_level: z.string(),
    share_config: z.any(),
    config: themeConfigSchema.optional(),
  }),
});

// Schema for importing .ampedtheme files - uses the same config validation
export const ampedThemeImportSchema = themeConfigSchema;

export type Background = z.infer<typeof backgroundSchema>;
export type ThemeConfig = z.infer<typeof themeConfigSchema>;
export type EditThemeInput = z.infer<typeof editThemeSchema>;
export type AmpedThemeImport = z.infer<typeof ampedThemeImportSchema>;
