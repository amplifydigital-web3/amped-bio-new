/**
 * Store catalog and store policy (content PR 9; docs/features/store-catalog.md,
 * docs/features/store-policy.md, docs/legal/creator-storefront-policy.md).
 * Client, server and landing share every schema, limit and line here.
 */
import { z } from "zod";
import type { MembershipPlanPublic } from "./memberships";
import { CONTENT_PUBLIC_ID_REGEX } from "./contentKeys";
import type { ContentImageSet } from "./contentPlayer";

// ---------------------------------------------------------------- store settings

export const STORE_STATUSES = ["draft", "live", "paused"] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const STORE_LAYOUTS = ["grid", "list", "feature"] as const;
export type StoreLayout = (typeof STORE_LAYOUTS)[number];

/** Sections the creator orders. Header, Buying here and Footer are fixed (content spec 3.8). */
export const STORE_SECTIONS = ["membership", "featured", "products", "free", "about"] as const;
export type StoreSection = (typeof STORE_SECTIONS)[number];

export const STORE_LIMITS = {
  name: 40,
  tagline: 80,
  about: 600,
  thankYouNote: 280,
  featured: 3,
  title: 80,
  slug: 60,
  description: 2000,
  bundleItems: 50,
  /** Spec decision 7: one time 0.50 to 1,000 USDC. The payment settings bound it again at quote. */
  amountMinUnits: 500_000n,
  amountMaxUnits: 1_000_000_000n,
} as const;

export const storeSettingsUpdateSchema = z
  .object({
    name: z.string().trim().max(STORE_LIMITS.name).nullable(),
    tagline: z.string().trim().max(STORE_LIMITS.tagline).nullable(),
    layout: z.enum(STORE_LAYOUTS),
    sectionOrder: z.array(z.enum(STORE_SECTIONS)).max(STORE_SECTIONS.length),
    featuredOfferIds: z.array(z.string().regex(/^[0-9a-f]{32}$/)).max(STORE_LIMITS.featured),
    about: z.string().trim().max(STORE_LIMITS.about).nullable(),
    thankYouNote: z.string().trim().max(STORE_LIMITS.thankYouNote).nullable(),
  })
  .partial();
export type StoreSettingsUpdate = z.infer<typeof storeSettingsUpdateSchema>;

// ---------------------------------------------------------------- products (offers)

/** Kinds the store lists. ticket, tip and link offers arrive with their own builds. */
export const OFFER_KINDS = ["single", "bundle"] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

export const OFFER_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/** Access period chips: forever (In your Library), 30 days or 365 days. */
export const OFFER_ACCESS_PERIODS = [null, 30, 365] as const;

export const OFFER_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
export const offerIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

/** A slug from a title: lowercase words joined by hyphens, at most 60 characters. */
export function slugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, STORE_LIMITS.slug)
    .replace(/-+$/g, "");
  return slug || "product";
}

export const offerUpsertSchema = z.object({
  id: offerIdSchema.optional(),
  kind: z.enum(OFFER_KINDS),
  title: z.string().trim().min(1).max(STORE_LIMITS.title),
  slug: z.string().regex(OFFER_SLUG_REGEX),
  description: z.string().trim().max(STORE_LIMITS.description).nullable(),
  /** USDC units (6 decimals) as a decimal string */
  amountUnits: z.string().regex(/^\d{1,13}$/),
  accessPeriodDays: z.union([z.literal(30), z.literal(365)]).nullable(),
  alsoInMembership: z.boolean(),
  /** Content item public ids in order. A single holds one */
  itemPublicIds: z
    .array(z.string().regex(CONTENT_PUBLIC_ID_REGEX))
    .min(1)
    .max(STORE_LIMITS.bundleItems),
  /** The item whose cover the product uses, or null for the first item */
  coverItemPublicId: z.string().regex(CONTENT_PUBLIC_ID_REGEX).nullable(),
});
export type OfferUpsertInput = z.infer<typeof offerUpsertSchema>;

