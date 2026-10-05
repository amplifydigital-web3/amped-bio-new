import type { BlockType } from "@repo/constants";
import { getPlatformName, getPlatformUrl, platforms, type PlatformId } from "@/utils/platforms";

// Titles, meta lines and validity for block rows (Screen Review 036 I05, I10)
// and the preview (006 I08). One place so the list, the preview and the public
// renderer agree on what a block needs.

export {
  blockNeed,
  isHidden,
  isRenderable,
  mediaHelp,
  mediaName,
  mediaUrlError,
  stripTags,
  type BlockNeed,
} from "@repo/constants";
import { mediaName, stripTags, type BlockNeed } from "@repo/constants";

export function blockTitle(block: BlockType) {
  switch (block.type) {
    case "link":
      return block.config.label || getPlatformName(block.config.platform);
    case "media":
      return block.config.platform === "creator-pool"
        ? block.config.label || "Creator pool"
        : mediaName(block.config.platform);
    case "pool":
      return block.config.label || "Creator pool";
    case "referral":
      return "Referral link";
    default:
      return "Text";
  }
}

function withoutScheme(url: string) {
  return url
    .replace(/^mailto:/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

export function hostOf(url: string) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(
      /^www\./,
      ""
    );
  } catch {
    return withoutScheme(url).split("/")[0] ?? "";
  }
}

export function blockMeta(block: BlockType) {
  switch (block.type) {
    case "link":
      return withoutScheme(block.config.url ?? "");
    case "media":
      return block.config.url
        ? `${mediaName(block.config.platform)}, ${hostOf(block.config.url)}`
        : "";
    case "pool":
      return block.config.label ? block.config.label : "";
    case "referral":
      return "Your invite link";
    case "text":
      return stripTags(block.config.content ?? "");
    default:
      return "";
  }
}

export const NEED_LABEL: Record<Exclude<BlockNeed, null>, string> = {
  link: "Needs a link",
  pool: "Needs a pool",
  text: "Needs text",
};

// ---------------------------------------------------------------------------
// Link detection (Screen Review 034 I02, I04, I05)

type LinkPlatform = PlatformId;

