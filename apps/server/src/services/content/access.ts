/**
 * Who may open a content item (Build Board #20, spec 3.6 and 3.10). One place for
 * the rule so the read URLs, progress writes and every public list agree.
 *
 * Public: READY, PUBLISHED, moderation CLEAR, no access rule, not 18+ and not
 * deleted, on a published page whose account is not suspended. Gated items open
 * through the gating engine (PR 8, LISTED_ITEM_WHERE and the content resolver).
 * 18+ items are refused on every public surface
 * until age assurance ships (#28, PR 7); until then no viewer has passed it.
 *
 * Owner: any READY item that is not blocked, so a creator can check a draft or
 * an item held for review before anyone else sees it.
 */
import type { ContentAsset, ContentItem, Prisma } from "@repo/database";

/** The Prisma filter for items anyone may open. Pair it with publicCreatorWhere. */
export const PUBLIC_ITEM_WHERE = {
  status: "READY",
  publishState: "PUBLISHED",
  moderationState: "CLEAR",
  accessRuleId: null,
  adult: false,
  deletedAt: null,
  // A Safety hide (content takedown 4.6) closes the item everywhere
  hiddenAt: null,
} satisfies Prisma.ContentItemWhereInput;

/**
 * Items a public page may list (content gating 3.2): PUBLIC_ITEM_WHERE without
 * the rule test. Gated items appear as locked cards and a locked page; they
 * never reach the sitemap, llms.txt, JSON-LD or hasPublicContent, which keep
 * PUBLIC_ITEM_WHERE. Used only while the accessGating flag is on.
 */
export const LISTED_ITEM_WHERE = {
  status: "READY",
  publishState: "PUBLISHED",
  moderationState: "CLEAR",
  adult: false,
  deletedAt: null,
  hiddenAt: null,
} satisfies Prisma.ContentItemWhereInput;

/** Creators whose items may appear publicly: a published page, not suspended. */
export const PUBLIC_CREATOR_WHERE = {
  page_status: "PUBLISHED",
  block: "no",
} satisfies Prisma.UserWhereInput;

type ItemFields = Pick<
  ContentItem,
  "status" | "publishState" | "moderationState" | "accessRuleId" | "adult" | "deletedAt"
> & {
  /** Safety hide. Optional so callers that do not load it read "not hidden" */
  hiddenAt?: Date | null;
};
type CreatorFields = { page_status: string; block: string };

export function isPublicItem(item: ItemFields, creator: CreatorFields | null): boolean {
  return (
    item.status === "READY" &&
    item.publishState === "PUBLISHED" &&
    item.moderationState === "CLEAR" &&
    item.accessRuleId === null &&
    !item.adult &&
    item.deletedAt === null &&
    !item.hiddenAt &&
    creator !== null &&
    creator.page_status === PUBLIC_CREATOR_WHERE.page_status &&
    creator.block === PUBLIC_CREATOR_WHERE.block
  );
}

/**
 * The owner previews any finished item that was not blocked. A Safety hide closes
 * it to the owner too (content takedown 4.8): nobody gets a token while it holds.
 */
export function ownerCanOpen(
  item: Pick<ContentItem, "status" | "moderationState"> & { hiddenAt?: Date | null }
): boolean {
  return item.status === "READY" && item.moderationState !== "BLOCKED" && !item.hiddenAt;
}

/**
 * Served assets must have passed the scan (spec 3.10): CLEAN, or SKIPPED for the
 * renditions we made ourselves. An infected, failed or unscanned served asset
 * keeps the whole item closed. Stream re-encodes every video it serves, so the
 * STREAM and PREVIEW_CLIP rows are never scanned by us and are not counted.
 */
const STREAM_ROLES = new Set(["STREAM", "PREVIEW_CLIP"]);

export function assetServable(asset: Pick<ContentAsset, "role" | "scanStatus">): boolean {
  if (STREAM_ROLES.has(asset.role)) return true;
  return asset.scanStatus === "CLEAN" || asset.scanStatus === "SKIPPED";
}

export function servedAssetsClean(assets: Array<Pick<ContentAsset, "role" | "scanStatus">>) {
  return assets.every(assetServable);
}

export type ContentViewer = { userId: number | null };

export type OpenDecision = "owner" | "public" | null;

/**
 * How a viewer may open an item: as its owner, as anyone (public), or not at
 * all. The owner check comes first so a creator can always preview their own
 * draft.
 */
export function openDecision(
  item: ItemFields & Pick<ContentItem, "userId">,
  creator: CreatorFields | null,
  viewer: ContentViewer
): OpenDecision {
  if (viewer.userId !== null && viewer.userId === item.userId) {
    return ownerCanOpen(item) ? "owner" : null;
  }
  return isPublicItem(item, creator) ? "public" : null;
}

/** The listed test (LISTED_ITEM_WHERE) for one loaded item and its creator. */
export function isListedItem(
  item: Omit<ItemFields, "accessRuleId">,
  creator: CreatorFields | null
): boolean {
  return (
    item.status === "READY" &&
    item.publishState === "PUBLISHED" &&
    item.moderationState === "CLEAR" &&
    !item.adult &&
    item.deletedAt === null &&
    !item.hiddenAt &&
    creator !== null &&
    creator.page_status === PUBLIC_CREATOR_WHERE.page_status &&
    creator.block === PUBLIC_CREATOR_WHERE.block
  );
}
