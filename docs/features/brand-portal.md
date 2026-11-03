# Brand portal

Status: Draft for Rob's review, 3 Nov 2026. Written in the QA fix pass of 3 Nov (cross finding OB-Q60 and rows 359 to 364). Nothing here is built.
Owner: Rob Frasca. Drafted by Claude.
Build Board: #7 Brand portal.
Baseline: `development` at a460a9a (3 Nov 2026).
Design: Brand portal boards bp1 to bp6, https://claude.ai/artifact/L5SESHzbjbRmQthnAssi64 (redrawn 3 Nov as Prism 2.2 HTML boards).
Reads with: `docs/features/content-system.md` (adult surfaces, 3.17 and decision 3), `docs/features/fan-graph.md` (3.13, checkbox not switch), `docs/features/identity-checks.md` (`checkIdentity`, 4.5), Amped Messages spec revision 4 (project doc `claude/amped-messages-native-spec-r4-2026-11-02.md`, sections 5, 7.1, 8.2, 8.3, 9), `docs/features/seo-llm-discoverability.md` 3.5 (`indexableUserWhere`), `docs/features/rate-limiting.md`, `packages/constants/src/testnet.ts`, `packages/constants/src/access.ts`.

## 1. Summary

Brands find creators who opted in, send one structured request, and track the answer. The request arrives in the creator's Amped Messages Inbox, in Requests, with a Brand label. The creator accepts, declines, blocks or reports. Amped is the channel only. It does not process collaboration payments, does not review posts and does not certify FTC compliance. Both sides see a fixed disclosure line.

Three safety rules frame the feature:

1. Only adults can be found. A creator turns on brand collaborations only after a passed Authbase Over 18 check.
2. Creators with 18+ content are hidden from brand search by default. A brand must turn them on. 18+ items never appear in the portal.
3. Brands never get creator contact data. They contact creators only through Amped. Export holds the brand's own request records only.

## 2. Rules carried in

