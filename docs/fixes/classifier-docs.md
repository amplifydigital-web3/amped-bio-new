# R7: classify document pages, review files of 18+ creators (defect F2)

Spec: `docs/features/adult-content-review.md` (revision 6), defect F2 and acceptance 6; decision D10.
Branch: `feat/classifier-docs`, stacked on R5 (`feat/safety-creators-appeals`, #501), because the file review reads `CreatorAdultProfile` and opens an 18+ review case (R1). No migration.

## Change

- `apps/media-processor/src/pipeline.ts`: documents now go through the adult classifier on up to 5 page renders spread over the document, the same way video keyframes do.
  - An explicit document that is not labeled 18+ is held.
  - On staging, the `qa-explicit` title mock covers it (acceptance 6).
- `apps/server/src/services/content/state.ts`: at READY, a `file` item whose creator has 18+ turned on is held with reason `adult_file_review`, and an 18+ review case opens. Nothing reads inside a file, so a reviewer opens it.
  - Files of other creators stay download only and reportable (D10).
- `services/safety/intake.ts`: `adult_file_review` opens an 18+ review case.

## Merge note

F1 (#495) changes `run.classify` to send `explicit` on both outcomes; R7 only changes where `classify` is called. They merge cleanly.

## Tests

- Media processor: the PDF test now expects `classifier:ok`; a new test holds an explicit PDF. 36 pass.
- Server `content-state.test.ts`: a file of an 18+ creator is held for review; another creator's file clears.
