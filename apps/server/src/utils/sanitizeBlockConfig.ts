import {
  DEFAULT_TELEGRAM_GROUP_CONFIG,
  DEFAULT_TELEGRAM_MESSAGE_CONFIG,
  followConfigSchema,
  followersConfigSchema,
  isSafeHref,
  isSafeWebUrl,
  rnsIdConfigSchema,
  sanitizeRichText,
  telegramGroupConfigSchema,
  telegramMessageConfigSchema,
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
 *
 * The Telegram blocks (Build Board #2, decision 14) keep only their schema's
 * fields: a label and the hidden flag. Anything else a client sent, such as a
 * username or a rule, is dropped, and a label the schema refuses falls back to
 * the default (spec 3.8: the page never carries a Telegram username).
 *
 * Link and media blocks (Build Board D57) keep their URL only when it is a safe
 * link: http, https, mailto or tel for links, http or https for embeds. Any other
 * URL (javascript:, data:, vbscript:) is emptied, so the block needs a link and
 * does not render. This runs on public reads too, so rows stored before the fix
 * never reach a page. A legacy Telegram text block keeps its channel URL only
 * when it is https, the rule its renderer already applies.
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
  if (type === "telegram_message" || type === "telegram_group") {
    const schema =
      type === "telegram_message" ? telegramMessageConfigSchema : telegramGroupConfigSchema;
    const parsed = schema.safeParse(config);
    if (parsed.success) return parsed.data as T;
    const fallback =
      type === "telegram_message" ? DEFAULT_TELEGRAM_MESSAGE_CONFIG : DEFAULT_TELEGRAM_GROUP_CONFIG;
    const hidden = (config as { hidden?: unknown }).hidden === true;
    return { ...fallback, ...(hidden ? { hidden } : {}) } as T;
  }
  if (type === "link" || type === "media") {
    const url = (config as { url?: unknown }).url;
    if (typeof url !== "string" || url === "") return config;
    const safe = type === "link" ? isSafeHref(url) : isSafeWebUrl(url);
    return safe ? config : ({ ...config, url: "" } as T);
  }
  if (type !== "text") return config;
  const content = (config as { content?: unknown }).content;
  if (typeof content !== "string") return config;
  if ((config as { platform?: unknown }).platform === "telegram") {
    return isSafeWebUrl(content) && /^https:/i.test(content.trim())
      ? config
      : ({ ...config, content: "" } as T);
  }
  return { ...config, content: sanitizeRichText(content) };
}
