import {
  followConfigSchema,
  followersConfigSchema,
  rnsIdConfigSchema,
  sanitizeRichText,
} from "@repo/constants";

/**
 * Runs the shared rich text sanitizer over any HTML a block config carries.
 * Today only text blocks hold HTML (config.content). Other block types pass through.
 * Used when a block is saved and when blocks are served to public pages.
 *
 * Follow and Followers blocks (Build Board #30) and the RNS ID block (#33)
 * carry no HTML. They pass through their zod schema so a stored row always
 * reaches the page with every field and default filled in, whichever version
 * of the editor wrote it.
 */
export function sanitizeBlockConfig<T>(type: string, config: T): T {
  if (!config || typeof config !== "object") return config;
  if (type === "follow") {
    const parsed = followConfigSchema.safeParse(config);
    return parsed.success ? ({ ...config, ...parsed.data } as T) : config;
  }
  if (type === "followers") {
    const parsed = followersConfigSchema.safeParse(config);
    return parsed.success ? ({ ...config, ...parsed.data } as T) : config;
  }
  if (type === "rnsid") {
    const parsed = rnsIdConfigSchema.safeParse(config);
    return parsed.success ? ({ ...config, ...parsed.data } as T) : config;
  }
  if (type !== "text") return config;
  const content = (config as { content?: unknown }).content;
  if (typeof content !== "string") return config;
  return { ...config, content: sanitizeRichText(content) };
}
