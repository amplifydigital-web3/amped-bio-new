# Store policy and performer release

Status: spec for build, 3 Nov 2026, revision 3 (QA fixes SP-Q1 to SP-Q49). Drafted by Claude for Rob Frasca.
Build Board: #28 Adult content compliance (gate COUNSEL-ADULT, cleared by counsel 3 Nov) and #20 Content system (store).
Texts: `docs/legal/adult-content-policy.md` (COUNSEL-ADULT v1.1), `docs/legal/performer-release.md` (`RELEASE_VERSION` 1), `docs/legal/creator-storefront-policy.md` (`STORE_POLICY_TEMPLATE_VERSION` 1).
Boards sp1 to sp8: https://claude.ai/artifact/TErq8QL9fn31ENpgo6nD1r
Parents: content system spec 3.8 (store), mobile checkout spec section 5 (pay sheet c1), adult content review spec 5.2 (people who appear, board ar5), identity checks (Over 18, seller).

## 1. Why

Amped is a platform and storefront. The creator is the seller of record and the producer of the content (COUNSEL-ADULT v1.1, sections 1 to 3). Counsel approved that position on 3 Nov 2026. The product has to say it the same way everywhere a fan buys:

1. Every store has a store policy in the creator's name.
2. Every purchase records which store policy version was in force.
3. Every person who appears in 18+ content signs the creator's release, with their own options, before the item can go to review.

## 2. Decisions (Rob, 3 Nov)

- Counsel confirmed and approved every item in COUNSEL-ADULT section 10.2.
- Creators adopt the standard store policy with their name filled in, or publish their own.
- The release is the creator's document. Amped is neither party nor beneficiary.

## 3. Store policy

### 3.1 Modes (sp1, sp2, sp3)

| Mode | Creator sets | Rendered text |
|---|---|---|
| `standard` (default) | Seller name (shared, below), refund option (`A`, or `B` with 3, 7 or 14 days), contact (Amped messages always, optional email) | Template from `docs/legal/creator-storefront-policy.md` Part B with the fields filled. Section 9 only when 18+ is on |
| `custom` | Seller name (shared, below), plain text or Markdown, max 20,000 characters, and the confirmations of template A.3 (five, or six with 18+ on) | The creator's text, rendered as text, below the fixed Amped notice |

