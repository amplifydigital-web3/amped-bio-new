# Identity checks: Over 18 and verified sellers

Status: spec for approval, 2026-10-23. Build Board: new card "Identity checks (Authbase)", with edits to #28 Adult content, #20 Content and store, #25 Memberships, #15 Payments to creators, #21 Gating engine.
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at 48ca154, plus open PR #348 (content public pages).

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
      | "unavailable" };     // Authbase down or not configured; fail closed

export function checkIdentity(userId: number, kind: IdentityCheckKind,
  opts?: { fresh?: boolean }): Promise<IdentityCheckResult>;
```

Rules:

- The wallet is always the session user's `UserWallet.address`. No endpoint takes an address from the client.
- `age_over_18` passes on status VERIFIED or VERIFIED_WITH_BADGE and `attributes.age_over_18 === "true"`.
- `seller` passes on status VERIFIED or VERIFIED_WITH_BADGE, either tier (decision S2 covers tiers).
- A pass is cached until the earlier of `valid_until` and 24 hours after the check. A fail is cached 5 minutes. `fresh: true` skips the cache. The client calls it with fresh after the user returns from Authbase.
- `unavailable` never passes. No grace on outage.

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

One row per user and kind, overwritten on each check. It holds the outcome and dates only. No name, birth date, document or attribute value is stored. Authbase keeps the identity record. This keeps Amped inside the data retention limits some state laws set (Ohio, West Virginia, Missouri) and inside `docs/legal/privacy-parameters.md`. The privacy notice gains one line: Amped records whether an Authbase check passed and when it expires.

Wallet change: linking a different wallet deletes the user's rows.

Swap to ZK facets: `checkIdentity` is the only reader. When the facet proof API ships, `age_over_18` reads a `facet:age_over_18` proof instead of the attribute. Callers do not change.

## 4. Over 18

### 4.1 Who must pass

- **Viewers of 18+ items.** Before any 18+ item, product, preview, list entry or stream is returned. Signed out viewers are asked to sign in first.
- **Creators who publish 18+.** Turning on the 18+ label, or publishing an 18+ item, requires the creator's own `age_over_18` pass and a `seller` pass (S1 makes it the same Authbase verification). #28 co-performer releases and 2257 records stay on #28.

### 4.2 Fan flow (mobile first)

One sheet, "Over 18 check", opened from a locked 18+ card:

| State | Copy | Action |
| --- | --- | --- |
| Signed out | This is for adults. Sign in to continue. | Sign in |
| not_linked or not_verified | Verify your age with Authbase. It takes a few minutes and you do it once. | Verify with Authbase (`AUTHBASE_VERIFY_URL`) |
| not_shared | You are verified. Share Over 18 with Amped.Bio to open adult items. | Share in Authbase (`AUTHBASE_CONSENT_URL`) |
| Returned from Authbase | Checking | Fresh check, then open the item |
| under_18 | This item is for adults only. | Close. No retry prompt. |
| unavailable | We could not check your age right now. Try again in a minute. | Try again |

The sheet carries `returnTo` with the item, so the fan lands back on it. The Authbase SSO links live in `apps/client`; the landing app opens the sheet at `app.amped.bio/age-check?returnTo=...`, the same host the 23 Oct review moves checkout to.

### 4.3 Where it applies

Recommended: everywhere (decision A1). Rob's 10 Oct answer on #28 (verify only where laws require it, a dated self confirmation elsewhere) is superseded if A1 is accepted, and the geo config table drops out of #28.

### 4.4 Content before the gating engine (PR A1)

PR #348 refuses every 18+ item. PR A1 opens them to viewers who pass, with no engine:

- `services/content/access.ts` gains `canViewAdult(viewer)`. Public reads stay public only and stay 18+ free in server HTML, sitemaps, `llms.txt`, share tags, email, push and Telegram.
- A signed in client call `content.listAdultForBio` and `content.getAdult` return 18+ cards and items to a viewer with a pass. `getReadUrl` and `getPreview` check the pass before signing a gateway token.
- The landing app shows one placeholder card "Adult items" on a bio that has any, which opens the sheet. No title, cover or count before a pass.
- When the gating engine ships, its age precondition calls `checkIdentity(…, "age_over_18")` and these paths move under it without behavior change.

## 5. Verified sellers

### 5.1 Rule

An account can receive USDC through Amped.Bio only with a `seller` pass on the wallet that receives the money. This covers every payee on a split table: the creator, promoters, partners and agencies (#38). It covers store products, memberships, live tickets, tips and paid links.

It does not cover the wallet's own Send. Sending USDC to an address is the user's wallet, not a sale through Amped. The Send review already shows the recipient's verification through `rnsTrust`.

RNS name: recommended optional (decision S1). A verified seller with a bound, active RNS name shows the Verified badge on the pay sheet and the store. A seller without one shows "Verified by Authbase".

### 5.2 Enforcement points

| Point | Check | Result on fail |
| --- | --- | --- |
| Store go live checklist (#20 decision 22) | Item 5: Identity verified with Authbase | Store live switch disabled; checklist links to Verify |
| Plan activation (#25), offer activation (#20 PR 9), ticket creation (#27), tip block (#15 phase C) | `checkIdentity(seller)` fresh | Activation refused with the Verify step |
| Split table signing (`payments.quote`, the CDP split signer, #15) | Every payee with an Amped account passes; payee address equals the checked wallet | Quote refused. This is the hard stop: no signed split, no payment |
| Membership renewal job (#25) | Creator passes | Decision S3 |
| Agency link (#38) | Agency passes before a transaction share takes effect | Share inactive until verified |

### 5.3 Expiry

Authbase returns NOT_VERIFIED after `valid_until`. Amped emails the seller 30 and 7 days before. At expiry new sales stop: the store shows "Not taking payments right now", and paid and member cards show their lock without Buy or Join. Buyers and members keep the access they have.

## 6. Decisions for Rob (recommended first)

**A1. Over 18 everywhere.** Recommended: every 18+ view needs an Authbase Over 18 pass, in every location. Why: one rule, no geo table for counsel to maintain, no VPN gaps, safe as more states pass laws (27 by September 2026, with device age signals starting in North Dakota). Alternative: keep the 10 Oct split (Authbase only in covered states, dated self confirmation elsewhere). Fewer steps for fans outside those states.

**A2. Creators who publish 18+ pass both checks.** Recommended: Over 18 and seller verification before the 18+ label turns on. Why: #28 already requires ID and liveness for adult creators; Authbase is that ID check. Alternative: Over 18 only for creators who do not sell.

**A3. Store outcome only.** Recommended: keep pass or fail, tier and dates; never the attribute value or documents. Why: data retention limits in several state laws and our privacy parameters. Alternative: none worth taking.

**S1. RNS name optional for sellers.** Recommended: Authbase verification is required; an RNS name is optional and adds the Verified badge. Why: a required name adds a purchase and a second step before a creator's first sale. Alternative: require an active RNS name bound to the wallet (the full Verified badge) to sell.

**S2. Either Authbase tier.** Recommended: STANDARD or ENHANCED both pass for selling and Over 18. Why: tiers are Authbase's; we do not know yet that ENHANCED adds anything a seller needs. Alternative: ENHANCED for 18+ creators if it includes liveness (open question 1).

**S3. Renewals after seller expiry.** Recommended: renewals pause on expiry and members keep access to the period end; renewals resume when the creator verifies again. Why: no money moves to an unverified payee. Alternative: 14 day grace for renewals only.

**S4. Payees on the split table.** Recommended: every Amped payee must pass, not only the creator. Why: promoters, partners and agencies receive USDC from fans too. Alternative: creator only.

## 7. Build

| PR | Branch | Scope | Depends | Size |
| --- | --- | --- | --- | --- |
| I1 | `feat/identity-checks` | `IdentityCheck` model and migration, `services/identity/checks.ts`, `identity.myChecks` and `identity.recheck` procedures, cache, wallet change cleanup, privacy notice line, tests | none | 1.5 days |
| A1 | `feat/content-adult-access` | Over 18 sheet (app host), content adult paths in 4.4, creator 18+ label requires A2 | I1, PR #348 | 2.5 days |
| S1 | with store PR 9 and memberships | Checklist item, activation checks, split signer check, renewal check, expiry emails | I1 | 1.5 days spread across those PRs |

Order with Rob's sequence: G0 (stake unit fix) before messaging goes live. I1 and A1 with content. S1 rides with the first USDC selling PR. The gating engine follows and reuses I1.

## 8. Acceptance

1. A fan with no Authbase link opening an 18+ item sees the Verify step, and no 18+ title, cover, URL or token is in any response they received.
2. A verified fan who has not shared Over 18 sees the Share step. After sharing and returning, the item opens without a second tap.
3. `age_over_18 = false` refuses with no retry prompt.
4. Authbase down refuses with Try again. No item opens.
5. A creator without a seller pass cannot turn the store live, activate a plan or offer, or get a signed split quote. The API refuses even when the client is bypassed.
6. A creator whose verification expires stops taking new sales at expiry. Existing access is unchanged.
7. `identity_checks` holds no attribute value, name or birth date. A test asserts the row shape.
8. Changing the linked wallet removes both rows.
9. Server HTML, sitemaps, `llms.txt` and share tags contain no 18+ item for any viewer.
10. Typecheck, build and tests pass. Copy has no em or en dashes.

## 9. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| What do STANDARD and ENHANCED check (document, liveness, sanctions)? Does either meet "government ID" or "commercially reasonable" under the Texas style laws? | Authbase team, counsel | A1 go live |
| Is Authbase's Over 18 attribute re-issued on a schedule (Ohio requires periodic re-verification)? | Authbase team | No |
| Can Authbase report status changes by webhook so expiry is pushed, not polled? | Authbase team | No |
| Is Authbase verification enough for a creator's 2257 record, or does #28 still need its own ID capture? | Counsel | A2 |
