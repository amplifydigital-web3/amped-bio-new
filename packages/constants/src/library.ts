/**
 * Fan Library (Build Board #26) API shapes, FL-2 (spec 3.4 and 3.6). The server
 * and the Library pages (FL-3, FL-4) share these, so the response shape is
 * fixed now: FL-6 changes who may open an item, not what a list returns.
 *
 * Every item names its owner and the one way the fan has it (accessSource).
 * No shape carries another user's email or wallet.
 */
import { z } from "zod";
import { CONTENT_UPLOAD_KINDS, contentPublicIdSchema } from "./content";
import { contentHandleSchema, type ContentCard } from "./contentPublic";
import { upgradeTheme } from "./effects/legacy";
import type { AnyThemeConfig } from "./theme";

// ---------------------------------------------------------------- access

/**
 * How a fan has an item, strongest first (spec 2.1, decision 12). A purchase
 * stays when a membership ends, so it outranks Members.
 */
export const LIBRARY_ACCESS_SOURCES = [
  "purchased",
  "member",
  "pool",
  "follower",
  "public",
] as const;
export type LibraryAccessSource = (typeof LIBRARY_ACCESS_SOURCES)[number];

/** The source the item shows when the fan has it several ways. Null for none. */
export function pickAccessSource(
  sources: Iterable<LibraryAccessSource>
): LibraryAccessSource | null {
  let best: number | null = null;
  for (const source of sources) {
    const rank = LIBRARY_ACCESS_SOURCES.indexOf(source);
    if (rank >= 0 && (best === null || rank < best)) best = rank;
  }
  return best === null ? null : LIBRARY_ACCESS_SOURCES[best]!;
}

// ---------------------------------------------------------------- limits

export const LIBRARY_LIMITS = {
  page: 24,
  continueMax: 12,
  /** Progress rows read to find 12 that still open */
  continueScan: 48,
  searchMinLength: 2,
  searchMaxLength: 80,
  /** Ids a client may send for On this device */
  deviceIdsMax: 500,
  /** Followed creators the item lists read (a fan following more sees the newest follows) */
  creatorsMax: 500,
  readsPerMinute: 120,
  savesPerMinute: 60,
  /** Items a section reads to count Yours and Shop once gating decides each one (FL-6) */
  sectionCountScan: 200,
  /** New content alerts (FL-6, spec 3.4): accounts written per chunk */
  fanOutChunk: 1000,
  /** The daily digest email (FL-6): the UTC hour it sends, and the most items it lists */
  digestHourUtc: 14,
  digestItemsMax: 6,
} as const;

// ---------------------------------------------------------------- inputs

const cursorSchema = z.string().min(1).max(64).optional();
const deviceIdsSchema = z.array(contentPublicIdSchema).max(LIBRARY_LIMITS.deviceIdsMax);

export const libraryContinueSchema = z
  .object({ handle: contentHandleSchema.optional() })
  .optional();

export const libraryNewestSchema = z
  .object({
    cursor: cursorSchema,
    type: z.enum(CONTENT_UPLOAD_KINDS).optional(),
    source: z.enum(LIBRARY_ACCESS_SOURCES).optional(),
    where: z.enum(["everywhere", "device"]).default("everywhere"),
    /** On this device: the ids in the app's download cache (FL-5) */
    deviceIds: deviceIdsSchema.optional(),
  })
  .optional();

export const libraryCreatorsSchema = z
  .object({
    cursor: cursorSchema,
    q: z.string().trim().max(LIBRARY_LIMITS.searchMaxLength).optional(),
  })
  .optional();

export const libraryCreatorSchema = z.object({ handle: contentHandleSchema });

export const libraryCreatorItemsSchema = z.object({
  handle: contentHandleSchema,
  seg: z.enum(["yours", "shop"]).default("yours"),
  cursor: cursorSchema,
});

export const librarySearchSchema = z
  .object({
    q: z.string().trim().min(LIBRARY_LIMITS.searchMinLength).max(LIBRARY_LIMITS.searchMaxLength),
    scope: z.enum(["all", "creator", "device"]).default("all"),
    /** scope creator */
    handle: contentHandleSchema.optional(),
    /** scope device */
    deviceIds: deviceIdsSchema.optional(),
    cursor: cursorSchema,
  })
  .refine(input => input.scope !== "creator" || !!input.handle, {
    message: "Choose a creator to search",
    path: ["handle"],
  });

/** New content alerts (fl-q5): every creator, or one creator by handle. */
export const libraryNewContentSchema = z.object({
  handle: contentHandleSchema.optional(),
  enabled: z.boolean(),
});

export const librarySavedSchema = z.object({ cursor: cursorSchema }).optional();
export const librarySaveSchema = z.object({ publicId: contentPublicIdSchema });

// ---------------------------------------------------------------- outputs

/** The creator's look, for the creator section, players and the payment sheet (FL-4). */
export interface LibraryThemeSummary {
  button: string;
  buttonText: string;
  text: string;
  container: string;
  containerOpacity: number;
  nameFont: string;
  bodyFont: string;
  /** Still scene only: a color or a gradient. Image, video and shader scenes give null. */
  background: { type: "color"; value: string } | { type: "gradient"; css: string } | null;
}

/** Who owns an item, as every Library row shows it. */
export interface LibraryOwner {
  handle: string;
  name: string | null;
  image: string | null;
  /** The 4 px accent on mixed screens: the creator's button color */
  accent: string | null;
}

export interface LibraryProgress {
  positionMs: number;
  durationMs: number | null;
  completed: boolean;
}