**Seller name (both modes, SP-Q7).** One field above the mode settings, shared by `standard` and `custom`: source `display` (the creator's display name) or `legal` (`sellerLegalName`, a legal or business name, 1 to 80 characters after trim). It fills `{seller_name}` in the fixed notice (3.2), the Buying here card, the product page line, the pay sheet seller line and the receipt. It is stored in `settings.sellerName` on every version, custom included. Errors: empty "Enter the name fans will see as the seller." Over 80 "Use 80 characters or fewer." The typed name is not checked against Authbase today. See For counsel, item 1.

**Contact (SP-Q4).** Amped messages is a fixed row marked Always on with a lock. It is not a toggle. Add an email is a ghost button that opens one email field (plain address, checked on save).

**Mode switch (SP-Q11).** The Standard and Own policy cards stay on the Policy tab in both modes. `StoreSettings.policyDraft` holds one draft per mode (`{ standard, custom }`), so switching mode keeps both drafts. Publish publishes the selected mode only. Switching mode never changes what fans see until Publish.

Custom text rules, checked on the server at publish:

- Links allowed: `amped.bio` hosts (and its subdomains) and plain email addresses. Anything else the link detector finds refuses publish with `policy_external_link` and the host.
- Link detector (SP-Q10), in `packages/constants/src/store.ts` as `findPolicyLinks(text)`, shared by client and server: (1) any scheme URL (`http:`, `https:`, `ftp:`, `www.` prefix); (2) any bare domain, a run of labels joined by dots that ends in a TLD from the public suffix list (`paypal.me/linstudio`, `cash.app`); (3) the same after removing spaces around dots and replacing `[dot]`, `(dot)` and ` dot ` with a dot. Email addresses are allowed and are not counted as domains.
- Payment handles written as text (`Venmo @name`, `$cashtag`, "pay me on Zelle") are not machine checked. Template A.3 forbids directing buyers to pay outside checkout in any form, so these fall to fan reports (type Store policy) and the Safety queue (R2), and removal under the Adult Content Policy falls back to standard mode.
- No HTML, images or embeds. Markdown renders headings, lists, bold and italics only.
- All required confirmations ticked, or refuse with `policy_confirmations_missing` and the list of missing keys.

Client copy, shown above the field it concerns (SP-Q8, SP-Q9):

| Code or rule | Where | Copy |
|---|---|---|
| Link found while typing | Above the text field, the link highlighted in the text | "Your text links to {host}. Only amped.bio links and email addresses are allowed. Remove the link to publish." |
| `policy_external_link` from the server (stale client, upload, agency draft) | Above the text field, field scrolled to the first link | "We could not publish. Your text links to {host}. Only amped.bio links and email addresses are allowed. Remove the link and publish again." |
| `policy_confirmations_missing` from the server | Above the confirmations, each missing one outlined in danger | "We could not publish. Tick every confirmation, then publish again." |
| `policy_rate_limited` (10 publishes a day) | Above the Publish button, Publish disabled | "You published 10 times today. You can publish again at {time}." `{time}` is `resetAt` in the creator's time zone |
| Footnote under Publish | Always | "Publish needs every confirmation and no links outside amped.bio." |

Amped does not review or approve custom text before it publishes. Reports on a store policy go to the Safety queue (#28 R2) as type Store policy. Removal under the Adult Content Policy falls back to the standard mode with the creator's last standard settings.

**Agency drafts.** An agency (#38) may edit and save a draft. Publish shows to the agency as disabled with "Only {creator display name} can publish the store policy, because it speaks in their name." The creator sees "{agency} edited your draft on {date}. Review and publish." on the Policy tab.

### 3.2 Fixed notice

Shown above every store policy, on every theme, in a neutral band the creator cannot restyle (sp4):

> Sold by {seller_name} on Amped.bio. Your purchase is from {seller_name}, not from Amped. The Amped.bio Terms, the Contract between Fan and Creator and the Adult Content Policy also apply, and they prevail if anything in this store policy conflicts with them.

- One constant renders it everywhere (SP-Q1, SP-Q15, SP-Q23): `STORE_POLICY_NOTICE` in `packages/constants/src/store.ts`, filled only with `{seller_name}`, rendered by one component `<StorePolicyNotice>` in `@repo/ui`. The editor preview (sp1), the public page (sp4) and the policy sheet (sp6) all use it. No surface shortens, splits or restyles it. No uppercase heading is drawn above it.
- The standard policy text below it renders Part B in full with the fields filled, sentence for sentence. Long text scrolls inside its frame with a scroll cue. Sentences are never trimmed (SP-Q2, SP-Q16).
- Band style (SP-Q44): the Prism `prism-notice` material with a `legal` variant: `warning-bg` fill (#FBF1DC), a 1.5px `ink` rim (#16152B), `ink` text, r13, Figtree 16/24 on desktop and 14/21 on phone. It ignores the creator theme. The rim and fill together keep at least 3:1 against any theme background (worst case 3.9:1). The `legal` variant is a Prism v1.1 addition composed of existing tokens; it needs Rob's written approval before merge (PRISM.md header).

### 3.3 Versions

- Publish writes a `StorePolicyVersion` with the rendered text, mode, settings, confirmations and time. Drafts autosave and are never shown to fans.
- `Purchase.storePolicyVersionId` and `Membership.storePolicyVersionId` record the version in force at quote time.
- A receipt and the fan's Library purchase row link to that version (`/{handle}/store/policy?v={n}`).
- Template text changes ship as a new `STORE_POLICY_TEMPLATE_VERSION`. Standard stores re render on their next publish; the app prompts the creator to republish within 30 days, and the old version stays live until then.
- Template update notice (SP-Q47), on the Policy tab and the phone Policy screen: "Amped updated the standard store policy text. Review the changes and publish by {date} to keep your store open for new products." Buttons: Review and publish (opens the preview with the changed sentences marked), Not now.
- Day 31 without a republish: the old version stays live and in force for every sale. The creator cannot publish new products or plans until they republish, and the go live checklist step 6 shows "Republish your store policy". When counsel marks a template change `required`, new sales pause on day 31 instead, with the Store paused notice, until the creator republishes. Existing memberships renew on the version they joined under.
- Past versions (SP-Q17): `/{handle}/store/policy?v={n}` stays readable, whatever the store state (live, paused, suspended or deleted with retained records), to the creator and to any signed in fan with a Purchase or Membership on that version. Everyone else gets not found for a paused or suspended store. A past version shows the banner "Version {n}, in force {from} to {to}. See the current policy." The link "See the current policy" shows only when the store is live.
- Loading: the Policy tab, the public page and the policy sheet show the Prism `Skeleton` (line fill, `delayMs={400}`) for the band and the text. The band skeleton has the band's size so nothing jumps.

### 3.4 Where fans see it

| Surface | What shows | Board |
|---|---|---|
| `/{handle}/store/policy` | Notice band, policy, version and date. Indexed when the store is live | sp4 |
| Storefront | Buying here card (seller name, refund summary, policy link) replaces the refund line in About. Fixed in the section order. Footer gains Store policy | sp5 |
| Product page | "Sold by {seller}. Store policy" under Buy | sp5 |
| Pay sheet and join sheet | Seller line above the commit button; Store policy opens the version in a sheet and returns to Pay | sp6 |
| Receipt email | Seller name and the version link | |
| Fan Library purchase row | Store policy at purchase | |

Refund summaries are constants in `packages/constants/src/store.ts` (`REFUND_SUMMARY`), reused on the Buying here card and the Sales refund menu (C10). No surface writes its own (SP-Q19, SP-Q20):

| Option | Summary |
|---|---|
| Standard A | "You buy from {seller}. Sales are final. If an item does not open or is not as described, message me within 7 days." |
| Standard B | "You buy from {seller}. You can ask for a refund within {refund_days} days of purchase, for any reason." |
| Custom | "You buy from {seller}. See the store policy for refunds." |

Every policy link (Read the store policy, the product page Store policy, the footer and the pay sheet line) has a 44 high hit area (SP-Q21, SP-Q28).

Footers (SP-Q18, SP-Q22, SP-Q46): the storefront and the public policy page show Store policy and Report store; the product page shows Store policy and Report item (with the item reasons of adult content review 7.1). When 18+ is on, every one of these footers also shows Adult Content Policy, 2257 statement and Take It Down (R3 and L1). Report store offers "Store policy breaks the rules" (adult content review 7.1).

Access line (SP-Q45): the policy grants a licence, not ownership (Part B section 3). The pay sheet and product page access line for one time purchases reads "In your Library" until counsel picks the word (For counsel, item 3). "Yours to keep" is withdrawn from the approved words.

### 3.5 Go live (sp7)

The st1 checklist (content spec 3.8, decision 22) gains two steps after #419's item 5 (seller check). Every step shows its number 1 to 7 in the C9 order of `store-catalog.md` section 2; a done step keeps its number beside the check (SP-Q31):

1. Seller terms accepted.
2. USDC on Base ready in your wallet.
3. Email verified.
4. One active product or membership plan.
5. Seller verified (Authbase and RNS name).
6. Store policy published.
7. Adult setup complete. Sub line: "Over 18, seller verified, Adult Content Policy accepted, custodian of records named." Shown only when the store has an 18+ product, so the label carries no condition (SP-Q30, SP-Q35).

`store.setLive` enforces both on the server. Step 7 passes only when `CreatorAdultProfile` has `enabledAt`, the current `ADULT_POLICY_VERSION` and a custodian of records (adult content review 5.1 and acceptance 1).

Owner of step 7 (SP-Q32): R4 `feat/adult-setup`. C9 ships the step behind `adultSetupStep(creatorUserId)` in `apps/server/src/services/store/goLive.ts`, a stub that returns `not_required` until R1 lands `CreatorAdultProfile`; R4 replaces the stub with the real rule. The step's Open action links to Adult setup (ar3).

Open Policy and Open Adult setup are 44 high link buttons. Go live uses the Prism disabled button (40% ink, dashed ring, no shadow) until every step passes. The phone version sits on board k1 (SP-Q33, SP-Q34).

### 3.6 Data

```prisma
model StorePolicyVersion {
  id              Bytes    @id @db.Binary(16)   // UUIDv7
  creatorUserId   Int      @map("creator_user_id")
  version         Int                            // 1, 2, 3 per creator
  mode            String   @db.VarChar(8)        // standard | custom
  templateVersion Int?     @map("template_version")
  settings        Json                           // seller name source and value, refund option and days, contact
  confirmations   Json?                          // custom only: six booleans and the time
  renderedText    String   @db.Text @map("rendered_text")
  publishedAt     DateTime @default(now()) @map("published_at")
  @@unique([creatorUserId, version])
  @@map("store_policy_versions")
}
```

- `StoreSettings` gains `policyDraft Json?` and `livePolicyVersionId Bytes?`.
- `Purchase` and `Membership` gain `storePolicyVersionId Bytes?`. `CheckoutIntent` gains the same, set at quote.
- Constants in `packages/constants/src/store.ts`: `STORE_POLICY_TEMPLATE_VERSION = 1`, `STORE_POLICY_MAX_CHARS = 20000`, refund day options.
- Kept for the life of the account plus the retention period counsel set for sales records. Account deletion (#13) keeps versions referenced by a Purchase or Membership.

### 3.7 Procedures

`store.policy.get` (owner), `store.policy.saveDraft`, `store.policy.preview`, `store.policy.publish`, `store.publicPolicy({ handle, v? })` (public, explicit fields). Publish is rate limited to 10 a day per creator.

## 4. Performer release

### 4.1 Flow (sp8, extends adult content review 5.2 and board ar5)

1. The creator adds a person in People and shares the invite link.
2. The person signs in and passes the Authbase Over 18 check.
3. The person sets the options from release sections 3 to 5, with the release's own labels (SP-Q42): Store (one time purchase), Memberships, Paid messages, Broadcast, Live stream; Nowhere else, or Also on with a text field (1 to 120); May be shown or Must not be shown; Creator may tag @handle, or No tag; No payment, A fixed fee (amount field in USD, paid by the creator outside Amped), or A revenue share (percent of the creator's share, 1 to 50, stored as bps).
4. The person reads the full release (SP-Q37): `RELEASE_VERSION` 1 Part B, sentence for sentence, with every field filled (parties, content description, production dates, item reference, check date and reference, governing law) and the chosen options shown as ticked boxes. The text scrolls inside the screen; Sign stays disabled with "Read to the end to sign" until the end of the text is reached. Then the person confirms they gave the creator their ID and every name used, ticks consent, and types their full legal name. Sign release is the `lg` primary button (indigo, 55). It is not the commit color (SP-Q43).
5. After signing, both parties get a copy (release section 12): a PDF of the filled text and both signature times, emailed to each party and kept under Account, Appearing in (performer) and People (creator).
6. The creator countersigns in People, on phone and desktop. The person is Ready for that creator only after the countersignature.

HELD (SP-Q36, Rob and counsel): whether the release is signed per item (at submit, when the creator tags the person) or per creator (at the People invite). The release text names one item and its production dates. Until the decision, boards fill `{item_reference}` and `{production_date}` from the item the creator tags, and this section, adult content review 5.2 and sp8 keep their current wording on Ready.

States the boards draw (SP-Q41): invite link expired or used ("This invite has expired or was used. Ask {creator} for a new link."); Over 18 not passed (Try again, Get help); under 18 ("You cannot appear in 18+ content on Amped." No retry, nothing about the creator's content shows again); withdrawal from Account, Appearing in (confirm sheet: "Withdraw consent for {creator}'s content? The content is hidden at once and {creator} must take it off sale everywhere within 48 hours."); the creator's People row Waiting for {person} to sign; Countersign with the release text; the countersign refusal (4.2).

### 4.2 Effects in the product

- Surfaces: an item with this person cannot be placed on a surface the release does not allow. The item editor greys those surfaces out with "Not allowed by {person}'s release".
- Face not shown and No tag are shown to the reviewer on the case view (ad2) as checks.
- Revenue share (SP-Q40): the release states a percent of the creator's share. Store it as `shareOfCreatorBps` (100 to 5,000) in `releaseOptions`. At quote, the split builder (PAY-2) computes the partner row as `floor(creatorBpsBeforePartners * shareOfCreatorBps / 10000)` and takes it from the creator row, after the platform fee and any promoter rows.
- Countersign check: refuse when the worst case breaks the contract. Worst case is the maximum platform fee (`MAX_FEE_BPS`, 1,000), the maximum promoter row the creator has enabled (C12) and every partner row already Ready on that item. Refuse when the creator row would fall under `minCreatorBps`, or the row count would exceed `maxRecipients`. Read both from the AmpedPay contract (`minCreatorBps()`, `maxRecipients()`), cached per quote window; never a fixed 6 or 5,000 in app code (`packages/contracts/src/AmpedPay.sol`, `packages/constants/src/payments.ts` defaults are fallbacks only).
- Countersign refusal copy, on the People countersign screen: "This share would leave you under the 50% minimum on a sale with a promoter. Ask {person} to lower it, or turn off promoters for this item." and "This item already has the most people who can be paid per sale ({max}). Remove a paid row first."
- Withdrawal from Account, Appearing in, or the report form ("I appear in this and withdraw consent") hides every item with that person on receipt and opens a case per item (adult content review 7.4).

### 4.3 Data

`AppearingPerson` (`docs/features/adult-content-review.md` section 10) carries `releaseOptions`, `idGivenConfirmedAt`, `creatorSignedAt` and `releaseVersion`. `CreatorAdultProfile` carries the custodian of records. Amped never stores an ID image.

- Check reference (SP-Q38): `IdentityCheck` (`packages/database/prisma/schema.prisma`) keeps one row per user and kind and overwrites it on each check, with no reference column. R4 adds `checkReference String? @db.VarChar(64)` and `checkDate DateTime?` to `AppearingPerson`, copied from the Authbase result at signing (the `age_over_18` check that admitted the person), and R1 adds `reference String? @db.VarChar(64)` to `IdentityCheck`, written by `checkIdentity`. The release fills `{check_date}` and `{check_reference}` from the `AppearingPerson` snapshot, never from the live row.
- IP address (SP-Q39): release section 10 lists what Amped stores and does not list the IP. R4 does not store `releaseIp` until counsel adds it to section 10 with a `RELEASE_VERSION` bump (For counsel, item 4). The privacy notice entries for R4 list the stored fields of section 10 only.
- Signed copy: R4 stores the filled release text (`releaseText`) and its sha256 on `AppearingPerson`, so the copy each party receives is the text they saw.

## 5. PRs that need this

### 5.1 Open PRs

| PR | Change |
|---|---|
| #412 `docs/mobile-checkout` (CK-0) | Add the seller line and policy sheet to c1 section 5, `storePolicyVersionId` on the intent, the "{seller} updated their store policy." state beside Price changed, and the membership checkbox wording naming the store policy. Seller line (SP-Q24), one text in three places: CK-2 "Sold by {seller} on Amped.bio. You buy from {seller}, not Amped." CK-5 adds "Refunds follow the store policy." and a 44 high Store policy link row. Section 5 of `mobile-checkout.md` drops "Refunds are at {seller}'s discretion." (edit on #412, not in this PR). The c1 order keeps Balance after between the fee row and the seller line, and the amount uses the system font with tabular numbers and the USDC tag (SP-Q26) |
| #414 `feat/pay-route` (CK-2) | Seller line only: "Sold by {seller} on Amped.bio. You buy from {seller}, not Amped." No policy link yet, because `StorePolicyVersion` lands in C9. No migration. #416 and #417 rebase on it. Board sp6 tags CK-2 (line, display name) and CK-5 (sheet, version) on each phone (SP-Q29) |
| #419 `docs/store-c9-identity` | C9 spec: checklist step 5 is the seller check, so store policy and adult setup become steps 6 and 7. sp5 sits on the phone boards s2 and s3 that replace st6 and st8. Add the policy fields and route to `store-catalog.md`. Edits still due on #419 (QA 3 Nov): item 7 reads "Adult setup complete (Over 18, seller verified, Adult Content Policy accepted, custodian of records named)" (SP-Q30); section 3a builds item 7 as the `adultSetupStep` stub only, R4 owns the rule (SP-Q32); k1 carries the numbered steps 1 to 7 (SP-Q31, SP-Q33) |
| #418 `docs/content-gating-c8` (C8) | Item editor: a surface not allowed by a person's release is refused at rule writing. One line in the C8 spec; no build change until R4 |
| #411 `feat/message-door` (M6) | None to build. The store policy contact uses the Message me door as the default contact |
| #413 `feat/messages-admin` (M7) | None to build. Store policy reports go to Safety, not Messaging admin |

### 5.2 Planned PRs

| PR | Change |
|---|---|
| C9 `feat/store-catalog` | Main home: `StorePolicyVersion` migration, `StoreSettings` fields, Policy tab (sp1 to sp3), `/{handle}/store/policy` (sp4), Buying here card and footer link (sp5), product page line, go live step 6 and the step 7 stub (sp7, 3.5), procedures in 3.7, `STORE_POLICY_NOTICE`, `REFUND_SUMMARY` and `findPolicyLinks` constants. Migration label |
| PAY-2 `feat/payments-core` | `Purchase.storePolicyVersionId` and `CheckoutIntent.storePolicyVersionId` columns (CheckoutIntent merged in CK-1 #399, so this is a new migration on it). Receipt email shows seller name and the version link. Performer revenue share rows in the split builder (4.2). Code today (SP-Q29): `CheckoutIntent` in `packages/database/prisma/schema.prisma` has no version column; `getIntent` in `apps/server/src/services/checkout/intents.ts` returns title, handle and display name only (`CheckoutItem`), and `resolveTarget` refuses every adult item. PAY-2 adds `storePolicyVersionId` to the intent and sets it in `startIntent` and on each quote; CK-5 returns `sellerName` and `storePolicyVersion` from `getIntent` (`apps/server/src/trpc/checkout.ts`). The adult refusal stays until A1 |
| CK-5 `feat/checkout-live` | Policy link and sheet on the pay sheet (sp6), version stored at quote, the policy changed state, carry the version from intent to Purchase |
| C10 `feat/store-sales` | Refund menu shows the creator's refund option with `REFUND_SUMMARY`. Sales CSV gains the policy version. Report store policy reaches Safety: `ContentReport` reasons gain `store_policy` ("Store policy breaks the rules") (SP-Q48) |
| MB-1 `feat/memberships-core` | `Membership.storePolicyVersionId`. Renewal reminder email links the policy. Join sheet seller line |
| MB-2 `feat/store-membership` | Section 5 of the standard policy renders only with an active plan |
| MB-3 `feat/library-money` | Store policy at purchase on Library rows |
| C12 `feat/store-promoters` | Promoter and performer rows share the 6 recipient cap; the code screen shows how many rows are left |
| R1 `feat/safety-foundation` | Case type Store policy. `ADULT_POLICY_VERSION` set to the v1.1 text |
| R3 `feat/takedown` | Withdraw consent reason on the report form. Footer links to the Adult Content Policy, the 2257 statement and Take It Down |
| R4 `feat/adult-setup` | Release text v1 shown in full before signing, release options, copies to both parties, countersignature with the cap and floor check, check reference snapshot, surface limits in the item editor (4.1 to 4.3). Go live step 7 rule in place of the C9 stub (3.5). Privacy notice entries before it ships, with a `CONSENT_POLICY_VERSION` bump. The F1 fix (`explicitAt`, adult content review) merges before R4 (SP-Q48) |
| R5 `feat/safety-creators-appeals` | Removing a custom store policy as an enforcement action, with the fallback in 3.1 |
| L1 `feat/legal-pages` (new, 1 day) | Landing pages for the Adult Content Policy and the public 2257 statement (COUNSEL-ADULT 6.7) at the approved placement, footer links on every page. Can merge into R3 if Gustavo prefers |
| A1 | The COUNSEL-ADULT gate is cleared by counsel. A1 still waits for the operational items in COUNSEL-ADULT 10.3 |

### 5.3 Specs to edit

- `docs/features/content-system.md` 3.8: Buying here card, footer link, policy route (edited in this PR). The go live list points to `store-catalog.md`.
- `docs/features/store-catalog.md` (#419): go live items 6 and 7 and section 3a, the C9 scope (done on #419).
- `docs/features/mobile-checkout.md` (#412): seller line, CK-5 policy sheet and version, join checkbox (done on #412, revision 2).
- `docs/features/adult-content-review.md`: first repo copy, revision 2, with release options, countersignature, custodian step and the new case types (this PR).
- `docs/legal/privacy-parameters.md`: release options and store policy versions as stored data (with R4).
- Agency System (#38): an agency may edit a draft store policy; only the creator can publish it, because it speaks in the creator's name.

## 6. Acceptance

1. A store cannot go live without a published store policy, and the API refuses `store.setLive` when the client is bypassed.
2. A custom policy with an outside payment link or a missing confirmation cannot publish.
3. Every Purchase and Membership created after C9 and PAY-2 has a `storePolicyVersionId`, and its receipt link opens that exact version.
4. The fixed notice shows above every store policy on every theme and cannot be removed by the creator.
5. Section 9 shows exactly when 18+ is on, and names no 18+ item.
6. A person is not Ready until both signatures exist, and an item cannot be placed on a surface their release excludes.
7. A performer revenue share that breaks the recipient cap or the creator floor is refused at countersign.
8. Copy on every new surface has no em or en dashes, no banned money words, and every control is at least 44 high.
9. The fixed notice text on the preview, the public page and the policy sheet is byte for byte `STORE_POLICY_NOTICE` with `{seller_name}` filled, and the standard text is byte for byte Part B with the fields filled. A unit test compares both with `docs/legal/creator-storefront-policy.md`.
10. A custom policy with a bare domain (`paypal.me/x`) or a spaced domain (`cash . app`) cannot publish; one with only `amped.bio` links and an email address can.
11. A fan with a purchase on version 3 can open `?v=3` after the store pauses.
12. A performer cannot sign until the full filled release has been scrolled to the end, and both parties get the same copy.
13. A revenue share that fits today but breaks the floor with the maximum fee and promoter row is refused at countersign.
14. Desktop editor boards are drawn at 1440 in the Prism shell and phones at 390, with no horizontal scroll.

## For counsel

Drafted for counsel. Nothing here is on a board as final text.

1. Seller name (SP-Q6). A creator may type a legal or business name (for example Lin Studio LLC) that becomes the seller of record name on the notice and receipts. Amped does not check it against Authbase or a business register. Does a business name need a check (for example a match to the Authbase verified name, or a declaration "I am authorised to sell as {name}") before it names the seller?
2. Store title (template A.4). With the default `{store_name}` "{seller_name} Store", the Part B title reads "{seller_name} Store Store Policy". May the renderer use `{seller_name}` in the title when the store title is the default? Boards use a store titled with the seller name until counsel answers.
3. Access word (SP-Q45). The approved access line "Yours to keep" predates Part B section 3 (licence, not ownership; kept while the item is in the store and the account is in good standing). Proposed: "In your Library". Alternatives: "Ongoing", "Keep in your Library".
4. Signer IP (SP-Q39). Should Amped store the signer's IP address as signature evidence? If yes, add it to release section 10 with a `RELEASE_VERSION` bump. Until then R4 does not store it.
5. Release scope (SP-Q36, held). Per item (signed when the creator tags the person on submit) or per creator (signed at the People invite). The text names one item and its production dates. Needs Rob and counsel.

## Revision log

- 2026-11-03: Revision 3. QA fixes SP-Q1 to SP-Q49 except SP-Q36 (held): one notice constant and band, seller name for both modes, link detector and publish errors, template update and day 31, past versions, refund summaries, footers, go live numbering and step 7 owner, release shown in full before signing, check reference, IP, revenue share bps, countersign states, For counsel list.
- 2026-11-03: Revision 2. Checklist steps renumbered 6 and 7 after #419; CK-2 carries the seller line only; policy sheet and version move to CK-5; #419 added.
- 2026-11-03: Revision 1. Store policy modes, versions, surfaces and go live steps; release options and countersignature; PR map.
