/**
 * 18+ items before the gating engine owns them (identity checks 4.4, PR A1; adult
 * content review 9 and R6). One place for who may see and publish 18+.
 *
 * - Nothing here runs while the adultContent flag is off: 18+ stays closed to
 *   everyone but the owner, as PR #348 left it.
 * - Public reads never change. PUBLIC_ITEM_WHERE and LISTED_ITEM_WHERE keep
 *   `adult: false`, so server HTML, sitemaps, llms.txt, share tags, email, push
 *   and Telegram stay 18+ free. 18+ cards and items leave the API only through
 *   the signed in shelf calls, after canViewAdult.
 * - A viewer opens 18+ with an `age_over_18` pass from checkIdentity. A creator
 *   labels or publishes 18+ with their own `age_over_18` and `seller` passes
 *   (decision A2).
 *
 * When the gating engine takes over, its age precondition already calls
 * checkIdentity(userId, "age_over_18"), so these paths move under it unchanged.
 */
import { prisma } from "@repo/database";
import type { ContentAdultRefusal, IdentityCheckResult } from "@repo/constants";
import { isFeatureOn } from "../featureFlags";
import { checkIdentity } from "../identity/checks";
import { listedItemWhere } from "./gate";

/** True while 18+ may open to anyone but the owner. */
export function adultOpen(): boolean {
  return isFeatureOn("adultContent");
}

/** The refusal for a viewer, or null on a pass. */
export function adultRefusal(
  result: IdentityCheckResult | "signed_out"
): Exclude<ContentAdultRefusal, "closed"> | null {
  if (result === "signed_out") return "signed_out";
  if (result.pass) return null;
  switch (result.reason) {
    case "no_wallet":
    case "not_linked":
    case "not_verified":
    case "not_shared":
    case "under_18":
      return result.reason;
    default:
      return "unavailable";
  }
}

/** Why this viewer may not see 18+ right now, or null when they may. */
export async function viewerAdultRefusal(
  userId: number | null
): Promise<ContentAdultRefusal | null> {
  if (!adultOpen()) return "closed";
  if (userId === null) return "signed_out";
  return adultRefusal(await checkIdentity(userId, "age_over_18"));
}

/** canViewAdult(viewer) from identity checks 4.4. */
export async function canViewAdult(userId: number | null): Promise<boolean> {
  return (await viewerAdultRefusal(userId)) === null;
}

/**
 * True when the creator has a listed 18+ item, so the page shows the one
 * "Adult items" card. No title, cover or count leaves with it. False while the
 * flag is off.
 */
export async function hasAdultItems(userId: number): Promise<boolean> {
  if (!adultOpen()) return false;
  const item = await prisma.contentItem.findFirst({
    where: { userId, ...listedItemWhere(), adult: true },
    select: { id: true },
  });
  return item !== null;
}

/** Decision A2: labeling or publishing 18+ needs the creator's Over 18 and seller passes. */
export async function creatorAdultBlocker(
  userId: number
): Promise<"age" | "seller" | "unavailable" | null> {
  const [age, seller] = await Promise.all([
    checkIdentity(userId, "age_over_18"),
    checkIdentity(userId, "seller"),
  ]);
  if (!age.pass) return age.reason === "unavailable" ? "unavailable" : "age";
  if (!seller.pass) return seller.reason === "unavailable" ? "unavailable" : "seller";
  return null;
}
