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

// Routable editor panels. The rail shows seven destinations (Screen Review 001,
// D01): home, explore, page, design, analytics, wallet, my-pool. Account is
// reached from the avatar menu. pay and rns stay routable and belong to Wallet.
// The hidden Leaderboard, Reward and Reward Pools panels are deleted (086 D1);
// their old URLs are legacy redirects below.
export const EDITOR_PANELS = [
  "home",
  "analytics",
  "people",
  "explore",
  "page",
  "design",
  "wallet",
  "my-pool",
  "account",
  "pay",
  "rns",
  "inbox",
] as const;

export type EditorPanelType = (typeof EDITOR_PANELS)[number];

/**
 * Legacy panel routes and where they now live (Screen Review 001 I01, I12).
 * The editor redirects these with replace, keeping the rest of the query.
 */
export const LEGACY_PANEL_REDIRECTS: Record<string, { panel: EditorPanelType; tab?: string }> = {
  profile: { panel: "page" },
  blocks: { panel: "page" },
  gallery: { panel: "design", tab: "themes" },
  createRewardPool: { panel: "my-pool" },
  developer: { panel: "account", tab: "developers" },
  appearance: { panel: "design", tab: "style" },
  effects: { panel: "design", tab: "motion" },
  // Screen Review 086 I01, I10 (D1, D2): deleted panels. Silent redirect, no toast.
  leaderboard: { panel: "explore", tab: "pools" },
  rewardPools: { panel: "explore", tab: "pools" },
  reward: { panel: "my-pool" },
};

/** Old /profile?tab= values that now live on Design (Screen Review 027). */
export const LEGACY_PROFILE_TABS: Record<string, string> = {
  appearance: "style",
  effects: "motion",
  theme: "themes",
};

export type EditorState = {
  profile: UserProfile;
  blocks: BlockType[];
  theme: Theme;
  activePanel: EditorPanelType;
  gallery: GalleryImage[];
  connectedWallet?: string;
  selectedPoolId: string | null;
  hasCreatorPool: boolean;
};
