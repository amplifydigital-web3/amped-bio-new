import { isSafeHref, isSafeWebUrl } from "@repo/constants";

// Build Board D57. Shared by the blocks:unsafe-urls script and its tests.

export type BlockRow = { id: number; user_id: number; type: string; config: unknown };

/** The block field that holds an unsafe URL, or null when the block is fine. */
export function unsafeBlockField(
  row: BlockRow
): { field: "url" | "content"; value: string } | null {
  const config = row.config;
  if (!config || typeof config !== "object") return null;
  const { url, content, platform } = config as {
    url?: unknown;
    content?: unknown;
    platform?: unknown;
  };
  if (row.type === "link" && typeof url === "string" && url !== "" && !isSafeHref(url)) {
    return { field: "url", value: url };
  }
  if (row.type === "media" && typeof url === "string" && url !== "" && !isSafeWebUrl(url)) {
    return { field: "url", value: url };
  }
  if (
    row.type === "text" &&
    platform === "telegram" &&
    typeof content === "string" &&
    content !== "" &&
    !(isSafeWebUrl(content) && /^https:/i.test(content.trim()))
  ) {
    return { field: "content", value: content };
  }
  return null;
}

/** The config to store for a neutralized block: the field emptied, the block hidden. */
export function neutralizedConfig(config: unknown, field: "url" | "content") {
  return { ...(config as Record<string, unknown>), [field]: "", hidden: true };
}
