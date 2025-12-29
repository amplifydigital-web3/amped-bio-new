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
  revoName?: string;
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

export type EditorPanelType =
  | "home"
  | "explore"
  | "profile"
  | "reward"
  | "gallery"
  | "blocks"
  | "rewardPools"
  | "createRewardPool"
  | "leaderboard"
  | "rns"
  | "wallet"
  | "pay"
  | "account";

export type EditorState = {
  profile: UserProfile;
  blocks: BlockType[];
  theme: Theme;
  activePanel: EditorPanelType;
  gallery: GalleryImage[];
  marketplaceView: "grid" | "list";
  marketplaceFilter: string;
  marketplaceSort: "popular" | "newest";
  connectedWallet?: string;
  selectedPoolId: string | null;
  hasCreatorPool: boolean;
};
