# Store policy and performer release

Status: spec for build, 3 Nov 2026. Drafted by Claude for Rob Frasca.
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
| `standard` (default) | Seller name source (`display` or `legal`, with `sellerLegalName` 1 to 80), refund option (`A`, or `B` with 3, 7 or 14 days), contact (Amped messages always, optional email) | Template from `docs/legal/creator-storefront-policy.md` Part B with the fields filled. Section 9 only when 18+ is on |
| `custom` | Plain text or Markdown, max 20,000 characters, and the six confirmations of template A.3 (the sixth only with 18+ on) | The creator's text, rendered as text, below the fixed Amped notice |

Custom text rules, checked on the server at publish:

- Links allowed: `amped.bio` hosts and plain email addresses. Any other URL refuses publish with `policy_external_link`.
- No HTML, images or embeds. Markdown renders headings, lists, bold and italics only.
- All required confirmations ticked, or refuse with `policy_confirmations_missing`.

Amped does not review or approve custom text before it publishes. Reports on a store policy go to the Safety queue (#28 R2) as type Store policy. Removal under the Adult Content Policy falls back to the standard mode with the creator's last standard settings.

### 3.2 Fixed notice

Shown above every store policy, on every theme, in a neutral band the creator cannot restyle (sp4):

> Sold by {seller_name} on Amped.bio. Your purchase is from {seller_name}, not from Amped. The Amped.bio Terms, the Contract between Fan and Creator and the Adult Content Policy also apply, and they prevail if anything in this store policy conflicts with them.

### 3.3 Versions

- Publish writes a `StorePolicyVersion` with the rendered text, mode, settings, confirmations and time. Drafts autosave and are never shown to fans.
- `Purchase.storePolicyVersionId` and `Membership.storePolicyVersionId` record the version in force at quote time.
- A receipt and the fan's Library purchase row link to that version (`/{handle}/store/policy?v={n}`).
- Template text changes ship as a new `STORE_POLICY_TEMPLATE_VERSION`. Standard stores re render on their next publish; the app prompts the creator to republish within 30 days, and the old version stays live until then.

### 3.4 Where fans see it

| Surface | What shows | Board |
|---|---|---|
| `/{handle}/store/policy` | Notice band, policy, version and date. Indexed when the store is live | sp4 |
| Storefront | Buying here card (seller name, refund summary, policy link) replaces the refund line in About. Fixed in the section order. Footer gains Store policy | sp5 |
| Product page | "Sold by {seller}. Store policy" under Buy | sp5 |
| Pay sheet and join sheet | Seller line above the commit button; Store policy opens the version in a sheet and returns to Pay | sp6 |
| Receipt email | Seller name and the version link | |
| Fan Library purchase row | Store policy at purchase | |

Refund summary for custom policies reads "You buy from {seller}. See the store policy for refunds."

### 3.5 Go live (sp7)

The st1 checklist (content spec 3.8, decision 22) gains two steps after #419's item 5 (seller check):

6. Store policy published.
7. Adult setup complete, only when the store has an 18+ product (Over 18, seller verified, current `ADULT_POLICY_VERSION` accepted).

`store.setLive` enforces both on the server.

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
3. The person sets the options from release sections 3 to 5: where the creator may sell (store, memberships, paid messages, Broadcast, live), other platforms, face shown or not, tag or not, payment (none, fixed fee, revenue share in bps).
4. The person confirms they gave the creator their ID and every name used, ticks consent, and types their full legal name.
5. The creator countersigns in People. The person is Ready for that creator only after the countersignature.

### 4.2 Effects in the product

- Surfaces: an item with this person cannot be placed on a surface the release does not allow. The item editor greys those surfaces out with "Not allowed by {person}'s release".
- Face not shown and No tag are shown to the reviewer on the case view (ad2) as checks.
- Revenue share: a partner row (role 3) in the split for that item's sales, inside the 6 recipient cap and the 5,000 bps creator floor. A share that breaks either refuses at countersign.
- Withdrawal from Account, Appearing in, or the report form ("I appear in this and withdraw consent") hides every item with that person on receipt and opens a case per item (adult content review 7.4).

### 4.3 Data

`AppearingPerson` (`docs/features/adult-content-review.md` section 10) carries `releaseOptions`, `idGivenConfirmedAt`, `creatorSignedAt` and `releaseVersion`. `CreatorAdultProfile` carries the custodian of records. Amped never stores an ID image.

## 5. PRs that need this

### 5.1 Open PRs

| PR | Change |
|---|---|
| #412 `docs/mobile-checkout` (CK-0) | Add the seller line and policy sheet to c1 section 5, `storePolicyVersionId` on the intent, the "This store updated its policy" state beside Price changed, and the membership checkbox wording naming the store policy |
| #414 `feat/pay-route` (CK-2) | Seller line only: "Sold by {seller} on Amped.bio. You buy from {seller}, not Amped." No policy link yet, because `StorePolicyVersion` lands in C9. No migration. #416 and #417 rebase on it |
| #419 `docs/store-c9-identity` | C9 spec: checklist step 5 is the seller check, so store policy and adult setup become steps 6 and 7. sp5 sits on the phone boards s2 and s3 that replace st6 and st8. Add the policy fields and route to `store-catalog.md` |
| #418 `docs/content-gating-c8` (C8) | Item editor: a surface not allowed by a person's release is refused at rule writing. One line in the C8 spec; no build change until R4 |
| #411 `feat/message-door` (M6) | None to build. The store policy contact uses the Message me door as the default contact |
| #413 `feat/messages-admin` (M7) | None to build. Store policy reports go to Safety, not Messaging admin |

### 5.2 Planned PRs

| PR | Change |
|---|---|
| C9 `feat/store-catalog` | Main home: `StorePolicyVersion` migration, `StoreSettings` fields, Policy tab (sp1 to sp3), `/{handle}/store/policy` (sp4), Buying here card and footer link (sp5), product page line, go live steps 6 and 7 (sp7), procedures in 3.7. Migration label |
| PAY-2 `feat/payments-core` | `Purchase.storePolicyVersionId` and `CheckoutIntent.storePolicyVersionId` columns (CheckoutIntent merged in CK-1 #399, so this is a new migration on it). Receipt email shows seller name and the version link. Performer revenue share rows in the split builder |
| CK-5 `feat/checkout-live` | Policy link and sheet on the pay sheet (sp6), version stored at quote, the policy changed state, carry the version from intent to Purchase |
| C10 `feat/store-sales` | Refund menu shows the creator's refund option. Sales CSV gains the policy version. Report store policy reaches Safety |
| MB-1 `feat/memberships-core` | `Membership.storePolicyVersionId`. Renewal reminder email links the policy. Join sheet seller line |
| MB-2 `feat/store-membership` | Section 5 of the standard policy renders only with an active plan |
| MB-3 `feat/library-money` | Store policy at purchase on Library rows |
| C12 `feat/store-promoters` | Promoter and performer rows share the 6 recipient cap; the code screen shows how many rows are left |
| R1 `feat/safety-foundation` | Case type Store policy. `ADULT_POLICY_VERSION` set to the v1.1 text |
| R3 `feat/takedown` | Withdraw consent reason on the report form. Footer links to the Adult Content Policy, the 2257 statement and Take It Down |
| R4 `feat/adult-setup` | Release text v1, release options, countersignature, surface limits in the item editor (4.1, 4.2). Privacy notice entries before it ships, with a `CONSENT_POLICY_VERSION` bump |
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

## Revision log

- 2026-11-03: Revision 2. Checklist steps renumbered 6 and 7 after #419; CK-2 carries the seller line only; policy sheet and version move to CK-5; #419 added.
- 2026-11-03: Revision 1. Store policy modes, versions, surfaces and go live steps; release options and countersignature; PR map.
