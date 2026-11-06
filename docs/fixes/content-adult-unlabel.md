# F1: the 18+ label can not come off an explicit item

Spec: `docs/features/adult-content-review.md` (revision 6), defect F1, acceptance 5.
Branch: `fix/content-adult-unlabel`. Must merge before A1.

## The defect

`content.update` let the owner set `adult` from true to false at any time. The classifier runs once, during processing. An item labeled 18+ passed the classifier as explicit, became CLEAR, and could then be unlabeled and published as a public item with no review. The only guard was the blanket refusal in `content.publish`, which A1 lifts.

## The fix

1. `ContentItem.explicitAt DateTime?` (migration `20261105130000_content_explicit_at`, one nullable column, no backfill).
2. The processor callback gains `explicit?: boolean` (`packages/constants/src/content.ts`). The media processor sends it on the classifier step with `held` (explicit, not labeled) and with `ok` (explicit, labeled). Before this change a labeled explicit item sent a plain `ok`, so the API never knew.
3. `applyProcessorCallback` stores `explicitAt` the first time the classifier reports explicit.
4. `content.update`:
   - `adult: false` on an item with `explicitAt` is refused with FORBIDDEN, "A reviewer marked this 18+. Ask for a review if this is wrong."
   - `adult: false` on a READY item with no `explicitAt` (processed before the column, or the classifier missed it) sets `moderationState = HELD`, `moderationReason = adult_label_removed` and `publishState = DRAFT`. `content.publish` then refuses it until a reviewer clears it. When R1 ships, this hold opens a SafetyCase (re-review trigger in spec 5.4).
   - An item still processing is left to the classifier, which now runs with `adult = false`. The queued job keeps the label it was enqueued with, so a label taken off mid-processing still reports explicit: the classifier step then holds the item with `adult_label_removed` instead of clearing it. `content.publish` also refuses any item with `explicitAt` set, so no ordering of the writes can put an unlabeled explicit item on the public pages.
   - Turning the label on never holds.
5. `ownerView` returns `adultLocked`. The item editor shows the 18+ switch on and disabled, with the locked line as its helper text.
6. F3 copy: the switch helper reads "Label this item for adults. Only fans who passed the Over 18 check can open it."

A reviewer setting `explicitAt` (labeling 18+ from the Safety queue) arrives with R2.

## Tests

- `apps/server/src/__tests__/content-state.test.ts`: explicitAt on held explicit, on labeled explicit, not on a clean pass.
- `apps/server/src/__tests__/content-router.test.ts`: locked refusal; label, process, unlabel, publish refused (held with `adult_label_removed`); processing items and labeling on are untouched.
- `apps/media-processor/test/pipeline.test.ts`: both classifier reports carry `explicit: true`.

## Deploy

Apply the migration, then deploy the server, then the media processor. A processor deployed first sends `explicit`, which an older API ignores (zod strips unknown keys), so the order is safe either way.