export const offerSetStatusSchema = z.object({
  id: offerIdSchema,
  status: z.enum(["active", "paused", "archived", "draft"]),
});

/** Why a product can't be saved or activated. Each maps to one line in STORE_COPY.errors. */
export const OFFER_REFUSALS = [
  "slug_taken",
  "amount_range",
  "bundle_full",
  "single_one_item",
  "item_not_ready",
  "item_adult",
  "no_plan",
  "seller",
  "policy",
  "archived",
  "bundle_has_buyers",
] as const;
export type OfferRefusal = (typeof OFFER_REFUSALS)[number];

// ---------------------------------------------------------------- go live (store-catalog 2)

export const GO_LIVE_STEPS = [
  "terms",
  "wallet",
  "email",
  "product",
  "seller",
  "policy",
  "adult",
] as const;
export type GoLiveStep = (typeof GO_LIVE_STEPS)[number];
export type GoLiveState = "done" | "todo" | "not_required";
export type GoLiveChecklist = {
  step: GoLiveStep;
  state: GoLiveState;
  reason?: string | null;
  /** Seller step (AB-6): selling with Standard, allowed by Amped.Bio until this ISO date */
  overrideUntil?: string | null;
}[];

// ---------------------------------------------------------------- store policy (store-policy 3)

export const STORE_POLICY_TEMPLATE_VERSION = 1;
export const STORE_POLICY_MAX_CHARS = 20_000;
export const STORE_POLICY_PUBLISH_PER_DAY = 10;
export const STORE_POLICY_REFUND_DAYS = [3, 7, 14] as const;

/** The fixed notice above every store policy. Filled only with {seller_name}. */
export const STORE_POLICY_NOTICE =
  "Sold by {seller_name} on Amped.bio. Your purchase is from {seller_name}, not from Amped. The Amped.bio Terms, the Contract between Fan and Creator and the Adult Content Policy also apply, and they prevail if anything in this store policy conflicts with them.";

export function storePolicyNotice(sellerName: string): string {
  return STORE_POLICY_NOTICE.replaceAll("{seller_name}", sellerName);
}

/** Refund summaries (store policy 3.4). No surface writes its own. */
export const REFUND_SUMMARY = {
  A: "You buy from {seller}. Sales are final. If an item does not open or is not as described, message me within 7 days.",
  B: "You buy from {seller}. You can ask for a refund within {refund_days} days of purchase, for any reason.",
  custom: "You buy from {seller}. See the store policy for refunds.",
} as const;

export const storePolicySellerSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("display") }),
  z.object({
    source: z.literal("legal"),
    legalName: z.string().trim().min(1).max(80),
  }),
]);

export const storePolicyStandardSchema = z.object({
  refund: z.discriminatedUnion("option", [
    z.object({ option: z.literal("A") }),
    z.object({
      option: z.literal("B"),
      days: z.union([z.literal(3), z.literal(7), z.literal(14)]),
    }),
  ]),
  /** Amped messages is always on; an optional email is added to the contact line */
  email: z.string().trim().email().max(254).nullable(),
});

/** Template A.3 confirmations. adult_records applies only when 18+ is on. */
export const STORE_POLICY_CONFIRMATIONS = [
  "names_seller",
  "age",
  "licence",
  "refunds",
  "memberships",
  "adult_records",
] as const;
export type StorePolicyConfirmation = (typeof STORE_POLICY_CONFIRMATIONS)[number];

export const storePolicyCustomSchema = z.object({
  text: z.string().max(STORE_POLICY_MAX_CHARS),
  confirmations: z.array(z.enum(STORE_POLICY_CONFIRMATIONS)),
});

export const storePolicyDraftSchema = z.object({
  mode: z.enum(["standard", "custom"]),
  seller: storePolicySellerSchema,
  standard: storePolicyStandardSchema,
  custom: storePolicyCustomSchema,
});
export type StorePolicyDraft = z.infer<typeof storePolicyDraftSchema>;

