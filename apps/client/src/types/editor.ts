import type {
  Collection,
  MarketplaceTheme,
  ThemeConfig,
  Background,
  BlockType,
} from "@ampedbio/constants";

export type UserProfile = {
  name: string;
  onelink: string; // Without @ symbol
  onelinkFormatted: string; // With @ symbol
  email: string;
  bio: string;
  photoUrl?: string;
  photoCmp?: string;
};

// Re-export types from constants package for convenience
export type { Collection, MarketplaceTheme, ThemeConfig, Background };

export interface GalleryImage {
  url: string;
  type: string;
}

export type Theme = {
  id: number;
  user_id?: number | null;
  name: string;
  share_level: string;
  share_config: object;
  config: ThemeConfig;
};

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
