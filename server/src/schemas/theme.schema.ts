import { z } from 'zod';

// Schema for theme configuration
const themeConfigSchema = z.record(z.any()).optional();

// Schema for the theme object in editTheme endpoint
export const editThemeSchema = z.object({
  theme: z.object({
    name: z.string().min(1, 'Theme name is required'),
    share_level: z.string(),
    share_config: z.any(),
    config: themeConfigSchema,
  }),
});