export const DEFAULT_STORE_POLICY_DRAFT: StorePolicyDraft = {
  mode: "standard",
  seller: { source: "display" },
  standard: { refund: { option: "A" }, email: null },
  custom: { text: "", confirmations: [] },
};

/** The confirmations a custom policy needs: five, or six with 18+ on. */
export function requiredConfirmations(adult: boolean): StorePolicyConfirmation[] {
  return STORE_POLICY_CONFIRMATIONS.filter(key => adult || key !== "adult_records");
}

const PART_B =
  "**{{store_name}} Store Policy**\n\nEffective {{effective_date}}\n\n## 1. Who you are buying from\n\nThis store is run by {{seller_name}} (@{{handle}}). When you buy\ncontent or a membership here, you buy it from me. I am the seller.\nAmped.bio provides the storefront and checkout. Amped is not the seller.\n\n## 2. Age\n\nYou must be 18 or older to buy from this store. To see any 18+ content,\nyou must pass the Amped age check. Do not share your account or let\nanyone under 18 use it.\n\n## 3. What you get\n\nWhen you buy an item or join a membership, you get a personal, limited\nlicence to view that content on your own devices through Amped. You do\nnot own the content. You may not download it outside Amped's features,\nrecord it, share it, repost it, resell it or use it to train AI.\n\nOne time purchases stay in your Library while the item is in my store\nand your account is in good standing. Membership content is available\nwhile your membership is active.\n\n## 4. Prices and payment\n\nPrices are shown in USDC, for example \\$10 USDC. You pay with USDC from\nyour Amped wallet through Amped checkout. The price you see is the price\nyou pay. Any network fee is shown before you confirm. Payments run on a\npublic blockchain, so the wallet address used is visible on chain.\n\n## 5. Memberships\n\n- Memberships are monthly or yearly at the price shown when you join.\n\n- Your membership renews each period. You get a reminder 3 days before\n  each charge.\n\n- If your wallet balance is short at renewal, you have a 7 day grace\n  period to top up. After that, your membership ends.\n\n- You can cancel at any time in My Memberships. You keep access to the\n  end of the period you paid for.\n\n- If I change a membership price, the new price applies from your next\n  period after I give notice.\n\n## 6. Refunds\n\n{{refund_terms}}\n\nRefunds are paid in USDC to your Amped wallet. The law where you live\nmay give you more rights. Nothing in this policy limits them.\n\n## 7. Custom requests\n\nIf I accept a custom request, we agree the description, price and\ndelivery time in messages before you pay. I only make content within my\nown rules and the Amped Adult Content Policy. I may decline any request.\n\n## 8. Messages and conduct\n\nBe respectful. No harassment, threats, requests to meet in person, or\nrequests for anything illegal. I may block anyone who breaks these\nrules.\n\n{{section_9}}## 10. Leaks and copyright\n\nMy content is mine. Sharing it outside Amped breaks this policy and may\nbreak the law. If you do, I may end your access and send takedown\nnotices.\n\n## 11. Privacy\n\nI can see your Amped handle, what you buy from me and the messages you\nsend me. I cannot see your legal name, your age check details or your\nwallet balance. Amped's privacy notice explains how Amped handles your\ninformation.\n\n## 12. Problems and reports\n\nContact me through {{contact_method}}. If you appear in content on\nAmped without your consent, use the Take It Down form on Amped.bio.\nAmped acts within 48 hours. To report anything else that breaks the\nrules, use the report link on the item.\n\n## 13. Changes\n\nI may update this policy. The effective date above shows the latest\nversion. The version in force when you buy applies to that purchase.\n";

/** Section 5 of Part B, verbatim, left out when the store has no membership plan (MB-2). */
const MEMBERSHIPS_SECTION = PART_B.slice(
  PART_B.indexOf("## 5. Memberships"),
  PART_B.indexOf("## 6. Refunds")
);
const OPTION_A =
  "Digital content opens as soon as your payment\nconfirms, so sales are final. If an item does not open or is not as\ndescribed, message me within 7 days and I will fix it or refund you in\nfull.";
