# Agency System

Status: Draft for Rob's review, 3 Nov 2026. Written in the Full QA pass of 3 Nov (finding AG-Q1, rows 167 to 179). Nothing here is built. The 17 decisions on Build Board card #38 are still open; this spec builds the recommended answer for each and says so.
Owner: Rob Frasca. Drafted by Claude for Rob and Gustavo.
Build Board: #38 Agency System.
Source: project docs `claude/amped-agency-spec-2026-10-14.md` (spec, baseline 8a8c222), `claude/amped-agency-overview-2026-10-14.md`, `claude/amped-agency-research-2026-10-14.md`. This file replaces the project spec. Where they differ, this file wins.
Baseline: `development` at 98db33f (3 Nov 2026).
Design: Agency System boards ag1 to ag13, https://claude.ai/artifact/1ZvoDCgRMo7WpE2WL9Ltdx (redrawn 3 Nov as Prism 2.2 HTML boards, desktop 1440 and phone 390 for every board).
Reads with: `docs/features/messaging.md` (Amped Messages r4: 2, 8.1, 8.2, 9), `docs/features/identity-checks.md` (5.1, 5.3), `docs/features/content-system.md` (split table, store), `docs/features/mobile-checkout.md` and `packages/constants/src/checkout.ts` (`usdcDollarsLabel`, `CHECKOUT_COPY.soldBy`), `docs/features/store-policy.md` and `docs/legal/adult-content-policy.md` (PR #420 head, COUNSEL-ADULT v1.1), `docs/features/brand-portal.md` (branch docs/qa-fixes-brandportal), `packages/constants/src/feature-flags.ts`, `packages/constants/src/access.ts`.

## 1. Summary

Agencies run their whole roster on Amped.Bio. Each staff member signs in with their own account and works on a creator's page by acting as that creator. A purple bar on every screen says whose page they are on. Every action lands in an audit log the creator reads.

The creator stays the owner and the seller. The creator keeps the payout wallet, the login, two factor, every identity check and the exit. The creator is the seller of record for every sale, whoever built the item. The agency's commission is a row in the creator's split table, paid in the same transaction as the creator under terms the creator signs with the wallet that collects the money.

## 2. Rules carried in

| Rule | Source |
| --- | --- |
| Amped is a platform and storefront. The creator is the seller of record and the producer | `docs/legal/adult-content-policy.md` section 1 items 1 to 3 (PR #420 head) |
| "An agency may manage a creator's account. The creator remains responsible for every item on it. An agency that films or produces content is itself a producer of that content." | `docs/legal/adult-content-policy.md` 4.2, lines 128 to 130 (PR #420 head). Counsel text, quoted verbatim |
| A person who manages sexually explicit content is a secondary producer | `docs/legal/adult-content-policy.md` 6.2, lines 346 to 352 |
| Checkout is creator branded. The seller line is `CHECKOUT_COPY.soldBy(seller)` | `docs/legal/adult-content-policy.md` section 8; `packages/constants/src/checkout.ts` CHECKOUT_COPY |
| Money on creator surfaces reads "$N USDC" (`usdcDollarsLabel`). Whole amounts drop the cents | `packages/constants/src/checkout.ts` lines 124 to 147, decision D6 |
| A creator collects USDC only as a verified seller: Authbase VERIFIED on the receiving wallet and an active RNS name bound to it, both ways | `docs/features/identity-checks.md` 5.1; Rob, 3 Nov |
| Agencies on a split table are not checked by the seller service. Their payouts pass `services/usdc/screen.ts` | `docs/features/identity-checks.md` line 147 and line 170 |
| Inbox is Amped Messages: Primary, Requests, Broadcast. No Telegram surface | `docs/features/messaging.md` sections 1, 8.2; Rob, 2 Nov |
| Feature switches are site_settings flags in `FEATURE_FLAGS`, not env vars | `packages/constants/src/feature-flags.ts` lines 1 to 15; Rob, 3 Nov |
| "Members" means the USDC membership kind only. Stake audiences read "Pool fans" and "Fans with a minimum stake" | `packages/constants/src/access.ts` lines 95 to 105 |
| No dashes and no banned money words on any surface. No staking, pool or tREVO language on agency surfaces | BRIEF rule 2; `check:copy` (`scripts/check-compliance-copy.ts`) |
| No new third party recipient of personal data without a privacy policy update | `docs/legal/privacy-parameters.md` line 30 |

## 3. Decisions

### 3.1 Open on card #38 (Rob)

Each row is still open on the Build Board. This spec builds the recommended answer.

| Id | Question | Recommended (built here) | Alternative |
| --- | --- | --- | --- |
| commission-base | What is the commission a percentage of? | The creator's share after the 5% platform fee and any promoter. The fan price never changes | Share of the gross price; a fee added on top |
| commission-band | Allowed range | 0% to 30%. Above 20% needs a second plain language confirmation and a yearly reconfirmation | 10% to 30% flat; up to 50% |
| streams | Which sales carry commission | Chosen per agreement from memberships, store, tips and live tickets. Brand deals wait for AG-D1. Pool staking and anything in tREVO never carry commission | All sales |
| leave-notice | Leaving | Leave any time. Access ends at once. Commission runs to the signed notice end (default 30 days, max 90), then stops in code, renewals included | Commission stops at once; access through notice |
| brand-tail | Post term tail | 0 to 12 months, brand deals logged during the term only, half rate in the second half. Waits for AG-D1 | No tail |
| one-agency | Agencies per creator | One commissioned agency at a time | Several with separate scopes |
| review-publish | Creator approval of agency edits | Off by default. The creator can turn on Review before publish | On by default |
| team-label | Do fans see staff replies | Yes. Team, or AI assisted, on every staff or agent message, always on | Terms only |
| adult-agencies | 18+ creators | Not in the pilot. After the #28 controls, the attestation and the red flag queue, behind the `agencyAdult` flag | Never; from day one |
| verification | Agency checks | Phase 1: email and website review. Before any commission: KYB, sanctions on owners and the payout wallet, W-9 or W-8 | Full KYB before phase 1 |
| pricing | Agency pricing | Free in the pilot and beta up to 25 creators, then Agency Pro by roster size in USDC, Amped as seller | 1% of commission; per seat |
| namespace | Agency page URL | Same handle namespace, amped.bio/northlight | amped.bio/a/northlight |
| bulk | Bulk changes | Theme kits and blocks to a group, applied and logged per creator, creator can opt out | None in v1 |
| who-starts | Who starts the link | Both. The creator signs last | Invite only |
| partner-rows | #20 decision 21 | Agency rows come from creator signed terms. Other partners stay admin set | All admin set |
| analytics-access | Agency analytics | Full creator analytics in scope. Revenue only for roles with revenue access. No fan level exports | Revenue for every role |
| agency-record | Agency Record | Phase 2 counts only. Phase 4 adds growth and verified reviews | No record |

### 3.2 Opened by the 3 Nov Full QA (Rob)

| Id | Question | Recommended | Alternative |
| --- | --- | --- | --- |
| AG-D1 | Do brand deal payments run through Amped? The brand portal says Amped does not process collaboration payments (`docs/features/brand-portal.md` line 12). The October agency spec routed them through AmpedPay with the agency row | Not in v1. Deals (ag10) tracks status and terms only. The brand deals stream and the brand tail stay off (`agencyBrandPay` flag off) until AmpedPay and counsel cover brand payments | Route through AmpedPay with the agency row; track off platform deals with no commission row |
| AG-D2 | Does the fan see the agency share? | No. The seller line stays `CHECKOUT_COPY.soldBy(creator)`. The split shows to the creator (Sales) and the agency (statements) only | A receipt line "Includes a share for {agency}" |
| AG-D3 | AI suggested replies in the team inbox | Off in v1 (`agencyAiDrafts` flag off). Turn on only after counsel clears the processor, the privacy notice names it, and the creator opts in per account | Ship with the AI assisted label in phase 3 |
| AG-D4 | Can staff accept a message request for the creator? Replying accepts in Amped Messages (`docs/features/messaging.md` line 52) | Yes for staff with the inbox scope. Accepting writes an audit row and the creator sees it in Activity | Creator only; staff can read Requests but not reply |
| AG-D5 | When does an agency show Verified agency? | Only after KYB passes. Phase 1 agencies show "Agency" with no badge | Badge after the phase 1 email and website review |

## 4. Phases and flags

| Phase | Ships | Flags (site_settings, `FEATURE_FLAGS`) |
| --- | --- | --- |
| 1 Manage, no money | Agency accounts, staff and roles, invite and request, terms without commission, acting as and the switcher, Page, Content, Design and Motion access, roster home and analytics, groups, audit log, Leave agency, the private check, notifications | `agency` (public, default false) |
| 2 Get paid | KYB, commission in the terms, EIP-712 signature, agency split row, membership end dates, statements, agency page blocks, Agency Record v1 | `agencyCommission` (server, default false), `agencyPage` (public, default false) |
| 3 Talk and deal | Team inbox in Amped Messages with assignment and the Team label, staff broadcasts, deals tracker, media kit, theme kits | `agencyInbox` (public), `agencyBrandPay` (server, AG-D1), `agencyAiDrafts` (public, AG-D3), all default false |
| 4 Grow, 5 Agents | Record v2, reviews, performance commission, Roster Pass, scouting, agent seats on RNS | Later, no date |
| 18+ creators | Adult agencies (decision adult-agencies) | `agencyAdult` (server, default false) |

Each flag is added to `FEATURE_FLAGS` in `packages/constants/src/feature-flags.ts` with label, description, scope and default. No env var. Every public flag that gates an action is checked again on the server.

## 5. Rules that are not settings

These hold in every phase and are enforced on the server. Acting as never changes them.

1. **Creator only, always.** With `actingAsUserId` set, these procedures return `FORBIDDEN acting_as_not_allowed`:
   - wallet, send, withdraw, payout address, tokens, pools and staking, RNS names and RNS binding;
   - login, email, password, two factor, recovery, sessions, account deletion;
   - every identity check: Authbase Over 18 and seller (`identity.*`, `authbase.*`), the Get paid checklist and its Publish step;
   - store policy: mode, seller name source, refund option and the custom text confirmations (`docs/features/store-policy.md` 3.1);
   - 18+: the 18+ setting, the custodian of records, the performer release flow (`people.release.*`), item submission when the item has 18+ on;
   - the representation itself: commission, terms signature, Leave, Get help, narrowing scopes, Review before publish.
2. No agency role exports or reads fan email addresses or wallet addresses in any list. Fan rows show display name and handle, as everywhere else. Fan data never crosses creators: About this fan shows the fan's relation to the creator in view only.
3. Every agency mutation writes one audit row in the same database transaction as the change. Reads that expose fan conversations write an audit row too (`inbox.thread.open`), once per thread per staff session.
4. The creator can always reach Leave agency and Get help.
5. A split table with an agency row is signed only if a creator signed terms record covers it: same agency payout address, bps at or below the signed bps, stream in scope, now before the row's end date, the creator a verified seller on the same wallet that signed.
6. Agency staff must have two factor on. A staff session without it can open only Account settings.

## 6. Seller of record and money

1. The creator is the seller of record for every sale on the creator's page, including items an agency drafted, priced or published while acting as the creator. The agency is never a seller and is not a party to the sale (`docs/legal/adult-content-policy.md` section 1 item 2, 4.2).
2. Checkout does not change. The pay sheet, the receipt and the store notice name the creator only: `CHECKOUT_COPY.soldBy(creatorName)`. The agency name never appears on a fan surface in a money context (AG-D2).
3. The fan pays the creator. One transaction carries Amped's 5% fee, the agency row and the creator's share. No one holds anyone's money.
4. Commission exists only for a verified seller. The creator must pass `checkIdentity(creator, "seller")` and the terms are signed with the wallet that passed, which is the payout wallet bound both ways to the creator's RNS name. If the binding is one way, the terms sheet shows the Get paid card with the Publish step first (identity-checks 5.2) and Sign terms is disabled.
5. The agency payout address passes `services/usdc/screen.ts` on save and on every quote. It is not checked by the seller service (identity-checks line 147).
6. Every amount on agency and creator money surfaces uses `usdcDollarsLabel` ("$1.90 USDC", "$12 USDC"). Statements CSV carries exact micro USDC. Display rounding follows `usdcDollars`.
7. Amped is the seller only for Agency Pro, with an Amped branded checkout.

### 6.1 Commission math (phase 2)

```
platformBps = 500                                    // 5%, payments.ts feeFloorBps
promoterBps = promoter code bps of amount, if any
creatorPool = 10000 - platformBps - promoterBps
agencyBps   = floor(creatorPool * commissionBps / 10000)
creatorBps  = creatorPool - agencyBps
require creatorBps >= 5000
```

Example used on every board: a $10 USDC sale at 20%. Amped $0.50 USDC, agency $1.90 USDC, creator $7.60 USDC.

The EIP-712 signature (domain `Amped.Bio Representation`, chain Base) covers the creator address, agency payout address, commissionBps, streams, startsAt, expiresAt, noticeDays and termsVersion. The split signer checks it before adding the agency row. On Leave, `noticeEndsAt` is set and every `SplitRecipient.endsAt` and stored membership row end date for that agency is set to it.

## 7. Data model

Prisma, MySQL, UUID v7 `Bytes @id @db.Binary(16)` for every new table. `users.id` stays Int.

```prisma
enum AccountType { CREATOR FAN AGENCY }
// users: accountType AccountType @default(CREATOR) @map("account_type")

model Agency {
  id            Bytes    @id @db.Binary(16)
  userId        Int      @unique @map("user_id")
  legalName     String   @map("legal_name") @db.VarChar(200)
  country       String   @db.VarChar(2)
  website       String?  @db.VarChar(300)
  status        String   @default("pending") @db.VarChar(16) // pending | reviewed | verified | suspended
  kybStatus     String   @default("none") @map("kyb_status") @db.VarChar(16)
  kybRef        String?  @map("kyb_ref") @db.VarChar(64)
  taxFormStatus String   @default("none") @map("tax_form_status") @db.VarChar(16)
  payoutAddress String?  @map("payout_address") @db.VarChar(42)
  licenseAttest Json?    @map("license_attest")
  openToApply   Boolean  @default(true) @map("open_to_apply")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  @@map("agencies")
}

model AgencyMember {
  id          Bytes    @id @db.Binary(16)
  agencyId    Bytes    @map("agency_id") @db.Binary(16)
  userId      Int      @map("user_id")
  role        String   @db.VarChar(16) // owner | admin | manager | designer | chatter | deals | analyst
  allCreators Boolean  @default(false) @map("all_creators")
  revenueView Boolean  @default(false) @map("revenue_view")
  status      String   @default("invited") @db.VarChar(12) // invited | active | removed
  invitedBy   Int      @map("invited_by")
  createdAt   DateTime @default(now()) @map("created_at")
  @@unique([agencyId, userId])
  @@index([userId, status])
  @@map("agency_members")
}

model AgencyMemberCreator {
  memberId         Bytes @map("member_id") @db.Binary(16)
  representationId Bytes @map("representation_id") @db.Binary(16)
  @@id([memberId, representationId])
  @@map("agency_member_creators")
}

model AgencyGroup {
  id        Bytes  @id @db.Binary(16)
  agencyId  Bytes  @map("agency_id") @db.Binary(16)
  name      String @db.VarChar(60)
  parentId  Bytes? @map("parent_id") @db.Binary(16)
  sortOrder Int    @default(0) @map("sort_order")
  @@index([agencyId])
  @@map("agency_groups")
}

model Representation {
  id                  Bytes     @id @db.Binary(16)
  agencyId            Bytes     @map("agency_id") @db.Binary(16)
  creatorUserId       Int       @map("creator_user_id")
  status              String    @db.VarChar(16) // invited | requested | checking | active | notice | ended | declined | suspended
  startedBy           String    @map("started_by") @db.VarChar(8)
  groupId             Bytes?    @map("group_id") @db.Binary(16)
  termsId             Bytes?    @map("terms_id") @db.Binary(16)
  reviewBeforePublish Boolean   @default(false) @map("review_before_publish")
  bulkOptOut          Boolean   @default(false) @map("bulk_opt_out")
  creatorScopes       Json      @map("creator_scopes")
  showOnRoster        Boolean   @default(false) @map("show_on_roster")
  activatedAt         DateTime? @map("activated_at")
  noticeEndsAt        DateTime? @map("notice_ends_at")
  endedAt             DateTime? @map("ended_at")
  endedBy             String?   @map("ended_by") @db.VarChar(8)
  createdAt           DateTime  @default(now()) @map("created_at")
  @@index([agencyId, status])
  @@index([creatorUserId, status])
  @@map("representations")
}
// At most one Representation per creator with status active, checking or notice (checked in a transaction).

model RepresentationTerms {
  id                   Bytes     @id @db.Binary(16)
  representationId     Bytes     @map("representation_id") @db.Binary(16)
  version              Int
  commissionBps        Int       @map("commission_bps")   // of the creator's share, 0 to 3000
  streams              Json                                // ["membership","store","tip","ticket"] ("brand" only with agencyBrandPay)
  scopes               Json                                // ["page","content","design","inbox","broadcast","deals","analytics","revenue"]
  termMonths           Int       @map("term_months")
  noticeDays           Int       @map("notice_days")
  brandTailMonths      Int       @default(0) @map("brand_tail_months")
  autoRenew            Boolean   @default(false) @map("auto_renew")
  proposedBy           Int       @map("proposed_by")
  signerAddress        String?   @map("signer_address") @db.VarChar(42) // must equal the seller checked wallet
  creatorSig           String?   @map("creator_sig") @db.VarChar(132)
  creatorSignedAt      DateTime? @map("creator_signed_at")
  agencySignedBy       Int?      @map("agency_signed_by")
  agencySignedAt       DateTime? @map("agency_signed_at")
  highShareConfirmedAt DateTime? @map("high_share_confirmed_at")
  expiresAt            DateTime  @map("expires_at")
  @@unique([representationId, version])
  @@map("representation_terms")
}

model AgencyAudit {
  id            Bytes    @id @db.Binary(16)
  agencyId      Bytes    @map("agency_id") @db.Binary(16)
  creatorUserId Int?     @map("creator_user_id")
  actorUserId   Int      @map("actor_user_id")
  actorKind     String   @map("actor_kind") @db.VarChar(8)  // staff | creator | system
  action        String   @db.VarChar(64)                    // session.acting_as.start, page.block.update, inbox.reply, inbox.request.accept, inbox.thread.open
  target        String?  @db.VarChar(128)
  diff          Json?                                        // field names and short values, no fan email or wallet
  ip            String?  @db.VarChar(45)
  createdAt     DateTime @default(now()) @map("created_at")
  @@index([creatorUserId, createdAt])
  @@index([agencyId, createdAt])
  @@map("agency_audit")
}
// Append only. No update or delete path. Retained 24 months.

model AgencyApplication {
  id            Bytes    @id @db.Binary(16)
  agencyId      Bytes    @map("agency_id") @db.Binary(16)
  creatorUserId Int      @map("creator_user_id")    // sign in required to apply
  links         Json
  helpWith      Json     @map("help_with")
  note          String?  @db.VarChar(1000)
  status        String   @default("new") @db.VarChar(12) // new | contacted | invited | declined
  createdAt     DateTime @default(now()) @map("created_at")
  @@index([agencyId, status])
  @@map("agency_applications")
}

model SafetyCheck {
  id               Bytes    @id @db.Binary(16)
  representationId Bytes    @map("representation_id") @db.Binary(16)
  answers          Json                                 // never visible to the agency
  flagged          Boolean  @default(false)
  createdAt        DateTime @default(now()) @map("created_at")
  @@map("agency_safety_checks")
}
```

Changes to existing tables:

- `DirectMessage` (`packages/database/prisma/schema.prisma` line 1867): add `sentByUserId Int? @map("sent_by_user_id")` (the staff member when it differs from `senderId`) and `senderLabel String? @db.VarChar(8)` (`team` or `ai`). The bubble shows the label to both sides. The fan never sees the staff member's name.
- `SplitRecipient` (#20): add `representationId Bytes?` and `endsAt DateTime?`; `role` gains `agency`.
- AmpedMemberships (#25): per recipient `uint64 endsAt` in the stored split. A renewal after `endsAt` pays that row's bps to the creator. Lands before the contract audit.

## 8. Server

### 8.1 Acting as

`apps/server/src/trpc/trpc.ts` builds `ctx.user` (SessionUser, lines 6 to 12) from the Better Auth session, including `wallet`. Add:

- `ctx.actor`: the signed in person. Always.
- `ctx.subjectId`: the account the request acts on. Default `ctx.actor.sub`.
- Session field `actingAsUserId`, set only by `agency.switch`. The client also sends `x-amped-acting-as: <handle>`; a mismatch returns `ACTING_AS_MISMATCH`, so a stale tab cannot write to the wrong creator.
- `resolveSubject(ctx, scope)`: loads the active Representation and the actor's AgencyMember row, checks role, signed scopes, creator narrowing and assignment. Cache 30 seconds per session. Failure returns `FORBIDDEN` with a reason code.
- `ownerProcedure(scope)` replaces `privateProcedure` in owner scoped routers. It sets `ctx.subjectId`, runs the mutation and the audit insert in one transaction.
- `creatorOnlyProcedure` wraps every procedure in section 5 item 1. It refuses when `actingAsUserId` is set.
- `ctx.user.wallet` is never replaced by the subject's wallet. Code that needs the creator's payout address reads it from the subject's row and only inside creator only or system paths.
- Refactor: there are 230 uses of `ctx.user!.sub` under `apps/server/src/trpc` today. Owner scoped routers move to `ctx.subjectId`; the rest move to `ctx.actor.sub`. A lint rule forbids `ctx.user!.sub` under `trpc/` outside an allowlist.
- `agency.switch` writes `session.acting_as.start` and the previous subject's `session.acting_as.end` to `AgencyAudit`.
- Gustavo's admin plugin `impersonatedBy` is not used for agencies.

Scope map:

| Scope | Procedures |
| --- | --- |
| page | `blocks.*`, `user.profile.update` (name, bio, photo), page status |
| content | `content.*` except store policy, 18+ items and price changes while `agencyCommission` is off |
| design | `theme.*`, `design.*`, `motion.*` |
| inbox | Amped Messages creator side: `messages.list`, `messages.thread`, `messages.send`, `messages.request.accept` (AG-D4), mute and archive. Never `messages.settings.*` or Blocked accounts |
| broadcast | `broadcast.creator.*` in Inbox, Broadcast |
| deals | brand requests creator side (`docs/features/brand-portal.md` 7.3), read and reply; accept stays with the creator |
| analytics | `analytics.*` without revenue fields |
| revenue | revenue fields in analytics, `store.sales` read, the creator's statement rows |

No scope reaches `telegram.*`. Telegram routers are being removed under #2.

### 8.2 Routers

`apps/server/src/trpc/agency/`:

- `agency.create`, `agency.update`, `agency.get`, `agency.verify.start`, `agency.payoutAddress.set` (screened).
- `agency.members.invite|update|remove|list`, `agency.groups.*`.
- `agency.roster.list({ groupId?, q?, sort })`.
- `agency.switch({ creatorHandle })`; `null` returns to the agency.
- `agency.invite`, `agency.request` (creator side), `agency.terms.propose`, `agency.terms.sign`.
- `agency.leave` (creator only), `agency.end` (agency owner, same notice rules).
- `agency.audit.list`, `agency.audit.export`.
- `agency.analytics.rollup({ groupId?, range })`, capped at 500 creators.
- `agency.statements.list|export` (phase 2).
- `agency.applications.*` (phase 2). Applying needs a signed in account.
- Creator side `account.agency.*`: `get`, `narrowScopes`, `setReviewBeforePublish`, `setBulkOptOut`, `showOnRoster`, `safetyCheck.submit`, `getHelp`, `leave`.

### 8.3 Team inbox (phase 3)

The team inbox is Amped Messages read across the roster. It is not a second messaging system.

- Folders are the creator's own: Primary, Requests, Broadcast. A creator filter and Mine, Unassigned filters sit above the list.
- Staff replies are `DirectMessage` rows with `senderId` the creator and `sentByUserId` the staff member, `senderLabel` `team`. The fan sees "Team" under the bubble.
- Request rules hold. Links stay plain text until accepted. A staff reply accepts the request (AG-D4) and writes `inbox.request.accept`.
- Assignment and team notes live in `agency_thread_meta` (thread id, assignee, notes). Notes never reach the fan.
- About this fan shows the relation to this creator only: Follower since, Member since, purchases with this creator. Never other creators on the roster.
- AI suggested replies stay off (AG-D3).

### 8.4 Safety

- Private check on activation, four questions, on the creator's device, never shown to the agency: Did you choose to work with this agency? Can you sign in to Amped.Bio by yourself? Do you control the wallet your earnings go to? Is anyone pressuring you to agree? Any No opens a trust and safety case and holds activation (`checking` status).
- Red flags to the trust and safety queue: terms above 2000 bps; a payout wallet change within 14 days of activation; the creator signing in from an IP or device used by agency staff; one device on more than 3 creator accounts; a bouncing creator email.
- Get help: Leave now, Report this agency, Talk to someone (trafficking hotline link). Trust and safety can end commission at once on a confirmed case.
- 18+ creators: off (`agencyAdult`). When on, the agency attests it is not present at the creator's ID and liveness check, and 2257 records name the agency when it arranges, films or manages the sexually explicit content (adult-content-policy.md 4.2, 6.2).

### 8.5 Notifications

In app (bell) and email (SMTP2GO): request received (agency), invite received (creator), terms signed, creator left (agency, with the notice end date), staff removed, approval waiting (creator, review before publish), renewal in 30 days (both), yearly high share reconfirmation (creator), KYB result (agency).

## 9. Client

### 9.1 Shells

- **Agency account.** Rail: Roster, Inbox (phase 3), Deals, Analytics, Team, Agency. Top bar: title, search with Cmd K, agency chip, bell, Help, avatar. Phone dock: Roster, Inbox, Analytics, Team, More (Deals and Agency in More).
- **Acting as.** The creator rail as shipped (`apps/client/src/components/shell/destinations.ts`): Home, Explore, Inbox; Page group Page, Content, Design, Analytics, People. Wallet and My Pool are not rendered. The top bar shows the Acting as chip where the wallet chip would be, then the bell. Under the top bar, on every destination, the Acting as bar: solid value deep #5B2F70, white 13/16 text (10.1:1), "Working on {name}'s page as {agency}. You: {staff}, {role}." and a 44 high Back to roster button. On the phone the bar sits under the top bar and Back to roster is a 44 icon button with a label.
- **Creator.** Account, Agency tab inside the shipped creator shell, with the bell.

### 9.2 Screens

| Board | Route | Frames | States drawn |
| --- | --- | --- | --- |
| ag1 Roster | `/roster` | 1440, 390 | Loading, empty roster, error, no revenue access |
| ag2 Switcher | Cmd K, chip | 1440 palette, 390 full sheet | No match, autosave failed before switch |
| ag3 Acting as, Page | `/@handle/page` | 1440, 390 | Access ended mid session, Review before publish draft, scope missing |
| ag4 Analytics | `/analytics` | 1440, 390 | Loading, no data, no revenue access |
| ag5 Send terms | `/roster`, Add creator | 1440 panel, 390 sheet | Above 20%, over 30% refused, creator not a verified seller, sent |
| ag6 Sign terms | `/account?tab=agency` | 390 sheet, 1440 value panel | Private check, second confirmation above 20%, binding one way, wallet rejected, signed |
| ag7 Account, Agency | `/account?tab=agency` | 1440, 390 | No agency, invite waiting, notice running, ended |
| ag8 Leave | sheet | 390 sheet, 1440 dialog | Leaving, could not leave, left |
| ag9 Team inbox | `/inbox` | 1440, 390 | Requests folder, no messages, access narrowed |
| ag10 Deals | `/deals` | 1440, 390 | Empty, waiting on creator, AG-D1 notice |
| ag11 Agency page | `/{handle}` | 390, 1440 | Sign in to apply, sent, closed to applications |
| ag12 Team | `/team` | 1440, 390 | Invite staff sheet, two factor missing |
| ag13 Statements | `/analytics?tab=commission` | 1440, 390 | Empty month, CSV failed |

### 9.3 Copy

All strings in `packages/constants/src/agency.ts` and checked by `check:copy`. No dashes. Money through `usdcDollarsLabel`.

- Acting as bar: "Working on {name}'s page as {agency}. You: {staff}, {role}." Button: "Back to roster".
- Terms checkbox: "I agree to these terms. I can leave at any time. Commission runs to the end of the notice period."
- Above 20%: "{agency} receives more than 20% of your share. Confirm you chose this." Checkbox required. Yearly: "Your terms give {agency} {n}% of your share. Keep them?"
- Not a verified seller: "To sign terms with a commission, finish Get paid first. Your terms are signed with the wallet you get paid in."
- Apply sheet: "Never share your password with an agency. Report an agency that asks for an upfront fee."
- Not a talent agency notice: text from counsel (section 14, C1). Until then the boards show the October draft and mark it Counsel.
- Team label: "Team". AI label: "AI assisted" (AG-D3).

## 10. Analytics events

Server `track()` through the #11 registry: `agency_created`, `agency_verified`, `agency_member_invited`, `representation_invited`, `representation_requested`, `representation_terms_signed`, `representation_activated`, `representation_left`, `representation_ended`, `agency_switch`, `agency_edit`, `agency_reply_sent` (label team), `agency_application_submitted`, `agency_statement_exported`. Events never carry fan identifiers.

## 11. Acceptance

1. A Designer on @maya can change her theme and cannot add a block (`FORBIDDEN scope_page`).
2. With acting as set, every procedure in section 5 item 1 returns `FORBIDDEN acting_as_not_allowed`, including `identity.*`, `authbase.*`, RNS binding, store policy, the 18+ setting and `people.release.*`.
3. Switching creators flushes autosave, resets the editor and the query cache and changes the URL. A second tab still on @maya cannot write (`ACTING_AS_MISMATCH`). The switch writes `session.acting_as.start`.
4. Every agency mutation writes one audit row in the same transaction. The creator sees it in Activity within 5 seconds. Opening a fan thread writes `inbox.thread.open` once per session.
5. A representation is active only after the creator signs (phase 2) or accepts (phase 1) and passes the private check.
6. Leave: agency access fails within 60 seconds; the agency is notified; split rows end at the notice date.
7. A $10 USDC payment at 20% pays $0.50 USDC, $1.90 USDC and $7.60 USDC in one transaction. The pay sheet reads `CHECKOUT_COPY.soldBy(creator)` and names no agency. The statement shows the transaction hash.
8. A split request with agency bps above the signed bps is refused.
9. A membership joined during the term renews after the notice end with no agency row.
10. Terms at 25% need the second confirmation and are flagged to trust and safety.
11. Terms with a commission cannot be signed while the creator is not a verified seller or the RNS binding is one way; the sheet shows Get paid.
12. A fan sees "Team" under a staff reply in Amped Messages. No Telegram path exists.
13. About this fan never shows the fan's relation to another creator.
14. Roster analytics for 50 creators return in under 1.5 seconds at p95.
15. Agency lists never contain fan email or wallet addresses.
16. A staff member without two factor can open only Account settings.
17. Every agency flag is a `FEATURE_FLAGS` entry and reads from site_settings.

## 12. Build plan

- Phase 1: schema, `resolveSubject`, `creatorOnlyProcedure` and the router refactor (largest item), agency rail, Roster, switcher, Account Agency tab, audit log, notifications. 5 to 7 weeks.
- Phase 2: after #25 and #20 contracts. KYB, EIP-712 terms, split changes, statements, agency page blocks. 4 to 5 weeks.
- Phase 3: after #2 Amped Messages M9 and #7. 4 weeks.

## 13. Changes to other specs (pending Rob's yes)

- #20 content system: decision 21 (agency rows by creator signature), `SplitRecipient.endsAt`, role `agency`.
- #25 memberships: per recipient `endsAt`.
- #2 Amped Messages (`docs/features/messaging.md`): `DirectMessage.sentByUserId` and `senderLabel`, the Team label under the bubble, staff access to Requests (AG-D4).
- #7 brand portal (`docs/features/brand-portal.md` BP8): a brand request to a represented creator lands in the creator's Requests as today and also shows in the agency's Deals when the deals scope is on. The creator accepts.
- Identity checks: section 5.3 row "Agency link (#38)" gains: terms with a commission need the creator's seller pass on the signing wallet.

## 14. For counsel

C1. The "Amped.Bio is not a talent agency" notice on ag6, ag10 and the agency page, and licensing attestation wording (CA, NY, FL).
C2. Money transmission position on the agency row in the creator's split. Section 8 of the Adult Content Policy covers the creator's share and Amped's fee only.
C3. Tax treatment of the agency leg, statements, W-9 and W-8.
C4. Team and AI labels (N.Z. v. Fenix, CA SB 243), and the AI processor for suggested replies (AG-D3, privacy-parameters line 30).
C5. Agencies as processors of fan data (DPA), and audit log retention of 24 months.
C6. Adult agencies: 2257 secondary producer position when an agency manages 18+ content, the attestation and the red flag queue.
C7. High share confirmation copy and the yearly reconfirmation.

## Revision log

- 3 Nov 2026, Full QA (AG-Q1 to AG-Q59). Ported the 14 Oct project spec into the repo. Inbox scope moved from Telegram to Amped Messages. Added the creator only list, seller of record section, verified seller rule on terms, site_settings flags, `DirectMessage.sentByUserId` and `senderLabel`, read audit, frames and states for every board, AG-D1 to AG-D5 for Rob, For counsel.
