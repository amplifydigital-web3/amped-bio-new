# Access Gating Engine v2: build spec

Status: spec for approval, 2026-10-23. Build Board #21.
Owner: Rob Frasca. Drafted by Claude.
Supersedes: v1 spec (CosimoRob/amped-bio-new, branch docs/wave1-specs, docs/features/access-gating-engine.md, 2026-09-26, revised 10 Oct) and the amendments in Memberships (#25, section 3.3), Live streaming (#27, section 3.4) and Content system (#20, sections 3.6 and 3.13). Where this document is silent, v1 still applies.
Overview: claude/amped-gating-engine-overview-2026-10-23.md.
Companion: claude/amped-identity-checks-spec-2026-10-23.md (Over 18 and verified sellers through Authbase; ships before this engine).
Sequence (Rob, 23 Oct): messaging and the content system go live before the gating engine.
Baseline: `development` at 48ca154 (23 Oct 2026).

## 1. Problem

Every paid or members only feature on the board needs one answer: may this person open this thing right now. No code answers it. Six builds wait on it: content PR 8 (gated items), store PR 9 and 10 (paid content), Fan Library FL-6, Memberships (#25), Live tickets (#27) and paid links (#16). Meanwhile three features answer the question on their own, with different rules. Two of those answers are wrong today (section 2.2).

## 2. Research

### 2.1 What is on development now

| Area | State | Source |
| --- | --- | --- |
| Rule table | None. No `AccessRule`, no `AccessEvent`. | `packages/database/prisma/schema.prisma` |
| Content | `ContentItem.accessRuleId` and `baseAccessRuleId` exist as `Binary(16)` with no foreign key. The owner view reports `gated: accessRuleId !== null`. No public read path checks it. | schema line 1361; `trpc/content.ts` line 97 |
| Blocks | `Block` has no rule column. Ten block types: link, media, text, pool, referral, follow, followers, rnsid, telegram_message, telegram_group. | `packages/constants/src/blocks.ts` |
| Public bio | `getHandle` returns every block config through `sanitizeBlockConfig`. Creator email is no longer returned (v1 launch gate D1 is met). | `trpc/handle.ts` |
| Media | Cloudflare media gateway verifies HMAC tokens the API signs. It never decides access. CloudFront is gone. | `apps/media-gateway`, `services/cloudflare/mediaToken.ts` |
| Messaging and Telegram | Own evaluator over `DmRuleKind` (ANYONE, FOLLOWER, PAID_MEMBER, POOL_MEMBER, STAKE_MIN). Its header says it becomes a thin call into #21 when #21 ships. | `services/telegram/rules.ts`, `services/messaging/access.ts` |
| Broadcast | Own pool member query (positive stake in the mirror). | `services/broadcast/index.ts` |
| Follows | ACTIVE follow uses the email grace rule (verified, or inside 30 days). | `trpc/follow.ts`, `utils/verificationGrace.ts` |
| Stakes | `StakedPool.stakeAmount` is wei as text. Updated only when the fan confirms through Amped. | `trpc/pools/fan.ts` |
| Identity | Authbase status by wallet (`services/authbase.ts`): VERIFIED with tier and `valid_until`, plus consented attributes including `age_over_18`. Used for RNS identity and recipient trust. Nothing stored. | `services/authbase.ts`, `services/rnsTrust.ts` |
| Payments | `UsdcSend`, `PaymentEvent`, onramp tables. No `Offer`, `Purchase` or `Membership` yet (content PR 9 and 10, Memberships phase C). | schema |

### 2.2 Defects found in the audit

1. **P0. Minimum stake unit mismatch.** The creator enters a whole tREVO amount (`stakeMinError`: "A whole number of tREVO"). The server stores it as typed and compares it in SQL against `stakeAmount`, which is wei. A rule of 500 tREVO admits a fan with 500 wei. Any staker passes. Affects the Fan messages STAKE_MIN door and Telegram group admission. Tests use the same unit on both sides, so they pass.
2. **P1. Follower definition drift.** `rules.ts` counts a follower only with `email_verified = true`. Fan Graph counts a follower inside the 30 day grace (Rob, 10 Oct). A new fan who follows sees the creator's follower count include them, then is refused the follower door.

Both ship as PR G0 ahead of the engine (section 6).

### 2.3 Market patterns

| Product | Pattern | Take | Avoid |
| --- | --- | --- | --- |
| Patreon | Post access: public, free members, paid members, selected tiers, sell this post, early access for paid tiers before going public. 7 day free trials on one tier, once per fan. | Early access as a date on the rule. Sell one item beside a membership. | Tier sprawl. |
| Linktree | Per link locks (code, age, subscribe, payment). Profile Lock beta (July 2026) gates the whole page, with a 30 day cookie after unlock. | One lock icon and one requirement line per card. | A 30 day cookie as the proof of access. Payment Lock hands over the raw URL. |
| Guild.xyz | Requirements roll up to roles; AND, OR and should not satisfy; access gained and lost automatically. | Rule separate from the thing it unlocks. Automatic loss of access. | Deep boolean builders. |
| Collab.Land | Balance checks on a schedule (24 hours paid, 7 days free). | A stated freshness window. | Day long staleness. |
| Unlock Protocol | Keys with an onchain expiry; ERC-20 renewals anyone can trigger with an allowance. | Access as a time bound credential. | An NFT per access. |
| SpiceDB / Zanzibar | Per request consistency: fast cached checks by default, "at least as fresh as" a token after a write, to avoid the new enemy problem. | Cached by default, forced fresh after a change the viewer caused (pay, unstake, block). | Running a separate authorization service. |
| OPA, OpenFGA, Cedar | General engines. OpenFGA needs relationship data synced into its own store; Cedar takes data per request; OPA needs Rego. | Default deny, typed rules, explainable reasons. | Any of them as a dependency (decision 1). |

### 2.4 Legal context that changed since v1

- Adult content is allowed behind age assurance (Rob, 8 Oct). The Supreme Court upheld Texas HB 1181 under intermediate scrutiny in *Free Speech Coalition v. Paxton* (27 June 2025). About 27 states had adult content age verification laws in force by September 2026. Most apply when more than one third of a site is adult material; Kansas uses 25 percent; several states use other triggers. North Dakota adds a device age signal from 1 August 2026. Counsel decides whether Amped as a whole is covered. The engine enforces the per item check either way (section 3.4).
- Stake gated access stays under securities review, launched in parallel to a pilot allowlist (Rob, 8 Oct). Unchanged.

## 3. Design

### 3.1 Principles

1. One function answers every access question. Features ask; they never evaluate.
2. Default deny. Unknown kind, missing data, chain failure and any thrown error refuse.
3. Every refusal names a reason and a next step. No reason carries an amount another person set.
4. The secret never leaves the server before a pass: link URL, text body, media token, stream token, Telegram invite.
5. Cached by default, fresh after the viewer's own change.

### 3.2 Pipeline

```
request(viewer, resource, intent)
  1 resolve      resource -> { ownerUserId, ruleId, adult, state }       (resolver registry)
  2 preconditions
       resource missing or not public state          -> not_found
       owner or delegate                             -> allow owner
       creator suspended or page unpublished         -> not_found
       viewer blocked by creator (FollowBlock)       -> blocked
       adult and no passed age check                 -> age_check_required
       ruleId null                                   -> allow public
       rule.opensToAllAt <= now                      -> allow public
  3 evaluate     kind evaluator(s), any or all, against cached facts
  4 decide       { allowed, reason, hint, rule summary, checkedAt }
  5 reveal       only on intent open: the caller's reveal function runs inside the pass
  6 record       AccessEvent (sampled for render, always for open, deduplicated 10 minutes)
```

Steps 1 to 4 are pure reads. Step 5 belongs to the feature (sign a media token, return a URL, return text, mint a Stream token, create a Telegram invite). The engine wraps it so no feature can reveal without a pass.

### 3.3 Kinds

| Kind | Params | Pass when | Status |
| --- | --- | --- | --- |
| `follower` | none | ACTIVE follow of the owner, using `trustedEmailWhere` from Fan Graph | Live in G1 |
| `pool_member` | `poolId` | Mirror stake at or above the platform floor in the owner's pool; open intent confirms on chain | Live in G1, pilot allowlist |
| `stake_min` | `poolId`, `minWei` | Same, at or above `minWei` | Live in G1, pilot allowlist |
| `paid` | `offerId` | `PaymentVerifier.verifyPurchase` is `purchased`, or `confirming` (soft unlock, decision 5) | Live with content PR 10 |
| `member` | `planId` | Membership active, or canceled with `currentPeriodEnd >= now` | Live with Memberships phase C |
| `any`, `all` | `ruleIds` (2 to 4 leaves, depth 1) | Any or all leaves pass | Live in G1 |
| `reward_points` | `programId`, `minPoints` | Ledger balance (Rewards #23) | Defined, Later |
| `rns_verified` | none, or `attribute` | Viewer holds a verified RNS name, or a named identity facet (decision 7) | Defined, Later |

Units. Every stake amount is stored as a wei string. Creator surfaces take whole tREVO and convert with `toWei` in `@repo/constants`. The floor is 1 tREVO (`MIN_GATE_STAKE_WEI = 10^18`), renamed from v1's "1 REVO". A mainnet REVO rename changes the label only.

Pools. A rule names `poolId` (the `CreatorPool` row) instead of v1's `chainId` plus `poolAddress`. The row already carries both. Only the owner's own pool is accepted (v1 decision 3).

### 3.4 Preconditions

- **Owner or delegate.** The owner always passes. When Agency System (#38) ships, an agency manager with an active link to the creator passes as `owner` for preview. No delegate passes for paid delivery to themselves outside preview.
- **Creator state.** Suspended creators and unpublished pages return `not_found`, matching `canMessage` today.
- **Blocked.** A `FollowBlock` from the creator refuses every kind, including paid. A paid item that a blocked fan bought stays refundable by the creator.
- **Age.** A resolver that returns `adult: true` triggers the age check before the rule. Reason `age_check_required`, hint `verify_age`. The check is the Authbase Over 18 attribute through `checkIdentity(userId, "age_over_18")` from the identity checks spec (Rob, 23 Oct). It ships before this engine with content PR A1; the engine calls it and adds nothing. When Authbase facet proofs ship, `checkIdentity` reads the ZK facet and the engine does not change. Signed out viewers get the hint too. 18+ items are never in server HTML, sitemaps, `llms.txt` or share tags (content spec 3.6), whatever the rule.
- **Seller verified.** `paid` and `member` refuse with `kind_unavailable` and hint `unavailable` when the seller's `seller` identity check no longer passes (identity checks spec 5.3). Buyers and members with current access keep it.
- **Early access.** A rule may carry `opensToAllAt`. After that instant the resource is public. Before it, the rule applies. Patreon early access, at no extra kind cost.

### 3.5 Contract (`@repo/constants/src/access.ts`)

```ts
export const ACCESS_RULE_KINDS = ["follower", "pool_member", "stake_min", "paid", "member",
  "any", "all", "reward_points", "rns_verified"] as const;
export const LIVE_ACCESS_RULE_KINDS = ["follower", "pool_member", "stake_min", "any", "all"] as const; // grows with G5, G6

export const ACCESS_RESOURCE_TYPES = ["block", "content", "broadcast", "live_event",
  "dm", "telegram_group"] as const;
export type AccessResource = { type: AccessResourceType; id: string }; // block id, content publicId, etc.

export const ACCESS_REASONS = ["ok", "owner", "public", "not_found", "blocked",
  "age_check_required", "not_signed_in", "no_wallet", "not_follower", "follow_pending",
  "not_pool_member", "stake_below_min", "not_purchased", "purchase_pending",
  "not_member", "membership_past_due", "membership_ended", "insufficient_points",
  "kind_unavailable", "chain_unavailable"] as const;

export type UnlockHint =
  | { action: "none" } | { action: "sign_in" } | { action: "verify_age" }
  | { action: "link_wallet" } | { action: "confirm_email" }
  | { action: "follow"; creatorHandle: string }
  | { action: "view_pool"; poolId: number }                 // never a one tap stake
  | { action: "buy"; offerId: string; priceDisplay: string }
  | { action: "join_membership"; planId: number; priceMonthlyDisplay: string; pastDue: boolean }
  | { action: "unavailable" };

export type AccessDecision = { allowed: boolean; reason: AccessReason; hint: UnlockHint;
  rule: { id: string; kind: AccessRuleKind; summary: string } | null; checkedAt: string };
```

Changes from v1: resource ids are strings (content uses `publicId`); `stake` hint becomes `view_pool` with no amounts (matches the messaging rule that no refusal carries an amount); new reasons `blocked`, `age_check_required`, `follow_pending`, `purchase_pending`; hints `verify_age`, `confirm_email`, `buy`.

The `summary` for stake kinds reads "Fans with a minimum stake" or "Pool fans". The required tREVO amount shows only in the unlock sheet to the viewer, never in public HTML.

### 3.6 Data model

```prisma
model AccessRule {
  id            Bytes     @id @db.Binary(16)        // UUIDv7, matches ContentItem.accessRuleId
  ownerUserId   Int       @map("owner_user_id")
  name          String?   @db.VarChar(80)           // null for rules made inline in the picker
  kind          String    @db.VarChar(24)
  params        Json
  opensToAllAt  DateTime? @map("opens_to_all_at")
  version       Int       @default(1)               // bumps on any edit; voids open decisions
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  owner  User  @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)
  @@index([ownerUserId])
  @@map("access_rules")
}

model AccessEvent {
  id           Bytes    @id @db.Binary(16)
  ruleId       Bytes?   @map("rule_id") @db.Binary(16)
  ownerUserId  Int      @map("owner_user_id")
  resource     String   @db.VarChar(80)             // "content:abc123"
  viewerKey    String   @map("viewer_key") @db.VarChar(24) // u:{id} or hashed ip+daily salt
  type         String   @db.VarChar(24)             // locked_view, check, denied, unlocked, revealed
  reason       String?  @db.VarChar(32)
  createdAt    DateTime @default(now()) @map("created_at")
  @@index([ownerUserId, createdAt])
  @@index([ruleId, createdAt])
  @@map("access_events")
}
```

- `Block` gains `accessRuleId Bytes? @db.Binary(16)` with an index. Gatable block types: link, media, text, telegram_group. Pool, referral, follow, followers and rnsid are never gated.
- `ContentItem.accessRuleId` gets its foreign key to `AccessRule` (`onDelete: Restrict`). `baseAccessRuleId` stays as the content spec defines it.
- `Broadcast` gains `accessRuleId` when Broadcast phase 2 needs it, not before.
- `CreatorMessagingSettings` keeps `ruleKind` and `stakeMin` in G2. They map onto engine kinds at read time. A later migration may replace them with `accessRuleId`; nothing in this build depends on it.
- A rule in use cannot be deleted (`CONFLICT` with the count). `kind` is immutable. Owner of rule must equal owner of resource on attach.

### 3.7 Server API (`apps/server/src/services/access/`)

```ts
check(viewer, resource, opts?: { intent?: "render" | "open"; fresh?: boolean }): Promise<AccessDecision>
checkBatch(viewer, resources, opts?): Promise<Map<string, AccessDecision>>
open<T>(viewer, resource, reveal: (d: AccessDecision) => Promise<T>): Promise<{ decision; value?: T }>
eligibleUserIds(ruleOrKind, ownerUserId, page): Promise<{ userIds: number[]; nextCursor }>
registerResolver(type, { get(id): Promise<Gate | null> })
registerPaymentVerifier(v) ; registerMembershipReader(r)
bumpViewer(userId, reason)  // follow, unfollow, block, stake confirm, purchase, membership change, age check
```

- `viewer` is always built from `ctx.user`. No endpoint accepts a wallet or user id from the client.
- `open` runs `check` with `intent: "open"` and `fresh: true`, calls `reveal` only on a pass, and logs the event. It replaces v1's client held AccessGrant JWT for every in app reveal (decision 2).
- `eligibleUserIds` serves broadcast audiences and the Telegram group sweep. It reads the mirror and Follow tables; it never grants.

tRPC `access` router:

| Procedure | Auth | Purpose |
| --- | --- | --- |
| `access.checkPage` | public | Decisions for every gated block and content card on a bio, after hydration |
| `access.check` | public | One decision, `intent` render or open |
| `access.openBlock` | public* | Text or media block body, through `open` |
| `access.rules.list`, `create`, `update`, `delete`, `stats` | private | Creator rules and stats |
| `blocks.setAccessRule` | private | Attach or clear a rule on a block |
| `GET /go/:blockId` | session cookie | Gated link redirect through `open` (v1 3.1.5 unchanged) |

*Public procedures return `not_signed_in` for anonymous viewers on any kind but public.

Feature owned reveals call `open` directly: `content.getReadUrl` and `getPreview` (sign gateway token), `live.watchToken` (Stream token), Telegram invite link, `messaging.send`.

Rate limits: 30 a minute per viewer key on check and open; 60 a minute on `/go`.

### 3.8 Freshness and caching

| Fact | Source at render | Source at open | Purged by |
| --- | --- | --- | --- |
| Rule | Redis 5 min | Same, version checked | edit, delete |
| Follow | DB | DB | follow, unfollow, block |
| Stake | Mirror, Redis 60 s | Chain read `fanStakes` no older than 60 s; falls back to mirror only to refuse, never to pass | `confirmStake`, `confirmUnstake` |
| Purchase, membership | DB | DB, `fresh` | payment indexer, refund, renewal job |
| Age check | `identity_checks` row, cached to `valid_until` or 24 h | Same | `identity.recheck`, wallet change |
| Decision | Redis 60 s keyed by `viewerVersion` | Not cached | `bumpViewer` |

`bumpViewer` is the "at least as fresh" step: a viewer who just paid, staked, followed or passed age check always gets a fresh decision on the next call. Chain failure at open refuses with `chain_unavailable` (fail closed). The stream exception from v1 3.1.4 stands: a Stream token covers its play session, up to 4 hours, and live tokens refresh every 30 minutes through `open`.

### 3.9 Public page rules

v1 sections 3.5 and 3.6 stand, with these changes:

- Locked block DTO: `{ id, type, order, gated: true, gate: { kind, summary }, config: { label, platform } }`. `custom` platform is sent as `locked`. No `clicks` on gated blocks.
- Content cards on a bio: locked cards carry title, the blurred cover from the preview pipeline, kind, duration and price display. Never the media token.
- 18+ cards follow the content spec: not in server HTML for anyone without a passed age check.
- Leak test in CI and nightly leak scan as v1, extended to content cards and the content sitemap.

### 3.10 Screens

The four Prism 2.2 gating screens (rule picker, locked bio, unlock sheet, rules and stats) and memberships board mb4 remain the base. Deltas for design, mobile first per the 23 Oct review:

1. Unlock sheet, phone: single step when the viewer is signed in and qualifies (open on tap, no sheet). Follow, Join, Buy and View pool as the one primary action per reason.
2. Age check: the Over 18 sheet from the identity checks spec 4.2, already built with A1. The unlock sheet hands off to it and returns to the item.
3. New state: purchase pending (soft unlock) with "Confirming payment" and access already open.
4. Rule picker: Early access date row ("Open to everyone on").
5. Locked content card with price and duration, matching R11 (sticky buy bar).

### 3.11 Compliance

v1 section 3.9 stands. Additions:

- Stake disclosure shows on every unlock sheet step for `pool_member` and `stake_min`, and for `any` or `all` with a stake leaf. Never on follower, paid or member sheets.
- No amount, rate, NRR, rank or reward figure appears on a locked card or unlock sheet. Pool links open the pool page and never start a stake.
- Paid and member copy follows the payment flow rules (creator branded, fan pays the creator, fee shown inside).
- The copy check script covers gating surfaces in client and landing app and fails on banned terms and on em and en dashes.

## 4. Requirements

### P0 (engine core, G0 to G3)

1. Unit fix and follower grace fix ship first, with tests that use wei on one side and whole tREVO on the other.
2. `AccessRule`, `AccessEvent`, `Block.accessRuleId`, content foreign key.
3. `check`, `checkBatch`, `open`, `eligibleUserIds`, resolver registry, preconditions, kinds follower, pool_member, stake_min, any, all.
4. Messaging, Telegram and broadcast run through the engine with no behavior change except the two fixes.
5. Gated link, text and media blocks with `/go`, locked DTO, `checkPage`, rule picker and unlock sheet, behind `ACCESS_GATING_ENABLED`.
6. Leak test in CI.

### P1

1. `paid` with `UsdcPaymentVerifier` and soft unlock (with store PR 10).
2. `member` (with Memberships phase C).
3. Age precondition calls `checkIdentity` (built in A1).
4. Rules and stats page, nightly leak scan, analytics events.
5. Early access date.

### P2 (designed for, not built)

`reward_points`, `rns_verified` and identity facets, SIWE external wallets, nested combinators, agency delegate preview, a whole page lock.

## 5. Acceptance criteria

1. A STAKE_MIN door of 500 tREVO refuses a fan with 499 tREVO and admits one with 500, measured in wei in the mirror. Same for Telegram group admission.
2. A follower inside the email grace passes `follower` in messaging, Telegram and gating alike. Past the grace without verification, the reason is `follow_pending` and the hint `confirm_email`.
3. Every refusal returns a reason from `ACCESS_REASONS` and a hint. No refusal JSON contains a stake amount, price set by someone else, email or full wallet.
4. Signed out, a bio with a gated link, text and content card contains no destination, body, media token or domain in HTML, `getHandle`, JSON-LD, share tags, sitemap or `llms.txt`.
5. A follower opens a gated link through `/go` in under 1 s at p95 warm, and a pool fan in under 2 s at p95 including the chain read.
6. After `confirmUnstake`, the next open is refused. After an unstake outside Amped, opens are refused within 60 s.
7. Chain RPC down: opens refuse with `chain_unavailable`; renders show the locked card.
8. A creator who blocks a fan refuses that fan on every kind within one request.
9. A rule edit bumps `version`; decisions cached under the old version are not used.
10. An 18+ item refuses with `age_check_required` until a passed age check exists, whatever the rule, including for followers and members.
11. `open` never calls the reveal function on a refusal (unit test with a spy).
12. Messaging and Telegram suites pass unchanged after G2, plus the new unit tests.
13. Typecheck, build and tests pass for server, client, landing app and constants. Copy check passes.

## 6. Build plan

Each PR is one branch into `development`, labeled by type, with a handoff doc for Gustavo.

| PR | Branch | Scope | Depends | Size |
| --- | --- | --- | --- | --- |
| G0 | `fix/stake-min-units` | `toWei` and `fromWei` in constants; migrate stored `stakeMin` values to wei; follower rule uses `trustedEmailWhere`; tests with real units | none | 0.5 day |
| G1 | `feat/access-core` | Constants contract, Prisma models and migration, engine, resolvers for `block` and `content`, kinds follower, pool_member, stake_min, any, all, caching, `bumpViewer` hooks in follow, block and stake confirm, rules router behind flag. No UI. | G0 | 4 days |
| G2 | `refactor/access-adopt` | `rules.ts`, `messaging/access.ts`, Telegram group sweep and broadcast audience call the engine. Resolvers `dm` and `telegram_group`. | G1 | 1.5 days |
| G3 | `feat/access-blocks` | `Block.accessRuleId`, locked DTO, `checkPage`, `/go`, `openBlock`, rule picker on the block row, unlock sheet in landing app, leak test, copy check | G1 | 4 days |
| Content PR 8 | `feat/content-gating` | Content resolver, `getReadUrl` through `open`, locked cards, item editor picker | G1 | content plan |
| G4 | `feat/access-paid` | `UsdcPaymentVerifier`, `paid` live, soft unlock, `purchase_pending` | Content PR 10 | 1.5 days |
| G5 | `feat/access-member` | Membership reader, `member` live | Memberships phase C | 1 day |
| G6 | `feat/access-insights` | Rules and stats page, events, nightly leak scan, early access date | G3 | 2 days |

The age precondition needs no PR of its own: G1 calls `checkIdentity` from I1.

**Sequence with messaging and content going live first (Rob, 23 Oct):**

1. G0 before messaging goes live. Messaging ships the Fan messages minimum stake door and Telegram group admission, which carry the unit defect.
2. I1 and A1 (identity checks spec) with the content system. Content goes live with public items and 18+ items behind the Over 18 check. Members only, Followers only and paid items wait for the engine.
3. S1 rides with the first PR that sells for USDC (store PR 9 or memberships).
4. G1, then G2, G3, content PR 8 and G6 in parallel. G4 with store PR 10, G5 with memberships phase C.

While messaging runs before G2, its evaluator (`telegram/rules.ts`) stays in place with the G0 fix. G2 moves it onto the engine with no behavior change.

Critical path to the first paid unlock: G0, G1, content PR 8, store PR 9 with S1, store PR 10, G4.

Flags: `ACCESS_GATING_ENABLED` (server), `VITE_ACCESS_GATING` (client and landing), `ACCESS_STAKE_KINDS_ALLOWLIST` (creator ids for pool kinds while counsel reviews).

## 7. Decisions for Rob (recommended first)

1. **Build in house.** Recommended: an in process engine in the API. Why: nine kinds over our own tables and one chain read; OpenFGA would need every follow, stake and purchase synced into a second store, and Cedar or OPA add a policy language for a problem a typed switch solves. Alternative: OpenFGA for relationship checks.
2. **One call reveal, no client grant.** Recommended: `open` checks and reveals in one request; drop v1's 10 minute AccessGrant JWT for in app reveals. Why: one round trip on phones, one less secret to replay, and the media token already is the short lived grant. Alternative: keep the v1 grant (two calls per open).
3. **Rule ids are UUIDs.** Settled by the repo: AGENTS.md requires UUIDv7 `Binary(16)` keys on every new table, and `ContentItem.accessRuleId` already ships with that type. No decision needed.
4. **Age check is a precondition, not a kind, and it is Authbase.** Recommended: every 18+ item runs the Authbase Over 18 check before any rule. Why: a creator cannot forget it, and Authbase already verifies it today (Rob, 23 Oct). Alternative: an `age` kind combined with `all`.
5. **Soft unlock on paid.** Recommended: `paid` passes on first chain confirmation, final at 12, revoked on reorg or failure. Why: matches the 23 Oct mobile review (R7, D4). Alternative: wait for finality (about 25 seconds on Base).
6. **Fix before messaging goes live.** Recommended: G0 ships before messaging launch; messaging keeps its own evaluator until G2 moves it onto the engine. Why: the unit defect lets any staker through a minimum stake door, and messaging launches before the engine. Alternative: launch messaging without the minimum stake rule and add it back with G2.
7. **New kinds.** Recommended: define `rns_verified` now and build it with RNS phase 2; no code lock or email capture lock. Why: Rob wants identity facets on profiles; a code lock duplicates Followers and invites sharing; follows already capture the fan. Alternative: add a code lock for event style drops.
8. **Early access date on rules.** Recommended: yes, in G6. Why: a standard Patreon lever, one column, no new kind. Alternative: creators publish twice.

## 8. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| Does Amped as a whole fall under any state age verification threshold, and does the Authbase check meet the method those laws require | Counsel, Authbase team | A1 go live |
| Securities counsel comments on pool_member and stake_min copy (review running in parallel) | Counsel | GA of stake kinds |
| Does `CreatorPool.fanStakes` reflect stakes made through the base token on Libertas (v1 build check) | Engineering | G1 open path |
| Store PR 9 `Offer` and PR 10 `Purchase` shapes final | Content plan | G4 |
| Agency delegate preview scope | Rob with #38 | No |

## 9. Success metrics

Leading (30 days after G3 behind the pilot allowlist): 30 percent of pilot creators gate at least one item; unlock success above 45 percent of attempts; locked view to attempt above 8 percent; `chain_unavailable` under 1 percent of attempts; leak scan finds 0.
Lagging (90 days after paid goes live): share of creators with any paid or member gated item; revenue through paid unlocks per active creator; support tickets about access under 1 per 1,000 unlocks.

## Sources

- Patreon, Setting post access: https://support.patreon.com/hc/en-gb/articles/37807653033997
- Patreon, Free trials: https://creatorhub.patreon.com/articles/give-your-audience-a-taste-of-membership-with-free-trials
- Linktree, Profile Lock (beta): https://linktr.ee/help/en/articles/15965888-make-your-linktree-private-with-profile-lock-beta
- Guild, How Guild works: https://docs.guild.xyz/guild/how-guild-works
- Unlock Protocol, Renewals: https://docs.unlock-protocol.com/core-protocol/public-lock/renewals
- AuthZed, SpiceDB consistency: https://authzed.com/docs/spicedb/concepts/consistency
- Permit.io, OPA vs OpenFGA vs Cedar: https://permit.io/blog/policy-engine-showdown-opa-vs-openfga-vs-cedar
- Perkins Coie, Free Speech Coalition v. Paxton: https://www.perkinscoie.com/node/10016
- AVP Association, US state age verification laws (September 2026): https://avpassociation.com/us-state-age-verification-laws-for-adult-content/
- v1 sources (Collab.Land, Lit, Shopify, Base Verify, Stan, Gumroad) remain in the v1 spec.

## Revision log

- 2026-10-23 (later): Rob's direction applied. Age precondition uses the Authbase Over 18 attribute through the shared identity check (G7 removed). Seller verification precondition on paid and member. Sequence: messaging and content live before the engine; G0 before messaging launch.
- 2026-10-23: v2. Reconciled to development at 48ca154. Audit found no engine, two defects in the messaging evaluator, UUID rule ids on content, the media gateway in place of CloudFront. Added preconditions (blocked, age, early access), one call `open`, `paid` soft unlock, `member` from #25, `rns_verified` defined, adoption of messaging, Telegram and broadcast, and a PR plan G0 to G7.
