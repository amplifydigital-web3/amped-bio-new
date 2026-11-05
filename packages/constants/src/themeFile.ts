/**
 * Theme Engine v2 theme files (spec 3.9). A v2 `.ampedtheme` file wraps the
 * config with a header: `{ "$schema": "https://amped.bio/theme/2", name,
 * author (handle or null), createdAt, config }`. A v1 file is the bare
 * config. Files carry ids and params only, never code (decision 9).
 */

export const THEME_FILE_SCHEMA = "https://amped.bio/theme/2";

/** Files above 64 KB are refused (spec 3.11). */
export const THEME_FILE_MAX_BYTES = 64 * 1024;

export interface ThemeFileV2<Config = unknown> {
  $schema: typeof THEME_FILE_SCHEMA;
  name: string;
  author: string | null;
  createdAt: string;
  config: Config;
}

export function themeFileV2<Config>(
  name: string,
  author: string | null,
  createdAt: Date | string,
  config: Config
): ThemeFileV2<Config> {
  return {
    $schema: THEME_FILE_SCHEMA,
    name,
    author,
    createdAt: typeof createdAt === "string" ? createdAt : createdAt.toISOString(),
    config,
  };
}

/** The config inside a theme file: a v2 file's config, or a v1 file as it is. */
export function themeFileConfig(data: unknown): unknown {
  if (
    data &&
    typeof data === "object" &&
    (data as { $schema?: unknown }).$schema === THEME_FILE_SCHEMA &&
    "config" in data
  ) {
    return (data as { config: unknown }).config;
  }
  return data;
}
