/**
 * Feature flags stored in site_settings, so a flag changes from the admin
 * (Feature flags page) without a rebuild or a redeploy.
 *
 * Every app resolves a flag in the same order:
 * 1. the site_settings row `feature_flag.<key>`, when an admin has set one;
 * 2. the app's own environment variable listed in `env`, the value before this
 *    registry existed, so a deploy changes nothing until an admin sets a row;
 * 3. `default`.
 *
 * `public` flags are sent to the client, admin and landing apps by
 * public.getFeatureFlags. Server flags never leave the API. Hiding UI is
 * not a guard: every public flag that gates an action is also checked on the
 * server.
 */

export interface FeatureFlagDefinition {
  /** Shown on the admin Feature flags page */
  label: string;
  /** What turns on, for the admin page */
  description: string;
  /** "public": the apps receive it. "server": it stays on the API. */
  scope: "public" | "server";
  /** Used when there is no row and no environment value */
  default: boolean;
  /** Environment variable each app read before this registry (the fallback) */
  env: {
    server?: string;
    client?: string;
    landing?: string;
  };
}

export const FEATURE_FLAGS = {
  rns: {
    label: "RNS",
    description:
      "Revolution Name Service: the Wallet RNS tab, name pages, the Page profile name and the RNS name on public pages.",
    scope: "public",
    default: false,
    env: { client: "VITE_SHOW_RNS", landing: "NEXT_PUBLIC_SHOW_RNS" },
  },
  rnsIdentity: {
    label: "RNS identity",
    description: "The Identity tab and the Verified badge on RNS names. Needs RNS.",
    scope: "public",
    default: false,
    env: { client: "VITE_RNS_IDENTITY" },
  },
  rnsAttributes: {
    label: "RNS attributes",
    description: "Live Attributes on RNS names. Without it the tab shows Soon. Needs RNS.",
    scope: "public",
    default: false,
    env: { client: "VITE_RNS_ATTRIBUTES" },
  },
  rnsFacets: {
    label: "RNS facets",
    description: "Live Facets and facet requests on RNS names. Needs RNS.",
    scope: "public",
    default: false,
    env: { client: "VITE_RNS_FACETS" },
  },
  rnsFacetRequest: {
    label: "RNS facet request dialog",
    description:
      "The facet request dialog over the RNS name page. Needs RNS and RNS identity, and the Authbase proof API.",
    scope: "public",
    default: false,
    env: { client: "VITE_SHOW_FACET_REQUEST" },
  },
  rnsCardCheckout: {
    label: "RNS card checkout",
    description: "Buy RNS names in USD by card through Authbase checkout. Needs RNS.",
    scope: "public",
    default: false,
    env: { client: "VITE_RNS_CARD_CHECKOUT" },
  },
  rnsPublicIdentity: {
    label: "RNS public identity",
    description: "The API returns the Verified state of RNS names to anyone.",
    scope: "server",
    default: false,
    env: { server: "RNS_PUBLIC_IDENTITY" },
  },
  rnsPublicAttributes: {
    label: "RNS public attributes",
    description: "The API returns the attributes a Verified owner chose to share.",
    scope: "server",
    default: false,
    env: { server: "RNS_PUBLIC_ATTRIBUTES" },
  },
  rnsExpiryEmails: {
    label: "RNS expiry emails",
    description: "The hourly sweep that emails owners before their RNS name expires.",
    scope: "server",
    default: true,
    env: { server: "RNS_EXPIRY_EMAILS" },
  },
  themeV2: {
    label: "Theme v2",
    description: "The v2 Design panel rows and the v2 page renderer on public pages.",
    scope: "public",
    default: false,
    env: { client: "VITE_SHOW_THEME_V2", landing: "NEXT_PUBLIC_SHOW_THEME_V2" },
  },
  themeShowcase: {
    label: "Theme showcase",
    description:
      "Theme Engine v2 phase 3: WebGL scenes and the other showcase engines run on creator pages and in the editor. Off, a WebGL scene shows its still poster.",
    scope: "public",
    default: false,
    env: {},
  },
  fontCatalog: {
    label: "Font catalog",
    description:
      "The Text row font catalog: about 1,900 Google Fonts families, a Name font and a Body font, weight, italics and width and optical size sliders. Needs Theme v2. Staging only until font delivery ships, because catalog fonts still load from Google.",
    scope: "public",
    default: false,
    env: {},
  },
  fontDelivery: {
    label: "Font delivery",
    description:
      "Fonts load from Amped's own media host (decision 2): the API mirrors each stylesheet from Google Fonts to R2, and no visitor's browser contacts Google. Off keeps the Google Fonts link. Needs MEDIA_GATEWAY_ORIGIN and R2 on the API and the media gateway's fonts route.",
    scope: "public",
    default: false,
    env: {},
  },
  homeConversionCopy: {
    label: "Home conversion copy",
    description:
      "The conversion and tradability paragraphs on Home. Turn on only with counsel sign off.",
    scope: "public",
    default: false,
    env: { client: "VITE_HOME_CONVERSION_COPY" },
  },
  homeUpdatesFrame: {
    label: "Home updates frame",
    description:
      "The onboarding site as an Updates section on Home. Turn on only after that site drops the conversion and tradability paragraphs.",
    scope: "public",
    default: false,
    env: { client: "VITE_HOME_UPDATES_FRAME" },
  },
  motion: {
    label: "Landing motion",
    description: "The landing page hero light, headline motion and How it works.",
    scope: "public",
    default: false,
    env: { landing: "NEXT_PUBLIC_SHOW_MOTION" },
  },
  telegram: {
    label: "Telegram (app)",
    description:
      "Telegram surfaces in the apps: the Account link, Fan messages, the composer channel and the Telegram blocks. The bot itself follows TELEGRAM_ENABLED on the API.",
    scope: "public",
    default: false,
    env: { client: "VITE_SHOW_TELEGRAM", landing: "NEXT_PUBLIC_SHOW_TELEGRAM" },
  },
  telegramGroups: {
    label: "Telegram groups",
    description:
      "Gated creator groups (phase 2): group connect, join checks, the Telegram group block and the hourly group checks. Needs Telegram.",
    scope: "server",
    default: false,
    env: { server: "TELEGRAM_GROUPS" },
  },
  telegramMiniApp: {
    label: "Telegram Mini App",
    description:
      "The Mini App page endpoint, follow and share (phase 3). Needs Telegram and the TON safe mode review.",
    scope: "server",
    default: false,
    env: { server: "TELEGRAM_MINIAPP" },
  },
  broadcast: {
    label: "Broadcasts",
    description: "Creator Pool Broadcast: the My Pool Broadcasts tab and the Inbox.",
    scope: "public",
    default: false,
    env: { client: "VITE_SHOW_BROADCAST" },
  },
  messages: {
    label: "Amped Messages",
    description:
      "Amped Messages: direct messages on the API (sends refuse while off), the Inbox in the app and the Message me door on public pages.",
    scope: "public",
    default: false,
    env: { server: "MESSAGING_ENABLED", client: "VITE_MESSAGES", landing: "NEXT_PUBLIC_MESSAGES" },
  },
  creatorPool: {
    label: "Creator pool",
    description:
      "The My Pool destination, the Launch pool ad and the creator pool rows in the Wallet.",
    scope: "public",
    default: false,
    env: { client: "VITE_SHOW_CREATOR_POOL" },
  },
  wallet: {
    label: "Wallet",
    description: "The Wallet destination in the editor.",
    scope: "public",
    default: false,
    env: { client: "VITE_SHOW_WALLET" },
  },
  fanGraph: {
    label: "People",
    description:
      "Fan Graph: the People destination, its blocks, the Explore people list and Follow on public pages.",
    scope: "public",
    default: false,
    env: { client: "VITE_FAN_GRAPH", landing: "NEXT_PUBLIC_FAN_GRAPH" },
  },
  content: {
    label: "Content library",
    description: "The Content destination and its Library tab in the editor.",
    scope: "public",
    default: false,
    env: { client: "VITE_CONTENT" },
  },
  fanLibrary: {
    label: "Fan Library",
    description:
      "Fan Library (Build Board #26): up next and the queue on public item pages, and the Library pages as they ship (FL-1 to FL-7).",
    scope: "public",
    default: false,
    env: {},
  },
  libraryDigest: {
    label: "Fan Library daily email",
    description:
      "Fan Library (FL-6): one email a day per creator with their new items, to followers who chose Email me updates. Needs BULK_FOOTER_ADDRESS (CAN-SPAM postal address) and counsel sign off on the digest as commercial email.",
    scope: "server",
    default: false,
    env: {},
  },
  contentUploads: {
    label: "Content uploads",
    description:
      "The API accepts new content uploads. Uploads also need every Cloudflare setting to be present.",
    scope: "server",
    default: false,
    env: { server: "CONTENT_UPLOADS_ENABLED" },
  },
  checkout: {
    label: "Mobile checkout",
    description: "Checkout intents on the API, the resume bar and the pay page in the app.",
    scope: "public",
    default: false,
    env: { server: "CHECKOUT_ENABLED", client: "VITE_CHECKOUT" },
  },
  usdc: {
    label: "USDC wallet",
    description:
      "USDC on Base: the Base network in the Wallet, the transfer indexer and USDC sends on the API.",
    scope: "public",
    default: false,
    env: { server: "USDC_ENABLED", client: "VITE_USDC_WALLET" },
  },
  onramp: {
    label: "Buy USDC",
    description: "Buy USDC through Coinbase. Needs USDC wallet, and the CDP keys on the API.",
    scope: "public",
    default: false,
    env: { server: "ONRAMP_ENABLED", client: "VITE_USDC_ONRAMP" },
  },
  payments: {
    label: "AmpedPay",
    description: "AmpedPay payments are reported as live on the admin Payments overview.",
    scope: "server",
    default: false,
    env: { server: "PAYMENTS_ENABLED" },
  },
  storeSales: {
    label: "Store sales",
    description:
      "Creator stores and product pages are public and take payments. Off: a store renders for its owner in preview only (store catalog 2).",
    scope: "public",
    default: false,
    env: {},
  },
  accessGating: {
    label: "Access gating",
    description:
      "The access gating engine (access.* procedures), locked content cards and the item editor's access picker.",
    scope: "public",
    default: false,
    env: { server: "ACCESS_GATING_ENABLED" },
  },
  adultContent: {
    label: "18+ content",
    description:
      "18+ items open to fans who pass the Over 18 check: the Adult items card, the 18+ shelf and item pages, and publishing 18+ by creators who pass Over 18 and verified seller. Keep off until the safety queue, adult setup and review before publish ship (#28 R1 to R5).",
    scope: "public",
    default: false,
    env: {},
  },
  themeSharing: {
    label: "Theme sharing",
    description:
      "Theme Engine v2 phase 4: saved looks with history, share links and the amped.bio/t page, and the rebuilt Themes tab. Off, the share link page returns 404.",
    scope: "public",
    default: false,
    // A new flag: no environment fallback (AGENTS.md, feature flags)
    env: {},
  },
  blocksV2: {
    label: "Blocks v2",
    description:
      "Block Review v2 (#54): Block settings on every block (schedule, attention, entrance), the Add block catalog, and each v2 block as its wave ships. Needs Theme v2. Off, the server drops the settings on save; saved schedules still apply.",
    scope: "public",
    default: false,
    // A new flag: no environment fallback (AGENTS.md, feature flags)
    env: {},
  },
  // Authbase storefront (Build Board #66, AB-6, M10): turn on after Rob sets the overrides for
  // creators selling today with Standard (open question 8)
  sellerRequiresEnhanced: {
    label: "Sellers need Enhanced",
    description:
      "Creators need an Enhanced Authbase check to sell and get paid. An admin can allow a named creator to sell with Standard until a date (Users, Seller check).",
    scope: "server",
    default: false,
    env: {},
  },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

export const PUBLIC_FEATURE_FLAG_KEYS = FEATURE_FLAG_KEYS.filter(
  key => FEATURE_FLAGS[key].scope === "public"
);

/** site_settings key of one flag's row */
export const FEATURE_FLAG_SETTING_PREFIX = "feature_flag.";

export function featureFlagSettingKey(key: FeatureFlagKey): string {
  return `${FEATURE_FLAG_SETTING_PREFIX}${key}`;
}

export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, value);
}

/** Rows set by an admin. A key that is missing has no row and falls back to the environment. */
export type FeatureFlagOverrides = Partial<Record<FeatureFlagKey, boolean>>;

/**
 * The shared resolution order. `envValue` is the app's own environment value
 * for this flag ("true"/"false"/undefined); apps pass their own reader because
 * Vite and Next only inline variables they see written out.
 */
export function resolveFeatureFlag(
  key: FeatureFlagKey,
  overrides: FeatureFlagOverrides,
  envValue: string | boolean | undefined
): boolean {
  const override = overrides[key];
  if (override !== undefined) return override;
  if (typeof envValue === "boolean") return envValue;
  if (envValue !== undefined && envValue !== "") return envValue === "true";
  return FEATURE_FLAGS[key].default;
}
