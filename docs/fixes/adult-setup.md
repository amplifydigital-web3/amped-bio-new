# R4: Creator 18+ setup, people who appear and releases

Spec: `docs/features/adult-content-review.md` (revision 6), sections 5.1 to 5.3, 6.1 and 7.4; `docs/features/store-policy.md` 4.0 to 4.3.
Branch: `feat/adult-setup`, stacked on R3 (`feat/takedown`, #499). No migration: the tables came with R1.

## Server

`services/safety/adultSetup.ts` and the private `adult` router:

| Procedure | What it does |
| --- | --- |
| `adult.getSetup` | The checklist: Over 18 and seller (`checkIdentity`), the policy version accepted against `ADULT_POLICY_VERSION`, custodian named, enabled, turned off by Amped with reason |
| `adult.acceptPolicy`, `adult.setCustodian` | Custodian name and address encrypted at rest (`safetyBox`) |
| `adult.enable` | Only when every step passes; refused while Amped turned 18+ off |
| `adult.disable` | Every published 18+ item becomes a draft; records stay |
| `adult.people.list`, `.invite`, `.countersign`, `.remove` | Invite link `app.amped.bio/appear/{token}`, single use, 14 days; only the sha256 of the token is stored. Status words Ready, Waiting to sign, Waiting for you, Withdrawn |
| `adult.appear.get`, `.sign` | The invited person (not the creator) passes a fresh Over 18 check, sets the options and signs with a typed legal name (encrypted). Stored: version, options, filled text and its sha256, timestamp, ID given confirmation, the check tier and date. No IP, no ID image |
| `adult.appear.mine`, `.withdraw` | Withdraw ends that release, hides every item it covers (`hideItems`, reason `withdrawn`) and opens a Take It Down case per item (7.4) |
| `adult.setItemPeople` | Who appears (Ready people only) with recording dates (`ContentItemPerson.productionDates`), and `aiLabel` |
| `adult.submitForReview` | Refused with `adult_off`, `policy_outdated`, `not_labeled`, `ai_label_missing`, `confirmation_missing`, `release_missing` or `production_dates_missing`. Otherwise the item is held (`adult_review`) and an 18+ review case opens; a creator's first submission also opens an 18+ setup check |

- `releaseAllowsSurface` (content gating hook) is now real: every tagged release must allow the surface, and a withdrawn release allows none.
- The report reason "I appear in this and withdraw consent" from a person on the creator's list withdraws their release. Anyone else continues on the Take It Down form.

## Client

- Content gains an Adult content tab while the `adultContent` flag is on.
  - The setup checklist (5 rows).
  - Turn on and Turn off.
  - People: Add a person copies the invite link, and Countersign.
- `/appear/:token` (signed in): the release options, the release text (Sign enables after scrolling to the end), the ID and consent boxes, and the typed name.
- Item editor: with the 18+ label on and the flag on, the 18+ section shows:
  - Who appears, with recording dates.
  - The AI label.
  - The confirmation.
  - Submit for review.

The `adultContent` flag definition is copied byte for byte from A1 (#496), so the two branches merge cleanly.

## Follow ups

- **Release text.** The text shown and hashed is a filled summary that names the version and the options. The counsel approved performer release (`docs/legal/performer-release.md`) should move into constants, so the full text is what the person scrolls and what gets hashed.
- **Locked surfaces.** The surfaces row in the item editor is not drawn yet. The server already refuses a surface a release excludes.
- **Notices and appeals (5.4).** The creator item states and the Inbox notices are R5.
- **Privacy notice (14a).** Add the release and custodian data, and bump `CONSENT_POLICY_VERSION` (counsel).

## Tests

- Server: `safety-adult-setup.test.ts` (6), covering:
  - Setup rules and custodian encryption.
  - Turn off makes items drafts.
  - Sign and countersign, including self sign and a missing Over 18 pass.
  - Submit rules and the two cases.
  - The surface rule.
  - Withdraw.
- Content, safety and access suites: 330 pass.
- Client: `AdultSetup.test.tsx` (1). The content panel suite has 99 passing tests. `tsc -b` is clean.