const OPTION_B =
  "You may ask for a refund within {{refund_days}} days\nof purchase for any reason. Message me and I will refund you in full.";
const SECTION_9 =
  "## 9. My content (shown when 18+ is on)\n\nEveryone who appears in my content was 18 or older when it was made,\npassed the Amped age check and signed a release. I keep the records\nrequired by 18 U.S.C. 2257. I follow the Amped.bio Adult Content Policy.\n\n";

/**
 * The standard policy, Part B of docs/legal/creator-storefront-policy.md sentence for
 * sentence, with every field filled. Section 9 only when 18+ is on.
 */
export function renderStandardPolicy(fields: {
  sellerName: string;
  storeName: string;
  handle: string;
  refund: StorePolicyDraft["standard"]["refund"];
  email: string | null;
  effectiveDate: string;
  adult: boolean;
  /** MB-2 (store policy 5.2): section 5 renders only for a store with a membership plan */
  memberships?: boolean;
}): string {
  const refundTerms =
    fields.refund.option === "A"
      ? OPTION_A
      : OPTION_B.replaceAll("{{refund_days}}", String(fields.refund.days));
  const contact = fields.email ? `Amped messages or ${fields.email}` : "Amped messages";
  const body = fields.memberships === false ? PART_B.replace(MEMBERSHIPS_SECTION, "") : PART_B;
  return body
    .replace("{{section_9}}", fields.adult ? SECTION_9 : "")
    .replaceAll("{{refund_terms}}", refundTerms)
    .replaceAll("{{store_name}}", fields.storeName)
    .replaceAll("{{seller_name}}", fields.sellerName)
    .replaceAll("{{handle}}", fields.handle)
    .replaceAll("{{contact_method}}", contact)
    .replaceAll("{{effective_date}}", fields.effectiveDate)
    .replace(/\n{3,}/g, "\n\n");
}

/** The refund summary for a published policy. */
export function refundSummary(
  sellerName: string,
  policy: { mode: "standard" | "custom"; refund?: StorePolicyDraft["standard"]["refund"] }
): string {
  if (policy.mode === "custom" || !policy.refund) {
    return REFUND_SUMMARY.custom.replaceAll("{seller}", sellerName);
  }
  if (policy.refund.option === "A") return REFUND_SUMMARY.A.replaceAll("{seller}", sellerName);
  return REFUND_SUMMARY.B.replaceAll("{seller}", sellerName).replaceAll(
    "{refund_days}",
    String(policy.refund.days)
  );
}

const ALLOWED_POLICY_HOSTS = /(^|\.)amped\.bio$/i;
// A small, common TLD list. The server check and the client hint share it.
const POLICY_TLDS =
  "com|net|org|io|me|app|co|xyz|link|ly|gg|tv|to|ai|bio|info|biz|us|uk|ca|de|fr|es|it|nl|eu|shop|store|page|site|online|cash|money|pay|finance|fans|club|vip|live|social|chat|im|be|at|ch|se|no|dk|fi|pl|br|mx|ar|au|nz|jp|kr|cn|in|ru|tk|ml|ga|cf|gq";
const BARE_DOMAIN = new RegExp(
  `(?:^|[^@\\w.-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${POLICY_TLDS}))(?=$|[^a-z0-9-])`,
  "gi"
);
const SCHEME_URL = /\b(?:https?|ftp):\/\/([a-z0-9.-]+)|\bwww\.([a-z0-9.-]+)/gi;

/**
 * Hosts a custom policy links to that are not amped.bio (store policy 3.1, SP-Q10): scheme URLs,
 * bare domains, and both after "[dot]", "(dot)" and " dot " become dots and spaces around dots
 * go. Email addresses are allowed and never counted.
 */
