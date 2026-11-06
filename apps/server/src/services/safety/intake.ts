/**
 * Where the content pipeline opens Safety cases (adult content review 6.2, 8.1 and
 * 8.5, PR R1). Best effort: a failure here is logged with `[safety] ALERT` and never
 * fails the processor callback, so the item state the pipeline set always stands.
 *
 * - A CSAM match: a Critical child safety case, the evidence copy, the alert.
 *   The item is already BLOCKED with a `csam` reason, so the edge marks it
 *   `blocked:` with reason child_safety (C7a).
 * - A classifier hold: a Classifier hold case for the item.
 * - Any other hold for review (an 18+ label taken off a READY item, F1): an 18+
 *   review case.
 */
import type { ContentItem } from "@repo/database";
import { openCase } from "./cases";
import { preserveEvidence } from "./evidence";
import { sendChildSafetyAlert } from "./alert";

type ItemRef = Pick<ContentItem, "id" | "publicId" | "userId">;

export async function onCsamMatch(item: ItemRef, matcher: string | null): Promise<void> {
  try {
    const { case: opened, joined } = await openCase({
      type: "CHILD_SAFETY",
      contentItemId: item.id,
      creatorUserId: item.userId,
      source: "csam_match",
      note: matcher ? `Matcher: ${matcher}` : null,
    });
    if (joined) return;
    // The alert does not wait for the copy: it must go within a minute
    const [evidence] = await Promise.all([
      preserveEvidence(opened.id, item.publicId),
      sendChildSafetyAlert(opened.id),
    ]);
    if (!evidence.ok) {
      console.error("[safety] ALERT child safety evidence not preserved", {
        case: opened.number,
        reason: evidence.reason,
      });
    }
  } catch (error) {
    console.error("[safety] ALERT child safety intake failed", {
      publicId: item.publicId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function onReviewHold(item: ItemRef, source: string): Promise<void> {
  try {
    await openCase({
      type: source === "adult_label_removed" ? "ADULT_REVIEW" : "CLASSIFIER_HOLD",
      contentItemId: item.id,
      creatorUserId: item.userId,
      source,
    });
  } catch (error) {
    console.error("[safety] ALERT review case not opened", {
      publicId: item.publicId,
      source,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
