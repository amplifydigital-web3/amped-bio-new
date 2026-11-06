# R3: Take It Down, copyright notices and reports

Spec: `docs/features/adult-content-review.md` (revision 6), sections 7.1 to 7.5, 8.3, 13 and 14.
Branch: `feat/takedown`, stacked on R2 (`feat/safety-queue`, #498). No migration: the request table came with R1.

## Reports (7.1)

- `CONTENT_REPORT_REASONS` and `CONTENT_REPORT_LABELS` follow 7.1, in order: `ncii`, `withdraw`, `csam`, `adult`, `copyright`, `harassment`, `scam`, `malware`, `other`. Store pages add `store_policy`.
- `content.report` goes through `services/safety/reports.ts`. Every report joins or opens a case, and `ContentReport.caseId` is set.
  - `csam` hides the item at once (C7a `hideItems`, reason `safety`) and opens a Critical child safety case with the alert.
  - Abuse guard: a reporter account with 3 child reports cleared in 30 days loses the automatic hide; their reports still open Critical cases.
  - Every other reason hides nothing.
- The answer carries `form`. `ncii` and `withdraw` continue on the Take It Down form, and `copyright` on the copyright form, with the item link filled in. The withdraw consent path for people on a release ships with R4.

## Take It Down (7.2, 7.3)

- `takedown.submit` and `takedown.status`: public and rate limited (5 an hour).
- A request valid on its face (all five parts, and every link is an Amped item):
  - The items and their exact sha256 copies across all creators are hidden at once with reason `take_it_down`.
  - A Take It Down case opens with the 48 hour legal clock.
  - Many requests against one creator in 24 hours add an `abuse_flag` event.
- A request missing a part still gets a number. Nothing is hidden, and "We need one more thing" names the missing parts.
- Contact, phone and signature are encrypted at rest. The status page needs the number and a key that only the sender holds (stored as a sha256).
- Desk:
  - **Remove all:** hashes blocked with `ncii`, copies hidden, the item marked blocked. The creator is told it was removed under the Act, never who asked. The requester is emailed.
  - **Not valid:** the items are restored and the requester gets the reason.

## Copyright (7.5)

- `copyright.submit` and `copyright.status`: public. A complete notice opens a Copyright case (`CN-`, 1 business day). Nothing is hidden on receipt.
- **Disable:** hidden with reason `safety`, hash blocked with `copyright` (on by default). The creator gets the claimed work, the sender's name and email (never address or phone), and the counter notice link. **Not valid:** the sender gets the reason.
- `copyright.counter`: private, the item's owner only, with the 512(g)(3) statements. A `CC-` request records the restore window (10 to 14 business days), and the sender gets a copy.
- Desk: Claimant filed suit (court and case number) keeps the item hidden. Restore is safety lead only and only inside the window.

## Pages

- Public site: `/takedown`, `/takedown/{number}?k=`, `/copyright`, `/copyright/{number}?k=`, `/copyright/{number}/counter`.
- The creator page footer links Take It Down and Copyright.
- The Report sheet shows the new reasons, the hidden thanks for a child report, and the follow on form link.
- Admin: Requests tab.
  - Kind filter and the clock per request.
  - Request view with masked contact; Show contact is safety lead only and logged.
  - Items and identical copies with their state.
  - Actions per kind.

## Before this goes live

- Privacy notice (14a): add the Take It Down and copyright contact data, signatures and retention, and bump `CONSENT_POLICY_VERSION`. This is a counsel edit, not in this PR.
- The DMCA designated agent registered and named on the copyright policy page (L1).
- Turnstile on the two public forms: the schema accepts `turnstileToken`, but the server does not check it yet.
- A banner on the admin dashboard for Take It Down clocks past 36 hours. `safety.requests.late` returns the count; the dashboard tile is R5.

## Tests

- `safety-takedown.test.ts` (8): links, valid and incomplete requests, the status key, Remove and Not valid, copyright Disable with the right creator notice, counter notice window, child report hide and the abuse guard.
- `content-public.test.ts`: updated for intake and `form`.
- Landing `NoticeForms.test.tsx` (3). Landing suite 65 pass, `next build` passes.
- Server, admin and landing typecheck clean.