export function findPolicyLinks(text: string): string[] {
  const normalized = text
    .replace(/\s*(?:\[dot\]|\(dot\)|\s+dot\s+)\s*/gi, ".")
    .replace(/\s*\.\s+(?=[a-z0-9])/gi, ".")
    .replace(/(?<=[a-z0-9])\s+\.(?=[a-z0-9])/gi, ".");
  const withoutEmails = normalized.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, " ");
  const hosts = new Set<string>();
  for (const match of withoutEmails.matchAll(SCHEME_URL)) {
    const host = (match[1] ?? `www.${match[2]}`).toLowerCase().replace(/\.+$/, "");
    if (!ALLOWED_POLICY_HOSTS.test(host)) hosts.add(host);
  }
  for (const match of withoutEmails.matchAll(BARE_DOMAIN)) {
    const host = match[1]!.toLowerCase();
    if (!ALLOWED_POLICY_HOSTS.test(host)) hosts.add(host);
  }
  return [...hosts];
}

// ---------------------------------------------------------------- public payloads

export type StoreProductCard = {
  id: string;
  slug: string;
  kind: OfferKind;
  title: string;
  amountUnits: string;
  accessPeriodDays: number | null;
  itemCount: number;
  cover: ContentImageSet | null;
  itemKinds: string[];
  /** MB-2: members open this product's items too */
  alsoInMembership: boolean;
};

export type StorePublic = {
  handle: string;
  name: string;
  sellerName: string;
  tagline: string | null;
  avatar: string | null;
  layout: StoreLayout;
  sectionOrder: StoreSection[];
  about: string | null;
  featured: StoreProductCard[];
  products: StoreProductCard[];
  buyingHere: { summary: string; policyVersion: number };
  /** MB-2: the membership card, when the creator has an active plan */
  membership: MembershipPlanPublic | null;
  /** Only true for the owner while the store is not live or sales are off */
  preview: boolean;
};

/** Store block (st10): products shown on the bio, featured first. */
export const STORE_BLOCK_PRODUCTS_MAX = 6;

/** What the store block renders. Null from the server means the block hides. */
export type StoreBioBlock = {
  handle: string;
  /** The store's name, used when the block's heading is empty */
  name: string;
  /** Every active product, for the row label ("3 products") */
  productCount: number;
  products: StoreProductCard[];
};

export type StoreProductPublic = StoreProductCard & {
  handle: string;
  sellerName: string;
  description: string | null;
  items: {
    publicId: string;
    kind: string;
    title: string;
    durationMs: number | null;
    pageCount: number | null;
  }[];
  policyVersion: number;
  /** MB-2: the plan that also opens this product, when it is Also in membership */
  membership: MembershipPlanPublic | null;
  preview: boolean;
};

export type StorePolicyPublic = {
  handle: string;
  sellerName: string;
  notice: string;
  version: number;
  mode: "standard" | "custom";
  text: string;
  publishedAt: string;
  current: boolean;
  /** The version after this one took over, for a past version */
  supersededAt: string | null;
};

// ---------------------------------------------------------------- copy

