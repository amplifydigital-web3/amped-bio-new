# Authbase storefront: identity checks bought with USDC in Amped.Bio

Status: approved for build, 5 Nov 2026. M1 to M10 and AB-D1 decided by Rob; M11 built as recommended in AB-1 (reversible before merge); proposed positions on the Authbase questions adopted by Rob (section 7), pending Authbase's reply. Build Board #66 (Authbase storefront and USDC checkout).
Owner: Rob Frasca. Drafted by Claude.
Overview: `docs/overviews/authbase-storefront.md`. Partner spec for Authbase: `docs/partners/authbase-integration.md` (Draft 3).
Design: "Authbase storefront screens", https://claude.ai/artifact/4dSAoKNiC8S1ozwTnVhukP, Prism 2.2. Page Fan: s1 Identity storefront desktop, s2 phone, s3 status states, c1 pay sheet, c2 short balance, c3 paid. Page Authbase Merchant Console: p1 Overview, p2 Products, p3 Payout wallet, p4 Orders and refund, p5 Developers (p6 Team follows the p5 table pattern and is not drawn). Page Amped.Bio admin: a1 Money, Merchants. Amounts on every board are placeholders until Authbase sets prices.
Builds on: AmpedPay spec (#50, approved 28 Oct), content and store spec 3.9 (split table, purchase flow), CK-5 pay sheet (PR #482), identity checks spec r3 (I1, seller gate), mobile checkout rules (24 Oct).
Rule for this build (Rob, 5 Nov): an Authbase check is a paid content purchase with a different seller and a different fulfillment step. Reuse the paid content checkout on Base wherever it already does the job.

## 1. Problem

Today the Identity tab (Wallet, RNS, name, Identity) sends the fan to Authbase. The fan links the wallet there, pays by card through Stripe, and verifies. Amped.Bio sees none of the sale and the fan leaves the app twice.

Rob wants the purchase inside Amped.Bio: an Authbase storefront on the Identity tab, a Buy now button that pays USDC from the Amped.Bio wallet, an admin panel where Authbase sets payout wallets, prices and products, and a way for Authbase to confirm payment before it runs the ID check.

## 2. What the code already has

| Area | State | Source |
| --- | --- | --- |
| Payment contract | AmpedPay `pay(SplitTable, splitSig, authValidAfter, authValidBefore, authSig)`. Exactly one creator row and one platform row at the treasury. Creator bps at or above `minCreatorBps` (5000). Authorization nonce equals the split hash. Emits `Paid(paymentRef, payer, creator, amount, splitHash)` and one `Share(paymentRef, to, role, amount)` per recipient. `paymentRef` is the Purchase id. | AmpedPay spec 3.2, PAY-1 |
| Gas | The relayer (CDP Server Wallet) sends every payment. The sheet shows "Network fee: Paid by Amped.Bio". | `services/usdc/relayer.ts`, CK-5 |
| Checkout | `payments.quote`, `payments.pay.prepare`, `payments.pay.submit`, `payments.status`. Pay sheet on app.amped.bio/pay. Short balance becomes Add USDC with the gap. Checking state on return. Store policy version recorded on the checkout intent. | `apps/client/src/pages/Pay.tsx`, `services/checkout/quote.ts`, `purchases.ts`, PR #482 |
| Confirmation | Purchase reaches `confirmed_soft` at the first confirmation (`soft_unlock_confirmations` = 1) and final at 12. | AmpedPay spec 3.3 |
| Catalog | `Offer` (creatorUserId, amountUnits, accessPeriodDays, adult, salesCount) with `OfferItem` rows for content. `Purchase`. `SplitRecipient` for admin set partners. | content and store spec, schema |
| Seller gate | `quote.ts` sets state `seller` when `checkIdentity(creatorUserId, "seller")` fails. The split signer refuses the same. The seller's payout address must equal the checked wallet. | identity checks r3 5.3, `quote.ts:152` |
| Authbase today | `getAuthbaseWalletStatus(address)` reads `/api/v1/public/wallets/{address}/status`: NOT_LINKED, NOT_VERIFIED, VERIFIED, VERIFIED_WITH_BADGE with `verification { type, verified_at, valid_until }`. `AUTHBASE_VERIFY_URL` is an SSO link into Authbase `/verify`. | `services/authbase.ts`, `rns/identity/catalog.ts` |
| Identity tab | Profile, Identity, Attributes (Soon), Facets (Soon). Identity shows Verify with Authbase, the Standard and Enhanced cards with "USD price from Authbase", and a tREVO / USD toggle. | screenshot 5 Nov |
| Admin money controls | `payments_admin` role, two person rule, `AdminChange` log, Payments pages a1 to a4. | AmpedPay spec 3.5 to 3.8 |

What is missing: a seller that is a business rather than a creator, a product that is a service rather than content, a fulfillment step outside Amped.Bio, and a way for an outside seller to read its orders.

## 3. Design

### 3.1 Authbase is a seller

- Authbase gets one Amped.Bio account, the merchant account, linked to a new `Merchant` row.
- Its products are `Offer` rows with `kind = service` and `fulfillment = external`. They have no `OfferItem` rows and never appear in the Library.
- In the split table, Authbase's payout wallet is the creator row (role 0). Amped.Bio is the platform row at the treasury. No promoter or partner rows at launch.
- Fee (Rob, 5 Nov, M3): Amped.Bio takes 20% of Authbase sales (2,000 bps). Authbase receives 80%. Creators stay at `platform_fee_bps` (500).
- AmpedPay caps the platform row at `MAX_FEE_BPS` = 1000 (10%), a constant. A 20% platform row reverts. Decision M11 sets how the contract carries a merchant fee above 10%. Recommended: a merchant recipient role with its own ceiling (section 3.13).

### 3.2 Seller gate for a merchant

The I1 seller gate checks a person: Authbase verification on the creator's wallet and an active RNS name bound to it. A business payout wallet (Authbase will likely use a Safe) has neither.

`quote.ts` and the split signer branch on the offer owner:

| Owner | Gate | Payout address |
| --- | --- | --- |
| Creator (today) | `checkIdentity(creatorUserId, "seller")` | The creator's `UserWallet.address` |
| Merchant (new) | `checkMerchant(merchantId)`: merchant `active`, payout wallet `effective`, screened by `services/usdc/screen.ts` | The merchant's effective payout wallet |

A failed merchant gate returns quote state `seller` with the same refusal copy as today. Merchant approval is an Amped.Bio admin decision (decision M1).

### 3.2b Seller tier for creators (Rob, 5 Nov, M10)

Creators need Authbase **Enhanced** to sell. An Amped.Bio admin can allow a named creator to sell with Standard.

- `checkIdentity(userId, "seller")` passes on VERIFIED or VERIFIED_WITH_BADGE with tier ENHANCED, plus the RNS binding (identity checks 3), unless an active `SellerOverride` exists for the user. Then STANDARD passes too.
- New fail reason `needs_enhanced` for a STANDARD pass with no override. The Get paid card shows "Verified by Authbase, Standard. Selling on Amped.Bio needs Enhanced." with Upgrade to Enhanced (board s5).
- Override (board a2): Admin, Users, the user, Seller check. Reason and end date required, two factor at the moment of change, logged in `AdminChange` (area `identity`). It ends on its date or when the Authbase check ends, whichever is first. The creator gets an email at start and 7 days before the end.
- Every enforcement point in identity checks 5.3 reads the same result: store go live, plan and offer activation, the split signer, renewals. At expiry, sales stop and members keep access, as in identity checks 5.4.
- Creators who sell today with Standard fail at the next check. Before AB-6 turns on: list them, email them with the date, and set overrides where Amped.Bio chooses. Rob decides whether any grace applies (open question 8).
- Merchants are unaffected. They pass `checkMerchant` (3.2).

### 3.3 Products

Authbase manages its products in the Merchant Console (3.8). Each product maps to one Authbase check.

| Field | Where | Notes |
| --- | --- | --- |
| Title, short description, feature lines | `Offer.title`, `Offer.description`, new `Offer.features` (json, up to 4 lines) | Feature lines render as the check marks on the cards |
| Amount | `Offer.amountUnits` | Inside `one_time_price_min` and `one_time_price_max` |
| Authbase product code | new `Offer.externalCode` | Sent to Authbase on the verify link and in `order.paid`. For example `STANDARD`, `ENHANCED` |
| Tier rank | new `Offer.rank` | Blocks buying a lower tier while a higher one is active |
| Placement | new `Offer.placement` | `rns_identity` for the Identity tab |
| Badge tag | new `Offer.tag` | Optional. "Most complete" on Enhanced |
| Status | `Offer.status` | draft, active, archived. Price changes apply to new quotes only, as today |

Positioning (Rob, 5 Nov):

| Product | Tag | Lines on the card |
| --- | --- | --- |
| Standard | For fans | ID document and selfie. Verified badge. Senders see Verified owner. Over 18 check. Opens adult (18+) content on Amped.Bio |
| Enhanced | For creators | ID document, selfie and address check. Everything in Standard, including Over 18. Required to sell and get paid on Amped.Bio. Ready for attributes like residence and age |

The Over 18 line depends on Authbase issuing `age_over_18` from both tiers, and on the fan sharing it with Amped.Bio (identity checks 4.2, `not_shared`). The 18+ sheet already sends fans who have not shared it to the Authbase consent manager. Open question 7.

Attempts included live in Authbase. Amped.Bio shows the line Authbase sets in the feature list.

### 3.4 Storefront on the Identity tab

The Identity tab becomes the Authbase storefront. Layout stays, buying changes.

| Today | After |
| --- | --- |
| Verify with Authbase (opens Authbase) | Choose a check (scrolls to the cards). Once a paid order exists: Continue to Authbase |
| tREVO / USD toggle | Removed. Amounts read $N USDC |
| "USD price from Authbase" chip | The live amount from the offer, for example $N USDC |
| Cards with no action | Each card has Buy now |
| Footnote on Stripe | "Paid in USDC from your Amped.Bio wallet. Sold and fulfilled by Authbase." The pool rewards sentence is removed from this screen |
| How it works step 1: Link this wallet on Authbase | "Choose a check and pay in USDC from your wallet." |
| "Authbase runs the check. Amped.Bio never sees your ID document." | Kept |

Status line under the name header, driven by the latest Purchase for this wallet and the existing status read:

| State | Line | Action |
| --- | --- | --- |
| No order, not verified | Not verified | Choose a check |
| Paid, not started | Paid. Verify your identity on Authbase. | Continue to Authbase |
| Back from Authbase, ID not yet on chain | Authbase is creating your ID on chain. | none, refreshes |
| In review | Authbase is reviewing your check. | none |
| Verified | Verified until {date} | none. Buy now on lower or equal tiers is disabled |
| Not passed | Authbase could not verify you. {Authbase reason} | Start again (when attempts remain) or Choose a check |
| Refunded | Refunded $N USDC on {date} | Choose a check |

Guards: Buy now is disabled on a tier at or below an active verification. Buy now becomes Continue to Authbase while a paid, unused order exists.

Highlighted card (Rob, 5 Nov, AB-D1): Standard carries the lens and rim for every account. Enhanced carries it for an account with a store or a membership plan, and Standard then shows as the plain card.

### 3.5 Checkout

The same pay sheet on app.amped.bio/pay, opened with the offer id. Every CK-5 behavior applies: Checking on return, refusal messages, Add USDC when short, in-app browser handoff, network fee paid by Amped.Bio.

Differences for a service offer:

- Seller line: "Sold by Authbase", with the Verified chip and Authbase's store policy (terms, privacy, refunds) in the policy sheet. The store policy is Authbase's own policy, adopted through the existing store policy flow.
- Access line: "Next: verify your identity on Authbase" in place of "In your Library".
- Paid result: "You paid Authbase $N USDC." with Continue to Authbase as the primary button and Later as the secondary.
- No cover image. The Authbase logo sits in the seller line.

No required checkbox (that rule covers memberships only).

### 3.6 Handoff to Authbase (how staging works today, Rob 5 Nov)

Only the payment moves into Amped.Bio. The rest is the flow that runs on staging now: Authbase signs the fan in with their Amped.Bio account, runs the check, and writes the ID on chain. The fan comes back to Amped.Bio and the ID is waiting.

1. The indexer reads `Paid` and sets the Purchase `confirmed_soft`, as today. An offer with `fulfillment = external` writes no Library row and sends `order.paid` to Authbase (3.7).
2. The paid screen (c3) and the Identity tab show Continue to Authbase. It opens Authbase's Amped.Bio sign in entry in the same tab: `{AUTHBASE}/sso/amped?returnTo=/verify?order={order_ref}`. This is `authbaseSsoUrl()` in `rns/identity/catalog.ts`, with the order added.
3. Authbase signs the fan in through Amped.Bio, as today. No new account and no wallet link step.
4. On `/verify`, Authbase finds the paid order: from the `order.paid` webhook it already holds, or `GET /entitlements?wallet=`, or the `Paid` event on chain. It confirms the payer is the wallet of the signed in account, skips its own payment step, and runs the steps for the check bought (`product_code`).
5. Authbase writes the ID on chain and sends the fan back to the return URL set in the Console: `app.amped.bio/wallet?tab=rns&name={name}&view=identity&order={order_ref}`.
6. On return the tab runs `checkIdentity` with `fresh: true` and polls until the status reads VERIFIED. While the ID is not yet on chain it shows "Authbase is creating your ID on chain." The badge comes only from the status API.
7. Authbase may report progress through `POST /orders/{order_ref}/fulfillment` (started, in_review, verified, not_passed). These update the order record and the Console. They never set the badge.

A forwarded verify link is safe: Authbase serves the check only to the signed in account whose wallet paid. In an in-app browser, checkout already runs in Safari or Chrome (mobile checkout), so the handoff stays there.

### 3.7 How Authbase confirms payment

Watching its payout address is not enough. A transfer does not name the order, two buyers can send the same amount, and Authbase receives its net share, not the price.

| Method | How | Use |
| --- | --- | --- |
| Webhook (push) | `order.paid` at `confirmed_soft`, `order.finalized` at 12 confirmations, `order.refunded`. HMAC signed, `event_id` dedupe, retries for 72 hours | Normal path |
| Partner API (pull) | `GET /orders/{order_ref}`, `GET /entitlements?wallet=` | Reconciliation, support, missed webhooks |
| On chain (trustless) | `Paid` on AmpedPay with `paymentRef == order_ref` and `creator ==` Authbase payout wallet. `Share` rows give the exact amounts | Independent proof. No trust in Amped.Bio servers |

The verify link carries `order_ref`, so Authbase can check the chain before it starts the check.

### 3.8 Merchant Console

A thin app at partners.amped.bio, Prism 2.2, built from the store admin components that already exist (product editor, Sales table, store policy editor). The Authbase team signs in with Amped.Bio accounts that are members of the merchant. A fresh two factor code is required for every money or secret change an Owner or Finance member makes (price, refund, API key, signing secret).

| Page | Built from | Does |
| --- | --- | --- |
| p1 Overview | new | Paid orders, USDC received, checks started, verified, not passed. Status of the merchant and payout wallet |
| p2 Products | store product editor | Create and edit service offers (3.3). Preview the Identity tab cards |
| p3 Payout wallet | new | Add a Base address, sign a message from it to prove control, set it effective. A change needs a second Owner, takes effect after 24 hours, emails every Owner and fires `payout_wallet.changed`. Quotes signed before the change still pay the old wallet |
| p4 Orders | store Sales table | Every order with wallet, RNS name, product, amount, fee, tx link, fulfillment state. Refund. CSV export |
| p5 Developers | new | API keys (test and live, shown once), webhook endpoints, outbound signing secret, delivery log with replay |
| p6 Team | new | Members and roles: Owner, Finance, Developer, Viewer. Audit log |

Store policy (terms, privacy, refunds) uses the existing store policy editor inside p2.

Amped.Bio admin gets Money, Merchants: approve or suspend a merchant (M1), set a merchant fee override (two person rule through `AdminChange`), see payout wallet history and the audit log. John configures this side.

### 3.9 Partner API

REST at `https://api.amped.bio/partners/v1` (staging `api.staging.amped.bio`). Bearer API key, hashed at rest, scoped to one merchant. All writes take `Idempotency-Key`. Rate limited per key.

| Method and path | Does |
| --- | --- |
| `GET /orders/{order_ref}` | Status, offer, external code, payer, RNS name, chain, tx hash, amount, shares, fulfillment state, timestamps |
| `GET /orders` | Paged list. Filters: status, wallet, RNS name, product, created range |
| `GET /entitlements?wallet=0x...` | Paid orders with no completed fulfillment |
| `POST /orders/{order_ref}/fulfillment` | `started`, `in_review`, `verified` (tier, valid_until), `not_passed` (reason text), `attempts_used` 0 to 3 |
| `POST /orders/{order_ref}/refund` | Starts the AmpedPay refund (3.11). Returns the data Authbase signs |
| `GET /products`, `PUT /products/{code}` | Same catalog as p2 |

Webhook events: `order.paid`, `order.finalized`, `order.refunded`, `order.expired`, `payout_wallet.changed`. Header `Amped-Signature: t={unix},v1={hmac}`. Deliveries older than 5 minutes are rejected by the receiver.

Authbase builds no new endpoint. It reads the order on `/verify` (3.6).

### 3.10 Data model

Reuse first. One additive migration per PR (AB-1 merchants, AB-2 service offers, AB-4 keys and webhooks, AB-6 seller overrides). Every new table uses a UUIDv7 `BINARY(16)` id.

| Model | Status | Change |
| --- | --- | --- |
| `Offer` | reused | `kind` (content, service), `fulfillment` (library, external), `externalCode`, `rank`, `placement`, `features`, `tag`, `merchantId` |
| `Purchase` | reused | `fulfillmentState` (null, paid, started, in_review, verified, not_passed), `rnsName` |
| `CheckoutIntent` | reused | none |
| `Merchant` | new | id, slug, name, status (pending, active, suspended), feeBps (Authbase 2000), businessCheck, storePolicyUrl, returnUrl, approvedAt, suspendedAt, createdById |
| `MerchantMember` | new | merchantId, userId, role (owner, finance, developer, viewer), addedById |
| `MerchantPayoutWallet` | new | merchantId, address, status (proposed, approved, effective, replaced, rejected, cancelled), proofMessage, proofSignature, proposedById, approvedById, approvedAt, effectiveAt, replacedAt. One payment chain per deployment, so no chainId column |
| `MerchantApiKey` | new | merchantId, name, prefix, keyHash (sha256, unique), mode (test, live), lastUsedAt, revokedAt |
| `WebhookEndpoint`, `WebhookDelivery` | new | url, secretBox (AES-256-GCM, shown once), events, status; eventId, attempt, responseCode, nextRetryAt. Any seller can use them later |
| `MerchantAuditLog` | new | merchantId, actorId (0 for the system), action, detail, createdAt |

UUIDv7 ids, per AGENTS.md. `feeBps` stays inside `feeFloorBps` and the merchant ceiling (3.13).

`SellerOverride` (new, AB-6): userId, reason, endsAt, createdById, createdAt, revokedAt, revokedById, reminderSentAt, endedNoticeAt. One active row per user, enforced when an override is set. Logged in `AdminChange`.

### 3.11 Refunds

AmpedPay refunds the full amount through `refund(paymentRef, deadline, creatorSig, creatorPermit)`. For a merchant the creator is the payout wallet, so Authbase signs the EIP-712 Refund and an EIP-2612 permit for its shares. The treasury returns the platform share. The fan gets back exactly what was paid.

Circle FiatToken v2.2 accepts ERC-1271 signatures, so a Safe payout wallet can sign both. Staging must prove this with a Safe before mainnet (open question 4).

Refund window: `refund_window_days` (30). Authbase's refund policy is the one the fan saw at checkout.

### 3.12 Copy rules

Amounts read $N USDC. No em or en dashes. Seller line names Authbase. Compliance lines: "Sold and fulfilled by Authbase." "Authbase runs the check. Amped.Bio never sees your ID document." On staging every sheet carries the existing staging line (test USDC has no value).

### 3.13 AmpedPay change for the merchant fee (M11, recommended)

The 20% fee does not fit today's contract: the platform row is capped at `MAX_FEE_BPS` = 1000. Recommended change, made before the single audit:

- `Recipient.role` gains `4 merchant`. A split has exactly one creator row or exactly one merchant row, never both.
- New constant `MAX_MERCHANT_FEE_BPS = 2000`. With a merchant row, the platform row may sit between `feeFloorBps` and 2000. Without one, the 10% ceiling holds.
- The merchant row must be the effective payout wallet the server checked, signed into the split as today.
- `refund` treats the merchant row like the creator row: the merchant signs the Refund and the permit, and the treasury returns the platform share.
- Tests: a creator split with 11% platform reverts; a merchant split with 20% passes; 21% reverts; creator and merchant rows together revert.
- `docs/audit/ampedpay-scope.md` and the AmpedPay spec 3.2 gain the role and the constant. Staging redeploys on Base Sepolia behind the staging Safe.

Fan display: the fee row reads "Includes the Amped.Bio fee (20%)" with the amount from the quote.

## 4. Decisions

| Id | Question | Recommended | Why | Alternatives |
| --- | --- | --- | --- | --- |
| M1 | How does a business seller pass the seller gate? | Amped.Bio admin approves the merchant after a business check (company registration, beneficial owners, sanctions screen). `checkMerchant` replaces `checkIdentity(seller)` for merchants | The personal check cannot verify a company or a Safe. Authbase verifying itself is circular | Require an Authbase verified Owner and an RNS name on the payout wallet |
| M2 | Payout wallet controls | Signed proof of control, second Owner approves, 24 hour delay, email to Owners, webhook | A hijacked wallet change is the largest loss in this design | Single Owner with two factor |
| M3 | Fee on merchant sales | **Decided (Rob, 5 Nov): 20% on Authbase sales**, set as the merchant's feeBps (2000) through the two person rule | Commercial term with Authbase | 0% at launch; flat fee per check |
| M4 | Card payments | Drop the Stripe path for Amped.Bio traffic. Card buyers use Add USDC | Matches the rule that USDC is bought into the wallet. One rail | Keep a Pay by card link to Authbase |
| M5 | When capture starts | At `confirmed_soft` (one confirmation) | Matches the existing access rule. `order.finalized` follows | Wait for final |
| M6 | Refunds | AmpedPay `refund`, Authbase signs | One refund path for every seller, full amount to the fan | Authbase sends USDC by plain transfer; fee kept |
| M7 | Where the console lives | partners.amped.bio, built from store admin components | Authbase never sees creator tooling. The same app serves the next merchant | Merchant mode inside app.amped.bio |
| M8 | Network | Base Sepolia on staging. Base mainnet when AmpedPay mainnet ships after the audit | Reuses the AmpedPay launch gate. No separate audit | A pilot on mainnet ahead of the audit |
| M9 | tREVO | Off. Revisit at mainnet if Authbase accepts it | Authbase needs a stable price | tREVO at a rate set in p2 |
| M10 | Must creators hold Enhanced to sell? | **Decided (Rob, 5 Nov): yes, with an admin override** (3.2b) | Enhanced is the creator product | Messaging only |
| M11 | How does AmpedPay carry a 20% merchant fee? | A merchant recipient role (role 4) in place of the creator row. A merchant payment allows platform bps up to `MAX_MERCHANT_FEE_BPS` = 2000. Creator payments keep the 10% ceiling. Refunds treat the merchant row like the creator row | Creators keep the contract guarantee. Refunds stay clean. Small change, made before the audit | Raise `MAX_FEE_BPS` to 2000 for everyone (no role change, but the creator guarantee drops to 20%). Or a second Amped.Bio partner row for 15% (no contract change, but on refund the merchant funds Amped.Bio's 15%) |
| AB-D1 | Which card is highlighted | **Decided (Rob, 5 Nov): Standard for every account, Enhanced for accounts with a store or plan** | Most buyers are fans | Enhanced for everyone |

## 5. Acceptance

1. A fan on the Identity tab sees live amounts as $N USDC and Buy now on each active service offer. No toggle, no Stripe line.
2. Buy now opens the pay sheet with "Sold by Authbase". One signature pays. The fan pays no gas.
3. `Paid` shows Authbase's payout wallet as the merchant row at 8,000 bps and the treasury at 2,000 bps. `paymentRef` equals `order_ref`.
4. `order.paid` reaches Authbase within 10 seconds of `confirmed_soft`. A bad signature or old timestamp is rejected by the reference receiver.
5. A missed webhook is recoverable through `GET /orders` and through the chain. A test reads `Paid` by `paymentRef` and matches the shares.
6. Continue to Authbase opens Authbase's Amped.Bio sign in with the order. Authbase starts the check without a second payment. A second tap never creates a second order.
7. Returning from Authbase runs a fresh status read. The Verified badge comes only from the status API.
8. A merchant that is not active, or has no effective payout wallet, cannot get a quote. The API refuses even when the client is bypassed.
9. A payout wallet change takes effect only after a second Owner approves and 24 hours pass. Quotes signed before still pay the old wallet.
10. A full refund returns the exact amount to the payer and sets the Purchase refunded. A second refund reverts.
11. Buy now is disabled at or below an active verified tier. Buy now becomes Continue to Authbase while a paid, unused order exists.
12. Typecheck, build and tests pass. Copy has no em or en dashes.

## 6. Build plan

| PR | Branch | Scope | Needs | Days |
| --- | --- | --- | --- | --- |
| AB-0 | `docs/authbase-storefront-spec` | This spec in `docs/features/authbase-storefront.md` | none | 0.5 |
| AB-1 | `feat/merchants-core` | `Merchant`, members, payout wallets, audit log, `checkMerchant`, quote and split signer branch, admin Money, Merchants. With M11: AmpedPay merchant role and `MAX_MERCHANT_FEE_BPS`, tests, Sepolia redeploy, audit scope update | AB-0, PAY-2, M11 | 4.5 |
| AB-6 | `feat/seller-enhanced` | Seller tier rule and `needs_enhanced` (3.2b), `SellerOverride`, admin Users override (a2), Get paid card states (s5), emails | AB-0 | 2 |
| AB-2 | `feat/service-offers` | `Offer` and `Purchase` fields, service offers, Identity tab storefront, pay sheet service variant, status line | AB-1, CK-5 (#482) | 3 |
| AB-3 | `feat/authbase-handoff` | External fulfillment at `confirmed_soft` (no Library row, `order.paid`), Continue to Authbase link with the order, return route with fresh status and polling | AB-2, AB-4 | 1.5 |
| AB-4 | `feat/partner-api` | Partner API, API keys, webhooks and deliveries, reference receiver and chain check script | AB-1 | 3 |
| AB-5 | `feat/merchant-console` | partners.amped.bio pages p1 to p6 | AB-1, AB-4 | 4 |

AB-4 can start beside AB-2. Authbase can build its side against staging once AB-4 lands.

Authbase builds: the paid order lookup on `/verify` (skip its own payment step for Amped.Bio orders), the webhook receiver, the return redirect to Amped.Bio, fulfillment reports, refund signing from its payout wallet, its store policy, and removal of the Stripe path for Amped.Bio traffic.

## 7. Open questions and proposed positions

Rob adopted these positions on 5 Nov. They are sent to Authbase for confirmation in the partner spec, section 16. Build to them; change them only if Authbase replies otherwise.

| # | Question | Position | Owner | Blocking |
| --- | --- | --- | --- | --- |
| 1 | Attempts per paid order | 3 attempts, valid 30 days from payment, no retake charge. After 3 failed attempts the fan buys a new check | Authbase to confirm | AB-3 copy |
| 2 | `/verify` reads `order`, skips its payment step, returns the fan | Required | Authbase to confirm | AB-3 |
| 3 | Payout wallet type | Safe on Base, 2 of 3. ERC-1271 refund signing tested on Base Sepolia first | Authbase, engineering | AB-1 staging, M6 |
| 4 | Refund policy | Full refund if not started within 30 days; full refund if Authbase cannot complete through its own fault; no refund after a pass or fail decision | Authbase, counsel | Go live |
| 5 | `age_over_18` from Standard | Yes, from the date of birth on the ID, valid while the ID is valid, no scheduled re-check | Authbase to confirm | Standard card copy |
| 6 | What Enhanced adds | Expected: proof of address, sanctions and PEP screen, stronger liveness | Authbase | Seller rules |
| 7 | Status webhooks to Amped.Bio | Signed webhooks on issued, renewed, expired. Phase 2 | Authbase | No |
| 8 | Grace for creators selling today with Standard | Open | Rob | AB-6 turn on |
| 9 | Non custodial posture for a business seller; merchant check list for M1 | Open | Counsel | Go live |

## Revision log

- 2026-11-05 (handoff): Rob described the staging flow. After payment the fan goes to Authbase's Amped.Bio sign in, verifies there, Authbase writes the ID on chain, and the fan returns to find it. 3.6 rewritten to reuse `/sso/amped`. Removed the prepaid session API and `FulfillmentSession`. AB-3 smaller (1.5 days).

- 2026-11-05 (decisions): Rob decided M1, M2, M4 to M9 and AB-D1 as recommended; M3 at 20% on Authbase sales; M10: creators need Enhanced, with an admin override. Added 3.2b, M11 (AmpedPay 10% ceiling), AB-6, boards s5 and a2, open question 8. Standard is the highlighted card.

- 2026-11-05 (later): Rob set the positioning. Standard is for fans and carries the Over 18 check line. Enhanced is for creators. Boards s1, s2 and p2 updated. Added M10 and an open question on `age_over_18` from Standard.

- 2026-11-05: First spec. Reuses AmpedPay, the CK-5 checkout and the I1 status read. Adds merchants, service offers, external fulfillment and the Partner API.
| 5 Nov (build) | Approved for build. Section 7 rewritten with the proposed positions Rob adopted. Overview and partner spec moved into the repo. M11 built as recommended. |