| Rule | Source |
| --- | --- |
| 18+ items never appear on the brand portal | content-system.md 3.17 (line 743); adult-content-review.md section 2 (PR #420) |
| Accounts are for people 18 and over by notice only. A creator is not age checked unless they sell or publish 18+ | identity-checks.md 4.1, 4.5; privacy notice section 12 |
| Over 18 is `checkIdentity(userId, "age_over_18")`. A `seller` pass does not read the age attribute | identity-checks.md section 3 |
| Brand portal toggles are labeled checkboxes, not switches | fan-graph.md 3.13; Rob's answer to 087 D1 |
| Inbox has Primary, Requests and Broadcast. Strangers land in Requests, links stay plain text until accepted, request previews never show text | Messages r4, msg-requests, 7.1, 8.2, 9 |
| Read receipts are a per account setting, on by default. A read reaches the other side only when both keep receipts on | Messages r4, msg-receipts, 7.3 item 6, 8.3 |
| Members means paid USDC members. Stake based audiences read Pool fans | `packages/constants/src/access.ts` lines 95 to 105; cross finding OB-Q61 |
| The testnet line is `TESTNET_NOTICE` wherever tREVO or pools show | `packages/constants/src/testnet.ts` |
| No dashes and no banned money words on any surface | BRIEF rule 2; `check:copy` |
| The portal reuses `indexableUserWhere` for who can be listed | seo-llm-discoverability.md 3.5 |

## 3. Decisions

Each row has the recommended answer, which this spec builds, and the alternative.

| Id | Question | Recommended | Alternative |
| --- | --- | --- | --- |
| BP1 | What is a brand account? | A Brand workspace owned by an Amped account. The owner adds teammates later (v1: one owner, up to 3 members). The workspace has its own name, website and status | A flag on a normal account |
| BP2 | How is the brand checked? | Work email domain must match the Website domain (registrable domain, so `team.northwindaudio.com` matches `northwindaudio.com`). The email is confirmed with a 6 digit code. On a mismatch the brand adds a DNS TXT record instead. Then a person reviews the brand within 1 business day | Domain email only, no review; or paid business verification |
| BP3 | Which agreement do brands accept? | Brand Terms (section 11) plus a separate FTC duty checkbox. Both required. Acceptance is stored with the terms version | One combined checkbox |
| BP4 | Who can be found? | Creators who tick "Open to brand collaborations" and hold an `age_over_18` pass, with an indexable page (`indexableUserWhere`), not suspended, not paused by Safety | Any creator with a page |
| BP5 | Does a seller pass count as the age gate? | No. A `seller` pass does not read `age_over_18` (identity-checks section 3). A verified seller is already verified with Authbase, so the sheet asks them only to share Over 18 (one tap in the consent manager) | Accept a `seller` pass as proof of age |
| BP6 | Creators with 18+ content | Hidden from brand search by default. A brand turns on "Include 18+ creators". That needs a verified brand and the brand user's own `age_over_18` pass. 18+ items, covers, titles and counts never show, even then | Never list 18+ creators |
| BP7 | Pool numbers | Not shown in v1. No pool filter, no pool row, no sort by pool size. Held for counsel (section 13, C3). When cleared, the row reads Pool fans, carries the On chain label and shows `TESTNET_NOTICE` once on the page | Show Pool fans now with the testnet line |
| BP8 | Where do requests land? | In Amped Messages, folder Requests, with a Brand label and a Brands filter. Accept moves the conversation to Primary with the Brand label kept | A separate Brand requests tab in Inbox (the old bp5) |
| BP9 | Read receipts | "Opened" shows only when the creator keeps read receipts on. The brand's own receipts setting does not hide the creator's | Always show opens |
| BP10 | Quota | 25 new requests per workspace per calendar month (UTC), free in beta. A request counts when sent. A failed send does not count. Decline or expiry does not refund | Per seat quotas |
| BP11 | Export | CSV of the brand's own request records only: request id, sent date, type, status, answered date, creator handle. No names, no audience numbers, no message text, no contact | No export |
| BP12 | Phone | The portal works at 1440 and 390. Brand screens are drawn desktop first with a phone board each. The creator side is phone first | Desktop only |
| BP13 | Brand shell | Brand rail: Discover, Requests, Saved, Brand. Top bar: title, quota line, Help, avatar. Phone dock: Discover, Requests, Saved, Brand. No creator destinations | Brands inside the creator rail |
| BP14 | Reply time and past partners | Reply time shows only after 5 answered requests. Past partners are creator entered and say so | Show from the first answer |

## 4. Brand accounts

### 4.1 Sign up (bp1)

Route `app.amped.bio/brands`. Four steps: Account, Company, Checks, Review.

1. **Account.** Sign in or create an Amped account. The account holder confirms they are 18 or over (the account notice). The workspace is a business, so no creator page is made for it.
2. **Company.** Company name, Website, Work email, Your role, Industry, Country, What you plan to do (Product seeding, Sponsored posts, Event invites; at least one), "We are an agency" (labeled checkbox; when ticked, the next step asks for the brands represented). Brand Terms checkbox and FTC checkbox, both required.
3. **Checks.** Work email code (6 digits, 10 minutes, 5 tries). Domain match result. On mismatch: the error state and the DNS TXT option (`amped-verify=<token>` on the Website domain, checked every 10 minutes for 72 hours).
4. **Review.** Pending state: "We review your brand within 1 business day. We email you when it is done." The workspace can browse Discover while pending. It cannot send requests or save creators until approved.

States: loading (skeleton), error (could not save, Try again), domain mismatch, code wrong, code expired, pending review, approved, declined (with reason and a support link).

### 4.2 Domain check

`services/brands/domain.ts`:

- `registrableDomain(url)` uses the public suffix list (`tldts`, already a transitive dependency of the landing app; add to server).
- Free mail providers (gmail.com, outlook.com and the rest of a static list in `packages/constants/src/brands.ts`) never match.
- Match: `registrableDomain(workEmail) === registrableDomain(website)`.
- Mismatch: show "Your work email is on a different domain than your website. Use an email at northwindaudio.com, or verify the domain with a DNS record." Offer Use DNS instead.
- Stored: `domainMethod` (EMAIL or DNS), `domainCheckedAt`. The check runs again at each monthly quota reset; a failed recheck pauses sending and emails the owner.

### 4.3 Review (admin)

Admin, Safety, Brands: queue of pending workspaces with company, website, domain result, industry, country, plan to do, agency flag. Actions: Approve, Decline (reason required), Pause, Resume. Shipped admin rail and roles (admin, moderator). Every action goes to the admin log.

## 5. Creator opt in

### 5.1 Where

Account, Messages (row 319), below Who can message me. A labeled checkbox, never a switch:

- Label: "Open to brand collaborations"
- Help: "Verified brands can find you and send you a request. Requests land in your Requests folder with a Brand label."
- 18+ note, shown when the creator has any 18+ label (any published `ContentItem.adult = true`, or 18+ on in Adult setup): "Brands see you only if they include 18+ creators."
- Below the checkbox once ticked: Open to (Product seeding, Sponsored posts, Event invites), Not open to (free text, 80 characters), Past partners (free text list, up to 5, shown to brands as creator entered), Audience (platform, range, as of month; up to 4 rows).

### 5.2 Age gate

Ticking the box calls `checkIdentity(userId, "age_over_18", { fresh: true })`.

| Result | What the creator sees |
| --- | --- |
| pass | The box ticks. The creator is listed within 5 minutes |
| not_linked, not_verified | Sheet: "Brands can reach only adults. Verify your age with Authbase to turn this on." Verify with Authbase |
| not_shared (includes verified sellers who have not shared Over 18) | "You are verified. Share Over 18 with Amped.Bio to turn this on." Share in Authbase |
| under_18 | The box stays off. No retry prompt. The Under 18 review case opens (identity-checks 4.5) |
| unavailable | "We could not check your age right now. Try again in a minute." The box stays off |

The pass is read again when it expires (`validUntil`). An expired or failed pass removes the creator from search at once and the setting shows "Paused until you verify again."

### 5.3 Turning it off

Unticking removes the creator from the index at once (synchronous delete, not the 5 minute refresh). Open brand requests stay in the creator's Requests. A brand with the drawer open sees the unavailable state on the next action (section 6.5).

## 6. Search

### 6.1 Index

Table `brand_directory` (one row per listed creator), rebuilt per creator on any change to the profile, the page, the opt in, the 18+ state or the identity pass, plus a sweep every 5 minutes. Listed when all are true:

- `CreatorBrandProfile.open = true`
- `checkIdentity(userId, "age_over_18")` passes (cached result)
- `isUserIndexable(user)` (seo spec 3.5) and `block = "no"`
- Not paused by Safety, not under an open Under 18 review case

Columns: userId, handle, displayName, avatarUrl, bio (first 280 characters of the page description), tags (up to 5), country, languages, openTo[], audience rows, followersBand, rnsName and rnsActive, hasAdult (boolean), repliesAnswered, medianReplyHours, updatedAt.

### 6.2 Server filter

`brands.search({ q, tags, platforms, audience, country, language, openTo, includeAdult, sort, cursor })`:

- `hasAdult = true` rows are excluded unless `includeAdult` is true **and** the workspace is approved **and** the calling user holds an `age_over_18` pass. Otherwise `includeAdult` is ignored and the response says `adultFilter: "hidden"`.
- No item, cover, title or count of 18+ content is ever selected into the index or returned.
- Sort: Best match (text rank), Newest on Amped, Most followers (by band). No sort or filter by pool size or stake.
- Page size 24, cursor based. Rate limit 60 a minute per workspace (shared limiter).

### 6.3 What brands see

Card (bp2): avatar, name, handle, country, up to 3 tags, up to 3 audience rows with their source label, Open to line, Save, View profile.

Drawer (bp3): the card fields plus bio, languages, all audience rows with month, Followers on Amped (band), RNS name, Open to, Not open to, Past partners (creator entered), reply time (BP14), Report, Save, Send a request.

Never shown: email, phone, wallet address, follower or member lists, who follows or stakes, sales, earnings, prices, pool size, stake amounts, any 18+ item or count, message history with other brands.

### 6.4 Audience source labels

| Label | Meaning | Shown as |
| --- | --- | --- |
| Self reported | The creator typed the range | "Self reported, Sep 2026" (month the creator last confirmed it). Rows older than 6 months show "Self reported, Mar 2026, may be out of date" |
| Counted by Amped | Amped counts it (followers on Amped, verified email followers only, fan-graph decision 8) | Band only: Under 100, 100 to 1k, 1k to 10k, 10k plus |
| On chain | Read from the chain | RNS name active and bound to the wallet. Pool fans only after counsel (BP7) |

Labels are text on a solid chip (13 px, 600, ink2 on white at 8.6:1), never grey meta on glass. "Verified by platform" (OAuth checked social counts) is Later and shows as a LaterPill on a non interactive line, never as a chip.

### 6.5 States

Search: loading (skeleton cards), no matches ("No creators match. Clear a filter or try another word." Clear filters), no opted in creators yet ("No creators are open to brands yet. We email you when the first ones join."), error (Try again), quota used up (banner "You have used 25 of 25 requests this month. Requests reset on Dec 1." Send a request disabled with the reason; search and Save still work), pending review (banner, Send disabled).

Drawer: loading, creator unavailable (opted out, paused or no longer listed: "This creator is not taking brand requests right now." Close, Remove from Saved), reported by you ("You reported this creator. We are looking at it." Send disabled), 18+ creator (a 18+ chip in the header and no adult content, only when the brand included 18+ creators).

## 7. Requests in Amped Messages

### 7.1 Model

A brand request is a Messages conversation between the brand workspace and the creator.

- `ConversationKind` gains `BRAND`. `pairKey` is `b:{brandWorkspaceId}:{creatorUserId}`, so a brand has one conversation per creator.
- `Conversation.brandWorkspaceId` (nullable, set for BRAND).
- The brand side member is the sending brand user; other workspace members read through the workspace (`BrandMember`).
- New table `BrandRequest` holds the structured part: id (UUID v7), conversationId, workspaceId, creatorId, type (PRODUCT_SEEDING, SPONSORED_POST, EVENT_INVITE, OTHER), subject (120), deliverables (200, optional), replyBy (date, 3 to 30 days ahead, default 14), status (SENT, ACCEPTED, DECLINED, EXPIRED, WITHDRAWN), declineReason (optional: Not a fit, Timing, Too many requests, Other), sentAt, openedAt (only stored when receipts are shared, 7.4), answeredAt, ftcAckAt.
- The message body (1,000 characters) is the first `DirectMessage`, encrypted at rest like every message.

### 7.2 Routing (`canMessage` for BRAND)

`services/messaging/access.ts` adds a branch before the rule check: for a BRAND conversation the creator's "Who can message me" rule does not apply; the opt in does.

1. Workspace approved, not paused; sender is a workspace member.
2. Creator listed (6.1) at send time. Otherwise refuse `brand_unavailable`.
3. Creator has not blocked the workspace. Otherwise refuse `blocked` (the brand sees the unavailable state; it is never told it was blocked).
4. Quota (section 8). Otherwise refuse `brand_quota`.
5. If an earlier request to this creator is SENT, refuse `awaiting_reply`. After DECLINED or EXPIRED the brand waits 30 days before a new request to the same creator.
6. Folder REQUESTS for the creator. The brand side cannot send a second message until the creator accepts.

### 7.3 What the creator sees (bp5, Messages row 317)

- Requests tab row: brand avatar (letter tile), brand name, Brand label, request type, Reply by date, unread dot.
- Requests filter chips: All, Brands, People. Chips fit at 390 (3 short chips).
- Request view: header with brand name, the domain check line ("northwindaudio.com, domain checked"), Brand label; the structured card (type, Reply by, subject, deliverables); the message with links as plain text; the Messages request notice; then Accept (primary), Decline (secondary), and ghost Block brand and Report.
- Under Accept, always: the creator FTC line and the payments line (section 10).
- Accept: status ACCEPTED, conversation moves to Primary with the Brand label, links turn on, the brand can reply. A "Share a business contact" ghost action lets the creator send an email or link as a normal message; nothing is shared automatically.
- Decline: optional reason; the conversation leaves Requests; the brand sees Declined and the reason.
- Expiry: at the end of the Reply by day (creator's time zone, default UTC) the status becomes EXPIRED and the row moves to the Requests "Past" list for 30 days, then is hidden.
- States: empty Brands filter ("No brand requests. Brands that find you send requests here."), opt in off ("You are not open to brand collaborations. Turn it on in Account, Messages."), accepted, declined, expired, loading, error.
- Notifications: kind REQUEST, text "{Brand} sent you a brand request". Never the message text (Messages 4.4 item 6, 7.4).

### 7.4 Receipts

- The brand sees "Opened" only when the creator's `MessagingSettings.readReceipts` is true at the time of reading. Otherwise the request stays "Sent" until answered.
- `BrandRequest.openedAt` is written only when receipts are on. Turning receipts off later does not erase past opens (the Messages rule for reads already delivered).
- Composer footer: "You see when Maya opens it if she shares read receipts. Her contact details stay private."
- Pipeline tile: "Opened, where shared".

## 8. Quotas and limits

- 25 new requests per workspace per calendar month, UTC. Shown as "{n} of 25 requests left this month" in the top bar.
- Counted at send in the same transaction as the request row (`BrandQuota` row per workspace and month, `used` incremented with a conditional update so two tabs cannot pass 25).
- A refused or failed send does not count. Withdraw within 15 minutes (the unsend window) refunds; later withdraw does not.
- Caps beside the quota: 10 requests a day per workspace, 1 open request per creator, the 30 day wait after decline or expiry. Admin can change each in SiteSettings `brands.caps.*`.
- Rate limits through the shared limiter: search 60 a minute, send 10 a minute, export 5 a day.
- Auto pause: 3 creator blocks in 30 days, or reports from 3 distinct creators in 30 days, pauses sending and opens a review in Admin, Safety, Brands.

## 9. Pipeline and export (bp6)

Route `app.amped.bio/brands/requests`.

- Tiles: Requests sent, Opened where shared, Accepted ({a} of {answered}, "of the requests creators answered"; answered means accepted plus declined, expired is not an answer), Median time to reply (answered only; shown after 3 answers, else "Not enough replies yet").
- Columns: Sent, Opened, Accepted, Declined or expired. A request is in exactly one column. Column totals add up to Requests sent.
- Card: creator name, handle, type, date, status line. Accepted cards show "Shared a business contact" only when the creator sent one in the conversation.
- Export CSV (BP11). Columns exactly: `request_id, sent_at, type, status, answered_at, creator_handle`. The file header row says "Your request records from Amped.Bio". The button reads "Export your request records".
- States: empty ("No requests yet. Find creators in Discover." Discover), loading, error, export failed.

## 10. FTC and disclosure strings

All in `packages/constants/src/brands.ts`, fixed, checked by `check:copy`:

| Key | Where | Text |
| --- | --- | --- |
| `BRAND_FTC_SIGNUP` | bp1 checkbox, required | "Creators we work with will disclose the partnership in each post, for example with #ad. We will remind them." |
| `BRAND_FTC_HELP` | Under both brand checkboxes | "Amped does not review posts or certify FTC compliance." |
| `BRAND_FTC_REQUEST` | bp4 checkbox, required each request | "The creator will disclose this partnership in each post, and I will remind them." |
| `CREATOR_FTC_ACCEPT` | bp5, under Accept, and in the accepted conversation header | "If you post about this brand, say so in the post, for example #ad or Gifted by {brand}." |
| `BRAND_PAYMENTS_LINE` | bp1 aside, bp4, bp5 | "Amped does not process payments for collaborations." |
| `BRAND_CONTACT_LINE` | bp5 under Accept | "Accepting shares no contact details unless you add one." |
| `BRAND_ADULT_LINE` | bp1 How it works, bp2 info line | "Creators with 18+ content are hidden from search unless you turn them on. Every creator you see is 18 or over." |

The final wording of `BRAND_FTC_*` and `CREATOR_FTC_ACCEPT` is for counsel (C2). The boards show these drafts.

## 11. Brand Terms (outline for counsel)

Draft headings only. Counsel writes the text (C1). The sign up checkbox links to `docs/legal/brand-terms.md` once it exists.

1. Contact creators only through Amped. No off platform contact obtained from Amped.
2. No scraping, copying or export of creator data. The only export is the brand's own request records (section 9).
3. FTC and advertising law duties stay with the brand and the creator. Amped does not review posts or certify compliance.
4. No contact with anyone under 18. Amped lists only creators with a passed Over 18 check. A brand that learns a creator may be under 18 reports it.
5. No requests for adult content, no token or trading promotions, no financial promises.
6. Amped does not process or guarantee any payment between brand and creator.
7. Amped may pause or close a workspace (blocks, reports, failed domain check).
8. Retention of the brand's records (section 12).

## 12. Retention

| Data | Kept |
| --- | --- |
| BrandWorkspace, domain result, terms acceptances | While the workspace exists, then 3 years (counsel confirms, C4) |
| BrandRequest rows | 2 years from sentAt, then deleted. Conversations follow Messages retention |
| Request messages | Messages rules (encrypted at rest; reported text kept for admins) |
| openedAt | With the request |
| Reports about or from brands | 1 year after resolution, like Messages reports |
| `brand_directory` row | Deleted at once when the creator opts out or stops qualifying |
| Creator brand profile (audience rows, past partners) | Until the creator deletes it or the account; account deletion (#13) deletes it |
| Export files | Not stored. Generated on request and streamed |

## 13. For counsel

- **C1.** Brand Terms text (section 11 outline). Needed before build. Also whether brands need a separate privacy notice section.
- **C2.** The FTC strings in section 10, brand and creator, and whether the creator line should name the FTC Endorsement Guides.
- **C3.** Whether any pool or stake number can be shown to brands as an audience metric (BP7). Until cleared, none is shown.
- **C4.** Retention periods in section 12.
- **C5.** Whether including 18+ creators in brand search (BP6) needs more than the brand user's Over 18 pass and a verified workspace.
- **C6.** Privacy notice: a section on the brand portal (what creators share, that brands see it, that brands cannot export it).

## 14. Data model

UUID v7 `Binary(16)` ids. Migration `20261110000000_brand_portal`.

```prisma
enum BrandStatus { PENDING APPROVED DECLINED PAUSED }
enum DomainMethod { EMAIL DNS }
enum BrandRequestType { PRODUCT_SEEDING SPONSORED_POST EVENT_INVITE OTHER }
enum BrandRequestStatus { SENT ACCEPTED DECLINED EXPIRED WITHDRAWN }

model BrandWorkspace {
  id               Bytes        @id @db.Binary(16)
  ownerId          Int
  name             String       @db.VarChar(120)
  website          String       @db.VarChar(255)
  domain           String       @db.VarChar(255)
  industry         String       @db.VarChar(64)
  country          String       @db.Char(2)
  planTo           Json
  isAgency         Boolean      @default(false)
  status           BrandStatus  @default(PENDING)
  domainMethod     DomainMethod?
  domainCheckedAt  DateTime?
  includeAdult     Boolean      @default(false)
  reviewNote       String?      @db.VarChar(255)
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  @@index([status])
  @@map("brand_workspaces")
}

model BrandMember {
  workspaceId Bytes @db.Binary(16)
  userId      Int
  role        String @db.VarChar(16) // owner | member
  @@id([workspaceId, userId])
  @@map("brand_members")
}

model BrandTermsAcceptance {
  id          Bytes    @id @db.Binary(16)
  workspaceId Bytes    @db.Binary(16)
  userId      Int
  kind        String   @db.VarChar(16) // terms | ftc
  version     String   @db.VarChar(16)
  acceptedAt  DateTime @default(now())
  @@map("brand_terms_acceptances")
}

model CreatorBrandProfile {
  userId       Int      @id
  open         Boolean  @default(false)
  openTo       Json
  notOpenTo    String?  @db.VarChar(80)
  pastPartners Json     // creator entered
  audience     Json     // [{ platform, range, asOf }]
  updatedAt    DateTime @updatedAt
  @@map("creator_brand_profiles")
}

model BrandRequest { /* fields in 7.1 */ @@map("brand_requests") }

model BrandQuota {
  workspaceId Bytes  @db.Binary(16)
  month       String @db.Char(7) // 2026-11
  used        Int    @default(0)
  @@id([workspaceId, month])
  @@map("brand_quotas")
}

model BrandSaved {
  workspaceId Bytes @db.Binary(16)
  creatorId   Int
  savedAt     DateTime @default(now())
  @@id([workspaceId, creatorId])
  @@map("brand_saved")
}
```

Blocks reuse `ConversationMember.state = BLOCKED` plus `BrandBlock(creatorId, workspaceId)` so a block covers every member of the workspace and future conversations. Reports reuse `MessageReport` with new reasons Not a real brand and Asked for adult content.

## 15. Screens

| Board | Route | Frames |
| --- | --- | --- |
| bp1 Brand sign up | `/brands` | Desktop Company step; Desktop Checks with domain mismatch; Desktop Review pending; Phone Company step; states (loading, save error, code wrong) |
| bp2 Creator search | `/brands/discover` | Desktop results with Include 18+ creators off; Phone results; states (loading, no matches, none opted in, error, quota used up) |
| bp3 Creator drawer | `/brands/discover?c=` | Desktop drawer; Phone sheet; states (unavailable, reported, 18+ creator) |
| bp4 Request composer | `/brands/requests/new` | Desktop composer with the Messages request preview; Phone composer; states (quota reached, send failed, offline draft, creator unavailable) |
| bp5 Creator brand requests | `/inbox?folder=requests&filter=brands` | Phone Requests with Brands filter and dock; Phone request view; Desktop Inbox Requests; Phone Account, Messages opt in; states (empty, accepted, declined, expired, age check needed) |
| bp6 Request pipeline | `/brands/requests` | Desktop pipeline; Phone pipeline; states (empty, loading, error) |

Shell: brand rail BP13 on brand screens. Creator screens use the editor shell from Messages (rail with Inbox, top bar with bell, dock Home, Page, Inbox, Wallet, More).

## 16. Acceptance

1. A brand whose work email domain differs from its Website sees the mismatch error and can verify by DNS. A free mail address never matches.
2. A pending workspace can browse but cannot send or save.
3. A creator without an `age_over_18` pass cannot tick Open to brand collaborations. A verified seller without the shared attribute is asked to share it.
4. A creator with any 18+ item is absent from search unless the brand turned on Include 18+ creators, and the brand user has an Over 18 pass. No 18+ item, title, cover or count appears anywhere in the portal.
5. No pool, stake or tREVO number appears in the portal while BP7 is held.
6. A brand request lands in the creator's Requests with the Brand label, the Brands filter finds it, links are plain text, and the push or email says "{Brand} sent you a brand request" with no text.
7. Accept moves the conversation to Primary. Decline and expiry update the brand's pipeline within 2 s on an open tab.
8. A creator with read receipts off never shows as Opened to the brand.
9. The 26th request in a month is refused with the quota message. Two tabs cannot pass 25.
10. Export contains exactly the six columns in section 9.
11. Blocking a brand stops every member of the workspace. 3 blocks in 30 days pause the workspace.
12. The creator sees `CREATOR_FTC_ACCEPT` under Accept. The brand ticks `BRAND_FTC_REQUEST` before each send.
13. Unticking Open to brand collaborations removes the creator from search at once.
14. Every board passes the Prism 2.2 gate at 1440 and 390: no dashes, no banned words, 44 px targets, AA contrast, no sideways scroll.

## 17. Build plan (PRs to `development`, after counsel C1 and C2)

| PR | Scope | Needs |
| --- | --- | --- |
| BP-1 | Schema and migration, constants file `packages/constants/src/brands.ts` | Messages M1 |
| BP-2 | Workspace, sign up, domain check (`services/brands/domain.ts`), admin Brands queue | BP-1 |
| BP-3 | Creator profile, opt in with `checkIdentity(age_over_18)`, `brand_directory` sync, Account, Messages checkbox | BP-1, identity checks I1 |
| BP-4 | Search and drawer (`trpc/brands/search.ts`), adult filter, Saved | BP-3 |
| BP-5 | `ConversationKind.BRAND`, `canMessage` branch, composer, quota, Requests Brand label and filter, receipts rule | BP-4, Messages M2 and M5 |
| BP-6 | Pipeline, export, auto pause, report reasons | BP-5 |

## 18. Edits to other specs

- **Amped Messages (r4).** `ConversationKind` gains `BRAND` (6). `canMessage` gains the BRAND branch (7.1, this spec 7.2). Requests gets filter chips All, Brands, People and the Brand label (8.2). Account, Messages gains the Open to brand collaborations checkbox (8.3). Copy gains the brand request push string (9). Report reasons gain Not a real brand and Asked for adult content.
- **Identity checks.** Enforcement points table (5.3) gains: brand opt in, `checkIdentity(age_over_18)` fresh, box refused with the sheet; brand Include 18+ creators, the brand user's `age_over_18`.
- **Fan Graph 3.13.** bp5 now uses a labeled checkbox. Resolved.
- **Content system 3.17.** No change. This spec enforces "never on the brand portal" in 6.2.

## 19. QA trace (3 Nov)

| Finding | Where fixed |
| --- | --- |
| OB-Q60 | This spec |
| OB-Q1 | 11, 13 C1 |
| OB-Q2 | 10 `BRAND_ADULT_LINE`, 11 item 4 |
| OB-Q3, OB-Q19 | 4.1, 5.1 (checkbox) |
| OB-Q4 | 4.1 steps and states, bp1 boards |
| OB-Q5 | BP6, 6.2 |
| OB-Q6, OB-Q20 | BP4, BP5, 5.2 |
| OB-Q7, OB-Q10, OB-Q61 (bp3) | BP7, 6.4 |
| OB-Q8, OB-Q12, OB-Q16, OB-Q21, OB-Q25, OB-Q67 (bp) | BP12, 6.5, 7.3, 9, boards |
| OB-Q9 | 6.4 label chip, LaterPill |
| OB-Q11 | BP14 |
| OB-Q13, OB-Q24 | BP9, 7.4 |
| OB-Q14, OB-Q17 | BP8, 7.1 to 7.3, 18 |
| OB-Q15 | Board sample dates after 3 Nov 2026 |
| OB-Q18 | 10 `CREATOR_FTC_ACCEPT` |
| OB-Q22 | 9 tiles and columns |
| OB-Q23 | BP11, 9, 11 item 2 |
| OB-Q66 (brand rail) | BP13 |
