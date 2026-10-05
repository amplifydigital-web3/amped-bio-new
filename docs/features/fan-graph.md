# Fan Graph (Follow)

Status: approved 2026-10-03 (Rob accepted all nine recommendations). Phase 0 and 1 built. Build Board item #22.
Owner: Rob Frasca. Drafted by Claude, 2026-10-03.
Business overview: Fan Loyalty overview (Build Board #22 to #24), https://claude.ai/code/artifact/a9e65a11-3272-4ac3-86e5-38a4666f8a78. Spec doc for comments: https://claude.ai/code/artifact/b9b8ef51-b1bd-44f5-900c-d867608fa163.
Screens: Prism 2.2 boards fg1 to fg12 in the Board Screen Designs gallery (https://claude.ai/artifact/GKy9Lvcbg6zckkuDLHrYhv#fg). Design QA: [fan-graph-design-qa.md](fan-graph-design-qa.md).

## 1. Research

### Current code (development at 278c04a1)

- No follow model. `packages/database/prisma/schema.prisma` has no `Follow`, follower or subscriber table. Broadcast (#1) and the gating engine (#21) both list this gap.
- Every account is a page. `customSession` in `apps/server/src/utils/auth.ts` backfills a handle from the email local part (`processEmailToUniqueHandle`) for any account without one. Register (`RegisterForm.tsx`) makes the page URL the hero field. There is no account without a public page.
- Consequence: Rob's decision that visitors need a full account to follow would, today, give every fan a public URL at `amped.bio/<email-prefix>`. Empty pages are already noindex and out of the sitemap (`indexableUserWhere` in `apps/server/src/utils/indexable.ts`: verified email, not suspended, a description or a block), but the URL still renders for anyone, and the handle exposes the fan's email prefix. The creator would also see that handle in the Followers list. Section 3.2 fixes both.
- `getHandle` filters on handle only. A suspended account (`block` other than "no") still renders. Outside this spec, but follower reads must filter `block = "no"`.
- "Fans" already means stakers. `CreatorPool.fans`, the pool block ("212 fans"), the pools directory and pool page (070, 071) use fans for pool members. Follow needs a different word.
- The creator page frame (Screen Review 039, `ProfileView.tsx`) has one Prism G1 clear capsule 21 from the bottom: View pool for visitors, Edit page for the owner. Everything else on the page is creator content in the creator's theme (section 17).
- Analytics shipped (`AnalyticsEvent`, `AnalyticsCampaign`, consent). `AnalyticsEventType` is `view`, `click`, `engage`. Visits carry `visitor_user_id` only with consent, plus `campaign_id` and UTM fields.
- Explore in code has Users and Pools tabs (`ExplorePanel.tsx`). The Pool Explorer design (#9, pe3) renames Users to Creators and adds a pool Watchlist; neither is built.
- `getHandle` no longer returns the owner's email (fix-email-exposure).

### Patterns in the market

- **Substack** separates follow from subscribe. A follow is a light signal that feeds Notes. A subscription delivers email. Creators push followers toward subscribing. Amped should keep the same split: Follow is the free signal, email updates are a separate opt-in, pool membership is the deeper commitment.
- **Laylo** captures fans in one tap at the moment of intent and notifies them about drops. Its value to creators is the owned list and its segments, not the count.
- **Patreon and Substack** show the creator the full list and the public only a count. The fan overview already chose this.
- **Link-in-bio tools** (Linktree, Beacons, Stan) have no fan-side follow. Fan relationships live on the social platforms the bio points to. Amped would own the first follow graph anchored on the bio link.

### Patterns to avoid

- Follow-for-follow loops, suggested follows and public following lists. They turn counts into vanity metrics and invite bots.
- Rewarding the follow with anything transferable. The follow quest in #23 pays Creator Points only, never tokens, and only after #23 ships.
- Treating a follow as email consent. Email needs its own explicit opt-in (CAN-SPAM, GDPR, and the broadcast consent model in #1).

## 2. Overview

### Terms

- **Follow.** A free, one-tap link from an Amped account to a creator. It costs nothing and moves nothing.
- **Follower.** An account that follows a creator. Used everywhere in UI and code.
- **Fan.** Unchanged. A pool member (stake above zero). The two can overlap. A follower who also stakes shows a Pool fan badge.
- **Fan account.** An Amped account created to follow, with no published page. It can publish a page at any time.

### In scope (v1)

1. Follow and Following on every published creator page, in the Amped frame capsule.
2. Fan sign-up from Follow: account first, no page published.
3. First-follow disclosure sheet that states what the creator sees.
4. Creator destination **People**, one view **Followers** (no tabs in v1): totals, list, search, filters, remove, block, export without emails.
5. Fan side: an **Explore, Following** tab for followed creators (and watched pools once #9 ships its watchlist).
6. Public follower count on the creator page, with a creator setting to hide it.
7. Optional public follower list: only fans who opt in appear on it.
8. `follower` rule kind goes live in the gating engine (#21).
9. **Followers** audience in Broadcast (#1).
10. Follow numbers for creators: follows by source and campaign, unfollows, and follow rate per page view. Analytics destination charts and product events follow in phase 1b.

### Out of scope (v1)

- Points, quests and Fan Score for following (#23, #24). The `Follow` row is the enrollment record they will read.
- Push notifications. Fans learn about updates through Inbox and opted-in email only.
- Fan to fan social features: following lists on fan pages, mutual follows, suggestions.
- Following non-creators. Only accounts with a published page can be followed.

### Decisions

Made earlier (carried in): a full Amped account is required to follow; the creator sees the full list and the public sees the count; a fan can opt in to appear on the public list.

Accepted by Rob on 2026-10-03, each as recommended:

1. **Fan accounts have no page until they publish one, and their handle never comes from the email.** Recommended: sign-up from Follow creates the account with `pageStatus = UNPUBLISHED` and a handle built from the name plus 4 digits (jordan-ellis-4821), which the fan can change. `amped.bio/<handle>` returns the not-found card until they publish. Alternative: keep today's behavior (every fan gets a reachable URL, and creators see the fan's email prefix as their @handle).
2. **Follow lives in the Amped frame capsule, not in the creator's blocks.** Recommended: the capsule shows the count, Follow (primary) and View pool. It is Amped's action, so it carries Prism styling and stays the same on every theme. Alternative: a creator-styled Follow button under the bio (theme contrast varies; harder to find; mixes Amped actions into creator content).
3. **One-time disclosure, then one tap.** Recommended: the first follow ever opens a sheet that says the creator sees your name, @handle and photo, with two unticked boxes (show me on public lists, email me updates from this creator). Later follows are one tap with a toast and Undo. Alternative: the sheet on every follow (slower, and fans stop reading it).
4. **Word choice.** Recommended: Follow, Following, followers. Fans stays reserved for pool members. Alternative: call followers "fans" (collides with every approved pool board).
5. **Creator destination.** Recommended: a new rail destination **People** in the Page group, with Followers as its first tab. Broadcasts move here from My Pool when this ships, because the Followers audience includes people with no stake. "Community" was the first name tried; it does not fit the 61 wide rail item at 13 bold. Alternative: a Followers tab inside Analytics (Analytics is about visits, not people) or inside My Pool (excludes creators without a pool).
6. **Fan side.** Recommended: Explore gets a **Following** tab (tabs Creators, Pools, Following). When the pool Watchlist from #9 ships, it becomes a Pools chip inside Following instead of its own tab. Alternative: a separate Watchlist tab as in the pe3 design (two lists for one habit).
7. **Email in exports.** Recommended: never. Export holds name, @handle, followed date, source and Pool fan. Creators reach followers through Broadcast, which enforces consent and unsubscribe. Alternative: include emails of followers who opted in to email (turns Amped into a list export tool and moves consent liability to every creator).
8. **Verified email before a follow counts.** Recommended: a follow from an unverified account is saved as pending and counts once the email is confirmed. Alternative: count at once (inflates counts with throwaway accounts).
9. **Public count.** Recommended: shown by default with a creator setting to hide it. Counts under 10 show as "New on Amped" instead of a number, so a new creator never displays 0 or 1. Alternative: always the exact number.

## 3. Detailed spec

### 3.1 Screens

| Board | Surface                                  | What it shows                                                                                                         |
| ----- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| fg1   | Creator page, desktop, visitor signed in | Graphite theme page. Frame capsule: 1,240 followers, Follow, View pool                                                |
| fg2   | Creator page, phone, after Follow        | Capsule switches to Following. Toast: You follow Maya Lin. Undo                                                       |
| fg3   | First-follow sheet, phone                | What Maya sees, two unticked boxes, Follow Maya Lin, privacy link                                                     |
| fg4   | Follow while signed out, phone           | Auth card "Follow Maya Lin": name, email, password, Google. No page URL field. Sign in link                           |
| fg5   | People, desktop                          | Four totals, sources, search, filter chips, list rows with Pool fan and Public badges, row menu, Export CSV, settings |
| fg6   | Explore, Following, desktop              | Followed creators with two checkboxes each, View page, Unfollow in the menu                                           |
| fg7   | People, phone                            | Totals, chips, list, reached from More                                                                                |
| fg8   | Following menu, phone                    | Public list and email checkboxes, Unfollow                                                                            |
| fg9   | Capsule states, phone                    | Signed out, under 10, pending email, count hidden, owner, blocked                                                     |
| fg10  | People, empty                            | No followers yet, Copy page link                                                                                      |
| fg11  | Block and remove                         | Block confirm dialog, Removed toast with Undo                                                                         |
| fg12  | Following, empty                         | You don't follow anyone yet, Explore creators                                                                         |

Loading and error states follow the app-structure conventions (skeletons after 400ms, local error card with Retry).

### 3.2 Fan accounts and page status

- `User.page_status`: `PUBLISHED` (default, every existing row) or `UNPUBLISHED`.
- Register from Follow (`/register?intent=follow&creator=<handle>`) renders `FanRegisterForm`: title "Follow Maya Lin" (the name comes from the server, never the URL), name, email, password with the register checklist, then Google. No page URL field.
- The better-auth create hook reads `intent=follow` from the sign up query (email) or the OAuth state (Google). It sets `page_status = UNPUBLISHED` and a handle from the name plus 4 random digits (`generateFanHandle`), never from the email.
- `getHandle` returns not found for every `UNPUBLISHED` page, the owner included. `indexableUserWhere` and `isUserIndexable` require `PUBLISHED`, so the sitemap and robots rules follow. `user.getUsers` (Explore, Users) lists only published, not suspended pages.
- After sign up or sign in the fan returns to `/<creator>?follow=1`, which finishes the follow (through the first-follow sheet on a first follow) and strips the parameter.
- Not in this build: the Home card "Make your own page" and the publish step for fan accounts (phase 1b). Until then a fan who wants a page claims one through Account, public URL.

### 3.3 Data model

Migration `20261003180000_add_fan_graph`. Field names follow the analytics models (snake case).

- `User`: `page_status PageStatus @default(PUBLISHED)`, `show_follower_count Boolean @default(true)`, `follow_disclosure_seen_at DateTime?`.
- `Follow`: `id`, `follower_id`, `creator_id`, `show_publicly` (default false), `email_updates` (default false) with `email_updates_at`, `source` (page, explore, pool, broadcast, qr), `campaign_id` (the visit's `AnalyticsCampaign`, kept only if it belongs to the creator), `created_at`. Unique on (follower, creator). Indexed by creator and date, and by follower and date.
- `FollowBlock`: (`creator_id`, `user_id`) primary key, `created_at`.
- `FollowRemoval`: `creator_id`, `reason` (unfollow, removed, blocked), `created_at`. No follower id, so creators see how many left and never who.
- Foreign keys cascade on account deletion.

Rules:

- **Pending is computed, not stored.** A follow counts while the follower's email is verified and the account is not suspended (`block = "no"`). A follow from an unverified account starts pending and counts on its own once the email is confirmed. Counts are a `COUNT` on the creator index at read time; no denormalized counter to reconcile.
- **Email consent lives on the follow row** (`email_updates`, `email_updates_at`) until Broadcast (#1) ships its consent events, which then read it. A follow alone is never email consent.
- Unfollow deletes the row and writes a `FollowRemoval`, except when the follow was made in the last 10 minutes (an Undo), which counts once.
- Remove follower deletes the row and returns a signed restore token (HMAC with `BETTER_AUTH_SECRET`, 8 second life) that holds source, campaign, visibility, consent and date. `restoreFollower` re-inserts the row as it was and drops the removal record.
- Block deletes the row and writes `FollowBlock`. A blocked account's follow fails with "You can't follow this creator."

### 3.4 tRPC procedures (`apps/server/src/trpc/follow.ts`)

| Procedure                                                                                       | Auth    | Returns, rules                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `follow.status({ handle })`                                                                     | public  | `followerCount` (null under 10 or when hidden), `showCount`, `newOnAmped`, `creatorName`, `isOwner`, `viewer` (following, pending, showPublicly, emailUpdates, disclosureSeen) or null |
| `follow.follow({ handle, source, campaignId?, showPublicly?, emailUpdates?, fromDisclosure? })` | user    | Upsert. Refuses self follow, unpublished or suspended pages, blocks. `fromDisclosure` records the first-follow sheet. Returns `{ following, pending }`                                 |
| `follow.unfollow({ handle })`                                                                   | user    | Deletes the row                                                                                                                                                                        |
| `follow.update({ handle, showPublicly?, emailUpdates? })`                                       | user    | The fan's own settings                                                                                                                                                                 |
| `follow.listFollowing({ cursor? })`                                                             | user    | The viewer's follows, newest first, 30 a page, with Pool fan                                                                                                                           |
| `follow.listFollowers({ q?, filter, sort, cursor? })`                                           | creator | Name, handle, photo, date, source or campaign, public flag, Pool fan. Never email or wallet                                                                                            |
| `follow.stats({ range })`                                                                       | creator | total, newInRange, unfollowsInRange, followRate, poolFans, poolFanShare, sources, showFollowerCount                                                                                    |
| `follow.removeFollower({ userId })`                                                             | creator | Deletes the row, returns `restoreToken`                                                                                                                                                |
| `follow.restoreFollower({ token })`                                                             | creator | Undo within 8 seconds                                                                                                                                                                  |
| `follow.blockFollower({ userId })`, `follow.unblock({ userId })`, `follow.listBlocked()`        | creator | Block list                                                                                                                                                                             |
| `follow.exportFollowers({ filter })`                                                            | creator | CSV: name, handle, followed_at, source, pool_fan, shown_publicly. Cells quoted, formulas neutralized. No email column                                                                  |
| `follow.publicList({ handle, cursor? })`                                                        | public  | Opted-in followers only. Empty while the count is hidden. Page for it is phase 2                                                                                                       |
| `follow.setCountVisibility({ show })`                                                           | creator | Explicit submit                                                                                                                                                                        |

Rate limits (`apps/server/src/utils/rateLimit.ts`, fixed windows on the existing Redis from `utils/cache.ts`, per-process fallback): follow and unfollow together 30 a minute and 500 a day per account; `listFollowers` 60 a minute; export 5 a day.

### 3.5 Follow flows

- **Signed in, first follow ever.** Follow opens the first-follow sheet (fg3). Follow Maya Lin saves the row, sets `follow_disclosure_seen_at`, closes the sheet and shows the toast.
- **Signed in, later follows.** Follow saves at once, the capsule shows Following, and a toast says You follow Maya Lin with Undo.
- **Following, tap again.** Following opens a menu (fg8): Show me on Maya's public list, Email me Maya's updates (both checkboxes), Unfollow. Unfollow needs no confirm. The toast offers Undo.
- **Signed out.** Follow opens the fan auth card (fg4). After sign-up or sign-in the page reloads with `?follow=1` and completes the follow.
- **Unverified email.** The capsule shows Following with a pending dot and the toast says Confirm your email to finish following. The row counts once the email is confirmed.
- **Own page.** The owner sees Edit page (and View pool when it applies), never Follow.

### 3.6 Where the UI lives

- **Creator page frame (039).** `ProfileView` capsule, behind `NEXT_PUBLIC_FAN_GRAPH`: follower count (13/16, "New on Amped" under 10, absent when hidden), Follow or Following, View pool (only when the creator has a pool and no pool block). At 390 the count sits above the buttons. Hides on scroll down as before. The owner sees Edit page, never Follow. Components: `components/follow/useFollow.ts`, `components/follow/FollowControls.tsx`.
- **People destination.** Rail group Page: Page, Design, Analytics, People (Content joins when #20 ships), behind `VITE_FAN_GRAPH`. v1 has no tabs (one view, Followers); Broadcasts joins as a tab in phase 2. Header row: Followers eyebrow, period select and Export CSV, as Analytics (093) does. Tiles use the Analytics tile anatomy. On phones People sits in More. `components/panels/people/PeoplePanel.tsx`.
- **Explore, Following.** A third tab after Users and Pools, behind `VITE_FAN_GRAPH`. The Users label stays until #9 renames it Creators. `components/panels/explore/components/FollowingTab.tsx`.
- **Not in this build (phase 1b):** Home Followers card, Home Make your own page card, Analytics Follows series and Campaigns Follows column, JSON-LD follower count.

### 3.7 Gating and broadcast

- Gating engine `follower` kind becomes live: passes when an ACTIVE `Follow` exists from the viewer to the rule owner. `params` stays empty. Pending follows do not pass.
- The rule builder adds Followers between Everyone and Pool members, with the helper "Anyone who follows you on Amped. Free for fans."
- Broadcast adds a `FOLLOWERS` audience kind. This changes the broadcast spec: `BroadcastAudienceKind` gains a value, `Broadcast.poolId` becomes nullable, and the composer opens for any creator with followers, not only pool owners. Consent events gain the sources `follow_sheet` and `follow_menu`. Delivery goes to the Inbox of every ACTIVE follower. Email goes only to followers who opted in for this creator, under the existing consent and unsubscribe rules. The composer counts "followers" and "followers who get email" separately.

### 3.8 Privacy, consent and compliance

- The first-follow sheet states three facts, word for word as rows: Maya sees "Your name, @handle and photo"; Stays private "Your email"; Everyone sees "The follower count". It ends with "Free. Unfollow any time." and a Privacy Policy link.
- Fans can see and change, per creator: shown publicly, email updates, unfollow. Their Following list is private to them.
- Creators never receive a follower's email, wallet address or visit history. The Followers list does not join `AnalyticsEvent` rows to people.
- Follow counts are not rewards and carry no value. No copy may say earn, reward, points, tokens or perks next to Follow until #23 ships and counsel approves the follow quest. `apps/server/src/__tests__/fan-graph.test.ts` scans the follow UI files for these words and fails the test run on a match.
- GDPR basis: performing the service the fan asked for (the follow). Data export (ws-account-deletion) includes the fan's follows and the creator's followers list without other people's emails.
- Counsel reviews: the disclosure sentence, the fan account terms, and the follower export.

### 3.9 Analytics events

**What ships now.** The creator-facing numbers come from first-party tables: totals and new follows from `Follow`, unfollows from `FollowRemoval`, sources from `Follow.source` and `campaign_id`. **Follow rate** = follows with `source = page` in the range divided by `view` events in the range. Both sides count every visit, so analytics consent does not skew it.

**What waits for the Analytics foundation (#11).** Product events have no server `track()` yet. When #11 lands, these fire with ids and counts only:

| Event                     | Where                      | Properties                                                                                       |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| `follow_cta_viewed`       | client, once per page view | `creator_id`, `signed_in`                                                                        |
| `follow_started`          | client                     | `creator_id`, `signed_in`, `source`                                                              |
| `follow_disclosure_shown` | client                     | `creator_id`                                                                                     |
| `follow_created`          | server                     | `creator_id`, `source`, `campaign_id`, `pending`, `via_signup`, `show_publicly`, `email_updates` |
| `follow_removed`          | server                     | `creator_id`, `reason`, `days_followed`                                                          |
| `fan_account_created`     | server                     | `creator_id`                                                                                     |
| `fan_page_published`      | server                     | `days_since_signup`                                                                              |
| `followers_list_viewed`   | client                     | `filter`                                                                                         |
| `followers_exported`      | server                     | `rows`                                                                                           |
| `follow_daily_snapshot`   | server, 00:00 UTC          | `creators_with_followers`, `creators_10_plus`, `active_follows`, `fan_accounts`                  |

**KPIs (90 days, proposed)**

| KPI                                | Target                 | Measurement                                                                                      |
| ---------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| Follow rate (creator tile)         | 2% of page views       | follows with `source = page` over `view` events. Measurable now                                  |
| Signed-in follow conversion        | 6%                     | `follow_created` (not via sign up) over `follow_cta_viewed` with `signed_in`. After #11          |
| Signed-out Follow to account       | 25%                    | `fan_account_created` plus sign-ins with `?follow=1` over `follow_started` signed out. After #11 |
| Creators with 10 or more followers | 30% of active creators | SQL on `follows` now; `follow_daily_snapshot` after #11                                          |
| 30-day unfollow rate               | under 8%               | `follow_removals` (unfollow) over new follows. Measurable now                                    |

### 3.10 Acceptance criteria

1. A signed-in visitor on a published page taps Follow and sees Following within 300 ms (optimistic), and `follow.status` returns `following: true` after reload.
2. Following the same creator twice creates one row. Unfollow then Follow within 10 minutes leaves one row and one `follow_created`.
3. A signed-out visitor who taps Follow, signs up with email and confirms it, lands back on the page following the creator. No page exists at their handle and the handle is absent from the sitemap.
4. Before the email is confirmed, the follow shows as pending to the fan and is absent from the creator's count, list, gating and broadcast audiences.
5. The first-follow sheet appears only on the account's first follow. Both boxes start unticked.
6. A creator's Followers list never contains an email or wallet address, in the UI, the API response or the CSV.
7. A fan with `showPublicly = false` never appears in `follow.publicList`.
8. Remove follower deletes the row; Undo within 8 seconds restores it with its original `createdAt`, source and visibility. Block prevents a new follow from that account.
9. Counts under 10 show "New on Amped". Hiding the count removes it from the capsule, `follow.status`, JSON-LD and `follow.publicList`.
10. The gating engine `follower` rule opens a block for an ACTIVE follower and refuses a pending or removed one.
11. A broadcast to Followers reaches every ACTIVE follower's Inbox. Email goes only to followers with email consent for that creator.
12. The owner sees Edit page, not Follow. Self follow is refused by the server.
13. Rate limits refuse the 31st follow call in a minute with a clear error.
14. Deleting an account removes its follows and its followers, and every count drops at once (counts are computed at read time).
15. A follow from an unverified account appears in the creator's count the first read after the email is confirmed, with no job.
16. Phase 1b: the bio JSON-LD carries `interactionStatistic` with `FollowAction` and the public count when shown (#10).
17. No follow surface contains earn, reward, points, tokens or perks. The compliance copy check passes.
18. The two "measurable now" KPIs in 3.9 can be computed in staging; the rest after #11.
19. Typecheck and build pass for `server`, `client`, `landingpage` and `@repo/ui`.

### 3.11 Phased rollout

- **Phase 0, prerequisites (built).** Migration (every existing user PUBLISHED). Fan sign up. Unpublished pages out of the page route, sitemap, robots and Explore.
- **Phase 1, launch (built).** Follow in the capsule, first-follow sheet, Following menu, People, Explore Following, counts, sources, remove with Undo, block, export. Flags `NEXT_PUBLIC_FAN_GRAPH` (landing) and `VITE_FAN_GRAPH` (client): on in development and staging, off in production until the migration runs and counsel signs off.
- **Phase 1b.** Home cards, fan page publish step, Analytics Follows series and Campaigns column, JSON-LD count, product events once #11 has `track()`.
- **Phase 2.** `follower` gating kind live. Followers broadcast audience. Broadcasts move to People. Public follower list page.
- **Phase 3.** Rewards Programs (#23) read `Follow` as enrollment. Superfans (#24) read follow age for badges.

### 3.12 Edits this spec makes to other specs

- **Gating engine (#21).** Kind table: `follower` becomes Live (phase 2). Acceptance 2 and 12 stop rejecting `follower`. `listEligibleUserIds` gains a Follow resolver beside the `StakedPool` one.
- **Broadcast (#1).** `FOLLOWERS` audience, nullable `poolId`, composer gate for creators with followers, consent sources `follow_sheet` and `follow_menu`. Its decision 1 said followers plug in with no schema change; that no longer holds.
- **Pool Explorer (#9).** Explore tabs become Creators, Pools, Following. The pool Watchlist moves inside Following.

### 3.13 Board corrections found during this work

- Broadcast br4 and brand portal bp5 use a switch. Rob answered 087 D1 with a checkbox and no switch. Those boards should switch to labeled checkboxes when Broadcast and Brand portal reach build.

## Sources

- https://productpotential.substack.com/p/substack-101-followers-vs-subscribers
- https://sheilabender.substack.com/p/important-to-know-difference-between
- https://go.laylo.com
- https://stackinfluence.com/beacons-vs-linktree-2026-link-bio-tool-is-best/
- https://schema.org/ProfilePage
- Fan loyalty research (Build Board #22 card)

## Revision log

- 2026-10-03: Approved. Built phase 0 and 1. Data model simplified for the build: pending computed from email verification, counts computed at read time, email consent on the follow row, `FollowRemoval` for unfollow counts. Product events wait for #11.
- 2026-10-03: Code check pass: empty pages were already noindex; fan handles no longer come from the email; Explore tabs corrected to code; follow rate defined on page views; restore token for Undo; shared Redis limiter; edits to #21, #1 and #9 listed.
- 2026-10-03: First spec. Refines the overview: fan accounts without pages, Follow in the frame capsule, People destination, Following replaces Watchlist, no emails in exports, pending follows until email is verified.
