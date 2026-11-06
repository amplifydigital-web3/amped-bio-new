# R2: Safety queue and case view

Spec: `docs/features/adult-content-review.md` (revision 6), sections 8.1, 8.2, 8.5, 8.7 (Blocked files), 8.10 and 13.
Branch: `feat/safety-queue`, stacked on R1 (`feat/safety-foundation`, #497). No migration.

## Server

`services/safety/review.ts` and the `safety` router:

| Procedure | Role | What it does |
| --- | --- | --- |
| `safety.queue.list` | moderator, safety_lead | Open cases by due time; filters type, severity, mine, unassigned, overdue. Moderators never see child safety. Each row carries the blur only, behind a 5 minute Safety token; child safety and Age result rows carry none. |
| `safety.case.get` | same | Item facts, creator facts (strikes in 12 months, open cases, 18+ on since), reports, delivery line (`edgeStatus`), the case log. Child safety: no title, description, assets or report text. |
| `safety.case.claim`, `.release` | same | A claim lapses after Settings `claimIdleMinutes` (30). |
| `safety.case.reveal` | same | One R2 asset, a 60 second gateway token with `a: "safety"`, logged. Refused for child safety and Age result. |
| `safety.case.decide` | same; strike: safety_lead | Clear, Label 18+ and clear (creator must have 18+ on), Ask for a change (waits for the creator, item stays held, email), Remove (hidden at the edge with reason `safety`, moderation BLOCKED, Block this file on by the reason default, optional strike, email). Note of 10 or more characters. Child safety cases never close here. |
| `safety.case.escalate` | same | Child safety: hides with `child_safety` for everyone for good, opens a Critical case, preserves evidence, sends the alert. Trafficking or coercion: a Critical case for the safety lead, no media lock. |
| `safety.case.retryDelivery` | safety_lead | Runs the edge sync for the item (C7a 4.6). |
| `safety.blocklist.list` | moderator, safety_lead | Blocked files: hash (12 characters), reason, case, added by, added on. Search by hash prefix or case number. |
| `safety.blocklist.unblock` | safety_lead | Reason of 10 or more characters; `csam` never. |

Reason codes and the text creators read are `SAFETY_REASON_CODES` in `packages/constants/src/safety.ts`. R5 makes them editable in Settings.

## Admin

Review (`/safety`): queue tiles, then the Queue and Blocked files tabs. A row opens the case view (`?case=`), which claims the case.
- Viewer: blurred by default. Reveal opens one rendition for 60 seconds and is desktop only (8.10).
- Decision panel: the keys C, L, A, R and E pick a decision; J and K move to the next and previous case.
- Delivery line: Retry now, for a safety lead.
- Case log.

## Not in R2

- Requests desk (R3).
- Creator profile, appeals, suspend and editable Settings (R5).
- People in this item (R4).
- Age result cases still live in `identity_review_cases` and alert by email; they move into the queue with R5.
- Video reveal of a hidden item: the Stream origins are closed for BLOCKED items (C7a), so the viewer shows renditions and covers.
- Label 18+ and clear does not set `explicitAt`. F1 (#495) adds the column; once both merge, set it here.

## Tests

`safety-review.test.ts` (11): queue visibility and thumbnails, child safety view and reveal refused, reveal token and log, claim and lapse, note and reason rules, clear, label, remove with block, strike and notice, ask for a change, both escalations. Server and admin typecheck clean.
