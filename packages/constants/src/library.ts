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
  | { kind: "buy"; amount: string }
  | { kind: "pool" };

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
    membership: null;
    purchases: { count: number };
    follow: { showPublicly: boolean; emailUpdates: boolean } | null;
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

// ---------------------------------------------------------------- downloads (FL-5)

/**
 * Offline copies (spec 3.5 Offline, decision C). The file lives only in the
 * app's Cache Storage; the server keeps a record so a check can tell the app
 * which copies the fan may still open.
 */
export const LIBRARY_DOWNLOADS = {
  /** Item kinds the app can keep offline */
  kinds: ["video", "audio", "document", "file"] as const,
  /** Download grants per fan per item per day (decision 24) */
  perDay: 10,
  /** How often the open app checks access, in ms */
  checkEveryMs: 6 * 60 * 60 * 1000,
  /** Offline opens are allowed this long after the last successful check */
  offlineWindowMs: 30 * 24 * 60 * 60 * 1000,
  /** Records one check may name */
  checkMax: 500,
  /** The largest size a record stores (20 GB) */
  maxBytes: 20 * 1024 ** 3,
} as const;
export type LibraryDownloadKind = (typeof LIBRARY_DOWNLOADS.kinds)[number];

/** True when the fan may keep an offline copy: the creator allows downloads and the kind is one the app keeps. */
export function canKeepOffline(card: Pick<ContentCard, "kind" | "allowDownload">): boolean {
  return card.allowDownload && (LIBRARY_DOWNLOADS.kinds as readonly string[]).includes(card.kind);
}

/** Why a copy left the device. */
export const LIBRARY_DOWNLOAD_REMOVED_REASONS = [
  "removed",
  "access",
  "unavailable",
  "downloadsOff",
] as const;
export type LibraryDownloadRemovedReason = (typeof LIBRARY_DOWNLOAD_REMOVED_REASONS)[number];

/** A random id per installed app. Never a fingerprint. */
export const libraryDeviceSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "Unknown device");
const downloadIdSchema = z.string().regex(/^[0-9a-f]{32}$/, "Unknown download");

export const libraryRecordDownloadSchema = z.object({
  publicId: contentPublicIdSchema,
  device: libraryDeviceSchema,
});
export const libraryMarkDownloadedSchema = z.object({
  id: downloadIdSchema,
  bytes: z.number().int().min(0).max(LIBRARY_DOWNLOADS.maxBytes),
});
export const libraryRemoveDownloadSchema = z.object({ id: downloadIdSchema });
export const libraryDownloadsSchema = z.object({ device: libraryDeviceSchema });
export const libraryDownloadsCheckSchema = z.object({
  device: libraryDeviceSchema,
  ids: z.array(downloadIdSchema).max(LIBRARY_DOWNLOADS.checkMax),
});

/** What recordDownload answers: the record and a short lived, single use file link. */
export interface LibraryDownloadGrant {
  id: string;
  item: LibraryItem;
  url: string;
  fileName: string;
  /** Unix ms. The app starts the fetch at once. */
  expiresAt: number;
}

export interface LibraryDownloadRecord {
  id: string;
  bytes: number;
  createdAt: string;
  item: LibraryItem;
}

export interface LibraryDownloadsCheck {
  /** Records the fan may still open offline */
  allowed: string[];
  /** Records whose files the app deletes now */
  removed: { id: string; reason: LibraryDownloadRemovedReason }[];
  /** ISO time of this check; offline opens are allowed for 30 days after it */
  checkedAt: string;
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
