import {
  MessageCircle,
  Instagram,
  Facebook,
  Github,
  Youtube,
  Linkedin,
  Mail,
  Link,
  FileText,
  Book,
  Camera,
  Store,
  Video,
  Heart,
  Newspaper,
  Gamepad2,
  Share2,
  type LucideIcon,
} from "lucide-react";
import { SlSocialSpotify } from "react-icons/sl";
import { FaXTwitter } from "react-icons/fa6";
import { type IconType } from "react-icons/lib";

export const allowedPlatforms = [
  "twitter",
  "telegram",
  "discord",
  "instagram",
  "lens",
  "facebook",
  "tiktok",
  "element",
  "github",
  "linkedin",
  "medium",
  "mirror",
  "warpcast",
  "zora",
  "opensea",
  "youtube",
  "patreon",
  "onlyfans",
  "appstore",
  "playstore",
  "email",
  "document",
  "custom",
] as const;

export type PlatformId = (typeof allowedPlatforms)[number];

interface Platform {
  id: PlatformId;
  name: string;
  icon: IconType | LucideIcon;
  color: string;
  url?: string;
}

type PlatformInfo = {
  id: string;
  name: string;
  icon: IconType | LucideIcon;
  color: `#${string}`;
};

const platformsInfo: PlatformInfo[] = [
  // Social Media
  {
    id: "twitter",
    name: "X",
    icon: FaXTwitter,
    color: "#000000",
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: MessageCircle,
    color: "#26A5E4",
  },
  {
    id: "discord",
    name: "Discord",
    icon: Gamepad2,
    color: "#5865F2",
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: Instagram,
    color: "#E4405F",
  },
  {
    id: "lens",
    name: "Lens Protocol",
    icon: Camera,
    color: "#00501E",
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: Facebook,
    color: "#1877F2",
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: Video,
    color: "#000000",
  },
  {
    id: "element",
    name: "Element",
    icon: MessageCircle,
    color: "#0DBD8B",
  },
  // Professional
  {
    id: "github",
    name: "GitHub",
    icon: Github,
    color: "#181717",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: Linkedin,
    color: "#0A66C2",
  },
  {
    id: "medium",
    name: "Medium",
    icon: Newspaper,
    color: "#000000",
  },
  {
    id: "mirror",
    name: "Mirror",
    icon: Book,
    color: "#007AFF",
  },
  // Web3
  {
    id: "warpcast",
    name: "Warp Cast",
    icon: Share2,
    color: "#6A45EC",
  },
  {
    id: "zora",
    name: "Zora",
    icon: Store,
    color: "#000000",
  },
  {
    id: "opensea",
    name: "OpenSea",
    icon: Store,
    color: "#2081E2",
  },
  // Content
  {
    id: "youtube",
    name: "YouTube",
    icon: Youtube,
    color: "#FF0000",
  },
  {
    id: "patreon",
    name: "Patreon",
    icon: Heart,
    color: "#FF424D",
  },
  {
    id: "onlyfans",
    name: "OnlyFans",
    icon: Heart,
    color: "#00AFF0",
  },
  {
    id: "spotify",
    name: "Spotify",
    icon: SlSocialSpotify,
    color: "#1DB954",
  },
  // Apps
  {
    id: "appstore",
    name: "App Store",
    icon: Store,
    color: "#0D96F6",
  },
  {
    id: "playstore",
    name: "Play Store",
    icon: Store,
    color: "#48FF48",
  },
  {
    id: "text",
    name: "Text Block",
    icon: FileText,
    color: "#000000",
  },
  // Communication
  {
    id: "email",
    name: "Email",
    icon: Mail,
    color: "#EA4335",
  },
  {
    id: "document",
    name: "Document",
    icon: FileText,
    color: "#4285F4",
  },
  // Generic
  {
    id: "custom",
    name: "Custom Link",
    icon: Link,
    color: "#000000",
  },
] as const;

const platformUrls = [
  // Social Media
  { id: "twitter", url: "https://x.com/{{username}}" },
  { id: "telegram", url: "https://t.me/{{username}}" },
  { id: "discord", url: "https://discord.gg/{{username}}" },
  { id: "instagram", url: "https://instagram.com/{{username}}" },
  { id: "lens", url: "https://lenster.xyz/u/{{username}}" },
  { id: "facebook", url: "https://facebook.com/{{username}}" },
  { id: "tiktok", url: "https://tiktok.com/@{{username}}" },
  { id: "element", url: "https://app.element.io/#/user/{{username}}" },

  // Professional
  { id: "github", url: "https://github.com/{{username}}" },
  { id: "linkedin", url: "https://linkedin.com/in/{{username}}" },
  { id: "medium", url: "https://medium.com/@{{username}}" },
  { id: "mirror", url: "https://mirror.xyz/{{username}}" },

  // Web3
  { id: "warpcast", url: "https://warpcast.com/{{username}}" },
  { id: "zora", url: "https://zora.co/{{username}}" },
  { id: "opensea", url: "https://opensea.io/{{username}}" },

  // Content
  { id: "youtube", url: "https://youtube.com/@{{username}}" },
  { id: "patreon", url: "https://patreon.com/{{username}}" },
  { id: "onlyfans", url: "https://onlyfans.com/{{username}}" },

  // Apps
  { id: "appstore", url: "https://apps.apple.com/developer/{{username}}/id" },
  { id: "playstore", url: "https://play.google.com/store/apps/developer?id={{username}}" },

  // Communication
  { id: "email", url: "mailto:{{username}}" },
  { id: "document", url: "{{username}}" },

  // Generic
  { id: "custom", url: "" },
] as const;

export const platforms: Platform[] = platformUrls.map(platform => ({
  id: platform.id as PlatformId,
  name: getPlatformName(platform.id),
  icon: getPlatformIcon(platform.id),
  color: getPlatformColor(platform.id as PlatformId),
  url: platform.url,
}));

export function getPlatformIcon(platformId: string): IconType | LucideIcon {
  const icon = platformsInfo.find(p => p.id === platformId)?.icon;
  return icon ?? Link;
}

export function getPlatformColor(platformId: PlatformId): string {
  return platformsInfo.find(p => p.id === platformId)?.color || "#000000";
}

export function getPlatformName(platformId: string): string {
  const platform = platformsInfo.find(p => p.id === platformId);
  if (!platform) return platformId;
  return platform.name;
}

/**
 * Generates a URL for a platform by replacing the {{username}} placeholder with the actual username
 * @param platformId The ID of the platform
 * @param username The username to insert into the URL template
 * @returns The generated URL with the username, or empty string if the platform doesn't have a URL template
 */
export function getPlatformUrl(platformId: string, username: string): string {
  const platform = platforms.find(p => p.id === platformId);
  if (!platform?.url) return "";

  return platform.url.replace("{{username}}", username);
}

// Utility function to extract username from URL
export function extractUsernameFromUrl(platform: PlatformId, url: string): string | null {
  // Skip for custom and document platforms
  if (platform === "custom" || platform === "document") {
    return null;
  }

  // For email platform
  if (platform === "email" && url.startsWith("mailto:")) {
    const emailMatch = url.match(/mailto:(.*)/);
    if (emailMatch && emailMatch[1]) {
      return emailMatch[1];
    }
  }
  // For other platforms
  else {
    const platformUrlPattern = getPlatformUrl(platform, "").replace("{{username}}", "");
    if (url.startsWith(platformUrlPattern)) {
      return url.replace(platformUrlPattern, "");
    }
  }

  return null;
}
