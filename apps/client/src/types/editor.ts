import { BaseBlock, BlockType } from "@/api/api.types";

export type UserProfile = {
  name: string;
  onelink: string; // Without @ symbol
  onelinkFormatted: string; // With @ symbol
  email: string;
  bio: string;
  photoUrl?: string;
  photoCmp?: string;
};

export type Background = {
  id?: string;
  type: "color" | "image" | "video";
  value: string;
  label?: string;
  thumbnail?: string;
};

export type ThemeConfig = {
  buttonStyle?: number;
  containerStyle?: number;
  background?: Background;
  buttonColor?: string;
  containerColor?: string;
  fontFamily?: string;
  fontSize?: string;
  fontColor?: string;
  transparency?: number;
  buttonEffect?: number;
  particlesEffect?: number;
  heroEffect?: number;
};

export type Theme = {
  id: number;
  user_id?: number | null;
  name: string;
  share_level: string;
  share_config: object;
  config: ThemeConfig;
};

export interface GalleryImage {
  url: string;
  type: string;
}

export interface MarketplaceTheme {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  tags: string[];
  theme: ThemeConfig;
  locked?: boolean;
  user_id?: number | null; // For server themes, null means admin theme
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  themeCount: number;
  themes?: MarketplaceTheme[]; // Optional - only present for hardcoded collections
  isServer?: boolean;
  categoryImage?: {
    id: number;
    url: string | null;
    [key: string]: any;
  } | null;
}

export type EditorState = {
  profile: UserProfile;
  blocks: BlockType[];
  theme: Theme;
  activePanel: string;
  gallery: GalleryImage[];
  marketplaceView: "grid" | "list";
  marketplaceFilter: string;
  marketplaceSort: "popular" | "newest";
  connectedWallet?: string;
  selectedPoolId: string | null;
};
