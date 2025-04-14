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

export const platforms: Platform[] = [
  // Social Media
  {
    id: "twitter",
    name: "X",
    icon: FaXTwitter,
    color: "#000000",
    url: "https://x.com/{{username}}",
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: MessageCircle,
    color: "#26A5E4",
    url: "https://t.me/{{username}}",
  },
  {
    id: "discord",
    name: "Discord",
    icon: Gamepad2,
    color: "#5865F2",
    url: "https://discord.gg/{{username}}",
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: Instagram,
    color: "#E4405F",
    url: "https://instagram.com/{{username}}",
  },
  {
    id: "lens",
    name: "Lens Protocol",
    icon: Camera,
    color: "#00501E",
    url: "https://lenster.xyz/u/{{username}}",
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: Facebook,
    color: "#1877F2",
    url: "https://facebook.com/{{username}}",
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: Video,
    color: "#000000",
    url: "https://tiktok.com/@{{username}}",
  },
  {
    id: "element",
    name: "Element",
    icon: MessageCircle,
    color: "#0DBD8B",
    url: "https://app.element.io/#/user/{{username}}",
  },

  // Professional
  {
    id: "github",
    name: "GitHub",
    icon: Github,
    color: "#181717",
    url: "https://github.com/{{username}}",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: Linkedin,
    color: "#0A66C2",
    url: "https://linkedin.com/in/{{username}}",
  },
  {
    id: "medium",
    name: "Medium",
    icon: Newspaper,
    color: "#000000",
    url: "https://medium.com/@{{username}}",
  },
  {
    id: "mirror",
    name: "Mirror",
    icon: Book,
    color: "#007AFF",
    url: "https://mirror.xyz/{{username}}",
  },

  // Web3
  {
    id: "warpcast",
    name: "Warp Cast",
    icon: Share2,
    color: "#6A45EC",
    url: "https://warpcast.com/{{username}}",
  },
  { id: "zora", name: "Zora", icon: Store, color: "#000000", url: "https://zora.co/{{username}}" },
  {
    id: "opensea",
    name: "OpenSea",
    icon: Store,
    color: "#2081E2",
    url: "https://opensea.io/{{username}}",
  },

  // Content
  {
    id: "youtube",
    name: "YouTube",
    icon: Youtube,
    color: "#FF0000",
    url: "https://youtube.com/@{{username}}",
  },
  {
    id: "patreon",
    name: "Patreon",
    icon: Heart,
    color: "#FF424D",
    url: "https://patreon.com/{{username}}",
  },
  {
    id: "onlyfans",
    name: "OnlyFans",
    icon: Heart,
    color: "#00AFF0",
    url: "https://onlyfans.com/{{username}}",
  },

  // Apps
  {
    id: "appstore",
    name: "App Store",
    icon: Store,
    color: "#0D96F6",
    url: "https://apps.apple.com/developer/{{username}}/id",
  },
  {
    id: "playstore",
    name: "Play Store",
    icon: Store,
    color: "#48FF48",
    url: "https://play.google.com/store/apps/developer?id={{username}}",
  },

  // Communication
  { id: "email", name: "Email", icon: Mail, color: "#EA4335", url: "mailto:{{username}}" },
  { id: "document", name: "Document", icon: FileText, color: "#4285F4", url: "{{username}}" },

  // Generic
  { id: "custom", name: "Custom Link", icon: Link, color: "#000000" },
];

export function getPlatformIcon(platformId: PlatformId): IconType | LucideIcon {
  const icon = platforms.find(p => p.id === platformId)?.icon;
  return icon ?? Link;
}

export function getPlatformColor(platformId: PlatformId): string {
  return platforms.find(p => p.id === platformId)?.color || "#000000";
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
