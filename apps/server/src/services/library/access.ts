/**
 * Who may see an item in the Fan Library (Build Board #26, FL-2, spec 3.4).
 *
 * The Library lists only what the fan can open now, and names how. Until the
 * gating engine opens content items (content gating C8, then FL-6), the only
 * way a fan can open someone else's item is that it is public, so every
 * listed item reads `public`. Listing and opening agree: getReadUrl uses the
 * same rule (services/content/access.ts), so nothing listed refuses to play.
 *
 * FL-6 replaces `libraryAccess` with a call to the engine's checkBatch and
 * fills `member`, `pool`, `follower` and `purchased`. The callers, and the
 * response shape, stay as they are.
 */
import type { ContentItem } from "@repo/database";
import { pickAccessSource, type LibraryAccessSource } from "@repo/constants";
import { PUBLIC_CREATOR_WHERE, PUBLIC_ITEM_WHERE, isPublicItem } from "../content/access";

export interface LibraryAccess {
  source: LibraryAccessSource;
  planName: string | null;
}

type AccessItem = Pick<
  ContentItem,
  "userId" | "status" | "publishState" | "moderationState" | "accessRuleId" | "adult" | "deletedAt"
>;
type AccessCreator = { page_status: string; block: string } | null;

/**
 * How the viewer has this item in their Library, or null when it is not theirs
 * to list. A creator's own items are not in their fan Library: they manage them
 * in Content.
 */
export function libraryAccess(
  item: AccessItem,
  creator: AccessCreator,
  viewerId: number
): LibraryAccess | null {
  if (item.userId === viewerId) return null;
  const sources: LibraryAccessSource[] = [];
  if (isPublicItem(item, creator)) sources.push("public");
  const source = pickAccessSource(sources);
  return source ? { source, planName: null } : null;
}

/** The database side of the same rule, so lists page over openable items only. */
export const LIBRARY_ITEM_WHERE = PUBLIC_ITEM_WHERE;
export const LIBRARY_CREATOR_WHERE = PUBLIC_CREATOR_WHERE;
