# R1: Safety foundation

Spec: `docs/features/adult-content-review.md` (revision 6), sections 8, 8.5, 8.7, 8.8, 10 and 16 (R1).
Branch: `feat/safety-foundation`, stacked on C7a (`feat/content-takedown`, #473). Merge C7a first.

## Data (migration `20261105140000_safety_foundation`, additive)

- New tables from section 10: `creator_adult_profiles`, `appearing_people`, `content_item_people`, `safety_cases` (enums `SafetyCaseType` with `COPYRIGHT`, `SafetyCaseState`), `safety_events`, `takedown_requests` (with the revision 6 copyright and counter fields), `strikes`.
- `blocked_content_hashes` gains `phash` (indexed), `case_id`, `added_by_id`, `removed_at`.
- `content_items.ai_label`, `content_reports.case_id`.
- `ContentItem.explicitAt` ships with F1 (#495), not here.

## Constants (`packages/constants/src/safety.ts`)

`ADULT_POLICY_VERSION = "1.1"`, `RELEASE_VERSION = "1"`, Safety roles, case types and labels, severity and due times per type (8.1), number format, hash reasons, Settings defaults.

## Services (`apps/server/src/services/safety/`)

- `events.ts`: `logSafetyEvent`, append only. Nothing updates or deletes a SafetyEvent.
- `cases.ts`: `openCase` numbers cases `SC-YYYY-NNNNNN` (`CN-` for copyright), sets severity and due time, joins an open case for the same item and type, retries a number clash. `caseOverview` gives the queue tiles.
- `time.ts`: business days skip weekends (holidays not counted yet).
- `settings.ts`: Settings as one JSON row (`safety.settings`) over the defaults; changes log the keys only.
- `blocklist.ts`: `blockHash`, `unblockHash` (sets `removedAt`, logged; `csam` can never be unblocked), `findBlockedHash` (active rows only), `findByPhash` within the threshold.
- `evidence.ts`: `preserveEvidence(caseId, publicId)` copies every object under the item's content prefixes to the evidence bucket under `cases/{number}/`, writes a manifest (sha256, size, upload time, uploader, the account's IPs, report text) and logs `evidence_preserved` with keys and `preservedUntil` (1 year). Never a URL. A video's Stream copy is recorded by uid with `streamPending: true`; C7a must not delete the Stream video while pending (R2 retries it).
- `alert.ts`: `sendChildSafetyAlert` emails safety leads, on call and `SAFETY_ALERT_EMAIL`, and texts on call through Twilio, 3 tries each, then `[safety] ALERT sms failed`. The text names only the case number and link. The log records counts only.
- `intake.ts`: a CSAM match opens a Critical child safety case, preserves evidence and alerts; a classifier hold opens a Classifier hold case; `adult_label_removed` opens an 18+ review case (F1 calls it once both merge).
- `crypto.ts`: `safetyBox` for fields encrypted at rest.

## Wiring

- `services/content/state.ts`: the hash step reads `findBlockedHash` (an unblocked file uploads again); a malware positive goes through `blockHash`; a CSAM match blocks the hash with reason `csam` and runs the child safety intake; a classifier hold opens a case. Intake never fails the callback.
- `trpc/safety.ts`: top level `safety` router. `safety.me`, `safety.overview` (moderator or safety_lead), `safety.settings.get` and `.update` (safety_lead). `admin` alone does not open Safety.

## Admin app

- Roles: `moderator` and `safety_lead` enter the admin app; a non admin sees only the destinations their roles open and is sent to the first of them.
- Rail: new Safety group between Content and Money with Review (`/safety`, ShieldCheck, Cmd or Ctrl Alt R, in the phone dock). Pools leaves the phone dock.
- Review page (R1): queue tiles (open, overdue, due today, Take It Down clock) and open cases by type. The queue and case view arrive with R2.

## Environment

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `ADMIN_URL`, `EVIDENCE_R2_ACCESS_KEY_ID`, `EVIDENCE_R2_SECRET_ACCESS_KEY`, `EVIDENCE_R2_BUCKET` (default `amped-evidence`), `SAFETY_DATA_SECRET`. All optional: without them the alert logs and the email still goes, and the evidence copy refuses with `[safety] ALERT evidence bucket not configured`.

Before 18+ opens: create the evidence bucket with a 1 year bucket lock and its own token, set up the Twilio Messaging Service, set the on call list in Settings, and give the safety lead role (Q6).

## Tests

- `safety-foundation.test.ts` (12): due times, numbering and joins, number clash retry, settings, blocklist, perceptual hash match, child safety alert (email and SMS retries, nothing personal in text or log), evidence copy and manifest.
- `content-state.test.ts`: CSAM match blocks the hash and runs intake; classifier hold opens a case.
- Server content, safety, identity and edge suites: 265 pass. Server and admin typecheck clean.