/** Store surfaces copy (store-catalog 6). Amounts go through usdcDollarsLabel. No dashes. */
export const STORE_COPY = {
  tabs: {
    storefront: "Storefront",
    products: "Products",
    membership: "Membership",
    sales: "Sales",
    policy: "Policy",
  },
  previewOnly: "Preview only. Store sales are not switched on yet. Only you can see your store.",
  accessLine: (days: number | null) =>
    days === null ? "In your Library" : `Access for ${days} days`,
  buy: (amount: string) => `Buy ${amount}`,
  soldBy: (seller: string) => `Sold by ${seller}.`,
  storePolicy: "Store policy",
  reportStore: "Report store",
  reportItem: "Report item",
  buyingHere: "Buying here",
  readPolicy: "Read the store policy",
  feeLine: (net: string, percent: string) =>
    `You receive ${net} after the Amped.Bio fee of ${percent}.`,
  goLive: {
    title: "Go live checklist",
    steps: {
      terms: "Seller terms accepted.",
      wallet: "USDC on Base ready in your wallet.",
      email: "Email verified.",
      product: "One active product or membership plan.",
      seller: "Seller verified (Authbase and RNS name).",
      policy: "Store policy published.",
      adult: "Adult setup complete.",
    } satisfies Record<GoLiveStep, string>,
    // AB-6 (board s5, M10): the seller step's states when the Enhanced rule is on
    sellerNeedsEnhanced:
      "Selling needs an Enhanced check. Your Standard check stays valid for 18+ content.",
    sellerUpgrade: "Upgrade to Enhanced",
    sellerAllowedUntil: (date: string) =>
      `Allowed by Amped.Bio to sell with Standard until ${date}.`,
    adultSub:
      "Over 18, seller verified, Adult Content Policy accepted, custodian of records named.",
    action: "Go live",
    pause: "Pause store",
    live: "Your store is live.",
    paused: "Your store is paused. Fans can't see it. Buyers keep access.",
  },
  products: {
    empty: "No products yet",
    emptyBody: "Make a product from items in your Library.",
    newProduct: "New product",
    goToLibrary: "Go to Library",
    statuses: {
      draft: "Draft",
      active: "Active",
      paused: "Paused",
      archived: "Archived",
    } satisfies Record<OfferStatus, string>,
    verifyToSell: "Verify to sell",
  },
  errors: {
    slug_taken: "That address is in use in your store.",
    amount_range: "Enter $0.50 to $1,000 USDC.",
    bundle_full: "A bundle holds up to 50 items.",
    single_one_item: "A single product holds one item.",
    item_not_ready: "Every item must be published, ready and cleared.",
    item_adult: "18+ items can't be sold yet. Adult setup comes first.",
    no_plan: "Set up a membership first.",
    seller: "Verify to sell before you activate a product.",
    policy: "Publish your store policy before you activate a product.",
    archived: "This product is archived. Make a new one.",
    bundle_has_buyers: "Archive this product and make a new one.",
    policy_external_link: (host: string) =>
      `We could not publish. Your text links to ${host}. Only amped.bio links and email addresses are allowed. Remove the link and publish again.`,
    policy_link_typing: (host: string) =>
      `Your text links to ${host}. Only amped.bio links and email addresses are allowed. Remove the link to publish.`,
    policy_confirmations_missing:
      "We could not publish. Tick every confirmation, then publish again.",
    policy_rate_limited: (time: string) =>
      `You published 10 times today. You can publish again at ${time}.`,
    sellerName: "Enter the name fans will see as the seller.",
  } as const,
  policy: {
    standard: "Standard",
    custom: "Own policy",
    publishFootnote: "Publish needs every confirmation and no links outside amped.bio.",
    publish: "Publish",
    published: (version: number, date: string) => `Version ${version}, published ${date}.`,
    confirmations: {
      names_seller: "It names me as the seller.",
      age: "It says buyers must be 18 or older, and 18+ content needs the Amped age check.",
      licence: "It says buyers get a personal, limited licence to view, not ownership.",
      refunds: "It states my refund terms, in USDC to the Amped wallet.",
      memberships:
        "For memberships, it states renewal, the 3 day reminder, the 7 day grace and how to cancel.",
      adult_records:
        "Everyone who appears was 18 or older, passed the Amped check and signed a release, and I keep 2257 records.",
    } satisfies Record<StorePolicyConfirmation, string>,
    pastVersion: (version: number, from: string, to: string) =>
      `Version ${version}, in force ${from} to ${to}.`,
    seeCurrent: "See the current policy.",
  },
  block: {
    name: "Store",
    description: "Up to 6 of your products and a link to your store.",
    heading: "Heading",
    headingHelp: "Leave empty to show your store name.",
    count: (n: number) => (n === 1 ? "1 product" : `${n} products`),
    visitStore: "Visit store",
    notLive: "Shows on your page once your store is live.",
    noProducts: "Shows on your page once you have an active product.",
    goToStore: "Open Store",
  },
} as const;
