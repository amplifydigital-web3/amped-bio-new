// Banner destinations (Screen Review 098 I07). The admin picks from the live
// destinations only. Older stored banners may still name a legacy panel, so
// the stored value accepts both; the client maps legacy values on read.

/** Destinations that render today, in rail order, with Account last. */
export const BANNER_LIVE_PANELS = [
  "home",
  "explore",
  "page",
  "design",
  "analytics",
  "wallet",
  "my-pool",
  "account",
] as const;

/** Values saved before the D01 destinations. Read only. */
export const BANNER_LEGACY_PANELS = [
  "profile",
  "reward",
  "gallery",
  "blocks",
  "rewardPools",
  "createRewardPool",
  "leaderboard",
  "rns",
  "pay",
] as const;

export const BANNER_PANELS = [...BANNER_LIVE_PANELS, ...BANNER_LEGACY_PANELS] as const;

export type BannerLivePanel = (typeof BANNER_LIVE_PANELS)[number];
export type BannerPanelValue = (typeof BANNER_PANELS)[number];

/** Where a legacy value now lands; reward is a hidden panel and gets none (D22). */
export const BANNER_LEGACY_TO_LIVE: Record<
  (typeof BANNER_LEGACY_PANELS)[number],
  BannerLivePanel | null
> = {
  profile: "page",
  blocks: "page",
  gallery: "design",
  createRewardPool: "my-pool",
  rns: "wallet",
  pay: "wallet",
  rewardPools: "explore",
  leaderboard: "explore",
  reward: null,
};

/** The live destination for any stored value. */
export function liveBannerPanel(
  value: BannerPanelValue | null | undefined
): BannerLivePanel | null {
  if (!value) return null;
  if ((BANNER_LIVE_PANELS as readonly string[]).includes(value)) return value as BannerLivePanel;
  return BANNER_LEGACY_TO_LIVE[value as (typeof BANNER_LEGACY_PANELS)[number]] ?? null;
}

export const BANNER_PANEL_LABELS: Record<BannerLivePanel, string> = {
  home: "Home",
  explore: "Explore",
  page: "Page",
  design: "Design",
  analytics: "Analytics",
  wallet: "Wallet",
  "my-pool": "My Pool",
  account: "Account",
};

// Define the unified schema for banner data (storage and presentation format)
// Note: This interface should match the Zod schema in apps/server/src/schemas/banner.ts
export interface BannerData {
  text: string;
  type: "info" | "warning" | "success" | "error";
  enabled: boolean;
  panel?: BannerPanelValue;
}
