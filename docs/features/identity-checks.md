# Identity checks: Over 18 and verified sellers

Status: revision 4, 3 Nov 2026, with the seller QA fixes of 3 Nov (Full QA of rows 341 to 343, project doc claude/amped-screen-full-qa-seller-2026-11-03.md). Revision 4 records S5 and Rob's answer on the RNS network (see the revision log). Revision 3 applies the Full QA of 30 Oct (project doc claude/amped-identity-gating-full-qa-2026-10-30.md) and Rob's answer on IQ1 (section 4.5); see the revision log. Revision 1 (23 Oct, PR #354) is in this file's history. Revision 2 applied Rob's choices on the six decisions: A1, A2, A3 (implied by S2), S2 and S3 as recommended; **S1 alternative (an active RNS name bound to the wallet is required to sell)** and **S4 alternative (creator only)**. Changed sections: 3 (seller result), 5, 6, 7, 8, 9. Build Board: card "Identity checks (Authbase)", with edits to #28 Adult content, #20 Content and store, #25 Memberships, #15 Payments to creators, #21 Gating engine.
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at f8bd0bb (revision 2 used a3ce333, revision 1 used 48ca154), plus open PR #348 (content public pages).
Design: Verified seller screens, https://claude.ai/artifact/LUnttKDFQVAgSjenbQu8FM (boards V1 to V10 and the 1440 frames, redrawn 3 Nov for this revision). The fan Over 18 sheet is drawn on #28 (ar1 to ar7) and is not redrawn here. The Under 18 review case is board ad8 on the same #28 page, https://claude.ai/artifact/LHQbtepDpgxEmLqoZzVVc7#ad8.

## 1. Rob's direction (23 Oct)

1. Over 18 uses the Authbase age check that RNS identity already uses. It works today as an attribute. A ZK facet replaces the attribute later.
2. Creators who collect USDC must be verified with RNS and Authbase.
3. Messaging and the content system go live before the gating engine.

## 2. What the code already has

| Piece | Where | What it does |
| --- | --- | --- |
| Status lookup | `apps/server/src/services/authbase.ts` `getAuthbaseWalletStatus(address)` | Calls Authbase `/api/v1/public/wallets/{address}/status`, validates with zod. Status is NOT_LINKED, NOT_VERIFIED, VERIFIED or VERIFIED_WITH_BADGE. Verified carries `verification { type: STANDARD or ENHANCED, verified_at, valid_until }`. Authbase returns NOT_VERIFIED once `valid_until` passes. |
| Over 18 attribute | Same payload, `attributes.age_over_18` | Arrives as a boolean (normalized to "true" or "false") only when the user shared it with Amped.Bio and the status is VERIFIED*. Absent means not shared. Key listed in `AUTHBASE_ATTRIBUTE_KEYS`. |
| Verify and consent links | `apps/client/.../rns/identity/catalog.ts` | `AUTHBASE_VERIFY_URL` (SSO into Authbase `/verify`) and `AUTHBASE_CONSENT_URL` (consent manager). |
| Owner read | `authbase.getMyStatus` | Session wallet only, never client input. |
| Recipient trust | `services/rnsTrust.ts` | Verified, not verified, unavailable or off for any address or RNS name; `verifiedOwner` when the name is active, points to its owner and the wallet is verified. 30 second cache. |
| Facet proofs | `facetRequestApi.ts` | Stub. No proof API yet. `facet:age_over_18` scope defined in `packages/ui/src/oauth/facet-scopes.ts`. |
| 18+ content | PR #348 `services/content/access.ts` | Public means not 18+. Every 18+ item is refused on every public surface until age assurance exists. |
| Store go live | `docs/features/content-system.md` decision 22 | Seller terms, USDC on Base, one active product or plan, verified email. No identity check. |

Nothing is stored about either check today. Every read calls Authbase.

## 3. Shared service

`apps/server/src/services/identity/checks.ts`, used by content, the store, memberships, live, tips and later the gating engine.

```ts
export type IdentityCheckKind = "age_over_18" | "seller";

export type IdentityCheckResult =
  | { pass: true; validUntil: Date; tier: "STANDARD" | "ENHANCED" }
  | { pass: false; reason:
      | "no_wallet"          // account has no Amped wallet
      | "not_linked"         // Authbase NOT_LINKED
      | "not_verified"       // Authbase NOT_VERIFIED, includes expired
      | "not_shared"         // verified, age_over_18 absent (age only)
      | "under_18"           // age_over_18 is false (age only)
      | "no_name"            // seller only: no RNS name stored on the account
      | "name_expired"       // seller only: the RNS name is past expiry (the grace period does not count)
      | "name_not_bound"     // seller only: owner or resolver addr is not the wallet
      | "name_not_linked"    // seller only: bound one way; the url record is not the page (X-Q1)
      | "unavailable" };     // Authbase down or not configured; fail closed

export function checkIdentity(userId: number, kind: IdentityCheckKind,
  opts?: { fresh?: boolean }): Promise<IdentityCheckResult>;
```

Rules:

- The wallet is always the session user's `UserWallet.address`. No endpoint takes an address from the client.
- `age_over_18` passes on status VERIFIED or VERIFIED_WITH_BADGE and `attributes.age_over_18 === "true"`.
- `seller` passes on status VERIFIED or VERIFIED_WITH_BADGE, either tier (S2), **and** `checkRnsBinding(user.revo_name, wallet)` returns `ok` **and** `twoWay` (S1 alternative; two way per X-Q1, Rob 3 Nov). The name must be active, owned by the wallet, resolve to it, and carry the page URL in its `url` record (`rns-identity-phase2.md`, section 2). This is the same binding the Verified badge needs. `validUntil` for a seller pass is the earlier of the Authbase `valid_until` and the name's expiry.
- Seller reasons from `checkRnsBinding` (`services/rns.ts`): `revo_name` null, `invalid` or `not_found` map to `no_name`; `expired` to `name_expired`; `not_owner` or `addr_elsewhere` to `name_not_bound`; `ok` without `twoWay` to `name_not_linked`; a thrown chain read to `unavailable`. Authbase reasons are checked first. `name_not_linked` is added to `IDENTITY_FAIL_REASONS` in `packages/constants/src/identity.ts`.
- A pass is cached until the earlier of `valid_until` and 24 hours after the check. A fail is cached 5 minutes, except `unavailable`, which is never cached or written to `identity_checks`, so Try again reaches Authbase. `fresh: true` skips the cache. The client calls it with fresh after the user returns from Authbase or the Names tab.
- `unavailable` never passes. No grace on outage.
- A stored row whose `walletAddress` differs from the session wallet is ignored and replaced on the next check.
- `identity.recheck` is rate limited to 6 a minute per user through `hitRateLimit` (`utils/rateLimit.ts`). Authbase answers 429 under load.

Seller detail for the Get paid card (QA 3 Nov, VS-Q2 and VS-Q3). `IdentityCheckResult` stays the gate. The card needs one state per row, so `identity.myChecks` and `identity.recheck({ kind: "seller" })` also return a `sellerDetail`:

```ts
export type SellerDetail = {
  authbase: { state: "done" | "todo" | "expired" | "unavailable"; validUntil?: string };
  name: {
    state: "done" | "none" | "not_bound" | "not_owner" | "one_way" | "expired" | "unavailable";
    label?: string;        // the stored revo_name, or the bound name found for the wallet
    expiry?: string;       // ISO date of the name's registration expiry
  };
  validUntil?: string;     // the earlier of the two dates, when both rows are done
};
```

- The binding is read even when Authbase fails, so the RNS row can be Done while Identity is To do. Today `checkIdentity` reads the binding only after a VERIFIED status (`apps/server/src/services/identity/checks.ts:215-223`). The pass or fail of `seller` does not change; only the detail is new.
- `not_bound` is `addr_elsewhere` from `checkRnsBinding`; `not_owner` is `not_owner`. The gate keeps mapping both to `name_not_bound`. The detail keeps them apart because the fixes differ (5.2).
- `authbase.state` is `expired` when Authbase returns NOT_VERIFIED and an earlier stored pass for this wallet had a `validUntil` in the past. Otherwise NOT_LINKED and NOT_VERIFIED are `todo`.
- The detail carries dates and states only. No attribute value. `toClient` in `apps/server/src/trpc/identity.ts:13-17` gains the field.

Storage, new table (UUIDv7 per AGENTS.md):

```prisma
model IdentityCheck {
  id            Bytes    @id @db.Binary(16)
  userId        Int      @map("user_id")
  kind          String   @db.VarChar(16)    // age_over_18 | seller
  walletAddress String   @map("wallet_address") @db.VarChar(42)
  pass          Boolean
  reason        String?  @db.VarChar(16)
  tier          String?  @db.VarChar(16)
  validUntil    DateTime? @map("valid_until")
  checkedAt     DateTime @default(now()) @map("checked_at")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, kind])
  @@map("identity_checks")
}
```

One row per user and kind, overwritten on each check. It holds the outcome, reason and dates only. No name, birth date, document or attribute value is stored. Authbase keeps the identity record. This keeps Amped inside the data retention limits some state laws set (Ohio, West Virginia, Missouri) and inside `docs/legal/privacy-parameters.md`.

Privacy work that ships in I1 (AGENTS.md, privacy and consent):

- Notice, section 2 after the Authbase paragraph: "When we check your age or your seller status with Authbase, we keep the result of the check and when it ends. We never receive your birth date or ID."
- Notice, section 12 Children: "If an age check shows that someone on an account is under 18, a person on our team reviews it and we close the account."
- Parameters, retention list: identity check results until the account closes; under 18 review cases 5 years (counsel confirms).
- Bump `CONSENT_POLICY_VERSION` (now 2026-10f) with the notice change.

Wallet change: `UserWallet` is one to one and `wallet.ts` refuses a different address, so no flow changes a linked wallet today. The row check above covers a change if one is added later.

Swap to ZK facets: `checkIdentity` is the only reader. When the facet proof API ships, `age_over_18` reads a `facet:age_over_18` proof instead of the attribute. Callers do not change.

## 4. Over 18

### 4.1 Who must pass

- **Viewers of 18+ items.** Before any 18+ item, product, preview, list entry or stream is returned. Signed out viewers are asked to sign in first.
- **Creators who publish 18+.** Turning on the 18+ label, or publishing an 18+ item, requires the creator's own `age_over_18` pass and a `seller` pass (A2). #28 co-performer releases and 2257 records stay on #28.

### 4.2 Fan flow (mobile first)

One sheet, "Over 18 check", opened from a locked 18+ card:

| State | Copy | Action |
| --- | --- | --- |
| Signed out | This is for adults. Sign in to continue. | Sign in |
| not_linked or not_verified | Verify your age with Authbase. It takes a few minutes and you do it once. | Verify with Authbase (`AUTHBASE_VERIFY_URL`) |
| not_shared | You are verified. Share Over 18 with Amped.Bio to open adult items. | Share in Authbase (`AUTHBASE_CONSENT_URL`) |
| Returned from Authbase | Checking | Fresh check, then open the item |
| under_18 | This item is for adults only. | Close. No retry prompt. Opens an Under 18 review case (4.5). |
| unavailable | We could not check your age right now. Try again in a minute. | Try again |

The sheet carries `returnTo` with the item, so the fan lands back on it. The Authbase SSO links live in `apps/client`; the landing app opens the sheet at `app.amped.bio/age-check?returnTo=...`, the same host the 23 Oct review moves checkout to.

### 4.3 Where it applies

Everywhere (decision A1). Rob's 10 Oct answer on #28 (verify only where laws require it, a dated self confirmation elsewhere) is superseded, and the geo config table drops out of #28.

### 4.4 Content before the gating engine (PR A1)

PR #348 refuses every 18+ item. PR A1 opens them to viewers who pass, with no engine:

- `services/content/access.ts` gains `canViewAdult(viewer)`. Public reads stay public only and stay 18+ free in server HTML, sitemaps, `llms.txt`, share tags, email, push and Telegram.
- A signed in client call `content.listAdultForBio` and `content.getAdult` return 18+ cards and items to a viewer with a pass. `getReadUrl` and `getPreview` check the pass before signing a gateway token.
- The landing app shows one placeholder card "Adult items" on a bio that has any, which opens the sheet. No title, cover or count before a pass.
- When the gating engine ships, its age precondition calls `checkIdentity(userId, "age_over_18")` and these paths move under it without behavior change.

### 4.5 Under 18 result (IQ1, Rob 30 Oct)

The privacy notice (section 12) says accounts are for people 18 and over and that Amped deletes an account it learns belongs to someone under 18. An `under_18` result is that knowledge, so it always reaches a person.

1. The item is refused as in 4.2. The fan sees the same refusal; nothing on the fan side changes.
2. `checkIdentity` stores the result and opens one Under 18 review case per account (later results attach to the open case). While it is open, every 18+ item stays closed to the account. Nothing else changes.
3. Before the Safety queue ships (#28 R1 and R2), I1 sends support an alert email with the case id, handle and time, through the existing transactional email (SMTP2GO, `utils/email`), moving to the single recipient type when #4 PR M1 ships. It names no attribute value. When R2 ships, the case moves into the queue as type Age result, beside Take It Down at the top.
4. Board ad8: the case view shows account facts and the check, no media. A moderator can run a fresh check. Clear, for a wrong read, needs a note. Confirm and close account is safety lead only, needs a note, and starts account closing as an account deletion (#13, 30 days). The account holder gets the closing email on ad8, which allows a reply within 30 days.
5. Storage: `IdentityReviewCase` (UUIDv7) with userId, status (open, cleared, closed), openedAt, lastResultAt, results, alertedAt, decidedAt, decidedBy, note. Kept 5 years, like screening denies; counsel confirms the period. The case outlives the account it is about: `user_id` is nullable with `onDelete: SetNull`, so closing the account (an account deletion) keeps the case and its decision.

## 5. Verified sellers

### 5.1 Rule (S1 alternative and S4 alternative)

An account can receive USDC through Amped.Bio only when its owner is a verified seller: Authbase VERIFIED on the wallet that receives the money, **and** an active RNS name bound two ways: the name points to that wallet and its `url` record points to the seller's Amped.Bio page (X-Q1, Rob 3 Nov). This matches the Verified badge rule (`rns-identity-phase2.md`, section 4), so every verified seller shows the full Verified badge on the pay sheet and the store.

The rule applies to the creator, the account that owns the product, plan, ticket, tip block or paid link (S4 alternative). Other payees on a split table (promoters, partners, agencies on #38) are not checked by this service. Their payouts still pass the USDC screening already in `services/usdc/screen.ts`.

It does not cover the wallet's own Send. Sending USDC to an address is the user's wallet, not a sale through Amped. The Send review already shows the recipient's verification through `rnsTrust`.

### 5.1b Merchants and the seller tier (Authbase storefront, 5 Nov)

- A business seller (a `Merchant`, first Authbase) does not pass this check. It passes `checkMerchant` instead: admin approved after a business check, an effective payout wallet, and the USDC screen. See `docs/features/authbase-storefront.md` 3.2.
- Creators need tier ENHANCED to pass `seller`, unless an Amped.Bio admin sets a `SellerOverride` (reason, end date, two factor, logged). New reason `needs_enhanced`. See `docs/features/authbase-storefront.md` 3.2b (M10). This replaces "either tier (S2)" from that PR on.

### 5.2 The seller checklist

One card, "Get paid", on the Store page and the Memberships setup, phone first and at 1440 inside the editor shell. It is item 5 of the store go live checklist (`store-catalog.md`, go live). It shows two rows with their own state. It does not turn payments on: the card ends with Back to checklist, and the store live switch stays on the checklist (QA 3 Nov, VS-Q6).

Card copy. Lede: "Fans pay you in USDC. Amped.Bio needs your identity and an RNS name on your wallet before your first sale."

| Row | State (from `sellerDetail`) | Copy | Action (44 px link button) |
| --- | --- | --- | --- |
| Identity | done | Verified by Authbase. Valid until {date} | none |
| Identity | todo | Verify with Authbase. It takes a few minutes and you do it once. | Verify with Authbase (`AUTHBASE_VERIFY_URL`) |
| Identity | expired | Your Authbase verification ended on {date}. | Verify again (`AUTHBASE_VERIFY_URL`) |
| RNS name | done | {name}, active until {date} | none |
| RNS name | none | Selling needs an active RNS name linked both ways: to this wallet and to your page. | Get an RNS name (Names tab, handle prefilled, S5) |
| RNS name | one_way | Publish to your name to link {name} to your page. Selling needs it linked both ways. | Publish to your name (`flow=publish`, page link row checked; board V2c) |
| RNS name | not_bound | Point {name} to this wallet. It points to another wallet now. | Point to this wallet (flow in 5.2.1) |
| RNS name | not_owner | {name} is no longer in this wallet. | Get an RNS name |
| RNS name | expired | {name} expired on {date}. Extend it to sell again. | Extend {label} (`flow=extend`) |
| Either | unavailable | We could not check right now. Try again in a minute. | Try again (`identity.recheck`) |

Card states (boards V1 to V10):

- **Checking.** After the user returns from Authbase or the Names tab, the card runs `identity.recheck` with a spinner row "Checking". No row changes until the answer.
- **Rate limited.** `identity.recheck` refuses with "Too many checks. Try again in a minute." The card shows it as an inline error under the rows and keeps the last state.
- **unavailable.** Never cached (section 3). Authbase not configured reads the same.
- **no_wallet.** The card shows one row: "Set up your Amped wallet to get paid." with Open Wallet. No other row shows.
- **Ready.** Both rows Done. The card shows the badge preview with "Fans see this on your store and checkout." and under it the shipped footnote "Verified means the identity check passed. It is not an endorsement." (`apps/client/src/config/rns/copy.ts:22`). The card ends with Back to checklist (Button lg primary, indigo, 55). No commit button: nothing moves money here.
- **Not ready.** The card ends with "This is item 5 of your go live checklist." and Back to checklist (secondary). The line does not show on Ready.

Network line (QA 3 Nov, X-Q4). Payments run on `PAYMENT_CHAIN` (`apps/server/src/env.ts:254`, default `base-sepolia`, `packages/web3/src/usdc.ts` `getPaymentChain`). When it is not `base`, the Get paid card and checkout show "Test mode. Payments use test USDC on Base Sepolia. It has no cash value." Rob confirms the staging value (section 9).

The Ready preview shows the full Verified badge: a seller who passes is linked both ways and Authbase verified, which is the badge rule (X-Q1, decided).

#### 5.2.1 Register and point fixes (QA 3 Nov)

- **Register writes the name (VS-Q1, code gap, S1).** The seller check reads only `user.revo_name` (`checks.ts:141,185,220`). The only writer today is the Page panel RNS section (`apps/client/src/components/panels/page/rns/RnsSection.tsx:213`). A creator who registers from the Get paid deep link and comes back still fails with `no_name`. Required change: in `apps/client/src/components/panels/wallet/rns/RegisterFlow.tsx`, in the effect that runs on `reg.tx.phase === "done"` (line 111), when the account has no `revo_name`, call `trpcClient.user.setRnsName.mutate({ label })`. Registration already sets the resolver `addr` to the wallet (`apps/client/src/hooks/rns/useRegistration.ts:208`, `setAddr` in the register `data`), so `assertRnsBinding` in `user.setRnsName` (`apps/server/src/trpc/user.ts:224-236`) passes right after the receipt. Registration sets `addr` but not the `url` record, so the name is bound one way. When the flow was opened from Get paid (`returnTo`), the result step offers Publish to your name (`flow=publish`, page link checked) before returning. Then invalidate `identity.myChecks` and run `identity.recheck({ kind: "seller" })` on return. A failed `setRnsName` does not fail the registration: the result step shows "Use {name} on your page" with a Retry that calls the same mutation. An account that already has a `revo_name` keeps it.
- **Point to this wallet (VS-Q4).** No flow writes `addr` on an existing name today. Publish writes text records only (`apps/client/src/components/panels/wallet/rns/name/PublishFlow.tsx:93-112`). Required change: a name page flow `flow=point` (`apps/client/src/components/panels/wallet/rns/route.ts`, add to `NAME_PAGE_FLOWS`) that calls the resolver `setAddr(node, wallet)`. Steps as Publish: Review (Network fee (estimate), Balance after, ComplianceCard with `TESTNET_NOTICE`), Confirm in wallet, result. Built with RN2 (`rns-identity-phase2.md`, section 3.1). Until it ships, the row links to the RNS app for the name.

### 5.3 Enforcement points

| Point | Check | Result on fail |
| --- | --- | --- |
| Store go live checklist (#20 decision 22) | Item 5: Verified seller (both rows) | Store live switch disabled; checklist opens the Get paid card |
| Plan activation (#25), offer activation (#20 PR 9, `store.products.setStatus`), ticket creation (#27), tip block (#15 phase C) | `checkIdentity(seller)` fresh | Activation refused with the Verify before you sell sheet (board V4). Every activation reuses V4 with its own save label (Save as draft, Save offer, Save ticket, Save block). The sheet varies by reason, below |
| Content checkout (`apps/server/src/services/checkout/intents.ts` `resolveTarget`, lines 38-72) | `checkIdentity(creatorUserId, "seller", { fresh: true })` after the item checks pass (QA 3 Nov, X-Q2, code gap) | `resolveTarget` returns null and the fan sees the existing "not available" checkout state. Also checked again before any pay step |
| Split table signing (`payments.quote`, the CDP split signer, #15) | The creator passes; the creator's payout address equals the checked wallet | Quote refused. This is the hard stop: no signed split, no payment |
| Membership renewal job (#25) | Creator passes | S3: renewals pause, members keep access to period end |
| Agency link (#38) | Not checked by this service (S4 alternative) | No effect |

The split signer hard stop (`payments.quote`, `packages/constants/src/checkout.ts:12`) is not built at 0500800. It gets the same `checkIdentity` call when it ships (X-Q2).

Refusal sheet by reason (QA 3 Nov, VS-Q14). Title "Verify before you sell". Prices show as "$N USDC" (for example "$8 USDC a month").

| Reason | Body | Primary | Secondary |
| --- | --- | --- | --- |
| not_linked, not_verified, no_name, name_not_bound, name_not_linked, no_wallet | You can save this plan now. To make it live, finish Get paid: verify your identity and put an RNS name on your wallet. | Open Get paid (returns to the item) | Save as draft |
| name_expired | Your RNS name {name} has expired. Extend it to make this plan live. | Extend {label} | Save as draft |
| unavailable | We could not check right now. Try again in a minute. | Try again | Save as draft |

### 5.4 Expiry

Two dates can end a seller pass: Authbase `valid_until` and the RNS name expiry. The earlier date wins: it ends the pass, and the notice and the emails name that one. Amped emails the seller 30 and 7 days before it ("Your Authbase verification ends on {date}" or "Your RNS name {name} expires on {date}").

Store notice (boards V5 and V5b), solid warning from 30 days out. Dates carry the year.

| Date that ends first | Notice | Action |
| --- | --- | --- |
| RNS name | Your RNS name expires on 2 Mar 2027. When it expires, your store stops taking payments. Members keep access until their period ends. | Extend {label} |
| Authbase | Your Authbase verification ends on 14 Oct 2027. When it ends, your store stops taking payments. Members keep access until their period ends. | Verify again (`AUTHBASE_VERIFY_URL`) |

Seller expiry emails (QA 3 Nov, VS-Q17, code gap). Neither ships at 0500800. Required changes:

1. `apps/server/src/utils/email/RnsExpiryTemplate.tsx`: add a `seller?: boolean` prop. When true, the body adds "When it expires, your store stops taking payments." after the expiry sentence. `services/rnsExpiry/index.ts` sets it when the name is the owner's `revo_name` and the owner has a seller pass or a live store.
2. New `apps/server/src/utils/email/AuthbaseSellerExpiryTemplate.tsx` and a sweep stage `d30` and `d7` on the Authbase `valid_until` of a seller pass (reuse `rnsExpiryStage` rules and the `rns_expiry_notices` dedupe pattern with kind `authbase_seller`). Subject "Your Authbase verification ends in N days". Body: "Your Authbase verification ends on {date}. When it ends, your store stops taking payments. Members keep access until their period ends." Button "Verify again". Footer as the RNS expiry email (rns-expiry-email.md, section 8).
3. Both are drawn on the RNS expiry email canvas (https://claude.ai/artifact/NXaY8GTJ9VwqSKQ3ykMdaz).

At expiry new sales stop: the store shows "Not taking payments right now", paid cards show their lock without Buy and member cards without Join (board V6), and renewals pause (S3). Buyers and members keep the access they have, members until their period ends. Sales resume on the next passing check, with no admin step.

## 6. Decisions (recorded on the Build Board card)

| Id | Question | Choice |
| --- | --- | --- |
| A1 | Where does Over 18 apply? | Recommended: everywhere |
| A2 | Creators who publish 18+ | Recommended: Over 18 and verified seller |
| A3 | What is stored | Recommended: outcome only |
| S1 | RNS name for sellers | **Alternative: an active RNS name bound to the wallet is required** |
| S2 | Authbase tier | Recommended: either tier |
| S3 | Renewals after seller expiry | Recommended: pause, members keep access to period end |
| S4 | Which payees must pass | **Alternative: the creator only** |
| IQ1 | What happens on an under_18 result | Recommended (30 Oct): refuse, store, open a review case; a safety lead closes the account or clears it |
| S5 | Where sellers get the RNS name | Decided (3 Nov): registration stays in the Wallet Names tab (`RegisterFlow.tsx`). The Get paid card deep links to it with the handle prefilled as the label. No second registration flow |
| X-Q1 | Do sellers need two way binding | Rob (3 Nov): yes. The seller check requires two way binding, matching the Verified badge rule. Get paid adds a Publish step when the binding is one way. The Ready preview shows the full Verified badge. Today `checks.ts:143` uses the one way rule; RN2 adds `twoWay` |
| RN1 | Which network do seller names live on | Rob (3 Nov): RNS names are held on testnet and mainnet. The product, selling included, runs on testnet with testnet names until the mainnet go live. The seller check reads the RNS chain of the environment |

## 7. Build

| PR | Branch | Scope | Depends | Size |
| --- | --- | --- | --- | --- |
| I1 | `feat/identity-checks` | `IdentityCheck` and `IdentityReviewCase` models and one migration, `services/identity/checks.ts`, `identity.myChecks` and `identity.recheck` (rate limited), cache rules in 3, under 18 case and support alert (4.5), privacy notice, parameters and `CONSENT_POLICY_VERSION` (3), tests | none | 2 days |
| A1 | `feat/content-adult-access` | Over 18 sheet (app host), content adult paths in 4.4, creator 18+ label requires A2 | I1, PR #348 | 2.5 days |
| S1 | with store PR 9 and memberships | Get paid card (two rows, states in 5.2), `sellerDetail` on `identity.myChecks` and `identity.recheck` (3), register writes `revo_name` (5.2.1), activation checks and the refusal sheet by reason (5.3), content checkout check in `resolveTarget` (5.3), split signer check (creator) when the signer ships, renewal check, store notice for both dates and the seller expiry emails (5.4), network line (5.2) | I1, RN2 for `twoWay` (#46 PR #351 merged 30 Oct) | 3 days spread across those PRs |
| RN2 point | with RN2 (`rns-identity-phase2.md`) | `flow=point`: resolver `setAddr` on an owned name (5.2.1) | RN2 | 0.5 day |

Order with Rob's sequence: G0 (stake unit fix) before messaging goes live. I1 and A1 with content. S1 rides with the first USDC selling PR. The gating engine follows and reuses I1.

## 8. Acceptance

1. A fan with no Authbase link opening an 18+ item sees the Verify step, and no 18+ title, cover, URL or token is in any response they received.
2. A verified fan who has not shared Over 18 sees the Share step. After sharing and returning, the item opens without a second tap.
3. `age_over_18 = false` refuses with no retry prompt.
4. Authbase down refuses with Try again. No item opens.
5. A creator without a seller pass cannot turn the store live, activate a plan or offer, or get a signed split quote. The API refuses even when the client is bypassed. A creator who is Authbase verified but has no bound, active RNS name fails with `no_name`, `name_expired` or `name_not_bound`.
6. A split with a promoter or agency payee who is not Authbase verified still signs when the creator passes.
7. A creator whose Authbase verification or RNS name expires stops taking new sales at the earlier date. Existing access is unchanged. Renewing the name or verifying again restores sales on the next check.
8. `identity_checks` holds no attribute value, name or birth date. A test asserts the row shape.
9. A row stored for a different wallet than the session wallet is never used.
10. Server HTML, sitemaps, `llms.txt` and share tags contain no 18+ item for any viewer.
11. Typecheck, build and tests pass. Copy has no em or en dashes.
12. Authbase down returns `unavailable`, writes no row, and the next Try again calls Authbase.
13. An `under_18` result opens one review case and sends the support alert. A second result attaches to the same case. Only a safety lead can close the account.
14. A creator with no `revo_name` who registers a name from the Get paid deep link has `user.revo_name` set with no manual step, and passes the seller check after Publish to your name. (VS-Q1, X-Q1)
20. A seller bound one way fails with `name_not_linked` and sees V2c. After Publish the check passes. A handle change makes the seller fail until the creator publishes again. (X-Q1)
21. The two way seller rule turns on with `RNS_BADGE_TWO_WAY`, after the 14 day notice (`rns-identity-phase2.md`, decision B3). Sellers bound one way get the notice email and the Get paid notice first. (X-Q1)
15. `identity.myChecks` returns `sellerDetail` with one state per row. A creator who is not Authbase verified but has a bound name sees the RNS row Done. (VS-Q2)
16. `addr_elsewhere` shows Point to this wallet; `not_owner` shows Get an RNS name. (VS-Q3)
17. A content checkout for a creator without a seller pass does not resolve. A test covers `resolveTarget`. (X-Q2)
18. The refusal sheet shows Try again on `unavailable` and Extend on `name_expired`. (VS-Q14)
19. A seller whose Authbase date is earlier than the name expiry sees the Authbase notice and gets the Authbase seller email at 30 and 7 days. (VS-Q16, VS-Q17)

## 9. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| What do STANDARD and ENHANCED check (document, liveness, sanctions)? Does either meet "government ID" or "commercially reasonable" under the Texas style laws? | Authbase team, counsel | A1 go live |
| Is Authbase's Over 18 attribute re-issued on a schedule (Ohio requires periodic re-verification)? | Authbase team | No |
| Can Authbase report status changes by webhook so expiry is pushed, not polled? | Authbase team | No |
| Is Authbase verification enough for a creator's 2257 record, or does #28 still need its own ID capture? | Counsel | A2 |
| Answered (RN1, Rob 3 Nov): RNS names are held on testnet and mainnet, and the product runs on testnet until the mainnet go live. Staging sells on testnet names. Mainnet selling needs RNS mainnet in `AVAILABLE_CHAINS` before the first mainnet sale | Rob, Revolution team | First mainnet sale only |
| What is `PAYMENT_CHAIN` on staging? If it is not `base`, the network line in 5.2 shows on Get paid and checkout (X-Q4) | Rob | No |
| Should a name in its one day grace period (`RNS_GRACE_PERIOD_SECONDS`) still pass? `isRnsNameActive` (packages/web3/src/rns.ts) does not count grace, so sales stop on the expiry date | Rob | No |

## Revision log

- 2026-11-05: A1 built (`feat/content-adult-access`). Over 18 sheet at `app.amped.bio/age-check`; `canViewAdult`, `content.listAdultForBio`, `content.getAdult`; creator 18+ needs Over 18 and seller (A2); all behind the `adultContent` flag. Handoff `docs/fixes/content-adult-access.md`.
- 2026-11-03 (revision 4, seller QA fixes): Full QA of rows 341 to 343. `sellerDetail` per row (3). Get paid card copy and states, card ends with Back to checklist, endorsement line, network line (5.2). Register writes `revo_name` and the Point to this wallet flow (5.2.1). Refusal sheet by reason, content checkout check (5.3). Earlier date wins, Authbase notice, seller expiry emails (5.4). S5 decided. Acceptance 14 to 21. X-Q1 decided by Rob: sellers need two way binding (`name_not_linked`, one_way row state, V2c).
- 2026-11-03 (revision 4): S5 recorded as recommended (Wallet Names tab, deep link from the Get paid card). RN1 recorded: RNS names on testnet and mainnet; the product runs on testnet until the mainnet go live. Authbase questions drafted for Rob to send (method and IAL2, re-verification, retention, anonymized result, expiry webhook, rate limits, status across staging and production, sandbox).
- 2026-10-30 (revision 3): Full QA of I1 against `development` f8bd0bb. Seller reason mapping from `checkRnsBinding`; `unavailable` never cached; rows for another wallet ignored (no wallet change flow exists); `identity.recheck` rate limit; privacy notice lines, retention and `CONSENT_POLICY_VERSION` bump spelled out; new 4.5 Under 18 result (IQ1, Rob 30 Oct) with board ad8; `IdentityReviewCase` added to I1; S1 no longer waits on #351. Acceptance 9 replaced, 12 and 13 added.
- 2026-10-27 (revision 2): S1 and S4 alternatives, S5 raised.
- 2026-10-23 (revision 1): first spec, PR #354.
