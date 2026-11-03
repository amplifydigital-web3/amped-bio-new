# Store catalog (content PR 9): changes before build

Build Board #20 (Content system) and the identity checks card. PR C9, branch `feat/store-catalog`.
Revision 2, 3 Nov 2026. Baseline: `development` at 0500800b.

This file records what changed for content PR 9 since `docs/features/content-system.md` was written on 12 Oct. That file is too large to edit through the connector, so this one lists each change and supersedes the text it names. The next PR that edits `content-system.md` folds these changes into it. Checkout changes to 3.8 and 3.9 are in `docs/features/mobile-checkout.md` section 16 (#412), not here.

Supersedes:

- `content-system.md` decision 22 (store visibility) and the 18+ bullet in 3.6, with sections 1 and 3 below.
- The board references in the PR 9 paragraph of 3.16, with section 4.
- `docs/fixes/content-system-authbase.patch`, which this PR deletes. That patch was never applied. Its line "Every payee on the split table passes the same check" is wrong since decision S4 (creator only).

## 1. Seller check (S1, S4, S5, RN1)

The source of truth is `docs/features/identity-checks.md` sections 5.1 to 5.4. For C9:

- **Rule.** A creator can activate an offer or turn the store live only as a verified seller: Authbase VERIFIED (either tier, S2) on the wallet that receives USDC, **and** an active RNS name bound to that wallet (S1). Only the creator is checked (S4). Promoters and partners on the split are not.
- **Where it runs.** `store.products.setStatus` to active and `store.setLive` call `checkIdentity(creator, "seller", { fresh: true })`. A fail refuses with the reason and opens the Get paid card. The API refuses even when the client is bypassed.
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

Before that, the Store tab shows the go live checklist and the public route returns not found. Item 5 opens the Get paid card, item 6 the Policy tab, item 7 Adult setup. `store.setLive` enforces all seven on the server. While `STORE_SALES_ENABLED` is off, the store renders for its owner in preview only (unchanged from PR 9).

## 3. 18+ items (replaces the 18+ bullet in 3.6)

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
| s2 | Storefront, phone | 162 | st6 |
| s3 | Product page, phone, sticky buy bar | 164 | st8 |
| k1 | Creator Products, quick editor, go live checklist with the identity item | 157 to 159 | Phone versions of st1, st2, st3 |
| sp1 to sp3 | Store tab Policy, desktop and phone | 322 to 324 | New |
| sp4 | Public store policy page | 325 | New |
| sp5 | Buying here card, footer, product page line (on s2 and s3) | 326 | Refund line on s2 |
| sp7 | Go live checklist items 6 and 7 (on k1 and st1) | 328 | New rows on k1 |

Store policy boards: https://claude.ai/artifact/TErq8QL9fn31ENpgo6nD1r

Desktop boards stay: st1, st2, st3 (Store tab), st7 (storefront), st10 (store block). st9 (the pay sheet) is replaced by the mobile checkout boards c1 to c8 (#412). k2 (Sales and refund) belongs to PR 10.

## 5. Open before C9 build

| Item | Owner | Blocks |
| --- | --- | --- |
| Storefront settings sheets on phone and desktop (PR plan design gate) | Design | C9 build |
| C8 merged (`docs/features/content-gating.md`) | Engineering | C9 merge |
| Authbase written answers (method, re-verification, retention, anonymized result) | Authbase team | 18+ go live only. Not C9 |
| RNS mainnet in `AVAILABLE_CHAINS` | Rob, Revolution team | First mainnet sale only |

## Revision log

- 2026-11-03: Revision 2. Go live items 6 (store policy) and 7 (adult setup), section 3a store policy scope for C9, boards sp1 to sp5 and sp7, counsel approval recorded. Source: #420.
- 2026-11-03: Revision 1. Seller check with S5 and RN1, store visibility item 5, the 18+ rule, phone boards s2, s3 and k1, open items. Replaces and deletes `docs/fixes/content-system-authbase.patch`.
