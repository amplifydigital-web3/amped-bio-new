import {
  THEME_FILE_MAX_BYTES,
  ampedThemeImportSchema,
  themeFileConfig,
  type ThemeConfig,
} from "@repo/constants";

export type { ThemeConfig };

export interface Theme {
  id?: number | null;
  name: string;
  config: ThemeConfig;
}

/** A safe theme file name: letters, digits and single hyphens, never empty. */
export function themeFileName(name: string) {
  const safe = name
    .replace(/\.ampedtheme$/i, "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return safe || "amped-theme";
}

/**
 * Export the current theme configuration as an AmpedTheme file (.ampedtheme)
 */
export function exportThemeConfigAsJson(theme: Theme, customFilename?: string) {
  // Create a Blob containing just the config part of the theme as JSON data
  const data = JSON.stringify(theme.config, null, 2);
  const blob = new Blob([data], { type: "application/json" });

  // Create a temporary URL for the Blob
  const url = URL.createObjectURL(blob);

  // Letters, digits and hyphens only (Screen Review 031 I05)
  const downloadName = `${themeFileName(customFilename || theme.name)}.ampedtheme`;

  // Create a temporary link element
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName;

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
    // Spec 3.11: files above 64 KB are refused
    if (file.size > THEME_FILE_MAX_BYTES) throw new Error("Theme file too large");
    const text = await file.text();
    // TE-4b: a v2 file wraps the config with a header (themeFile.ts); v1 is bare
    const data = themeFileConfig(JSON.parse(text));

    // Validate the imported data structure using the same schema as backend
    const validatedThemeConfig = ampedThemeImportSchema.parse(data);

    return validatedThemeConfig;
  } catch (error) {
    console.error("Theme config import error:", error);
    throw new Error("Invalid theme configuration file format");
  }
}