export interface LibraryItem extends ContentCard {
  owner: LibraryOwner;
  accessSource: LibraryAccessSource;
  /** The plan name when the source is member (FL-7) */
  planName: string | null;
  progress: LibraryProgress | null;
  /** ISO time the fan saved it; null when not saved */
  savedAt: string | null;
}

/** What opens a Shop item. Shop items carry no media URL (content criterion 9). */
export type LibraryUnlockHint =
  | { kind: "join" | "rejoin"; planName: string | null }
  /** FL-7: offerId starts the creator's payment sheet for the product */
  | { kind: "buy"; amount: string; offerId?: string }
  | { kind: "pool" }
  /** FL-6: a follower rule and the fan reached the section through the pool, not a follow */
  | { kind: "follow" }
  /** FL-6: the fan follows, but the follow counts once their email is confirmed */
  | { kind: "confirm_email" };

export interface LibraryShopItem extends ContentCard {
  owner: LibraryOwner;
  unlockHint: LibraryUnlockHint;
}

/** How the fan is connected to a creator (spec 2.1). */
export interface LibraryConnection {
  following: boolean;
  /** FL-7 */
  member: boolean;
  /** FL-7 */
  purchases: number;
  poolFan: boolean;
}

export interface LibraryCreatorRow {
  owner: LibraryOwner;
  connection: LibraryConnection;
  /** Items published since the fan last opened the section (or since they followed) */
  newCount: number;
  /** FL-7: a membership is past due */
  pastDue: boolean;
}

export interface LibraryCreatorHeader {
  /** False when the fan has no connection: the client opens the public page instead */
  connected: boolean;
  owner: LibraryOwner;
  theme: LibraryThemeSummary | null;
  connection: LibraryConnection;
  /** The status line: membership (FL-7), purchases (FL-7), follow settings */
  status: {
    /** FL-7: the fan's newest membership with this creator, current or ended */
    membership: LibraryMembershipStatus | null;
    purchases: { count: number };
    follow: { showPublicly: boolean; emailUpdates: boolean } | null;
    /** FL-7: the creator's plan when it takes members, for Join or Rejoin */
    plan: { name: string; amountEvery30Days: string } | null;
  };
  counts: { yours: number; shop: number };
}

export interface LibrarySearchGroup {
  owner: LibraryOwner;
  items: LibraryItem[];
}

export interface LibraryPage<T> {
  items: T[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------- theme summary

/** The still parts of a creator's look. Motion, overlays and cursor effects are left out (spec 3.2). */
export function libraryThemeSummary(
  config: AnyThemeConfig | null | undefined
): LibraryThemeSummary | null {
  if (!config) return null;
  let theme;
  try {
    theme = upgradeTheme(config);
  } catch {
    return null;
  }
  const base = theme.scene.base;
  const background: LibraryThemeSummary["background"] =
    base.type === "color"
      ? { type: "color", value: base.value }
      : base.type === "gradient"
        ? {
            type: "gradient",
            css: `linear-gradient(${base.angle}deg, ${base.stops
              .map(stop => `${stop.color} ${stop.at}%`)
              .join(", ")})`,
          }
        : null;
  return {
    button: theme.colors.button,
    buttonText: theme.colors.buttonText,
    text: theme.colors.text,
    container: theme.colors.container,
    containerOpacity: theme.colors.containerOpacity,
    nameFont: theme.fonts.name.family,
    bodyFont: theme.fonts.body.family,
    background,
  };
}

// ---------------------------------------------------------------- money (FL-7, MB-3)

/**
 * One state per membership card on Library, Memberships (row 125, boards r1, mb-q1).
 * Ordered past due, not covered, covered, then the rest. `active` means the wallet could
 * not be read, so the card claims nothing about coverage.
 */
export const LIBRARY_MEMBERSHIP_STATES = [
  "past_due",
  "not_covered",
  "covered",
  "active",
  "renewal_paused",
  "ends",
  "ended",
] as const;
export type LibraryMembershipState = (typeof LIBRARY_MEMBERSHIP_STATES)[number];

export interface LibraryMembershipStatus {
  id: string;
  planName: string;
  state: LibraryMembershipState;
  accessUntil: string | null;
  nextChargeAt: string | null;
  graceDay: number | null;
}

export interface LibraryMembershipCard extends LibraryMembershipStatus {
  owner: LibraryOwner;
  interval: "every_30_days" | "yearly";
  /** USDC units per period */
  amount: string;
  /** The access the next charge pays for runs to here, when the wallet covers it */
  coveredThrough: string | null;
  /** USDC units to add so the next charge goes through; null when nothing is short */
  need: string | null;
  /** The wallet has the USDC but the approval ran out: Join again renews it */
  allowanceShort: boolean;
  /** Charges the approval still covers; null when unread */
  chargesLeft: number | null;
  storePolicyVersion: number | null;
  joinedAt: string;
}

/** A membership charge or a purchase, with its transaction on Base. */
export interface LibraryReceipt {
  at: string;
  amount: string;
  txHash: string;
}

export interface LibraryPurchaseRow {
  id: string;
  title: string;
  amount: string;
  at: string;
  state: "pending" | "final" | "refunded";
  txHash: string | null;
  /** The store policy the fan was shown at purchase (store policy 3.6) */
  storePolicyVersion: number | null;
  /** Null is lifetime access */
  accessUntil: string | null;
}

export interface LibraryCreatorMoney {
  membership: LibraryMembershipCard | null;
  receipts: LibraryReceipt[];
  purchases: LibraryPurchaseRow[];
}
