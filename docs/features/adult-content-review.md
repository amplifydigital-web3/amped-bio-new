# Adult content review and the Safety admin

Status: revision 6, 3 Nov 2026 (content PR 7 split into C7a and R1 to R3, section 16a). Revision 5: Rob's decisions AD-D1 and AD-D2. Revision 4: Full QA AD-Q1 to AD-Q53. Revision 2, 3 Nov 2026. Build Board #28 (Adult content compliance, 18+). Revision 1 was approved by Rob on the Build Board card (24 to 26 Oct); outside counsel approved the policy, the 2257 position and the release on 3 Nov 2026.
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at 0500800 (2 Nov), with I1 (#397), G1 (#398) and content PR 6 (#348) merged. `docs/features/identity-checks.md`, `docs/features/content-system.md` sections 3.5, 3.11 and PR 7.
Texts: `docs/legal/adult-content-policy.md` (COUNSEL-ADULT v1.1, `ADULT_POLICY_VERSION` 1.1), `docs/legal/performer-release.md` (`RELEASE_VERSION` 1). Store policy and release options: `docs/features/store-policy.md`.
Designs: "Adult content review" design page, https://claude.ai/artifact/LHQbtepDpgxEmLqoZzVVc7 (boards ar1 to ar7, ad1 to ad8), and the release options board sp8 on https://claude.ai/artifact/TErq8QL9fn31ENpgo6nD1r. Screen Review rows 190 to 203, 314 and 329. Revision 6 boards ad2b, ad3b, ad6b, ar8, ar9, tk1 and tk2 on "Takedown and Safety additions", https://claude.ai/artifact/41WUvZcFU7KLVm1KBb86ta (Screen Review rows 372 to 378).

Counsel note: this spec states product rules and the controls that support them. Counsel approved the positions in COUNSEL-ADULT v1.1 section 10.2 on 3 Nov 2026. 18+ go live still waits on the operational items in its section 10.3.

## 1. What this covers

Rob decided on 8 Oct that Amped.Bio allows adult content behind age checks, and on 23 Oct that the Over 18 check is the Authbase attribute RNS already reads. The identity checks spec owns the check itself. This spec owns everything around it:

1. How a creator turns on 18+ and who may appear in 18+ items.
2. How every 18+ item is reviewed before a fan can open it.
3. How fans report items, and how anyone (with or without an account) asks for an intimate image to be taken down.
4. The Safety admin: the queue, the case view, the Take It Down desk, creator safety profiles, appeals, the audit log, roles and reviewer wellbeing.
5. Two defects in the current code that must be fixed before any 18+ item can open (section 11).

It replaces the trust and safety part of content system PR 7 for 18+ and widens it: PR 7 keeps DMCA, malware and the CSAM evidence path; this spec adds the shared queue and case model those tools sit in.

## 2. Rules already decided

| Rule | Source |
| --- | --- |
| Adult content is allowed for verified adult creators, behind an age check | Rob, 8 Oct (#20 decision 3) |
| Amped is a platform and storefront. The creator is the seller of record and the producer | Rob, 3 Nov; COUNSEL-ADULT v1.1 sections 1 to 3, counsel approved |
| Fan payments are USDC wallet to creator wallet. The on-ramp only loads the wallet and never sees what is bought | Rob, 8 Oct (onramp-adult, moot) |
| Over 18 is the Authbase `age_over_18` attribute, through `checkIdentity` | Rob, 23 Oct; identity checks spec |
| One age gate for every viewer of 18+ content in every state and country | COUNSEL-ADULT v1.1 section 5.1 |
| Creators who collect USDC are Authbase verified sellers | Rob, 23 Oct |
| 18+ never appears on the public bio HTML, Explore, search, SEO, `llms.txt`, share previews, email, push, Amped Messages notifications and Broadcast previews, or the brand portal (Telegram was removed on 2 Nov; QA AD-X1) | #28 decision surfaces |
| No adult live streams in v1 | #28 decision live-adult |
| Amped stores the check outcome only, never documents or attribute values | #28 decision store-outcome-only |
| Over 18 everywhere (authbase-everywhere), creators pass both checks (creator-18-checks) | #28 |

## 3. Research summary

**Laws that bite on a creator platform with adult content.** The full analysis and the state table are in `docs/legal/adult-content-policy.md` sections 5 to 7.

- **Age verification.** 27 US states had adult content age verification laws by September 2026, most with a one third threshold and "reasonable" or "commercially reasonable" methods; several reach hosts or portions of sites, and Ohio and Tennessee require periodic re-verification. Missouri, Kentucky and West Virginia restrict retention of identifying data. The Supreme Court upheld Texas's law in Free Speech Coalition v. Paxton (27 Jun 2025). Consequence: one rule everywhere and outcome only storage.
- **UK.** Ofcom requires user to user services that allow pornography to use highly effective age assurance, in force since 25 July 2025. Self declaration does not qualify. Consequence: Authbase must meet Ofcom's highly effective standard before UK viewers open 18+ (Q1).
- **Take It Down Act.** Covered platforms had to comply by 19 May 2026: a clear and conspicuous notice, a request process usable by people without an account, removal within 48 hours of a valid request, reasonable efforts to remove identical copies, and a good faith safe harbor for removals. The FTC enforces it as a rule violation, up to 53,088 dollars per violation. Consequence: section 7.
- **18 U.S.C. 2257 and 28 CFR 75.** Hosting, storing and transmitting another person's content without selecting or altering it is excluded from producer status, and removal consistent with Section 230(c) is not selection or alteration. Counsel approved the position on 3 Nov: creators are the producers and keep their own records; Amped does not select, feature, rank or edit 18+ items (D3, D4).
- **CSAM.** 18 U.S.C. 2258A reporting to NCMEC, evidence kept 1 year (REPORT Act). Already specified in content system 3.11. This spec routes escalations into it and never displays a suspected file again.

**What comparable platforms do.** OnlyFans, Fanvue and Fansly run three controls together: verified identity for every creator and every person who appears, a signed release per co-performer held by the creator, and review of adult uploads before they are visible, backed by automated scanning. Amped matches these with Authbase for identity, the creator's in app release, the processor's classifier and CSAM steps, and a human review queue.

## 4. Product shape

```
Creator                         Amped                                Fan
-------                         -----                                ---
Set up 18+  ---- checks ---->   Authbase Over 18 + seller
  accept Adult Content Policy
Invite people who appear ---->  each person: Authbase Over 18,
                                 sets release options, signs;
                                 creator countersigns
Upload, label 18+, tag people
                                Processor: hash, malware, CSAM,
                                classifier
                                Safety queue: a reviewer opens
                                the case, checks people and
                                releases, decides
Publish (only when CLEAR) ----> 18+ shelf on the creator's page  --> Over 18 check sheet
                                (signed in, passed only)             then the item
Reports, Take It Down ------->  Safety queue, 48 hour clock      <-- Report, This is me
Appeal ---------------------->  second reviewer
```

## 5. Creator side

### 5.1 Turn on 18+ (Adult setup)

Content, Store, Settings gains "Adult content". Off by default. Turning it on opens a checklist (board ar3):

| Step | Pass rule | Fail |
| --- | --- | --- |
| Over 18 | `checkIdentity(user, "age_over_18")` passes | Verify with Authbase, or Share in Authbase |
| Seller verified | `checkIdentity(user, "seller")` passes: Authbase verified **and** an active RNS name bound both ways to the receiving wallet (identity checks 5.1, Rob 3 Nov). The row shows both parts: "Authbase verified. Valid until {date}" and "{name} points to this wallet" | The Get paid card (identity checks 5.2) |
| Adult Content Policy | Accepts the current `ADULT_POLICY_VERSION` (1.1) | Read and accept |
| Custodian of records | Names the custodian of records for 2257 (name and address, kept private, encrypted at rest). The board row reads "Custodian of records. Who keeps the records for everyone in your 18+ items. Private: Amped gives it only on a lawful request." (COUNSEL-ADULT 4.2, QA AD-Q8) | Add custodian |
| People who appear | Read only explainer: everyone in an 18+ item must be on your list | None |

Board ar3 draws all five rows in this order, with the policy row reading "Adult Content Policy. Version 1.1, 3 Nov 2026" from `ADULT_POLICY_VERSION` (QA AD-Q9). The checklist is a phone screen and the Settings tab of Content, Store at 1440 in the Prism editor shell.

All required steps pass: `CreatorAdultProfile.enabledAt` is set and the 18+ label appears in the item editor. A new policy version asks the creator to accept again before the next 18+ upload; published items stay up.

Turning 18+ off later unpublishes every 18+ item (they return as drafts) and keeps the records.

Admin can turn it off (section 8.4). The creator then sees "18+ turned off by Amped.Bio" with the reason and an Appeal button.

### 5.2 People who appear (co-performers)

Every person who appears in an 18+ item, other than the creator, must be on the creator's People list with a release signed by both parties before the item can be submitted. The release is the creator's document (`docs/legal/performer-release.md`). Amped is neither party nor beneficiary.

Flow (boards ar5 and sp8):

Scope (SP-Q36, Rob 3 Nov): one release per performer per creator relationship, signed at this invite, covering all content that creator produces with that performer (store policy spec 4.0).

1. Creator taps Add a person, types a display name, and shares the invite link (`app.amped.bio/appear/{token}`, single use, 14 days).
2. The person opens the link, signs in or creates an account (no page, Fan Graph page_status rules), and passes `checkIdentity(person, "age_over_18")` with Authbase. Their wallet is made on sign up, so Authbase links to it.
3. The person sets the release options (store policy spec 4.1) with the release's labels: where the creator may sell (Store (one time purchase), Memberships, Paid messages, Broadcast, Live stream), other platforms (Nowhere else, or Also on with a text field), face shown or not, tag or not, payment (No payment, a fixed fee with an amount field, or a revenue share as a percent of the creator's share, stored as bps of the creator share).
4. The person reads the full release (`RELEASE_VERSION`) with every field and option filled, scrolled to the end before Sign enables, then confirms they gave the creator a copy of their ID and every name they have used, ticks consent and types their full legal name. Amped stores the typed name, the options, the filled text and its hash, the timestamp, the version, the check outcome and the check date and reference (snapshot at signing). It does not store the IP until counsel adds it to release section 10 (store policy spec 4.3). It never stores an ID image. Both parties get a copy (release section 12).
5. The creator countersigns in People. Only then does the person show Ready, and only Ready people can be tagged on an item.
6. The person can withdraw consent at any time from Account, Appearing in, or with the report reason "I appear in this and withdraw consent". Withdrawal ends that one release: it hides every item that release covers on receipt and opens a case per item (section 7.4). Releases with other creators are not affected.

A person may appear for several creators. Each creator relationship has its own release. Each 18+ item records which release covers each tagged person (`ContentItemPerson.releaseId`). Submit and publish are refused with `release_missing` while any tagged person has no valid release with that creator (both signatures, not withdrawn, version not marked for re signing).

### 5.3 Item editor 18+ section

The 18+ switch in the item editor (row 153, board cs3) becomes a section (board ar4):

- **18+ label.** Shown only with 18+ turned on. Off: the classifier holds explicit items (content system 3.5 step 6).
- **Who appears.** Only me, or Me and people from my list (multi select of Ready people). Required when 18+ is on.
- **Surfaces.** A surface the release of any listed person excludes is greyed out with "Not allowed by {person}'s release". Rule writing refuses it on the server (content gating hook `releaseAllowsSurface`).
- **Release status per person.** Each person on the list shows their release status with this creator, in the store policy spec words: Ready, Waiting to sign, Waiting for you, Withdrawn. Only Ready people can be ticked. A ticked person shows which release covers them ("Release signed 20 Oct, countersigned 20 Oct"); saving writes `ContentItemPerson.releaseId` (QA AD-Q14, AD-Q16).
- **Recording dates.** Required when anyone other than the creator is ticked: every date the item was recorded (release section 2, "on every date the Content was recorded"). Stored on `ContentItemPerson.productionDates` and listed in the app as the release's covered content (store policy spec 4.1 step 7). Submit is refused with `production_dates_missing` without them (QA AD-Q14).
- **AI label.** "Made or changed with AI". Yes or No, required on every 18+ item (COUNSEL-ADULT 4.4 and 9.2: AI generated or AI altered content carries an AI label). Yes shows an AI chip beside 18+ on the shelf, the item page and the case view. Stored as `ContentItem.aiLabel Boolean?`; null blocks submit (QA AD-Q13). Reviewers check it (6.3 check 4).
- **Confirmation.** "Everyone in this item is 18 or older, agreed to be filmed and agreed to it being shared here." Required checkbox, stored with the submission.
- **Locked label.** When the classifier or a reviewer marked the item explicit, the switch is locked on and reads "A reviewer marked this 18+. Ask for a review if this is wrong." (Fixes defect F1.)

Saving with 18+ on puts the item in review (section 6). The status chip reads In review.

Boards: ar4 at 390 and at 1440 in the Prism editor shell (Content, Library, item editor). The surfaces row is drawn with a greyed surface and its reason (QA AD-Q15).

### 5.4 Notices and appeals

Creators see one of four states on the item and in Inbox (board ar6):

| State | Copy | Action |
| --- | --- | --- |
| In review | A reviewer checks 18+ items before fans can open them. Usually within 1 business day. | None |
| Needs a change | Reason text from the reviewer (for example, a person who appears is not on your list) | Fix and resubmit |
| Removed | Reason, policy link, and the strike count | Appeal |
| Cleared | Ready to publish | Publish |

Appeal: one per decision, within 30 days, with up to 1,000 characters. A different reviewer decides within 5 business days. The answer is final inside Amped.

Exceptions and extra notices (QA AD-Q24, AD-Q25):

- **Child safety removals are final** (COUNSEL-ADULT 4.7). The item shows "Removed. This decision is final." with the policy link and no Appeal button. `content.appeal` refuses a case of type Child safety with `appeal_not_allowed`.
- **Removed under the Take It Down Act.** "This item was removed after a request under the Take It Down Act." No requester detail. Decision AD-D2 (Rob, 3 Nov): one appeal, within 30 days, decided by a safety lead (not the first reviewer). The item stays hidden during the appeal. On Reverse, the requester is emailed with the reason before anything is restored; the restore runs 2 business days after that notice unless the requester replies, and a reply returns the case to the safety lead. Copy under Appeal: "A safety lead decides. The item stays hidden until then. The person who asked is told before anything is restored." Board ar6e; admin board ad5d.
- **18+ turned off by Amped.Bio** (5.1): reason, the strike count or the admin reason, and Appeal.
- **Restored after review** (7.3 abuse guard): "Restored after review. No strike." No action.
- Inbox and email carry the reason and the action only. For 18+ items they name no title and show no media ("An item needs a change"), per section 14.

Boards: ar6 at 390 and at 1440 (Content, Library, item outcome panel).

## 6. Review before publish

### 6.1 What is reviewed

Every 18+ item is reviewed by a person before it can be published (decision D1). Every unlabeled item the classifier holds is reviewed too. Store products inherit: a product with any 18+ item publishes only when every item in it is CLEAR.

Re-review triggers: a new file version, a change to Who appears, the 18+ label turned off (F1), a report, an appeal.

### 6.2 States

`ContentItem.moderationState` keeps PENDING, CLEAR, HELD, BLOCKED. A case carries the detail:

```
PENDING (processing) --> HELD (in queue) --> CLEAR       --> publish allowed
                                         --> NEEDS_CHANGE (case outcome; item stays HELD, creator edits, resubmits)
                                         --> BLOCKED     (removed; appeal possible)
```

`ContentItem` gains `explicitAt DateTime?` (set when the classifier returns explicit or a reviewer labels 18+). While `explicitAt` is set, `adult` cannot be set false by the owner.

### 6.3 What the reviewer checks

The case view (board ad2) shows the checks in order. A case can be cleared only when every required check is ticked:

1. No sign of a minor. Any doubt escalates (section 8.5). Never Clear on doubt.
2. Every person visible matches Who appears. Each listed person has a Ready release for this creator, with both signature dates and the recording dates for this item. A person whose release says Must not be shown is not identifiable by face; a person whose release says No tag is not tagged.
3. Nothing in the prohibited list of the Adult Content Policy section 4.6.
4. The 18+ label and the AI label are right (labeled when explicit, not labeled when not; AI labeled when made or changed with AI).
5. Title, description and cover are fine for the 18+ shelf (no prohibited terms; cover is only shown after the Over 18 check anyway).

Approve or remove are the only outcomes on content. Reviewers never edit, crop, caption, retitle, reorder or feature an item (COUNSEL-ADULT 6.5).

## 7. Reports and Take It Down

### 7.1 Report

The existing Report content (PR #348) offers these reasons, in this order (labels in R3 replace `CONTENT_REPORT_LABELS` in `packages/constants/src/contentPublic.ts:53`; stored values in brackets map to `CONTENT_REPORT_REASONS` at `contentPublic.ts:42`, QA AD-Q29): "This is me and I did not agree" (`ncii`), "I appear in this and withdraw consent" (`withdraw`), "This shows a child" (`csam`, the existing value; no new `child` value), "Adult item not labeled" (`adult`), "It copies my work" (`copyright`), "Harassment" (`harassment`), "Scam or fraud" (`scam`), "The file is harmful" (`malware`, kept from the code), "Something else" (`other`). Store pages add "Store policy breaks the rules" (`store_policy`). Board ar7 draws every reason. The first three route as follows:

- **This shows a child.** Code change in R3: `content.report` (`apps/server/src/trpc/content.ts:943-974`) today records the report and hides nothing ("nothing is taken down by a report alone"). R3 replaces that comment and behavior for `csam` only, behind the abuse guard below; every other reason still hides nothing (QA AD-Q30). The item is hidden at once (KV takedown, no reviewer needed), a case opens at Critical, and the reporter is told "Thank you. We hid it while we check." Staff follow the CSAM path in content system 3.11. Abuse guard: a reporter account or IP whose child reports are found unfounded 3 times in 30 days loses the automatic hide; their reports still open Critical cases. A wrongly hidden item is restored by the reviewer within the 1 hour due time and the creator gets no strike.
- **This is me and I did not agree.** Opens the Take It Down form with the item prefilled.
- **I appear in this and withdraw consent.** For a signed in person on the creator's People list, withdraws their release (5.2 step 6). For anyone else, opens the Take It Down form.

### 7.2 Take It Down form

Public at `amped.bio/takedown` and linked from every page footer and every 18+ page. No account needed (board ar7).

Fields, matching the Act's valid request:

1. Where it is: one or more Amped.Bio links (prefilled from Report), or a creator handle plus a description.
2. Statement: "I believe in good faith that this was shared without my consent." Required checkbox, plus optional detail.
3. Who you are: "I am the person shown" or "I act for them" (with the relationship).
4. Contact: email (required) and phone (optional).
5. Signature: full name typed.

On submit: a request number (TD-2026-000123), an email with that number, and a status page `amped.bio/takedown/{number}?k={key}`.

States on board ar7 (QA AD-Q31): the form with phone (optional), detail (optional) and the relationship field when "I act for them" is picked; a request that is not valid on its face (a link that is not an Amped item, or a missing field): "We need one more thing" naming the field, nothing hidden yet, the number still issued; the status page with Received, Hidden, Decided and the outcome.

### 7.3 What happens in Safety

- Valid on its face (all five fields present and the link points to an Amped item): the items are hidden at once (decision D5) and the request enters the Requests tab with a 48 hour clock from receipt.
- A reviewer confirms within the clock: Remove (hash blocked, identical copies searched and removed, requester told), or Not valid (reason sent to the requester; the item is restored and the creator is not told who asked).
- Identical copies: exact `sha256` matches across all creators are hidden automatically with the reported item. Perceptual hash matches above the threshold set in Settings are listed for the reviewer, who can hide them at once and remove them with the decision.
- On Remove, the image hash is offered to StopNCII.org with the requester's agreement (decision D9).
- The creator is told the item was removed under the Take It Down Act. The requester's identity is never shown to the creator.
- Abuse guard: many requests from the same email or IP against one creator in a short window are flagged for the reviewer. Items are still hidden, but a Not valid outcome restores them with no strike, and the creator sees "Restored after review".
- A clock past 36 hours pages the safety lead. A clock past 48 hours is an incident and appears on the dashboard.

### 7.4 Consent withdrawn

When a person who appears withdraws consent (5.2 step 6), Safety hides each published item they appear in, opens one case per item, and follows 7.3. The creator takes the item off sale everywhere they control it within 48 hours (release section 7). The item comes back only if the reviewer finds the person does not appear.

### 7.5 Copyright notices (DMCA), from content PR 7

Content PR 7 is split (`docs/features/content-takedown.md`, C7a). Its DMCA tools land here, in R3, beside Take It Down, because both are notice and action desks with a clock.

**Notice form.** Public at `amped.bio/copyright`, linked from every page footer, the Report reason "It copies my work" and the copyright policy page (L1). No account needed. Fields follow 17 U.S.C. 512(c)(3):

1. The work: what was copied (text) and an optional link to the original.
2. Where it is: one or more Amped.Bio links.
3. Contact: name, postal address, email (required), phone (optional).
4. Statement: "I believe in good faith that this use is not authorized by the copyright owner, its agent or the law." Required checkbox.
5. Statement: "The information in this notice is accurate, and under penalty of perjury, I am the owner or authorized to act for the owner." Required checkbox.
6. Signature: full name typed.

On submit: a number (CN-2026-000123), an email with it, and a status page `amped.bio/copyright/{number}?k={key}`. A notice missing a field gets "We need one more thing" naming the field; nothing is disabled yet (512(c)(3)(B) lets a service treat a deficient notice as not received, but the reviewer sees it so the sender can fix it).

**What happens.** A complete notice opens a Copyright case (due 1 business day). Unlike Take It Down, the item is not hidden on receipt: the reviewer decides. Disable (the item is hidden with reason `copyright` through `hideItems`, products paused, the hash offered to the blocklist with reason `copyright`) or Not valid (reason sent to the sender). The creator gets a notice with the claimed work, the sender's name and email (512(g)(2)(A) and (3) need them for a counter notice; never the postal address or phone), and a Counter notice button.

**Counter notice.** From the creator's notice (board ar9). Fields follow 512(g)(3): the item (prefilled), a statement under penalty of perjury that the item was removed by mistake or misidentification, name, address and phone, consent to the jurisdiction of the federal court for their address (or any judicial district where Amped may be found, outside the US), and that they accept service from the sender, plus a typed signature. On submit the case moves to Counter notice, Safety forwards a copy to the sender, and the item is restored no sooner than 10 and no later than 14 business days after receipt, unless the sender tells Safety they filed an action (Claimant filed suit, with the court and case number). A restore needs a reviewer to press Restore inside the window; past day 12 the case is overdue on the queue.

**Repeat infringers.** Three valid copyright removals in 12 months end the account and pause the store (content system 3.11, 512(i)). They count as strikes with reason `copyright` in R5. A reversed counter notice removes the strike.

**Records.** Notices, counter notices and decisions are kept 3 years (content system 3.12). The sender's postal address and phone are erased 1 year after close.

## 8. The Safety admin

A new rail group "Safety" in `apps/admin` with one destination, Review (`/safety`, shortcut Cmd or Ctrl plus Alt plus R, in the mobile dock). Tabs: Queue, Requests, Creators, Appeals, Log, Settings.

Shell (QA AD-Q33, AD-Q36): `apps/admin/src/shell/destinations.ts` gains `AdminGroup` "safety", `GROUP_LABELS.safety = "Safety"`, and `GROUP_ORDER = ["start", "content", "safety", "money", "access"]`. Review uses the `ShieldCheck` icon and `KeyR`. The desktop rail then reads: Dashboard, Users; Content: Themes, Files, Broadcasts, Messaging (Telegram becomes Messaging with Amped Messages M7, messaging spec section 9); Safety: Review; Money: Pools, USDC, Payments; Access: OAuth clients, Feature flags. Pages use the shipped `TopBar` (title "Review", Refresh, account menu). Phone dock: Dashboard, Users, Review, USDC, More; Pools sets `dock: false` and moves to More. A moderator or safety lead without `admin` sees only Review in the rail and the dock (8.8). Boards ad1 to ad6 are drawn at 1440 and 390 in this shell.

### 8.1 Queue (board ad1)

One list of open cases, sorted by due time. Each row: type, severity, item thumbnail (blurred and grayscale), creator handle, opened, due, assignee. Child safety rows and Age result rows show no thumbnail at all, only a neutral icon ("Hidden, child safety"); `safety.queue.list` returns no thumbnail URL or token for them (8.5, COUNSEL-ADULT 7.2, QA AD-Q34).

| Case type | Opens when | Due |
| --- | --- | --- |
| Child safety | Report reason "This shows a child", CSAM match, reviewer escalation | 1 hour, Critical |
| Take It Down | Valid request (7.3) or consent withdrawn (7.4) | 48 hours legal, 24 hours target |
| Age result | `under_18` identity result (identity checks 4.5, board ad8) | 1 business day |
| 18+ review | Creator submits an 18+ item or new version | 1 business day |
| Classifier hold | Unlabeled item held by the classifier | 1 business day |
| Store policy | Report on a store policy (store policy spec 3.1) | 3 business days |
| Copyright | Complete copyright notice (7.5), or a counter notice on one | 1 business day; counter notice: restore window day 10 to 14 |
| Report | Any other report reason | 3 business days |
| Appeal | Creator appeals a decision | 5 business days |
| 18+ setup check | First 18+ submission by a creator (one per creator) | 1 business day |

Filters: type, severity, mine, unassigned, overdue. Summary tiles: open, overdue, due today, Take It Down clock (the oldest open request). Claim assigns the case to the reviewer; a claimed case is released after 30 minutes of no activity.

### 8.2 Case view (board ad2)

Left: the media viewer. Right: facts and the decision panel.

- **Viewer.** Blurred and grayscale by default, audio muted. Reveal unblurs one asset at a time; each reveal is logged. Video plays from frame thumbnails first (one per 5 seconds), then full playback on Reveal. Documents show page thumbnails. Zoom, rotate.
- **Facts.** Title, description, kind, size, uploaded, labeled 18+ or not, classifier labels with scores, sha256, hash matches, report text.
- **Creator.** Handle, joined, Over 18 and seller check status with valid until, 18+ on since, strikes in the last 12 months, open cases, link to the creator profile.
- **People in this item.** Each listed person with check status, release date, countersign date, the recording dates for this item, and the face and tag options shown as checks ("Face may be shown", "No tag"). A missing release, countersignature or recording date blocks Clear. The AI label shows beside 18+ (QA AD-Q38).
- **Checklist.** The five checks in 6.3.
- **Decision.** Clear; Label 18+ and clear (only when the creator has 18+ on; drawn on ad2, QA AD-Q37); Ask for a change (reason required, sent to the creator); Remove (reason code required; optional strike); Escalate to child safety. Every decision needs a note of at least 10 characters for the log. Keyboard: C clear, L label, A ask, R remove, E escalate, J and K next and previous case.
- **Block this file.** Remove shows "Block this file everywhere" (adds the item's sha256 and perceptual hash to `BlockedContentHash`, so the same file can not be uploaded again by anyone). On by default for reasons `copyright`, `malware`, `non_consent` and every child safety removal; off by default for other policy reasons. Same file copies under other creators are listed with the decision (7.3).
- **Delivery line.** Under the viewer: the item's edge state from `edgeStatus` (C7a 4.6): "Delivery stopped 14:02" or "Stopping delivery, 2 retries" with Retry now for a safety lead (board tk2).
- **Store policy cases.** Show the published version and the reported text. Decision: Keep, or Remove custom policy (the store falls back to the standard policy with the creator's last settings, store policy spec 3.1).

### 8.3 Requests (boards ad3 and ad3b)

Two kinds share the tab, with a filter: Take It Down (7.2) and Copyright (7.5). Copyright requests (board ad3b) show the claimed work, the located items, the sender (name and email; address and phone masked until Show, logged), the 1 business day clock, and actions Disable, Not valid (reason), Ask the sender. After a counter notice they show the counter notice text, the restore window ("Restore between 17 Nov and 21 Nov"), Claimant filed suit (court and case number, keeps the item hidden and closes the case), and Restore. A copyright request cannot close while an item it disabled is hidden without a decision.

The Take It Down desk. Each request shows the clock, the requester's statement, contact (masked until Show, which is logged), the located items and identical copies with their state, and actions: Remove all, Not valid (reason), Ask the requester (email from a template), Share hash with StopNCII. A request cannot close while any located item is visible.

### 8.4 Creators (board ad4)

A safety profile per creator: identity checks, 18+ status and policy version, People list with release states, store policy version and mode, strikes (12 month window), cases, decisions, appeals, and the store state. Actions:

- Turn off 18+ (reason, notice to the creator).
- Pause store (stops new sales; buyers keep access).
- Suspend account (sets `User.block = "yes"`, KV takedown on every item, store paused). Needs a second person with the safety lead role to approve within the tool. Two cases suspend at once and ask for approval after (COUNSEL-ADULT 4.7, decision D6, QA AD-Q43): a child safety escalation, and a confirmed upload of a person without consent (a Take It Down request or a consent withdrawal decided Remove with reason `non_consent`). `safety.creators.suspendRequest` takes `immediate: true` only for those two and still opens the approval.

The profile also shows the custodian of records (named or not, never the address), the Adult Content Policy version accepted, the seller check with both parts (Authbase and the bound RNS name), and the store policy version and mode (QA AD-Q44).

### 8.5 Child safety escalation

Escalate (or a CSAM match, or a child report) does the following at once: hides the item, freezes the creator's uploads and store, closes the viewer for everyone, and opens a Critical case for the safety lead. Nobody reveals the media again. The safety lead follows content system 3.11 (evidence bucket, NCMEC report). The Safety tool records that a report was made and its reference, never the file.

Evidence path (R1 service, run by Escalate and by a CSAM match; from content PR 7): `preserveEvidence(caseId, publicId)` copies the original and the served renditions, server side, from the content bucket to the evidence bucket (`amped-evidence`, its own R2 token, bucket lock retention 1 year, REPORT Act 2024), with a JSON manifest (sha256, size, upload time, uploader user id, IPs held for that account, the report text). It writes `SafetyEvent` `evidence_preserved` with the object keys and `preservedUntil`, never a URL. No token for the evidence bucket ever leaves the server. Only after the copy succeeds does C7a delete the Stream video and the R2 objects; until then the item is hidden (`blocked:` with reason `child_safety`).

Alerting (R1): a child safety case sends the safety lead an email and an SMS within 1 minute, and the on call list from Settings gets the same (Q6). SMS goes through Twilio (Q8, Rob 3 Nov) from a Messaging Service with a dedicated sender number; the server reads `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID`. A failed SMS is retried twice and then logged as `[safety] ALERT sms failed`; the email still goes. The message carries the case number and a link, never the creator, the title or media. On call phone numbers are staff data, kept in Settings, visible to safety leads only; Twilio is added to the processor list in `docs/legal/privacy-parameters.md` for staff contact data.

The child safety case view (board ad2, third frame; QA AD-Q39) shows no media and no thumbnail. It carries: the escalation note, what was done automatically (hidden, uploads and store frozen, account suspended pending approval), the evidence copy state (preserved until {date}, 1 year, REPORT Act), and a "CyberTipline report" panel: Report filed (required before close), CyberTipline report number, filed at, filed by. The case cannot close without a report number or a safety lead note that the matter is not reportable. These go in `SafetyEvent.detail` with action `ncmec_report` (number, filedAt, preservedUntil); no new table. Reviewers can also escalate trafficking or coercion signs (COUNSEL-ADULT 7.3): Escalate offers "Child safety" and "Trafficking or coercion"; the second opens a Critical case for the safety lead without the media lock.

### 8.6 Appeals and Log (board ad5)

- **Appeals.** The original decision, the reviewer, the creator's text, and the item. The appeal reviewer must differ from the first reviewer (enforced by the server). Outcomes: Uphold, Reverse (restores the item and removes the strike). A Take It Down appeal (AD-D2) keeps the item hidden; Reverse first sends the requester notice (SafetyEvent `requester_notified`) and `safety.appeals.decide` refuses to restore a Take It Down item without that event; the restore job runs 2 business days later unless the requester replied.
- **Log.** Every action in Safety, append only: who, when, case, action, reason, note, and reveals. Filter by reviewer, creator, case, action. Export CSV for counsel (safety lead only).

### 8.7 Settings (board ad6)

Reason codes and their creator facing text, strike rules (decision D6), due times, the perceptual hash threshold, classifier thresholds, wellbeing limits, who has which role, and the on call list for child safety alerts. Changes to Settings need the safety lead role and are logged.

**Blocked files** (board ad6b, from content PR 7). The hash blocklist: sha256 (first 12 characters), reason, case number, added by, added on, uploads refused since. Search by hash or case. Unblock (safety lead only, reason required, logged) for a reversed decision; child safety hashes can not be unblocked here. Upload checks already read this table (`apps/server/src/services/content/state.ts:248`); the list adds who and why.

### 8.8 Roles

Roles stay in the comma separated `User.role` field the server already reads (`createRoleProtectedProcedure`). New roles:

| Role | Can |
| --- | --- |
| `moderator` | Queue, case view, Clear, Label, Ask, Remove without strike, Requests (Remove, Not valid), Log (own actions) |
| `safety_lead` | Everything a moderator can, plus strikes, appeals, suspend approvals, child safety cases, Settings, Log export, contact reveal on requests |
| `admin` | Unchanged. Does not get Safety by default; an admin who reviews needs `moderator` too |

The admin app gate (`apps/admin/src/ProtectedRoute.tsx`) admits only accounts whose role includes `admin` today. R1 widens it to `admin`, `moderator` or `safety_lead`; a moderator or safety lead without `admin` sees only the Safety group in the rail and gets 403 from every other admin procedure. New Safety procedures use `createRoleProtectedProcedure(["moderator", "safety_lead"])` or `(["safety_lead"])`.

When PR #308 (Better Auth admin plugin) lands, these roles move into its role model with the same names. Decision D7.

### 8.9 Reviewer wellbeing

Defaults per reviewer (decision D8): blur on, grayscale on, audio muted, reveal per asset. A break prompt after 50 minutes of case view time, and a daily cap of 4 hours on 18+ and child safety cases (Settings). The cap blocks new claims of those types and shows the time left. A wellbeing link sits in the Safety footer.

### 8.10 Phone triage (board ad7)

Safety on a phone shows the Queue and Requests in a single column and lets a moderator Remove or hide an item and assign it. On a Take It Down request the phone shows Hide matches now, Remove all and block the file (note required) and Assign; Not valid and restore stays on a desktop because it needs the media (QA AD-Q51). Full review (reveal, clear) is desktop only, so media is never revealed on a phone. Creators, Appeals, Log and Settings work at 390 as single column pages (boards ad4 to ad6).

## 9. Fan side

- **18+ shelf.** On a creator page with 18+ items, signed out or unchecked viewers see one card, "Adult items", with no title, cover or count (identity checks 4.4). After a pass, the shelf at `amped.bio/{handle}/adult` lists the items in the creator's theme with the 18+ chip. The landing app serves only an empty shell for that route and fills it from the signed in `content.listAdultForBio` call, so no server HTML ever holds an 18+ title or cover.
- **Over 18 check sheet.** The six states from identity checks 4.2 (boards ar1 and ar2). Phone first.
- **Report.** Every 18+ item and product page carries Report with the reasons in 7.1.
- **Nothing 18+ by Amped's hand.** No Explore, no recommendations, no "more like this", no Amped emails or pushes that name 18+ items. Fan Library lists 18+ items the fan owns, behind the same check (decision D4).
- **Health warnings and helpline (AD-D1, Rob 3 Nov). Interim, pending counsel.** Source: Alabama Act 2024 HB 164 (enrolled), Section 9, effective 1 Oct 2024; the adult website threshold is more than 33 1/3 percent of content harmful to minors (Section 2). Counsel approved COUNSEL-ADULT 10.2 item 6 but has not yet given a written answer on whether and where it applies; until then Amped shows the statutory text to every viewer, matching the one national gate (COUNSEL-ADULT 5.1).
  - The three warnings (Section 9(a)(1)) show on the Over 18 sheet in every state of 4.2 that a viewer sees before the check passes, and on the 18+ shelf landing (`amped.bio/{handle}/adult`). Boards ar1b to ar1d and ar2b.
  - The helpline notice (Section 9(a)(2)) shows on every 18+ page: the shelf and every 18+ item and product page. Boards ar2b and ar2e.
  - Section 9(c) asks for 14 point or larger and conspicuous: Prism body 16 px or larger, full contrast ink (16152B on white, or the theme ink on the theme background at 4.5:1 or more) inside a 1.5 px ink outline, never collapsed, truncated or behind a toggle.
  - The text is verbatim statute. It is not edited and is exempt from the dash and banned word checks. It lives in constants and nowhere else:

```
ALABAMA HEALTH AND HUMAN SERVICES WARNING: Pornography is potentially biologically addictive, is proven to harm human brain development, desensitizes brain reward circuits, increases conditioned responses, and weakens brain function.
ALABAMA HEALTH AND HUMAN SERVICES WARNING: Exposure to this content is associated with low self-esteem and body image, eating disorders, impaired brain development, and other emotional and mental illnesses.
ALABAMA HEALTH AND HUMAN SERVICES WARNING: Pornography increases the demand for prostitution, child exploitation, and child pornography.

U.S. SUBSTANCE ABUSE AND MENTAL HEALTH SERVICES ADMINISTRATION HELPLINE: 1-800-662-HELP (4357)
THIS HELPLINE IS A FREE, CONFIDENTIAL INFORMATION SERVICE (IN ENGLISH OR SPANISH) OPEN 24 HOURS PER DAY, FOR INDIVIDUALS AND FAMILY MEMBERS FACING MENTAL HEALTH OR SUBSTANCE USE DISORDERS. THE SERVICE PROVIDES REFERRAL TO LOCAL TREATMENT FACILITIES, SUPPORT GROUPS, AND COMMUNITY-BASED ORGANIZATIONS.
```
- **Legal pages.** The Adult Content Policy and the public 2257 statement (COUNSEL-ADULT 6.7) are public pages linked from every footer (L1).

## 10. Data model

New tables, UUID v7 keys per AGENTS.md. Admin only tables are never exported to the client.

```prisma
model CreatorAdultProfile {
  id             Bytes     @id @db.Binary(16)
  userId         Int       @unique @map("user_id")
  enabledAt      DateTime? @map("enabled_at")
  policyVersion  String?   @map("policy_version") @db.VarChar(16)
  custodianName  String?   @map("custodian_name") @db.VarChar(160)   // 2257 custodian, encrypted at rest, never public
  custodianAddress String? @map("custodian_address") @db.Text        // encrypted at rest, given only on lawful request
  disabledAt     DateTime? @map("disabled_at")
  disabledBy     Int?      @map("disabled_by")      // admin user id, null when the creator turned it off
  disabledReason String?   @map("disabled_reason") @db.VarChar(255)
  @@map("creator_adult_profiles")
}

// One row is one release: one performer with one creator (SP-Q36). A re sign after withdrawal or a required version is a new row.
model AppearingPerson {
  id              Bytes     @id @db.Binary(16)
  creatorUserId   Int       @map("creator_user_id")
  personUserId    Int?      @map("person_user_id")    // set when the invite is accepted
  displayName     String    @map("display_name") @db.VarChar(80)
  inviteHash      String?   @unique @map("invite_hash") @db.Char(64)
  inviteExpires   DateTime? @map("invite_expires")
  releaseVersion  String?   @map("release_version") @db.VarChar(16)
  releaseName     String?   @map("release_name") @db.VarChar(160)   // typed legal name, encrypted at rest
  releaseOptions  Json?     @map("release_options")                // surfaces, otherPlatforms, faceShown, tagAllowed, payment kind, fixed amount, bps
  idGivenConfirmedAt DateTime? @map("id_given_confirmed_at")       // person confirms they gave the creator their ID and names
  releaseAt       DateTime? @map("release_at")
  releaseText     String?   @map("release_text") @db.Text           // the filled text the person signed
  releaseHash     String?   @map("release_hash") @db.Char(64)        // sha256 of releaseText
  checkReference  String?   @map("check_reference") @db.VarChar(64) // Authbase reference, snapshot at signing
  checkDate       DateTime? @map("check_date")
  // releaseIp is not stored until counsel adds IP to release section 10 (store policy spec 4.3)
  creatorSignedAt DateTime? @map("creator_signed_at")             // Ready only when set
  withdrawnAt     DateTime? @map("withdrawn_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  @@index([creatorUserId])
  @@index([personUserId])
  @@map("appearing_people")
}

model ContentItemPerson {
  contentItemId Bytes @map("content_item_id") @db.Binary(16)
  personId      Bytes @map("person_id") @db.Binary(16)
  releaseId     Bytes @map("release_id") @db.Binary(16)      // the AppearingPerson row (signed release) that covers this person, set at tagging
  productionDates Json @map("production_dates")               // recording dates for this item, listed as covered content
  @@id([contentItemId, personId])
  @@map("content_item_people")
}

enum SafetyCaseType { CHILD_SAFETY TAKE_IT_DOWN AGE_RESULT ADULT_REVIEW CLASSIFIER_HOLD STORE_POLICY REPORT APPEAL ADULT_SETUP }
enum SafetyCaseState { OPEN CLAIMED WAITING_CREATOR DECIDED CLOSED }

model SafetyCase {
  id            Bytes           @id @db.Binary(16)
  number        String          @unique @db.VarChar(20)     // SC-2026-000123
  type          SafetyCaseType
  severity      Int                                          // 0 critical, 1 high, 2 normal
  state         SafetyCaseState @default(OPEN)
  contentItemId Bytes?          @map("content_item_id") @db.Binary(16)
  offerId       Bytes?          @map("offer_id") @db.Binary(16)
  storePolicyVersionId Bytes?   @map("store_policy_version_id") @db.Binary(16)
  creatorUserId Int?            @map("creator_user_id")
  requestId     Bytes?          @map("request_id") @db.Binary(16)
  parentCaseId  Bytes?          @map("parent_case_id") @db.Binary(16)  // appeals
  assigneeId    Int?            @map("assignee_id")
  claimedAt     DateTime?       @map("claimed_at")
  dueAt         DateTime        @map("due_at")
  outcome       String?         @db.VarChar(24)   // clear | label_clear | needs_change | removed | escalated | upheld | reversed | not_valid | kept | policy_removed
  reasonCode    String?         @map("reason_code") @db.VarChar(32)
  decidedById   Int?            @map("decided_by_id")
  decidedAt     DateTime?       @map("decided_at")
  createdAt     DateTime        @default(now()) @map("created_at")
  @@index([state, dueAt])
  @@index([creatorUserId, createdAt])
  @@index([contentItemId])
  @@map("safety_cases")
}

model SafetyEvent {               // append only audit log
  id        Bytes    @id @db.Binary(16)
  caseId    Bytes?   @map("case_id") @db.Binary(16)
  actorId   Int?     @map("actor_id")          // null for the system
  action    String   @db.VarChar(32)           // claim | reveal | decide | strike | suspend_request | suspend_approve | contact_reveal | setting_change | export ...
  detail    Json?
  note      String?  @db.Text
  createdAt DateTime @default(now()) @map("created_at")
  @@index([caseId, createdAt])
  @@index([actorId, createdAt])
  @@map("safety_events")
}

model TakedownRequest {
  id            Bytes     @id @db.Binary(16)
  number        String    @unique @db.VarChar(20)    // TD-2026-000123
  statusKeyHash String    @map("status_key_hash") @db.Char(64)
  relationship  String    @db.VarChar(16)            // self | agent
  agentDetail   String?   @map("agent_detail") @db.VarChar(160)
  contactEmail  String    @map("contact_email") @db.Text      // encrypted
  contactPhone  String?   @map("contact_phone") @db.Text      // encrypted
  signature     String    @db.Text                            // encrypted
  statement     String?   @db.Text
  locations     Json                                          // [{ url, publicId? }]
  receivedAt    DateTime  @default(now()) @map("received_at")
  dueAt         DateTime  @map("due_at")                      // receivedAt + 48 hours
  closedAt      DateTime? @map("closed_at")
  outcome       String?   @db.VarChar(16)                     // removed | not_valid | withdrawn
  @@index([closedAt, dueAt])
  @@map("takedown_requests")
}

model Strike {
  id         Bytes     @id @db.Binary(16)
  userId     Int       @map("user_id")
  caseId     Bytes     @map("case_id") @db.Binary(16)
  reasonCode String    @map("reason_code") @db.VarChar(32)
  createdAt  DateTime  @default(now()) @map("created_at")
  reversedAt DateTime? @map("reversed_at")
  @@index([userId, createdAt])
  @@map("strikes")
}
```

Changes for content PR 7 (revision 6):

```prisma
enum SafetyCaseType { CHILD_SAFETY TAKE_IT_DOWN AGE_RESULT ADULT_REVIEW CLASSIFIER_HOLD STORE_POLICY REPORT APPEAL ADULT_SETUP COPYRIGHT }

model TakedownRequest {
  // ...fields above
  kind          String    @default("ncii") @db.VarChar(12)    // ncii | copyright | counter
  counterOfId   Bytes?    @map("counter_of_id") @db.Binary(16) // a counter notice points at its copyright notice
  workDescription String? @map("work_description") @db.Text
  postalAddress String?   @map("postal_address") @db.Text    // encrypted, copyright and counter only
  jurisdictionConsent Boolean? @map("jurisdiction_consent")  // counter notice
  restoreFrom   DateTime? @map("restore_from")               // counter notice: received + 10 business days
  restoreBy     DateTime? @map("restore_by")                 // received + 14 business days
  suitFiledAt   DateTime? @map("suit_filed_at")
  suitReference String?   @map("suit_reference") @db.VarChar(120)
}

model BlockedContentHash {
  // existing: id, sha256, reason (dmca | malware | policy), createdAt
  // reason gains: copyright (replaces dmca for new rows), ncii, csam, non_consent
  phash     String? @db.VarChar(64)
  caseId    Bytes?  @map("case_id") @db.Binary(16)
  addedById Int?    @map("added_by_id")
  removedAt DateTime? @map("removed_at")              // Unblock keeps the row for the record
  @@index([phash])
}
```

`ContentItem.hiddenAt`, `hiddenReason` and the edge state columns come from C7a (`content-takedown.md` 4.3). Numbers for copyright notices use the `CN-` prefix in the same `number` column.

Changes to existing tables: `ContentItem.explicitAt DateTime?`; `ContentItem.aiLabel Boolean?` (5.3); `ContentReport.reason` gains `ncii`, `withdraw` and `store_policy` ("This shows a child" keeps the existing `csam` value; QA AD-Q29); `ContentReport.caseId Bytes?`; `BlockedContentHash.reason` gains `ncii` and a `phash String?` column with an index.

Constants in `packages/constants`: `ADULT_POLICY_VERSION = "1.1"`, `RELEASE_VERSION = "1"`.

Retention: SafetyEvent, SafetyCase and Strike are kept 3 years (as DMCA records, content system 3.12). TakedownRequest contact fields are erased 1 year after close; the number, dates and outcome stay. Release records stay as long as any item with that person exists plus 7 years, on the retention schedule counsel set. Account deletion (#13) keeps release records and the custodian details for that period. Child safety evidence stays in the restricted store (content system 3.11).

## 11. Defects found in this review

**F1 (P0 before 18+ opens).** `content.update` lets the owner set `adult` from true to false at any time, and the classifier runs only once during processing. An item labeled 18+ passes the classifier as explicit, becomes CLEAR, and can then be unlabeled and published as a public item with no review. Fix: store `explicitAt`; refuse `adult: false` while `explicitAt` is set; until `explicitAt` exists, turning `adult` off on a READY item sets `moderationState = HELD` with reason `adult_label_removed`. Test: label, process explicit, unlabel, publish is refused.

**F2 (P1).** The processor classifies images and video frames only. Document page renders skip the classifier, and `file` items are never seen. Fix: classify document page renders; for `file` items of creators with 18+ on, open an 18+ review case; for others, keep `file` items download only and reportable (decision D10).

**F3 (P2, copy).** The item editor says the 18+ label shows "only to fans who confirmed their age". New copy: "Label this item for adults. Only fans who passed the Over 18 check can open it."

**F4 (P1, process).** Production runs `CLASSIFIER=none` with `CLASSIFIER_REQUIRED=true`, so every image and video is held, and no reviewer tool exists until R2. Either ship R2 with content Phase 1 or keep the `contentUploads` feature flag off in production until it lands. It is switched in admin › Feature flags (registry `packages/constants/src/feature-flags.ts`) and the server reads it with `isFeatureOn("contentUploads")`; `CONTENT_UPLOADS_ENABLED` is only its fallback while no admin row is set.

## 12. Decisions

D1 to D12 were answered as recommended on the Build Board card (#28). D3 is confirmed by counsel.

**D1. Human review of every 18+ item before publish.** Every 18+ item and every new version.

**D2. Co-performers verify with Authbase and sign in app.** Every person who appears passes the Authbase Over 18 check and signs the creator's release in the app; the creator countersigns. No ID documents reach Amped.

**D3. Records position on 2257.** Creators are the producers and keep their own 2257 records and name a custodian; Amped keeps the check outcomes and releases as platform policy records and does not select, feature or edit 18+ content. Counsel approved on 3 Nov 2026 (COUNSEL-ADULT section 6).

**D4. No curation of 18+.** Amped never features, ranks, recommends or emails 18+ items.

**D5. Hide first on a valid Take It Down request.** Hide on a facially valid request, review within 48 hours.

**D6. Strikes.** A strike on Remove for a policy reason; 3 strikes in 12 months turns off 18+; child safety or a confirmed non consent upload suspends at once.

**D7. Roles now, Better Auth later.** `moderator` and `safety_lead` in the existing role string now; into #308's role model when it merges.

**D8. Wellbeing defaults on.** Blur, grayscale and mute by default, per asset reveal, 50 minute break prompt, 4 hour daily cap.

**D9. StopNCII.** On Remove, offer the requester to share the hash with StopNCII.org.

**D10. Unscannable files.** `file` items from creators with 18+ on go through 18+ review; document page renders are classified.

**D11. Appeals.** One appeal per decision, within 30 days, decided by a different reviewer within 5 business days.

**D12. Phone triage only.** Safety on phones can hide, remove and assign, but never reveals media.

## 13. API

New routers `safety` (admin roles) and additions to `content`, `identity`, `takedown` (public).

| Procedure | Access | Purpose |
| --- | --- | --- |
| `adult.getSetup`, `adult.acceptPolicy`, `adult.setCustodian`, `adult.enable`, `adult.disable` | private, owner | 5.1 |
| `adult.people.list`, `adult.people.invite`, `adult.people.countersign`, `adult.people.remove` | private, owner | 5.2 |
| `adult.appear.get`, `adult.appear.setOptions`, `adult.appear.sign`, `adult.appear.withdraw` | private, the invited person | 5.2 |
| `content.update` (people, surfaces, confirmation) | private, owner | 5.3, F1 |
| `content.submitForReview` | private, owner | 6.1 |
| `content.appeal` | private, owner | 5.4 |
| `content.report` (new reasons) | public, rate limited | 7.1 |
| `takedown.submit`, `takedown.status` | public, rate limited, Turnstile | 7.2 |
| `copyright.submit`, `copyright.status` | public, rate limited, Turnstile | 7.5 |
| `copyright.counter` | private, the item's owner | 7.5 counter notice |
| `safety.requests.copyright.decide`, `safety.requests.copyright.suitFiled`, `safety.requests.copyright.restore` | moderator (restore after counter: safety_lead) | 8.3 |
| `safety.blocklist.list`, `safety.blocklist.unblock` | moderator list, safety_lead unblock | 8.7 |
| `safety.case.retryDelivery` | safety_lead | C7a edge sync retry |
| `safety.queue.list`, `safety.case.get`, `safety.case.claim`, `safety.case.release` | moderator | 8.1, 8.2 |
| `safety.case.reveal` | moderator | logs and returns a 60 second gateway token for one asset |
| `safety.case.decide` | moderator (strike: safety_lead) | 8.2 |
| `safety.case.escalate` | moderator | 8.5 |
| `safety.requests.list`, `safety.requests.get`, `safety.requests.revealContact`, `safety.requests.decide`, `safety.requests.copies` | moderator (contact: safety_lead) | 8.3 |
| `safety.creators.get`, `safety.creators.disableAdult`, `safety.creators.pauseStore`, `safety.creators.removeStorePolicy`, `safety.creators.suspendRequest`, `safety.creators.suspendApprove` | moderator, approve: safety_lead | 8.4 |
| `safety.appeals.decide` | safety_lead, not the first reviewer | 8.6 |
| `safety.log.list`, `safety.log.export` | moderator own, safety_lead all | 8.6 |
| `safety.settings.get`, `safety.settings.update` | safety_lead | 8.7 |

Reveal tokens: `safety.case.reveal` signs a gateway token with `aud: "safety"`, 60 seconds, for one asset, and the gateway accepts it for HELD items. No token is ever issued for a child safety case.

## 14. Notifications

| Event | Who | Channel |
| --- | --- | --- |
| Case decided | Creator | Inbox and email (no media, no title for 18+ items: "An item needs a change") |
| Take It Down received, decided | Requester | Email with the number |
| Take It Down appeal reversed, before restore (AD-D2) | Requester | Email with the number and the reason, 2 business days before the restore |
| Take It Down removal | Creator | Inbox and email, no requester detail |
| Consent withdrawn | Creator | Inbox and email naming the person's display name only |
| Release ready to countersign | Creator | Inbox |
| Clock over 36 hours | safety_lead | Email and the admin dashboard banner |
| Child safety case | safety_lead | Email and SMS |
| Suspend waiting for approval | safety_lead | Email |
| Copyright notice received, decided | Sender | Email with the number |
| Item disabled after a copyright notice | Creator | Inbox and email with the claimed work, the sender's name and email, and Counter notice |
| Counter notice received | Sender | Email with a copy and the restore window |
| Restored after a counter notice | Creator and sender | Inbox and email |
| Delivery sync behind (C7a) | safety_lead | Admin dashboard tile and the log alert |

## 14a. Privacy

New personal data: the typed legal name, options and timestamps on a release (no IP until counsel adds it to release section 10, store policy spec 4.3; QA AD-X2); the custodian name and address; Take It Down contact details and signatures; reviewer notes that may describe a person. Per `docs/legal/privacy-parameters.md` and AGENTS.md, the privacy notice gains these before R3 and R4 ship, with retention as in section 10, and `CONSENT_POLICY_VERSION` is bumped. New recipient if D9 is used: StopNCII.org (hashes only, with the requester's agreement). Authbase is already listed through identity checks.

## 15. Analytics

Counts only, no media and no requester data: `safety_case_opened` (type), `safety_case_decided` (type, outcome, minutes to decide), `takedown_received`, `takedown_closed` (hours), `adult_enabled`, `adult_person_ready`, `adult_consent_withdrawn`. From content PR 7: `copyright_received`, `copyright_decided` (outcome, business hours to decide, for the 1 business day KPI in content system 3.13), `copyright_counter_received`, `copyright_restored`, `hash_blocked` (reason), `upload_refused_hash` (reason).

## 16. Build plan

| PR | Branch | Scope | Depends | Size |
| --- | --- | --- | --- | --- |
| F1 | `fix/content-adult-unlabel` | Unlabel holds the item; `explicitAt`; test | #348 (merged) | 0.5 day |
| C7a | `feat/content-takedown` | Edge state, outbox and loop, KV and Stream hide, cache purge, gateway `p` and `a` token checks, `hideItems` and `restoreItems` (`docs/features/content-takedown.md`) | #348, #442 | 3 days |
| R1 | `feat/safety-foundation` | Tables in section 10, roles and the admin app gate (8.8), SafetyEvent writer, settings defaults, `ADULT_POLICY_VERSION` and `RELEASE_VERSION`. From content PR 7: the hash blocklist service (reasons, `phash`, `caseId`, Unblock), `preserveEvidence` and the evidence bucket, the child safety alert channel (email and Twilio SMS). Hide and restore come from C7a | I1 (merged), C7a | 3 days |
| R2 | `feat/safety-queue` | Admin Safety rail group, Queue, Case view with blur and reveal, decisions, store policy cases, notices to creators, keyboard. From content PR 7: Block this file on Remove, the delivery line and Retry, Escalate runs `preserveEvidence` and the alert, the Blocked files list in Settings (ad6b), Safety reveal tokens with `a: "safety"` | R1 | 4.5 days |
| R3 | `feat/takedown` | Public form and status page, Requests desk, identical copy search, the withdraw consent reason, `content.report` hides on `csam` with the abuse guard (7.1), `CONTENT_REPORT_LABELS` and reasons per 7.1, notices, footer links. From content PR 7: the copyright notice form and status page (ar8), counter notice (ar9), copyright requests in the desk (ad3b), repeat infringer counting, copyright analytics | R1 | 5 days |
| R4 | `feat/adult-setup` | Creator 18+ setup with the custodian step, People and invites, release options, signature and countersignature, the surface rule behind `releaseAllowsSurface`, item editor section, submit for review, privacy notice entries | R1 | 4 days |
| R5 | `feat/safety-creators-appeals` | Creator profile, strikes, suspend with approval, remove custom store policy, appeals, Log export, Settings | R2 | 3 days |
| R6 | with A1 | 18+ shelf after a pass, Over 18 sheet states (identity checks A1) | F1, R2, R4, A1 | in A1 |
| R7 | `feat/classifier-docs` | F2: classify document renders, `file` items into review for 18+ creators | processor | 1 day |
| C1 | with A1 (R6) | `packages/constants/src/compliance.ts`: `ALABAMA_HEALTH_WARNINGS` (readonly array of the three warnings) and `SAMHSA_HELPLINE_NOTICE` (readonly array of the two lines), verbatim from section 9, with a source comment (Alabama Act 2024 HB 164, Section 9, interim pending counsel). A shared `StatutoryNotice` component renders them at 16 px or larger with no collapse. A unit test compares both constants byte for byte with the block in section 9 of this spec. The copy linter (dash and banned word checks) skips `compliance.ts` only | none | 0.5 day |
| L1 | `feat/legal-pages` | Public Adult Content Policy and 2257 statement pages, footer links (can fold into R3) | none | 1 day |

About 25 engineer days plus A1, C7a included (revision 6 moved content PR 7 here: 3 days for C7a, 1 more for R1, half for R2, 2 for R3). Order: C7a and F1 now; A1 must not merge before F1, because `content.update` still sets `adult` freely (`apps/server/src/trpc/content.ts:634`) and the only guard today is the blanket refusal in `publish` (`content.ts:683`) that A1 lifts (QA AD-Q18). R1 and R2 with content Phase 1 (they also answer F4). R3 and L1 before any public 18+ and before content general availability. R4, R5, R6 before 18+ opens.

Launch gate for 18+: counsel approval (done, 3 Nov 2026); the operational items in COUNSEL-ADULT 10.3 (Authbase written terms against Q1 and Q2, NCMEC registration, Take It Down desk live, release and store policy in the app, 2257 statement published); C7a, R1 to R7 and L1 merged; the DMCA designated agent registered with the Copyright Office and named on the copyright policy page; the evidence bucket created with bucket lock; PhotoDNA live (content system decision 11); staging walk of every acceptance test below.

## 16a. Content PR 7, split (revision 6)

Content system 3.16 named one PR 7 for trust and safety. On 3 Nov Rob split it: C7a (`docs/features/content-takedown.md`) builds the delivery stop every Safety action needs, and the rest lands in R1 to R3.

| Content PR 7 item | Now in | Section here |
| --- | --- | --- |
| Admin content queue and decisions | R2 | 8.1, 8.2 |
| DMCA tools | R3 | 7.5, 8.3 |
| Hash blocklist actions | R1 service, R2 Remove and Settings | 8.2, 8.7, 10 |
| CSAM evidence path and alerting | R1 service, R2 Escalate | 8.5 |
| KV takedown writes and cache purge | C7a | content-takedown.md |
| 18+ refusals in public procedures | Done in C8 and G1 | 9 |
| Analytics events | C7a, R2, R3 | 15 |
| Copy scan over content components | Done in C8 | 17 item 19 |

## 17. Acceptance

1. A creator without both identity passes, the accepted policy version and a custodian cannot turn on 18+, and the API refuses an 18+ label from them even when the client is bypassed.
2. An 18+ item with a person who has no valid release with that creator (both signatures, not withdrawn) cannot be submitted or published, and the API refuses it with `release_missing`.
3. An item cannot be placed on a surface excluded by the release of any person in it.
4. No 18+ item is CLEAR without a recorded reviewer decision with all checks ticked.
5. F1: label, process explicit, unlabel, publish is refused and a case opens.
6. F2: an explicit PDF on staging (`qa-explicit` mock) is held.
7. A Take It Down request with all fields hides the item within 1 minute and shows a number. The requester gets the email.
8. A withdrawal hides every item with that person within 1 minute.
9. Identical copies (same sha256) under another creator are listed and removed in one action.
10. The creator never sees the requester's name, email, phone or statement.
11. A child safety escalation hides the item, freezes the creator's uploads and store, and no reveal token can be issued for that case afterwards.
12. A suspend needs a second safety_lead approval, except child safety, which suspends at once and asks after.
13. An appeal cannot be decided by the reviewer who made the decision.
14. Every reveal, decision, contact reveal and setting change appears in the Log with the actor.
15. A moderator past the daily cap cannot claim 18+ or child safety cases.
16. Safety on a phone never shows unblurred media.
17. Server HTML, sitemaps, `llms.txt`, share tags, email and push contain no 18+ title, cover or link.
18. A `moderator` without `admin` can open Safety and gets 403 from every other admin page and procedure.
19. Typecheck, build and tests pass. UI copy has no em or en dashes. Every control is at least 44 high. Contrast passes 4.5:1 for body text.
20. A child safety removal shows no Appeal, and `content.appeal` refuses it.
21. A confirmed non consent upload suspends at once and opens the approval after.
22. `safety.queue.list` and the phone queue return no thumbnail or token for child safety and age result cases.
23. A child safety case cannot close without a CyberTipline report number or a safety lead note.
24. An 18+ item cannot be submitted without the AI label answered and, when others appear, the recording dates.
25. A `csam` report hides the item at once; every other reason hides nothing.
26. The Over 18 sheet and the 18+ shelf landing show the three Alabama warnings, and every 18+ page shows the helpline notice, rendered from the constants, byte for byte, at 16 px or larger and never collapsed (AD-D1).
27. A Take It Down appeal is decided only by a safety lead, the item stays hidden while it is open, and no restore runs before the requester notice is sent (AD-D2).
28. A complete copyright notice opens a case due in 1 business day; Disable hides the item within 1 minute (C7a) and the creator's notice carries the sender's name and email and a Counter notice button.
29. A counter notice cannot restore before 10 business days or after 14 without a recorded reason; Claimant filed suit keeps the item hidden.
30. A third valid copyright removal in 12 months ends the account and pauses the store; a reversed one removes the strike.
31. Block this file refuses the same sha256 on any later upload, by anyone; Unblock needs a safety lead and a reason and is logged; child safety hashes cannot be unblocked.
32. Escalate to child safety copies the original and renditions to the evidence bucket before any delete, logs `evidence_preserved`, and alerts the safety lead within 1 minute without the creator, title or media in the message.

## 17a. For counsel

Drafted for counsel. Nothing here is on a board as final text.

1. Alabama health warning (COUNSEL-ADULT 10.2 item 6). Rob decided on 3 Nov (AD-D1) to show the statutory text now as interim text (section 9). Counsel to confirm in writing whether and where it applies to a mixed platform, and whether showing it to every viewer is right. Until then the interim text stays.
2. Per creator release wording (store policy spec, For counsel 5). Board ar5 marks the scope sentence as pending counsel.

## 18. Open questions

| # | Question | Owner | Blocks |
| --- | --- | --- | --- |
| Q1 | Authbase written terms: Ofcom highly effective, US commercially reasonable methods, IAL2 for Arkansas, anonymized result for Florida | Authbase team | UK and US 18+ go live |
| Q2 | Authbase re-verification schedule (Ohio, Tennessee) and deletion terms (Kentucky, Missouri, West Virginia) | Authbase team | 18+ go live |
| Q3 | 2257 position and release text | Counsel | Answered 3 Nov 2026 |
| Q4 | Adult Content Policy and prohibited list | Counsel, Rob | Answered 3 Nov 2026 |
| Q5 | StopNCII partnership terms | Rob | D9 only |
| Q6 | Who holds `safety_lead` at launch, and the child safety on call list | Rob, ops | R2 go live |
| Q7 | Reviewer staffing: in house or a vendor for the 1 business day target | Rob | Scale, not pilot |
| Q8 | SMS provider for child safety alerts | Rob | Answered 3 Nov 2026: Twilio |
| Q9 | DMCA designated agent: who is named, and the postal address on the copyright policy page | Rob, counsel | R3 and L1 go live |

## 19. Sources

- `docs/legal/adult-content-policy.md` sources list (state laws, OnlyFans and Fanvue terms, 28 CFR 75.1, Third Circuit, TAKE IT DOWN, REPORT Act, Ofcom).
- AVPA, US state age verification laws for adult content (updated 13 Sep 2026): https://avpassociation.com/us-state-age-verification-laws-for-adult-content/
- WilmerHale, The TAKE IT DOWN Act goes live (15 Jun 2026): https://wilmerhale.com/en/insights/client-alerts/20260615-the-take-it-down-act-goes-live
- 28 CFR 75.1 definitions (Cornell LII): https://www.law.cornell.edu/cfr/text/28/75.1
- 17 U.S.C. 512 (Cornell LII), notice (c)(3), counter notice (g)(2) and (g)(3), repeat infringers (i): https://www.law.cornell.edu/uscode/text/17/512
- Cloudflare KV, Stream signed URLs and cache purge: sources in `docs/features/content-takedown.md`.

## Revision log

- 2026-11-05: A1 with R6 and C1 built (`feat/content-adult-access`). `adultContent` flag (off until R1 to R5); shelf and item shells at `/{handle}/adult`; statutory notices in constants with a byte test and `StatutoryNotice`. Handoff `docs/fixes/content-adult-access.md`.
- 2026-11-05: F1 built (`fix/content-adult-unlabel`). `explicitAt` set from a new `explicit` flag on the classifier callback; unlabel refused while set, else a READY item is held with `adult_label_removed`. Handoff `docs/fixes/content-adult-unlabel.md`.
- 2026-11-03: Q8 answered by Rob: Twilio sends child safety SMS alerts (8.5). Secrets and the privacy processor entry added.

- 2026-11-03: Revision 6. Content PR 7 split (16a): C7a builds the delivery stop; R1 gains the hash blocklist service, the evidence path and the alert channel; R2 gains Block this file, the delivery line and the Blocked files list; R3 gains the copyright desk (7.5), counter notices and repeat infringers. Case type Copyright, `TakedownRequest.kind`, `BlockedContentHash` columns, API, notifications, analytics, acceptance 28 to 32, Q8 and Q9. Boards ad2b, ad3b, ad6b, ar8, ar9, tk1, tk2.

- 2026-11-03: Revision 5. Rob's decisions AD-D1 (Alabama HB 164 Section 9 warnings and SAMHSA helpline, interim pending counsel, constants in C1) and AD-D2 (one Take It Down appeal by a safety lead, item hidden, requester told before restore). Acceptance 26 and 27.

- 2026-11-03: Revision 4 (Full QA AD-Q1 to AD-Q53). Seller row has both parts; custodian row text; policy 1.1 on boards; release status words, recording dates and AI label in the item editor; child safety removals final; Take It Down removal, turned off and restored notices; report reasons mapped to the code values (`csam` kept) and the R3 change to `content.report`; admin shell, Safety group position and phone dock; no thumbnails for child safety; people panel detail; non consent suspends at once; CyberTipline report panel and trafficking escalation; phone Remove on requests; no IP in 14a; A1 after F1; acceptance 20 to 25; For counsel.

- 2026-11-03: SP-Q36 decided: one release per performer per creator, signed at the invite; ContentItemPerson.releaseId and productionDates; withdrawal per release; release_missing on submit and publish.
- 2026-11-03: Revision 3 (QA fixes). 5.2 steps 3 and 4: release labels, full text before Sign, check reference snapshot, no IP until counsel adds it, copies to both parties. Data model: releaseText, releaseHash, checkReference, checkDate; releaseIp removed.
- 2026-11-03: Revision 2. First repo copy. Counsel approval recorded (D3, Q3, Q4). Release is the creator's document with options, ID confirmation and countersignature; custodian of records step; surface rule; withdraw consent reason; Age result and Store policy case types; L1; launch gate updated to COUNSEL-ADULT 10.3.
- 2026-10-24: Revision 1. Spec for approval, project copy `claude/amped-adult-content-review-spec-2026-10-24.md`.
