import type { FeatureFlagKey } from "./feature-flags";
import type { MediaBlockPlatform } from "./blocks";

// Block Review v2, the Add block catalog (Build Board #54, wave 1 spec section
// 9, board ab1, Screen Review 218). One registry the editor reads: every block
// family, available or Coming soon, in the order All shows them. A wave PR
// ships a block by changing its entry from `soon` to `available` and giving it
// an `add` action; nothing else in the dialog changes.

export const BLOCK_FAMILIES = [
  { id: "structure", label: "Links and structure" },
  { id: "media", label: "Media" },
  { id: "audience", label: "Audience" },
  { id: "commerce", label: "Commerce" },
  { id: "identity", label: "Identity" },
] as const;

export type BlockFamily = (typeof BLOCK_FAMILIES)[number]["id"];

/** What picking an available tile adds. Mirrors the editor's draft kinds. */
export type CatalogAdd =
  | { type: "media"; platform: MediaBlockPlatform }
  | { type: "text" }
  | { type: "pool" }
  | { type: "referral" }
  | { type: "follow" }
  | { type: "followers" }
  | { type: "rnsid" }
  | { type: "content" }
  | { type: "store" }
  | { type: "telegram_message" }
  | { type: "message" };

/**
 * Icon keys the editor maps to lucide icons (or a platform icon for media
 * platforms). Constants stay free of React.
 */
export type CatalogIcon =
  | "text"
  | "heading"
  | "images"
  | "code"
  | "folder"
  | "at"
  | "megaphone"
  | "files"
  | "video"
  | "music"
  | "post"
  | "grid"
  | "rss"
  | "podcast"
  | "disc"
  | "library"
  | "mail"
  | "message-square"
  | "clipboard"
  | "timer"
  | "user-plus"
  | "users"
  | "help"
  | "contact"
  | "presentation"
  | "ticket"
  | "calendar"
  | "gift"
  | "chart"
  | "quote"
  | "milestone"
  | "map-pin"
  | "messages"
  | "sparkles"
  | "tag"
  | "shopping-bag"
  | "graduation"
  | "pen"
  | "target"
  | "percent"
  | "list"
  | "store"
  | "heart"
  | "badge-check"
  | "radio"
  | "id-card"
  | "send"
  | "message-circle"
  | "coins"
  | "link"
  | "gem"
  | "line-chart"
  | "trophy"
  | "crown"
  | `platform:${string}`;

export type CatalogEntry = {
  /** Stable id, also the analytics `type` for Coming soon tiles */
  id: string;
  name: string;
  /** One line under the name */
  line: string;
  family: BlockFamily;
  icon: CatalogIcon;
  status: "available" | "soon";
  /** Set when available: what the tile adds */
  add?: CatalogAdd;
  /** The block type a singleton tile matches on the page */
  singletonType?: string;
  /** "bar": only the announcement bar is one per page (Marquee and bar) */
  singleton?: true | "bar";
  /** The tile shows only while this flag is on */
  flag?: FeatureFlagKey;
  /** The tile hides while this flag is on (the block it replaces) */
  hideWhen?: FeatureFlagKey;
  /** Providers and synonyms search reads, as well as the name and line */
  keywords?: readonly string[];
  /** Build plan wave that ships it (Coming soon tiles) */
  wave?: "W1" | "W2" | "W3" | "W4" | "W5" | "W6" | "W7" | "W8";
  /** Another board card ships it */
  dependsOn?: string;
  /** New shows for NEW_BADGE_DAYS after this ISO date */
  releasedAt?: string;
};

export const NEW_BADGE_DAYS = 30;

const soon = (
  id: string,
  name: string,
  line: string,
  family: BlockFamily,
  icon: CatalogIcon,
  extra: Partial<CatalogEntry> = {}
): CatalogEntry => ({ id, name, line, family, icon, status: "soon", ...extra });

