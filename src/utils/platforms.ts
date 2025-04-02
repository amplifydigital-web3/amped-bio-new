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
  DollarSign,
  Music,
  Newspaper,
  Gamepad2,
  Share2,
  type LucideIcon
} from 'lucide-react';
import { FaXTwitter } from 'react-icons/fa6';
import { type IconType } from 'react-icons/lib';

interface Platform {
  id: string;
  name: string;
  icon: IconType | LucideIcon;
  color: string;
}

export const platforms: Platform[] = [
  // Social Media
  { id: 'twitter', name: 'X', icon: FaXTwitter, color: '#000000' },
  { id: 'telegram', name: 'Telegram', icon: MessageCircle, color: '#26A5E4' },
  { id: 'discord', name: 'Discord', icon: Gamepad2, color: '#5865F2' },
  { id: 'instagram', name: 'Instagram', icon: Instagram, color: '#E4405F' },
  { id: 'lens', name: 'Lens Protocol', icon: Camera, color: '#00501E' },
  { id: 'facebook', name: 'Facebook', icon: Facebook, color: '#1877F2' },
  { id: 'tiktok', name: 'TikTok', icon: Video, color: '#000000' },
  { id: 'element', name: 'Element', icon: MessageCircle, color: '#0DBD8B' },

  // Professional
  { id: 'github', name: 'GitHub', icon: Github, color: '#181717' },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: '#0A66C2' },
  { id: 'medium', name: 'Medium', icon: Newspaper, color: '#000000' },
  { id: 'mirror', name: 'Mirror', icon: Book, color: '#007AFF' },

  // Web3
  { id: 'warpcast', name: 'Warp Cast', icon: Share2, color: '#6A45EC' },
  { id: 'zora', name: 'Zora', icon: Store, color: '#000000' },
  { id: 'opensea', name: 'OpenSea', icon: Store, color: '#2081E2' },

  // Content
  { id: 'youtube', name: 'YouTube', icon: Youtube, color: '#FF0000' },
  { id: 'patreon', name: 'Patreon', icon: Heart, color: '#FF424D' },
  { id: 'onlyfans', name: 'OnlyFans', icon: Heart, color: '#00AFF0' },

  // Apps
  { id: 'appstore', name: 'App Store', icon: Store, color: '#0D96F6' },
  { id: 'playstore', name: 'Play Store', icon: Store, color: '#48FF48' },

  // Communication
  { id: 'email', name: 'Email', icon: Mail, color: '#EA4335' },
  { id: 'document', name: 'Document', icon: FileText, color: '#4285F4' },

  // Generic
  { id: 'custom', name: 'Custom Link', icon: Link, color: '#000000' },
];

export function getPlatformIcon(platformId: string): LucideIcon {
  const icon = platforms.find((p) => p.id === platformId)?.icon;
  return typeof icon === 'function' ? (icon as LucideIcon) : Link;
}

export function getPlatformColor(platformId: string): string {
  return platforms.find((p) => p.id === platformId)?.color || '#000000';
}