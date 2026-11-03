# Store catalog (content PR 9): changes before build

Build Board #20 (Content system) and the identity checks card. PR C9, branch `feat/store-catalog`.
Revision 3, 3 Nov 2026 (Full QA fixes, rows 157 to 166). Baseline: `development` at 98db33f.

This file records what changed for content PR 9 since `docs/features/content-system.md` was written on 12 Oct. That file is too large to edit through the connector, so this one lists each change and supersedes the text it names. The next PR that edits `content-system.md` folds these changes into it. Checkout changes to 3.8 and 3.9 are in `docs/features/mobile-checkout.md` section 16 (#412), not here.

Supersedes:

- `content-system.md` decision 22 (store visibility) and the 18+ bullet in 3.6, with sections 1 and 3 below.
- The board references in the PR 9 paragraph of 3.16, with section 4.
- `content-system.md` 3.2 `PLATFORM_FEE_BPS`, the 3.8 refund line and Storefront settings fields, and the amount and access copy in 3.8 and 3.11, with section 6.
- `docs/fixes/content-system-authbase.patch`, which this PR deletes. That patch was never applied. Its line "Every payee on the split table passes the same check" is wrong since decision S4 (creator only).

## 1. Seller check (S1, S4, S5, RN1)

The source of truth is `docs/features/identity-checks.md` sections 5.1 to 5.4. For C9:

- **Rule.** A creator can activate an offer or turn the store live only as a verified seller: Authbase VERIFIED (either tier, S2) on the wallet that receives USDC, **and** an active RNS name bound two ways to that wallet and the creator's page (S1, X-Q1, Rob 3 Nov). Only the creator is checked (S4). Promoters and partners on the split are not. When the name is bound one way, the Get paid card shows Publish to your name (identity checks 5.2, reason `name_not_linked`).
- **Where it runs.** `store.products.setStatus` to active and `store.setLive` call `checkIdentity(creator, "seller", { fresh: true })`. A fail refuses with the reason and opens the Get paid card (the Verify to sell sheet on phone, board st3d). The API refuses even when the client is bypassed.
- **The quote is the hard stop (ST-Q50).** Today `getQuote` in `apps/server/src/services/checkout/quote.ts` (lines 152 to 156) sets state `seller` only when the creator has no wallet or is outside the pilot list. Required change, built in C9 with offers on the intent: before `ready`, call `checkIdentity(resolved.creatorUserId, "seller")` (cached read is fine for the quote) and set state `seller` when it fails. `pay.prepare` and the split signer run the same check fresh and refuse to sign. The pay sheet shows c8 "@{handle} cannot take payments right now. Nothing was taken from your wallet."
- **Get paid card** (identity checks 5.2, design page LUnttKDFQVAgSjenbQu8FM). Two rows, Identity and RNS name, phone first, on the Store tab and the Memberships setup.
- **Where sellers get the name (S5, Rob 3 Nov).** The RNS name row deep links to the Wallet Names tab (`RegisterFlow.tsx`) with the creator's handle prefilled as the label. When the name is owned but not bound, the row offers "Point {name} to this wallet". There is no registration step inside the card. Returning from the Names tab runs a fresh check.
- **Network (RN1, Rob 3 Nov).** RNS names are held on testnet and mainnet. The product, selling included, runs on testnet with testnet names until the mainnet go live. The seller check reads the RNS chain of the environment. Staging sells on testnet names.

## 2. Store visibility (replaces decision 22)

A store goes live when the creator:

1. accepts the seller terms,
2. has a USDC address on Base,
3. has a verified email,
4. has one active product or an active plan,
5. passes the seller check in section 1,
6. has published a store policy (section 3a),
7. has completed adult setup, only when the store has an 18+ product (Over 18, seller verified, current `ADULT_POLICY_VERSION` accepted).

Before that, the Store tab shows the go live checklist (boards st1a, st1c, k1d) and the public route returns not found. On phone, done steps fold into one row so steps 5 to 7 stay in view. Item 5 opens the Get paid card, item 6 the Policy tab, item 7 Adult setup. `store.setLive` enforces all seven on the server. While the `storeSales` feature flag is off, the store renders for its owner in preview only (unchanged from PR 9). `storeSales` is a new entry in `packages/constants/src/feature-flags.ts` (`scope: "public"`, `default: false`, `env: {}`), added when sales are built and switched in admin › Feature flags with no rebuild or redeploy; no `STORE_SALES_ENABLED` variable. The server reads it with `isFeatureOn("storeSales")` (`apps/server/src/services/featureFlags.ts`), the client with `isFeatureOn("storeSales")` (`apps/client/src/config/featureFlags.ts`), the landing app with `useFeatureFlag("storeSales")`.

## 3. 18+ items (replaces the 18+ bullet in 3.6)

- Storefront and store block (ST-D1, decided by Rob 3 Nov): for viewers without a pass, one Adult items card with no title, cover or count opens the Over 18 sheet, as on the bio (identity checks 4.4). 18+ products load through a signed in client call after the pass. The store block never lists an 18+ product. Boards st6b (s2b), st7a, st8e (s3e), st10a.
- **Interim statutory text (AD-D1, Rob 3 Nov). Interim, pending counsel.** Source: Alabama Act 2024 HB 164 (enrolled), Section 9, effective 1 Oct 2024; the adult website threshold is more than 33 1/3 percent of content harmful to minors (Section 2). Counsel's written answer on whether and where it applies is open. Until then:
  - The three Section 9(a)(1) warnings show on the Over 18 sheet opened from the store or store block and on the landing of every 18+ product page, to every viewer. Constant `ALABAMA_HEALTH_WARNINGS` in `packages/constants/src/compliance.ts`.
  - The Section 9(a)(2) helpline (two lines) shows on every 18+ page. Constant `SAMHSA_HELPLINE_NOTICE` in the same file.
  - Section 9(c): body 16 or larger, full contrast on the creator surface, never collapsed or behind a toggle.
  - The text is verbatim statute. It is not edited, and the dash and banned word checks in `scripts/check-compliance-copy.ts` exempt these two constants. Boards st8d (s3d) and st8e (s3e).
- Product editor: 18+ comes from the items and cannot be turned off on the product. Activating an 18+ product needs the creator's Over 18 and seller passes, adult setup, and a valid release with this creator for every performer tagged on its items. A missing release refuses with `release_missing` naming the performer (Rob 3 Nov; board st3b).

- Public lists, `getReadUrl` and `getPreview` refuse 18+ items for viewers without a passed Over 18 check: `checkIdentity(viewer, "age_over_18")`, built in I1 and wired through the gating engine (`docs/features/content-gating.md`).
- A creator turns on the 18+ label only with their own Over 18 and seller passes (identity checks A2). A1 builds this.
- An 18+ product is never in the sitemap, `llms.txt`, JSON-LD or share tags. Its product page renders only behind the age gate.
- Counsel approved COUNSEL-ADULT v1.1 on 3 Nov 2026 (`docs/legal/adult-content-policy.md`). 18+ go live still waits on the operational items in its section 10.3. C9 does not change that gate.

## 3a. Store policy (new in C9)

The creator is the seller of record, so every store carries a store policy in the creator's name. Full spec: `docs/features/store-policy.md` sections 3.1 to 3.7. Template: `docs/legal/creator-storefront-policy.md`. C9 builds:

- Migration: `StorePolicyVersion` (UUIDv7), `StoreSettings.policyDraft` and `StoreSettings.livePolicyVersionId`. Label `migration`.
- Store tab, fifth tab Policy: Standard (seller name, refund option, contact) or Own policy (paste or upload, six confirmations, outside payment links refused). Boards sp1 to sp3.
- `/{handle}/store/policy` with the fixed Sold by notice, version and date (sp4).
- Storefront Buying here card in place of the refund line, Store policy in the footer, and the line under Buy on the product page (sp5, on s2 and s3).
- `store.policy.get`, `saveDraft`, `preview`, `publish`, and the public `store.publicPolicy`.
- Item 6 of the go live checklist (sp7).

Not in C9: the policy link on the pay sheet (CK-5), the version on Purchase and CheckoutIntent (PAY-2), and on Membership (MB-1).

## 4. Boards

The 24 Oct phone boards replace the phone layouts drawn on 12 Oct:

| Board | Surface | Screen Review row | Replaces |
| --- | --- | --- | --- |
| s2 | Storefront, phone (redrawn 3 Nov: Buying here, footer Store policy, Adult items, seller lapsed) | 162 | st6 |
| s3 | Product page, phone, sticky buy bar (redrawn 3 Nov: Sold by line, member, owned, 18+) | 164 | st8 |
| k1 | Creator Products, quick editor, Verify to sell, seven step go live, seller lapsed | 157 to 159 | Phone versions of st1, st2, st3 |
| sp1 to sp3 | Store tab Policy, desktop and phone | 322 to 324 | New |
| sp4 | Public store policy page | 325 | New |
| sp5 | Buying here card, footer, product page line (on s2 and s3) | 326 | Refund line on s2 |
| sp7 | Go live checklist items 6 and 7 (on k1 and st1) | 328 | New rows on k1 |

Store policy boards: https://claude.ai/artifact/TErq8QL9fn31ENpgo6nD1r

Desktop boards stay, redrawn 3 Nov in the Prism shell with 390 frames: st1 (Storefront settings and go live), st2 (Products), st3 (product editor, 18+ refusal), st4 (Membership, seller status), st5 (Sales), st7 (storefront), st10 (store block). Creator Store boards: https://claude.ai/artifact/TFx1jSi932KWNxij8StSYj. st9 (the pay sheet) is replaced by the mobile checkout boards c1 to c8 (#412); st9a and st9b keep the store side only (seller line as built in CK-2, policy link in CK-5). k2 (Sales and refund) belongs to PR 10.

## 5. Open before C9 build

| Item | Owner | Blocks |
| --- | --- | --- |
| Storefront settings sheets on phone and desktop (PR plan design gate) | Design | C9 build |
| C8 merged (`docs/features/content-gating.md`) | Engineering | C9 merge |
| Authbase written answers (method, re-verification, retention, anonymized result) | Authbase team | 18+ go live only. Not C9 |
| RNS mainnet in `AVAILABLE_CHAINS` | Rob, Revolution team | First mainnet sale only |

## 6. Copy, amounts and states for the store surfaces (Full QA, 3 Nov)

Supersedes the text named at the top of this file. Source: findings ST-Q1 to ST-Q54 (`qa2/store/qa.md`).

**Amounts and plans.**

- Amounts read `$18 USDC` on every store and editor surface (decision D6), from `usdcDollarsLabel` in `packages/constants/src/checkout.ts`. Rows under a tagged headline may read `$0.90`. Replaces "Amounts read `3 USDC`" in `content-system.md` 3.8 and 3.11.
- The 30 day plan reads "every 30 days", the yearly plan "a year". Never "a month", "monthly" or "per member". Creator lines: "You receive $4.75 USDC per renewal", tile "Every 30 days, after fee".
- Buy buttons carry the amount: "Buy $18 USDC". Join on the store reads "Join" beside the amount line.

**Fee.** There is no `PLATFORM_FEE_BPS` constant on development. The fee is the payment setting `platform_fee_bps` (`packages/constants/src/payments.ts` lines 139 to 148, admin, with an effective date), read through `payments.quote`. The product editor and plan editor lines "You receive $N USDC after the Amped.Bio fee of 5%" take the percentage and the net from the same setting through a new `store.feePreview` read (private, returns `{ feeBps }`).

**Access line.** "In your Library", "Access for 30 days", "Access for 365 days". "Yours to keep" is withdrawn pending counsel (SP-Q45, For counsel below).

**Storefront settings (st1).**

- Fields: store name (40), tagline (80), banner, layout, section order, featured (up to 3), About, thank you note. The Refund line field is removed. Refunds come from the store policy; Buying here is fixed in the section order and shows `REFUND_SUMMARY` for the live version.
- Store tab sub tabs on desktop and phone: Storefront, Products, Membership, Sales, Policy. On phone they wrap to two rows.
- States: seller lapsed notice "Not taking payments right now." naming which date ended, with Renew in Wallet or Open Get paid; storeSales flag off "Preview only. Store sales are not switched on yet. Only you can see your store."; autosave failed "Not saved. Check your connection." with Try again.

**Products (st2) and the product editor (st3).**

- Statuses: Active, Draft, Archived, Needs a release, Verify to sell. An 18+ chip on products with 18+ items. Empty state "No products yet" with New product and Go to Library.
- Errors: slug taken "That address is in use in your store."; amount out of range "Enter $0.50 to $1,000 USDC."; bundle full "A bundle holds up to 50 items."; removing an item from a bundle with buyers in access "Archive this product and make a new one."; Also in membership without an active plan is disabled with "Set up a membership first."
- Product card preview shows "Buy $N USDC" and "Sold by {seller}. Store policy".

**Membership (st4).** Opens with the seller status row (Verified seller, Authbase valid until, RNS name active until, Get paid). Lapsed: "Not taking new members right now." New joins and renewals pause; members keep access to period end. Recurring terms: "Members renew every 30 days or every year until they cancel. They get a reminder 3 days before each charge. New amounts apply to new members only."

**Sales (st5, k2, PR 10).** Status Pending until final, then Final, or Refunded (D4). The refund sheet shows "Your store policy:" with the `REFUND_SUMMARY` of the version on the purchase. Export CSV includes the store policy version per sale.

**Seller line on the pay sheet (CK-D1, Rob 3 Nov).** Counsel sentences only after the seller line: "Sold by {seller} on Amped.bio. You buy from {seller}, not Amped." From CK-5 add "Refunds follow the store policy." and the Store policy link. "Refunds are at {seller}'s discretion." is dropped and "Payments are final." is not restored. Build change: `CHECKOUT_COPY.soldBy` in `packages/constants/src/checkout.ts` (lines 157 to 158) drops its last sentence, and the `Pay.test.tsx` match stays on the first two. Boards st9a and st9b.

**Storefront and product page (s2, s3, st7).** Buying here card and footer Store policy on every store. "Sold by {seller}. Store policy" under Buy on every product page, with a 44 high link row. Members see "Included in your membership." and Open. Report item in the product page footer. The in app browser handoff is c4 (Mobile checkout, QA1); the store draws no Open in Safari button.

**Store block (st10).** Up to 6 products in a row labelled with the product count, each card a link at least 44 high, Visit store, the membership card. No 18+ products. Hidden when the store is not live or has no active products.

## 7. Acceptance (added 3 Nov)

1. `store.setLive` refuses unless all seven items in section 2 pass, with the client bypassed.
2. A creator bound one way fails the seller check with `name_not_linked` and cannot activate an offer or go live.
3. `payments.quote` returns state `seller` for a creator without a seller pass, and `pay.prepare` refuses to sign a split for that creator.
4. An 18+ product with a tagged performer who has no valid release with the creator cannot be activated (`release_missing`).
5. No store, product page, store block or editor string contains "Yours to keep", "a month", "monthly" or the word price, and every amount reads `$N USDC` (`scripts/check-compliance-copy.ts`).
6. The storefront, product page, pay sheet and receipt each name the creator as seller and link the store policy version.
7. 18+ products are absent from server HTML, the store block, sitemaps, `llms.txt`, JSON-LD and share tags for viewers without a pass.
8. The Over 18 sheet and every 18+ product page show `ALABAMA_HEALTH_WARNINGS` and `SAMHSA_HELPLINE_NOTICE` byte for byte, at 16 or larger, never collapsed (interim, AD-D1).
9. No pay sheet seller line contains "discretion" or "Payments are final" (CK-D1).

## For counsel

1. AD-D1: whether Alabama Act 2024 HB 164 Section 9 applies to Amped (adult website threshold, Section 2) and where the warnings and helpline must show. The interim text ships until counsel answers in writing.
2. Access line wording: "In your Library" in place of "Yours to keep" (SP-Q45). The store policy grants a licence, not ownership.

## Revision log

- 2026-11-03: Revision 4. Rob's decisions: ST-D1 Adult items placeholder decided, CK-D1 seller line without the refund sentence, AD-D1 interim Alabama warnings and SAMHSA helpline on the Over 18 sheet and 18+ product pages.

- 2026-11-03: Revision 3. Full QA of rows 157 to 166: two way seller binding, the quote as the hard stop with a build step in `quote.ts`, 18+ on the storefront, block and product editor, section 6 copy and states, acceptance, For counsel. Boards redrawn on the Creator Store, Creator store on phone and Store and paid cards pages.

- 2026-11-03: Revision 2. Go live items 6 (store policy) and 7 (adult setup), section 3a store policy scope for C9, boards sp1 to sp5 and sp7, counsel approval recorded. Source: #420.
- 2026-11-03: Revision 1. Seller check with S5 and RN1, store visibility item 5, the 18+ rule, phone boards s2, s3 and k1, open items. Replaces and deletes `docs/fixes/content-system-authbase.patch`.
