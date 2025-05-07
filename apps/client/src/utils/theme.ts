import type { Theme, ThemeConfig } from "../types/editor";
import { z } from "zod";

// Schema for validating imported theme configuration data
const themeConfigSchema = z.object({
  buttonStyle: z.number().optional(),
  containerStyle: z.number().optional(),
  background: z.object({
    type: z.enum(["color", "image", "video"]),
    value: z.string(),
    id: z.string().optional(),
    label: z.string().optional(),
    thumbnail: z.string().optional()
  }),
  buttonColor: z.string().optional(),
  containerColor: z.string().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.string().optional(),
  fontColor: z.string().optional(),
  transparency: z.number().optional(),
  buttonEffect: z.number().optional(),
  particlesEffect: z.number().optional(),
  heroEffect: z.number().optional()
});

/**
 * Export the current theme configuration as an AmpedTheme file (.ampedtheme)
 */
export function exportThemeConfigAsJson(theme: Theme) {
  // Create a Blob containing just the config part of the theme as JSON data
  const data = JSON.stringify(theme.config, null, 2);
  const blob = new Blob([data], { type: "application/json" });

  // Create a temporary URL for the Blob
  const url = URL.createObjectURL(blob);

  // Create a temporary link element
  const link = document.createElement("a");
  link.href = url;
  link.download = `${theme.name.toLowerCase().replace(/\s+/g, "-")}.ampedtheme`;

  // Trigger the download
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Import a theme configuration from an AmpedTheme file (.ampedtheme)
 */
export async function importThemeConfigFromJson(file: File): Promise<ThemeConfig> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate the imported data structure using zod schema
    const validatedThemeConfig = themeConfigSchema.parse(data);
    
    return validatedThemeConfig;
  } catch (error) {
    console.error("Theme config import error:", error);
    throw new Error("Invalid theme configuration file format");
  }
}