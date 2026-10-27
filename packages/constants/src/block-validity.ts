import type { BlockType, MediaBlockPlatform } from "./blocks";

// When a block can show on a creator page (Screen Review 006 I08, 036 I09,
// I10, 037 I05). Shared by the editor list, the preview and the public page,
// so all three agree.

const MEDIA_NAMES: Record<string, string> = {
  spotify: "Spotify",
  youtube: "YouTube",
  instagram: "Instagram",
  twitter: "X",
  facebook: "Facebook",
  tiktok: "TikTok",
  vimeo: "Vimeo",
};

export function mediaName(platform: string) {
  return MEDIA_NAMES[platform] ?? platform;
}

export type BlockNeed = "link" | "pool" | "text" | null;

/** Hidden blocks render in neither the preview nor the public page (036 I09). */
export function isHidden(block: BlockType) {
  return (block.config as { hidden?: boolean }).hidden === true;
}

const MEDIA_RULES: Record<string, { kind: string; example: string; help: string; test: RegExp }> = {
  spotify: {
    kind: "track, album, playlist, show or episode",
    example: "open.spotify.com/track/…",
    help: "Paste a track, album, playlist, show or episode link",
    test: /^(https?:\/\/)?open\.spotify\.com\/(intl-[a-z-]+\/)?(track|album|playlist|show|episode)\/[a-zA-Z0-9]+/,
  },
  youtube: {
    kind: "video",
    example: "youtube.com/watch?v=…",
    help: "Paste a video or Shorts link",
    test: /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/).+/,
  },
  instagram: {
    kind: "post",
    example: "instagram.com/p/…",
    help: "Paste a post or reel link",
    test: /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|tv)\/[a-zA-Z0-9_-]+/,
  },
  twitter: {
    kind: "post",
    example: "x.com/name/status/…",
    help: "Paste a post link",
    test: /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/[0-9]+/,
  },
  facebook: {
    kind: "post",
    example: "facebook.com/name/posts/…",
    help: "Paste a post or video link",
    test: /^(https?:\/\/)?(www\.|m\.)?(facebook\.com|fb\.watch)\/.+/,
  },
  tiktok: {
    kind: "video",
    example: "tiktok.com/@name/video/…",
    help: "Paste a video link",
    test: /^(https?:\/\/)?(www\.|vm\.)?tiktok\.com\/.+/,
  },
  vimeo: {
    kind: "video",
    example: "vimeo.com/123456",
    help: "Paste a video link",
    test: /^(https?:\/\/)?(www\.|player\.)?vimeo\.com\/(video\/)?[0-9]+/,
  },
};

export function mediaHelp(platform: string) {
  return MEDIA_RULES[platform]?.help ?? "Paste a link";
}

/** Null when the media URL is valid for its platform; otherwise the fix (037 I05). */
export function mediaUrlError(platform: MediaBlockPlatform | string, url: string) {
  const value = url.trim();
  if (!value) return `Paste a ${mediaName(platform)} link`;
  const rule = MEDIA_RULES[platform];
  if (!rule) return null;
  return rule.test.test(value)
    ? null
    : `This is not a ${mediaName(platform)} ${rule.kind} link. Paste a link like ${rule.example}`;
}

export function stripTags(html: string) {
  return html
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** What a block still needs before it can show on the page (presence, not format). */
export function blockNeed(block: BlockType): BlockNeed {
  switch (block.type) {
    case "link":
      return block.config.url ? null : "link";
    case "media":
      if (block.config.platform === "creator-pool") return block.config.url ? null : "pool";
      // Presence only: live pages keep every embed they render today. The
      // editor validates the link format on blur (037 I05).
      return block.config.url?.trim() || block.config.content?.trim().startsWith("http")
        ? null
        : "link";
    case "pool":
      return /^0x[a-fA-F0-9]+$/.test(block.config.address ?? "") ? null : "pool";
    case "text":
      return stripTags(block.config.content ?? "") ? null : "text";
    default:
      return null;
  }
}

/** Whether visitors see this block (the public renderer uses the same rule). */
export function isRenderable(block: BlockType) {
  return !isHidden(block) && blockNeed(block) === null;
}