const SOCIAL_HOSTS: { platform: LinkPlatform; pattern: RegExp }[] = [
  { platform: "twitter", pattern: /^(www\.)?(x|twitter)\.com\/@?([A-Za-z0-9_]+)\/?$/i },
  { platform: "telegram", pattern: /^(www\.)?t\.me\/([A-Za-z0-9_]+)\/?$/i },
  { platform: "discord", pattern: /^(www\.)?discord\.gg\/([A-Za-z0-9_-]+)\/?$/i },
  { platform: "instagram", pattern: /^(www\.)?instagram\.com\/([A-Za-z0-9_.]+)\/?$/i },
  { platform: "facebook", pattern: /^(www\.)?facebook\.com\/([A-Za-z0-9_.]+)\/?$/i },
  { platform: "tiktok", pattern: /^(www\.)?tiktok\.com\/@([A-Za-z0-9_.]+)\/?$/i },
  { platform: "github", pattern: /^(www\.)?github\.com\/([A-Za-z0-9_-]+)\/?$/i },
  { platform: "linkedin", pattern: /^(www\.)?linkedin\.com\/in\/([A-Za-z0-9_-]+)\/?$/i },
  { platform: "medium", pattern: /^(www\.)?medium\.com\/@([A-Za-z0-9_.]+)\/?$/i },
  { platform: "mirror", pattern: /^(www\.)?mirror\.xyz\/([A-Za-z0-9_.]+)\/?$/i },
  { platform: "warpcast", pattern: /^(www\.)?warpcast\.com\/([A-Za-z0-9_.]+)\/?$/i },
  { platform: "zora", pattern: /^(www\.)?zora\.co\/([A-Za-z0-9_.@]+)\/?$/i },
  { platform: "opensea", pattern: /^(www\.)?opensea\.io\/([A-Za-z0-9_.]+)\/?$/i },
  { platform: "youtube", pattern: /^(www\.)?youtube\.com\/@([A-Za-z0-9_.-]+)\/?$/i },
  { platform: "patreon", pattern: /^(www\.)?patreon\.com\/([A-Za-z0-9_.]+)\/?$/i },
  { platform: "onlyfans", pattern: /^(www\.)?onlyfans\.com\/([A-Za-z0-9_.]+)\/?$/i },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isSocial(platform: string) {
  return !["custom", "document", "email", "appstore", "playstore"].includes(platform);
}

/** The platform prefix shown inside the well (linkedin.com/in/). */
export function platformPrefix(platform: string) {
  if (!isSocial(platform)) return "";
  return getPlatformUrl(platform, "").replace(/^https?:\/\//i, "");
}

export interface LinkDraft {
  platform: LinkPlatform;
  /** What the creator typed or pasted */
  input: string;
}

/** Detects a platform from pasted text; returns the username for socials. */
export function detectLink(raw: string): { platform: LinkPlatform; value: string } | null {
  const text = raw.trim();
  if (!text) return null;
  const bare = text.replace(/^mailto:/i, "");
  if (EMAIL.test(bare)) return { platform: "email", value: bare };
  const noScheme = withoutScheme(text);
  for (const { platform, pattern } of SOCIAL_HOSTS) {
    const match = noScheme.match(pattern);
    if (match) return { platform, value: match[match.length - 1] };
  }
  if (/^[^\s]+\.[a-z]{2,}(\/.*)?$/i.test(noScheme)) {
    return { platform: /\.pdf(\?.*)?$/i.test(noScheme) ? "document" : "custom", value: text };
  }
  return null;
}

/** The URL visitors open, or null when the input is not valid yet. */
export function resolveLink(platform: string, input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (platform === "email") {
    const address = value.replace(/^mailto:/i, "");
    return EMAIL.test(address) ? `mailto:${address}` : null;
  }
  if (!isSocial(platform)) {
    const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes(".") ? url : null;
    } catch {
      return null;
    }
  }
  const username = value.replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]+$/.test(username)) return null;
  return getPlatformUrl(platform, username);
}

export function linkError(platform: string, input: string): string | null {
  const value = input.trim();
  if (!value) return "Paste a full link, for example robfrasca.com";
  if (resolveLink(platform, value)) return null;
  if (platform === "email") return "Enter an email like name@example.com";
  if (isSocial(platform)) return "Use letters, numbers, dots, hyphens or underscores";
  return "Paste a full link, for example robfrasca.com";
}

/** The default label once a platform is known (034 I05). */
export function defaultLabel(platform: string, input: string) {
  if (platform === "email") return "Email";
  if (platform === "custom") return hostOf(input);
  if (platform === "document") {
    const file = input.split("?")[0].split("/").pop() ?? "";
    return decodeURIComponent(file) || "Document";
  }
  return getPlatformName(platform);
}

/** The text for the Link field when an existing link opens (037 I08). */
export function linkInputFromUrl(platform: string, url: string) {
  if (platform === "email") return url.replace(/^mailto:/i, "");
  if (!isSocial(platform)) return url;
  const prefix = getPlatformUrl(platform, "");
  return prefix && url.startsWith(prefix) ? url.slice(prefix.length) : url;
}

export const LINK_PLATFORM_GROUPS: { label: string; ids: string[] }[] = [
  {
    label: "Social",
    ids: [
      "twitter",
      "instagram",
      "facebook",
      "tiktok",
      "telegram",
      "discord",
      "linkedin",
      "youtube",
    ],
  },
  { label: "Creator", ids: ["github", "medium", "mirror", "patreon", "onlyfans", "element"] },
  { label: "Web3", ids: ["warpcast", "lens", "zora", "opensea"] },
  { label: "Other", ids: ["appstore", "playstore", "email", "document", "custom"] },
];

export const LINK_PLATFORMS = platforms;
