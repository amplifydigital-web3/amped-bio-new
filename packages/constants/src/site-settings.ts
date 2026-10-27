export const SITE_SETTINGS = {
  AFFILIATE_REFERRER_REWARD: "affiliate_referrer_reward",
  AFFILIATE_REFEREE_REWARD: "affiliate_referee_reward",
  FAUCET_ENABLED: "faucet_enabled",
  DASHBOARD_BANNER: "dashboard_banner",
  /** USDC wallet spec 3.8: Pause USDC sends. The relayer submits nothing while true. */
  USDC_SENDS_PAUSED: "usdc_sends_paused",
  /** Buy USDC (Build Board #5, spec 3.8): Pause Buy USDC. No new Coinbase quote, link or order while true. */
  USDC_ONRAMP_PAUSED: "usdc_onramp_paused",
} as const;

export type SiteSettingKey = (typeof SITE_SETTINGS)[keyof typeof SITE_SETTINGS];
