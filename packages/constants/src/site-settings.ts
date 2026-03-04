export const SITE_SETTINGS = {
  AFFILIATE_REFERRER_REWARD: "affiliate_referrer_reward",
  AFFILIATE_REFEREE_REWARD: "affiliate_referee_reward",
  FAUCET_ENABLED: "faucet_enabled",
  DASHBOARD_BANNER: "dashboard_banner",
} as const;

export type SiteSettingKey = (typeof SITE_SETTINGS)[keyof typeof SITE_SETTINGS];