const media = (
  platform: MediaBlockPlatform,
  name: string,
  line: string,
  keywords: readonly string[] = []
): CatalogEntry => ({
  id: `media-${platform}`,
  name,
  line,
  family: "media",
  icon: `platform:${platform}`,
  status: "available",
  add: { type: "media", platform },
  keywords: [platform, ...keywords],
});

export const BLOCK_CATALOG: readonly CatalogEntry[] = [
  // Links and structure
  {
    id: "text",
    name: "Text",
    line: "Words with formatting",
    family: "structure",
    icon: "text",
    status: "available",
    add: { type: "text" },
    keywords: ["paragraph", "note", "about"],
  },
  soon("section", "Header and divider", "Sections and a menu", "structure", "heading", {
    wave: "W1",
    keywords: ["heading", "title", "spacer", "section"],
  }),
  soon("gallery", "Gallery", "Grid, carousel, slideshow", "structure", "images", {
    wave: "W1",
    keywords: ["photos", "images", "portfolio"],
  }),
  soon("embed", "Embed", "Calendly, Maps and more", "structure", "code", {
    wave: "W1",
    keywords: ["calendly", "typeform", "google maps", "bandcamp", "cal.com", "iframe"],
  }),
  soon("collection", "Collection", "Group blocks in a folder", "structure", "folder", {
    wave: "W6",
    keywords: ["folder", "group"],
  }),
  soon("social", "Social icons", "Every profile in one row", "structure", "at", {
    wave: "W1",
    singleton: true,
    keywords: ["instagram", "tiktok", "x", "youtube", "icons", "profiles"],
  }),
  soon("marquee", "Marquee and bar", "News ribbon or top bar", "structure", "megaphone", {
    wave: "W1",
    singleton: "bar",
    keywords: ["announcement", "ticker", "banner"],
  }),
  soon("subpages", "Sub pages", "Coming soon", "structure", "files", {
    dependsOn: "Sub pages card",
  }),

  // Media: today's platforms until the Media kinds ship in wave 2
  media("youtube", "YouTube", "A video with a player", ["video", "shorts"]),
  media("vimeo", "Vimeo", "A video with a player", ["video"]),
  media("tiktok", "TikTok", "A TikTok video", ["video"]),
  media("spotify", "Spotify", "A track, album or show", ["music", "podcast"]),
  media("instagram", "Instagram post", "One post or reel", ["post", "reel"]),
  media("twitter", "X post", "One post from X", ["post", "tweet", "twitter"]),
  media("facebook", "Facebook post", "One post or video", ["post"]),
  soon("social-feed", "Social feed", "Latest from Instagram, TikTok", "media", "grid", {
    wave: "W4",
    keywords: ["instagram", "tiktok", "youtube", "feed", "grid"],
  }),
  soon("feed", "Latest posts", "Substack, beehiiv, any RSS", "media", "rss", {
    wave: "W4",
    keywords: ["substack", "beehiiv", "ghost", "medium", "rss", "blog", "newsletter"],
  }),
  soon("podcast", "Podcast", "Episodes with a player", "media", "podcast", {
    wave: "W4",
    keywords: ["episodes", "rss", "apple podcasts"],
  }),
  soon("release", "Release and pre save", "Pre save, then every service", "media", "disc", {
    wave: "W5",
    keywords: ["spotify", "apple music", "deezer", "smart link", "pre save"],
  }),
  {
    id: "content",
    name: "Video, audio and files",
    line: "Items from your library",
    family: "media",
    icon: "library",
    status: "available",
    add: { type: "content" },
    flag: "content",
    keywords: ["library", "upload", "video", "audio", "files"],
  },

  // Audience
  soon("email_signup", "Email signup", "Grow your list", "audience", "mail", {
    wave: "W3",
    keywords: ["newsletter", "subscribe", "mailchimp", "kit", "beehiiv", "klaviyo", "sign up"],
  }),
  soon("sms", "SMS signup", "Texts with consent", "audience", "message-square", {
    wave: "W3",
    keywords: ["text", "sms", "sign up"],
  }),
  soon("form", "Form", "Contact and requests", "audience", "clipboard", {
    wave: "W3",
    keywords: ["contact", "enquiry", "brief"],
  }),
  soon("countdown", "Countdown", "Count to a real date", "audience", "timer", {
    wave: "W1",
    keywords: ["timer", "launch", "drop"],
  }),
  {
    id: "follow",
    name: "Follow button",
    line: "Fans follow you on Amped",
    family: "audience",
    icon: "user-plus",
    status: "available",
    add: { type: "follow" },
    singleton: true,
    singletonType: "follow",
    flag: "fanGraph",
  },
  {
    id: "followers",
    name: "Followers",
    line: "Proof fans chose to share",
    family: "audience",
    icon: "users",
    status: "available",
    add: { type: "followers" },
    singleton: true,
    singletonType: "followers",
    flag: "fanGraph",
  },
  soon("faq", "FAQ", "Answers fans look for", "audience", "help", {
    wave: "W1",
    keywords: ["questions", "help", "accordion"],
  }),
  soon("contact", "Save contact", "Add you to their phone", "audience", "contact", {
    wave: "W7",
    keywords: ["vcard", "phone", "contact card"],
  }),
  soon("mediakit", "Media kit", "Figures and rates for brands", "audience", "presentation", {
    wave: "W5",
    keywords: ["brands", "rates", "stats", "sponsor"],
  }),
  soon("events", "Events", "Tour dates and tickets", "audience", "ticket", {
    wave: "W4",
    keywords: ["tour", "bandsintown", "seated", "tickets", "gigs"],
  }),
  soon("booking", "Booking", "Sessions from Cal.com, Calendly", "audience", "calendar", {
    wave: "W1",
    keywords: ["calendly", "cal.com", "coaching", "call", "appointment"],
  }),
  soon("leadmagnet", "Lead magnet", "A free file for a signup", "audience", "gift", {
    wave: "W3",
    keywords: ["freebie", "download", "sign up"],
  }),
  soon("poll", "Poll and survey", "Ask fans a question", "audience", "chart", {
    wave: "W3",
    keywords: ["vote", "survey", "question"],
  }),
  soon("testimonials", "Testimonials", "What customers say", "audience", "quote", {
    wave: "W3",
    keywords: ["reviews", "quotes"],
  }),
  soon("timeline", "Timeline", "Steps and milestones", "audience", "milestone", {
    wave: "W1",
    keywords: ["roadmap", "milestones", "steps"],
  }),
  soon("location", "Map and location", "Where to find you", "audience", "map-pin", {
    wave: "W4",
    keywords: ["map", "address", "studio", "directions"],
  }),
  soon("community", "Community", "Telegram, Discord and more", "audience", "messages", {
    wave: "W5",
    keywords: ["discord", "telegram", "whatsapp", "slack", "group"],
  }),
  soon("ask", "Ask me", "Coming soon", "audience", "sparkles", {
    wave: "W8",
    dependsOn: "AI builder #14",
    keywords: ["ai", "assistant", "questions"],
  }),

  // Commerce
  soon("picks", "Affiliate picks", "Products you recommend", "commerce", "tag", {
    wave: "W1",
    keywords: ["affiliate", "amazon", "recommendations", "products"],
  }),
  soon("shop", "Shop", "Merch from your store", "commerce", "shopping-bag", {
    wave: "W5",
    keywords: ["shopify", "fourthwall", "spring", "etsy", "printful", "merch"],
  }),
  soon("course", "Course", "Lessons with a free preview", "commerce", "graduation", {
    wave: "W7",
    keywords: ["lessons", "class"],
  }),
  soon("requests", "Paid requests", "Shoutouts and commissions", "commerce", "pen", {
    wave: "W7",
    keywords: ["shoutout", "commission", "custom"],
  }),
  soon("goal", "Fundraising goal", "Progress toward a goal", "commerce", "target", {
    wave: "W7",
    keywords: ["goal", "support", "fundraiser"],
  }),
  soon("discount", "Discount code", "A code fans copy", "commerce", "percent", {
    wave: "W1",
    keywords: ["coupon", "promo", "code"],
  }),
  soon("pricelist", "Price list", "Services and prices", "commerce", "list", {
    wave: "W1",
    keywords: ["menu", "services", "rates", "plans"],
  }),
  {
    id: "store",
    name: "Store",
    line: "Products from your store",
    family: "commerce",
    icon: "store",
    status: "available",
    add: { type: "store" },
    singleton: true,
    singletonType: "store",
    flag: "content",
    keywords: ["shop", "products", "sell"],
  },
  soon("tip", "Tip", "Coming soon", "commerce", "heart", { dependsOn: "Memberships #25" }),
  soon("membership", "Membership", "Coming soon", "commerce", "badge-check", {
    dependsOn: "Memberships #25",
  }),
  soon("live", "Live tickets", "Coming soon", "commerce", "radio", {
    dependsOn: "Live streaming card",
  }),

  // Identity
  {
    id: "rnsid",
    name: "RNS ID",
    line: "Your verified name",
    family: "identity",
    icon: "id-card",
    status: "available",
    add: { type: "rnsid" },
    singleton: true,
    singletonType: "rnsid",
    flag: "rns",
  },
  {
    id: "message",
    name: "Message me",
    line: "Fans message you on Amped",
    family: "identity",
    icon: "message-circle",
    status: "available",
    add: { type: "message" },
    singleton: true,
    singletonType: "message",
    flag: "messages",
  },
  {
    id: "telegram_message",
    name: "Telegram message",
    line: "Message me on Telegram",
    family: "identity",
    icon: "send",
    status: "available",
    add: { type: "telegram_message" },
    singleton: true,
    singletonType: "telegram_message",
    flag: "telegram",
    hideWhen: "messages",
  },
  {
    id: "pool",
    name: "Creator pool",
    line: "Back this creator",
    family: "identity",
    icon: "coins",
    status: "available",
    add: { type: "pool" },
    keywords: ["pool", "revo"],
  },
  {
    id: "referral",
    name: "Referral",
    line: "Start your own page",
    family: "identity",
    icon: "link",
    status: "available",
    add: { type: "referral" },
    singleton: true,
    singletonType: "referral",
    keywords: ["invite"],
  },
  soon("collectibles", "Collectibles", "Items on the Revolution chain", "identity", "gem", {
    wave: "W8",
    keywords: ["nft", "badges"],
  }),
  soon("token", "Token price", "REVO price with its source", "identity", "line-chart", {
    wave: "W8",
    keywords: ["revo", "price"],
  }),
  soon("quests", "Quests", "Coming soon", "identity", "trophy", { dependsOn: "Quests #23" }),
  soon("superfans", "Superfans", "Coming soon", "identity", "crown", {
    dependsOn: "Superfans #24",
  }),
];

/** Whether a tile shows for these flags */
export function catalogEntryShown(
  entry: CatalogEntry,
  isOn: (flag: FeatureFlagKey) => boolean
): boolean {
  if (entry.flag && !isOn(entry.flag)) return false;
  if (entry.hideWhen && isOn(entry.hideWhen)) return false;
  return true;
}

/** New shows for NEW_BADGE_DAYS after releasedAt */
export function catalogEntryIsNew(entry: CatalogEntry, now: Date = new Date()): boolean {
  if (entry.status !== "available" || !entry.releasedAt) return false;
  const age = now.getTime() - Date.parse(entry.releasedAt);
  return age >= 0 && age < NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
}

function normalize(text: string) {
  return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

/** Search reads names, one lines and keywords. Every word must match. */
export function catalogMatches(entry: CatalogEntry, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = normalize([entry.name, entry.line, ...(entry.keywords ?? [])].join(" "));
  return words.every(word => haystack.includes(word));
}

export function searchCatalog(
  entries: readonly CatalogEntry[],
  query: string,
  family: BlockFamily | "all" = "all"
): CatalogEntry[] {
  return entries.filter(
    entry => (family === "all" || entry.family === family) && catalogMatches(entry, query)
  );
}
