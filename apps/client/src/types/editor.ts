import type {
  Collection,
  MarketplaceTheme,
  ThemeConfig,
  Background,
  BlockType,
} from "@repo/constants";

export type UserProfile = {
  id: number;
  name: string;
  handle: string; // Without @ symbol
  handleFormatted: string; // With @ symbol
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

export const EDITOR_PANELS = [
  "home",
  "explore",
  "profile",
  "reward",
  "gallery",
  "blocks",
  "rewardPools",
  "createRewardPool",
  "leaderboard",
  "rns",
  "wallet",
  "pay",
  "account",
] as const;

export type EditorPanelType = (typeof EDITOR_PANELS)[number];

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
