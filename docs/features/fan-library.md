# Fan Library: My Media, My Memberships, creator sections and the player on every device

Status: approved for build, 2026-10-23 (R3, mobile first). All decisions answered by Rob. Screens approved on the Screen Review: rows 124, 125, 127 to 130 and 180 to 183; row 184 in Design review; row 126 merged into 180 and 181.
Owner: Rob Frasca. Drafted by Claude, 2026-10-08; revised 2026-10-23 three times (repo corrections, creator ownership, mobile first). See the Revision log.
Build Board: #26 Fan Library. Amends #25 Memberships (Wallet tab), #20 Content system (player, progress, feed page), #1 Broadcast (inbox kinds), #22 Fan Graph (fan side Following), D28 Theme Engine v2 (new consumer). Live in the Library is specified in #27 Live streaming.
Parents: Access Gating Engine (#21, `docs/features/access-gating-engine.md`, not on development yet) owns access. Content system (#20, `docs/features/content-system.md`) owns items, storage and signed delivery. Theme Engine v2 (`docs/features/theme-engine-v2.md`) owns the creator's look. This document reads all three and changes only what section 3.12 lists.
Overview: `docs/overviews/fan-library.md`. Design QA: `docs/features/fan-library-design-qa.md`. PR plan: section 3.10.
Boards: Fan Library design page, version 2 (m1 to m12 phone, d1, d4, d10 desktop). Version 1 boards fl1 to fl15 are superseded.

## 1. Research

### 1.1 What the current specs give a fan

| Need | Where it is today | Gap |
| --- | --- | --- |
| See my memberships | Wallet, Memberships tab (mb9): creator, plan, interval, renewal, allowance, Cancel, Renew | Billing only. No content, no benefits list, sits beside token balances. |
| Open members only content | The creator page content block and the item page amped.bio/handle/c/{publicId} | Per creator. No cross creator view. No newest first. No continue watching. |
| See everything one creator gave me, and why | Nothing. The creator page shows what anyone sees, with locks. | No view of my access with one creator: plan, purchases, follow, in one place. |
| Know something new was published | Nothing. Broadcast is a manual message. | A creator must write a broadcast for every drop or fans never hear about it. |
| Resume a video | PR 6a (#346) stores progress per account. | No list of what I was watching across creators. |
| Listen on a phone with the screen off | PR 6a: Media Session and one audio element. | Needs the phone player, queue and sleep timer. |
| Download a file | Content system: single use signed URL when downloads are allowed | Works per item. No list of what I downloaded, no offline video or audio. |
| Following | Fan Graph: the Following menu on the creator page and People for creators | No fan side list of who I follow with their content. |
| Live | Out of scope in the content system | #27. |

### 1.2 What is on development (23 Oct 2026)

- **Destinations.** Seven rail items (app structure D01). Fan accounts (page UNPUBLISHED) see the creator shell with a Home card Make your own page. There is no fan first destination.
- **Inbox.** A top bar bell opens the broadcast inbox. The list is a feed of items with a `kind`; v1 has `broadcast`. Unread polling every 60 seconds.
- **Content.** Content system PRs 1 to 5 are merged: `ContentItem` and `ContentAsset` with `publishedAt` and `chapters` (`[{ startMs, title }]`), uploads to R2 and Cloudflare Stream, the processor Worker and the media gateway Worker. Video plays from Stream with signed RS256 tokens; audio, images, documents and files are R2 objects served through the media gateway (`media.ampedusercontent.com`) with HMAC tokens (content system 3.6). In review: PR 6a #346 (signed delivery, the shared player, `ViewerProgress`, captions) and PR 6 #348 (publish, public item and feed pages, the content block).
- **Fan Graph.** `Follow` with ACTIVE computed at read. `follow.listFollowing` does not exist; People lists followers for creators only.
- **Theme.** `ThemeConfigV2` per creator through `upgradeTheme`: scene base, colors, fonts, container and button style, with the contrast guard (4.5:1 cards and buttons, 3:1 name).
- **Memberships and purchases.** Specified (#25, content system 3.9), not built.
- **Gating.** Specified (#21), not on development. A batch check per item list is the right call for a Library page.
- **PWA.** `apps/client` has no manifest and no service worker.

### 1.3 Patterns in the market

| Product | What it does | Take | Avoid |
| --- | --- | --- | --- |
| Patreon app (member) | Home and Memberships feeds; Library with recently played, saved and downloads; a page per creator inside the app. | A per creator view. Library with continue, saved, downloads. | Mixing discovery into the paid feed. Burying membership management three taps deep. |
| Gumroad library | Every purchase in one list, grouped by creator, with the file and a Receipt link. | Group by creator. Purchased is a lasting relationship with a receipt. | Handing out raw file URLs. |
| Shopify Shop app | Each merchant shows as its own branded store page inside one app, with the shopper's orders from that merchant. | One app frame, each seller's brand inside it. | Letting the seller's brand replace the app navigation. |
| Kindle, Apple Books | Library by author or collection; the reader opens in the publisher's typography; app chrome stays. | Content in the owner's look; navigation stays ours. | Hiding where an item came from. |
| Spotify, YouTube | Position sync per account. Mini player that persists. Queue, autoplay, swipe gestures, offline downloads. | Server side position, mini player, queue, autoplay within a source, swipe to dismiss, downloads. | Autoplay into content the fan cannot open. |
| Netflix | Continue row first. Remove from row, Mark as watched. Offline downloads per item. | Continue first, item menu, downloads. | DRM licensing beyond what the creator allows. |
| Apple Podcasts | Library search separated from catalog search. | Scoped search. | Two search boxes. |
| Media Session, Picture in Picture, Web App Manifest | Lock screen controls, PiP, home screen install. | All three in the player and the client shell. | A native app before the web app has proven the flows. |

### 1.4 Patterns we adopt

1. The Library is a view over grants. Every item shown is the result of `checkAccessBatch` for the viewer. No separate permission model.
2. Every item shows its owner and, at most, one access label.
3. One app frame, many creator looks. Prism owns navigation, system notices and non money sheets. The creator's theme owns the creator section, the players, the viewers and the creator's payment sheet.
4. Position, completion, saved and download state are per account, server side.
5. One player, two layouts, on every surface that plays media.
6. New content reaches fans through the inbox with the per creator email consent.
7. Downloads only where the creator allows them.
8. Phone first: 390 wide boards first, 1440 desktop follows the same structure.

## 2. Overview

### 2.1 Ownership and access model

- **One owner per item.** `ContentItem.bioId` names the creator who published it. Products, bundles and membership plans also belong to one creator. Nothing in the Library is owned by Amped.Bio or by the fan.
- **The fan holds access, not ownership.** Sources: a membership with that creator, a purchase from that creator (item or bundle), a pool stake, a follow, or a public post.
- **Precedence.** Purchased, then Members, then Pool fans, then Followers, then Public. The server computes `accessSource` for every item; the client never infers it.
- **One label.** Membership items show the plan name with the crown icon. Purchases show Purchased. Pool items show Pool fans. Followers and Public items show no label. A purchased course or collection is labeled once at its group heading.
- **Ending access.** A past due membership keeps members items open for the 3 day grace period, with a notice and Renew. After it ends, members items leave every Library list and Continue; an item opened from a link shows Access ended with Rejoin. A purchase stays open for its term (forever unless the product says until a date), including after a membership ends.
- **Ownership line.** Every creator section's status sheet opens with "{Creator} owns this content." The section footer carries the same line.

### 2.2 What ships

1. **Library, one page, no tabs** (phone m1, desktop d1). Order: Continue, Saved and Downloads, Your creators, Memberships row, Newest. Header: title, Search, Filter, Inbox. Desktop puts Your creators, Memberships, Saved and Downloads in a side column.
2. **Filter sheet** (m1). Type (Video, Audio, Documents, Photos, Files), How you have it (Membership, Purchased, Pool fans, Free), Where (Everywhere, On this device). The active filter shows as one removable chip.
3. **Search** (m2, row 183). Scope chips: All creators, the current creator, On this device. Results grouped by creator. Recent searches. Searches titles, descriptions and chapter titles of items the fan can open.
4. **Your creators** (m3, row 180). One row per connected creator: avatar with the brand ring, how the fan is connected, a new count or one warning. Past due first, then recent activity. Replaces the Creators and Following tabs of version 1. The testnet line sits at the foot when a pool row is present.
5. **Creator section** at `/library/@handle` (m4, d4, m5; rows 181, 182). In the creator's look. Header, one status line (plan and renewal, purchases, following) that opens the status sheet (membership with Manage and Receipts, purchases with receipts, follow settings, Unfollow), Continue for this creator, segments Yours and Shop. Yours is one list: courses and collections first, then newest. Shop lists items the fan cannot open, each with one action (Join or Rejoin, Buy for N USDC, Go to the pool). When the fan is not a member and the creator has a plan, a From {creator} row offers Join as an outline button.
6. **Memberships** (m9, row 125). Reached from the Memberships row on Library and from each status sheet. Summary line, one card per membership with one primary action: Renew when past due, Manage when active, Rejoin when canceled. Manage sheet: next renewal, switch billing interval, charges left on the approval, receipts, Cancel membership with the end date.
7. **Player** (m6, m7, d10, row 128). Video and audio, full and mini layouts, in the item owner's look. Details in 3.5.
8. **Viewers** (m8, row 184). PDF and photo sets in the owner's look.
9. **Downloads and offline** (m10, row 129). Offline video, audio and files where the creator allows downloads. Details in 3.5.
10. **Inbox content items** (m11, row 130). Kind `content` when a creator publishes an item the fan can open but the public cannot. Notification settings per creator.
11. **States** (m12). Empty, loading, offline, access ended during playback.
12. **Creator feed page** at amped.bio/handle/content (cs6, row 127; content system PR 6).
13. **Installable web app.**

### 2.3 Decisions (all answered by Rob with the recommended answers)

| # | Decision | Answer |
| --- | --- | --- |
| 1 | Where the Library lives | A destination in the Start group after Explore. Phone dock for fan accounts: Home, Explore, Library, Wallet, More; for creators: Home, Page, Library, Wallet, More. |
| 2 | Do memberships leave Wallet | Yes. Library Memberships is the only management screen; mb9 becomes a Wallet Activity row with Manage. Wallet tabs: Tokens, Activity, Names. |
| 3 | Where progress is stored | Server side per account and item, every 10 seconds of play and on pause (PR 6a). |
| 4 | Downloads | Only where the creator allows downloads. Amended by decision C. |
| 5 | Web app or native | Installable web app now; native evaluated after 90 days of Library data. |
| 6 | New content notices | An inbox item for every account that qualifies at publish, with the per creator email consent; email as a daily digest, one per creator at most. |
| 7 | Creator feed page | amped.bio/handle/content, server rendered, public items indexable, locked items as cards with no media URL. |
| 8 | Casting | AirPlay now; Chromecast in phase 2 through DASH. |
| 9 | Relationship labels | Members (plan name), Purchased, Pool fans, Followers; one label per item (amended by R3). |
| 10 | Whose look the creator section uses | The creator's theme inside the Prism frame. Rail, top bar, dock and system notices stay Prism. Scenes still, name and cursor effects off. |
| 11 | Locked items in the Library | Only in the creator section's Shop. Continue, Newest and search never show locked items. |
| 12 | Access precedence | Purchased, Members, Pool fans, Followers, Public. |
| 13 | Paying from the Library | Join, Rejoin, Renew and Buy open the creator's payment sheet, unchanged from the memberships spec. No on-ramp in the Library. |
| 14 | Creator section address | `/library/@handle`, signed in only, never indexed. |
| A | Library on the phone | One page, no tabs. |
| B | Creator section segments | Yours and Shop. |
| C | Offline video and audio | Allowed where the creator allows downloads; removed when access ends. |
| D | Autoplay | On by default within the same creator, never into an item the fan cannot open, with a toggle. |

### 2.4 Out of scope

Native iOS and Android apps. Comments and likes. Playlists (content system phase 3). Cross creator recommendations inside the Library (Explore owns discovery). Chromecast (phase 2). Watch parties. Creator controlled layouts for the creator section beyond their theme. DRM.

## 3. Detailed spec

### 3.1 Screens

| Row | Screen | Boards | Notes |
| --- | --- | --- | --- |
| 124 | Library, one page, filter sheet, states | m1, d1, m12 | Continue cards: 44 px play button, minutes left, 2 line title, creator with a 4 px brand mark. |
| 180 | Your creators | m3, d1 side column | Avatar ring in the creator's accent; one warning (past due) or a new count. |
| 181 | Creator section, member and buyer, status sheet | m4, d4 | Status line, Continue, Yours and Shop, ownership line. |
| 182 | Creator section, buyer only, lapsed member with Shop, payment sheet | m5 | One filled button per screen. Shop rows with lock and outline Buy. |
| 183 | Search | m2 | Scope chips, grouped results, recent searches. |
| 125 | Memberships and Manage | m9 | One primary action per card. |
| 128 | Player: video portrait, landscape, chapters and speed; audio, queue, mini player; desktop video | m6, m7, d10 | See 3.5. |
| 184 | Document and photo viewers | m8 | In Design review. |
| 129 | Downloads and the item menu | m10, cs7 | Content page Resume, Save and Download is board cs7 (content system). |
| 130 | Inbox content items and notification settings | m11 | Toggles carry On and Off text. |
| 127 | Creator feed page | cs6 | Content system PR 6. |

**Phone rules on every screen.** Page title 32, section 20, item title 16 on up to 2 lines, body and meta 14 to 15, labels 13. 44 px minimum targets, 55 for the primary. One filled button per screen. Every gesture has a visible button too. Off toggles carry a 3:1 border.

### 3.2 Creator section and branding rules

- **Route.** `/library/@handle?seg=yours|shop`. Signed in only, `noindex`. A creator the fan has no connection with redirects to their public page.
- **Theme source.** `ThemeConfigV2` of the creator's published page, through `upgradeTheme`. Applied: scene base as a color or gradient (image, video and shader scenes use their still frame or base color), text and muted colors, name and body fonts, container style for cards, button style and shape. Not applied: particle overlays, name effects, cursor effects, button hover motion.
- **Contrast.** The theme's contrast guard applies (4.5:1 text and buttons, 3:1 headings). A failing pair falls back to the Graphite theme values for that pair and logs `library_theme_fallback`.
- **What stays Prism.** Rail, top bar, dock, focus ring, system notices (warning, offline), the Manage and status sheets, the Filter sheet, confirm dialogs.
- **Mixed screens.** Library, Your creators, Memberships, Downloads, Inbox and search show each creator as the avatar ring, a 4 px accent and, on creator actions, the creator's button color. Names in Figtree.
- **Creator copy.** Bio line, plan names, benefits and item titles come from the creator. Amped.Bio copy in the section is limited to labels, the ownership line, the payment sheet fixed lines and Powered by Amped.Bio.

### 3.3 Data model

New tables use UUID v7 ids in `BINARY(16)` (AGENTS.md). Times are milliseconds. All rows cascade with the user and the item.

```prisma
// Phase A, PR 6a (#346)
model ViewerProgress {
  id            Bytes    @id @db.Binary(16)
  userId        Int      @map("user_id")
  contentItemId Bytes    @map("content_item_id") @db.Binary(16)
  positionMs    Int      @default(0) @map("position_ms")
  durationMs    Int?     @map("duration_ms")
  completed     Boolean  @default(false)
  lastPlayedAt  DateTime @map("last_played_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  contentItem   ContentItem @relation(fields: [contentItemId], references: [id], onDelete: Cascade)
  @@unique([userId, contentItemId])
  @@index([userId, lastPlayedAt])
  @@index([contentItemId])
  @@map("viewer_progress")
}

// FL-2: Saved items and creator visits
model SavedItem {
  id            Bytes    @id @db.Binary(16)
  userId        Int      @map("user_id")
  contentItemId Bytes    @map("content_item_id") @db.Binary(16)
  createdAt     DateTime @default(now()) @map("created_at")
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  contentItem   ContentItem @relation(fields: [contentItemId], references: [id], onDelete: Cascade)
  @@unique([userId, contentItemId])
  @@index([userId, createdAt])
  @@map("saved_items")
}

model LibraryCreatorVisit {
  userId        Int      @map("user_id")
  bioId         Int      @map("bio_id")
  lastVisitedAt DateTime @map("last_visited_at")
  @@id([userId, bioId])
  @@map("library_creator_visits")
}

// FL-5: offline downloads
model DownloadRecord {
  id            Bytes     @id @db.Binary(16)
  userId        Int       @map("user_id")
  contentItemId Bytes     @map("content_item_id") @db.Binary(16)
  bytes         BigInt
  grantJti      String    @map("grant_jti") @db.VarChar(64)
  device        String    @db.VarChar(64)          // random id per installed app, never a fingerprint
  createdAt     DateTime  @default(now()) @map("created_at")
  removedAt     DateTime? @map("removed_at")
  @@index([userId, createdAt])
  @@map("download_records")
}

// FL-6: inbox content items
model InboxItem {
  id            Bytes     @id @db.Binary(16)
  userId        Int       @map("user_id")
  kind          String    @db.VarChar(16)          // content | live
  bioId         Int       @map("bio_id")
  refType       String    @map("ref_type") @db.VarChar(16)
  refId         Bytes     @map("ref_id") @db.Binary(16)
  readAt        DateTime? @map("read_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  @@unique([userId, refType, refId])
  @@index([userId, createdAt])
  @@map("inbox_items")
}
```

`LibraryCreatorVisit` drives the new count on Your creators. `NotificationPreference` gains `newContentEnabled` and `digestEnabled` on the per creator and global rows (FL-6). `ContentItem.publishedAt` and `chapters` already exist.

### 3.4 Access and listing

- Every Library list runs `checkAccessBatch(viewer, items)` and returns only allowed items, each with `accessSource` (purchased, member, pool, follower, public), `planName` when the source is member, and the owner.
- **Before the gating engine ships** (FL-2 to FL-5), the server answers with the rules that exist: an item is listed when it is public, or when it is visible to followers and the viewer follows the creator. `accessSource` is `follower` or `public`. The response shape is final, so FL-6 changes the resolver, not the clients.
- The Shop segment is the one Library list that returns items the fan cannot open, with `unlockHint` (join, rejoin, buy with price, pool) and no media URL, matching content system criterion 9.
- Grants are issued only when the fan opens an item, through `content.getReadUrl` (and `access.issueGrant` once gating ships). A refused refresh stops playback and shows Access ended.
- New content fan out (FL-6): on the first PUBLISHED transition of an item that is not public, `listEligibleUserIds(ruleId)` writes one `InboxItem` per account in chunks of 1,000. Public items create no inbox item.

### 3.5 Player, downloads and client structure

**Player** (`packages/ui/src/player/`, PR 6a; phone v2 in FL-1).
- `PlayerProvider` owns one `<video>` and one `<audio>` per page and never unmounts them; the full player borrows the video element; the mini player shows when no full player for the item is on screen. Mounted once in the editor and in the public site's handle layout (PR 6) and in the Library.
- Video: Stream HLS with the signed token, native HLS on Safari and iOS, hls.js 1.6.15 from npm imported on demand. Audio: a native `<audio>` element from the media gateway (`audio/{publicId}/full.m4a`), waveform peaks from `derived/{publicId}/waveform/peaks.json`. URLs refresh a minute before `expiresAt`.
- Progress every 10 seconds of play, on pause, seek, hide and `pagehide`. Resume at mm:ss and Start over between 30 seconds and 95 percent.
- Captions: WebVTT, up to 5 languages, 512 KB each; Stream tracks for video, R2 objects for audio. Speeds 0.75 to 2. Media Session, PiP when supported, AirPlay.
- **Phone video (FL-1, m6).** Portrait: 16:9 on top, controls on tap for 3 seconds, skip 10 s either side of play, captions, AirPlay, speed and quality, full screen, minimize. Landscape full screen when the phone rotates or on Full screen; double tap left or right skips 10 s with a ring; swipe down minimizes. Chapters and speed open in a sheet. Below the video: title, creator, label, Save, Chapters, more, Up next from the creator with Autoplay.
- **Phone audio (FL-1, m7).** Full player in the owner's look: cover, title, creator, label, Save, a scrub handle with a 44 px hit area, 15 s skips with numerals, speed, sleep timer (end of item, 15, 30, 60 minutes), Up next peeking as a sheet.
- **Mini player (FL-1).** 64 high, in the owner's colors, above the dock on phones. No close button: tap or swipe up opens the full player; swipe down stops and dismisses; swipe left or right plays next or previous. Pause is the one 52 px target.
- **Queue and autoplay (FL-1).** Queue sheet with drag handles. Autoplay on by default, continues with the same creator's items the viewer can open, newest first after the current group, never plays a locked item. Play next and Add to queue in every item menu.
- **Desktop (d10).** Keyboard shortcuts behind a Keyboard shortcuts button. Queue button.

**Viewers (FL-1, m8).** PDF with page count, search in document, Save, Download when allowed (pdf.js from PR 6). Photo sets: swipe, thumbnail strip, double tap to zoom.

**Item menu (FL-3, m10).** Long press or the more button: Play next, Add to queue, Download (when allowed), Save, Mark as watched, Go to the creator's section, Remove from Continue.

**Offline (FL-5, decision C).**
- Allowed only where the creator allows downloads. Video uses Stream's MP4 rendition (PR 6a already signs it); audio and files use the gateway's single use download URL. Files go into Cache Storage under `downloads/{publicId}`, opened through the service worker.
- Download all for a course or collection. Download on Wi-Fi only, on by default. Storage meter from the Storage API estimate. Swipe left to remove; Clear all behind a confirm.
- On every sync (app open, every 6 hours while open), the client asks `library.downloads.check` which records the viewer may still open; files for items the viewer lost access to, or that were unpublished or taken down, are deleted from the cache. Offline opens are allowed for 30 days since the last successful check.
- The service worker caches the app shell and `downloads/` only. Never streams in progress, signed URLs, API responses or creator pages.

**Theme scope (FL-4).** `CreatorThemeScope` in `@repo/ui` takes the theme summary from the API and sets `--c-bg`, `--c-bg2`, `--c-surface`, `--c-ink`, `--c-muted`, `--c-line`, `--c-btn`, `--c-btnink` and the two font families on a container. Used by the creator section, the players, the viewers, the mini player and the payment sheet. Fonts load only for creators on screen.

**Destinations (FL-3).** `LibraryPage` at `/library`, `CreatorSection` at `/library/@handle`, `LibrarySearch` at `/library/search`, `DownloadsPage` at `/library/downloads`, `MembershipsPage` at `/library/memberships`. Rail Start group after Explore; dock per decision 1. Flag `VITE_FAN_LIBRARY`.

### 3.6 tRPC procedures

`apps/server/src/trpc/library.ts`, all private, scoped to the session user, cursor pagination, the shared limiter.

| Procedure | PR | Input | Output |
| --- | --- | --- | --- |
| `progress.get`, `progress.set` | PR 6a | `{ publicId, ... }` | as shipped in #346 |
| `library.continue` | FL-2 | `{ bioHandle? }` | up to 12 unfinished progress rows, newest first, access rechecked, with owner and `accessSource` |
| `library.newest` | FL-2 | `{ cursor?, type?, source?, where? }` | items from connected creators, newest `publishedAt` first |
| `library.creators` | FL-2 | `{ cursor?, q? }` | one row per connected creator: profile, accent, how connected, new since last visit, past due flag |
| `library.creator` | FL-2 | `{ handle }` | header, theme summary, status line data (membership, purchases, follow settings), counts for Yours and Shop; writes `LibraryCreatorVisit` |
| `library.creatorItems` | FL-2 | `{ handle, seg: yours or shop, cursor? }` | Yours grouped by collection then newest; Shop with `unlockHint` and no media URL (empty until FL-6) |
| `library.search` | FL-2 | `{ q, scope: all, handle or device, cursor? }` | results grouped by creator; device scope filters by the ids the client sends from its cache |
| `library.saved`, `save`, `unsave` | FL-2 | `{ publicId }` | saved rows with access rechecked |
| `library.markWatched`, `removeFromContinue` | FL-3 | `{ publicId }` | ok |
| `follow.listFollowing` | FL-2 | `{ cursor? }` | ACTIVE follows of the viewer |
| `library.downloads`, `recordDownload`, `removeDownload`, `downloads.check` | FL-5 | as named | download records; check returns ids still allowed |
| `library.memberships` | FL-7 | none | memberships joined to plan, status, renewal, newest members items, accent |
| `inbox.list` (amended), `inbox.unreadCount` (amended) | FL-6 | `filter` gains `content` | rows with owner and `accessSource` |
| `notifications.setNewContent` | FL-6 | `{ bioId?, inbox?, digest? }` | ok |

No procedure returns another user's email or wallet.

### 3.7 Public site

`/[handle]/content` and `/[handle]/c/[publicId]` ship in content system PR 6 (#348). The Library links to them through Visit page. Reserved segments `content` and `c`.

### 3.8 Copy, compliance and privacy

- No earn, yield, return, income, invest, APY or price words in the Library, the player or the viewers. The verbatim testnet line ("Testnet only. tREVO has no cash value. Pool rewards come from the network, vary, and are not guaranteed.") appears only on Your creators when a pool row is present.
- Memberships, purchases and the creator payment sheet carry no staking, pool or tREVO words.
- The access label names the plan or the rule, never an amount staked.
- Payment flow rules apply in full: the fan pays the creator, in the creator's sheet, with "Includes the Amped.Bio fee of 5%"; no on-ramp in the Library.
- No copy implies the fan owns, resells or transfers content. The ownership line is "{Creator} owns this content."
- Progress, saved, visit, download and inbox records are personal data, deleted with the account. Creators never see per fan progress, saves, visits or downloads.
- Offline files are removed when access ends; the fan is told so on the Downloads screen.
- 18+ items play only for age assured accounts (#28); until age assurance ships every Library list refuses them.
- No em or en dashes in shipped copy.

### 3.9 Analytics

Client events: `library_opened`, `library_item_opened { type, accessSource, from }` (continue, newest, creator, search, saved, downloads, inbox), `library_creator_opened { from }`, `library_shop_action { action }`, `library_filter_applied`, `library_search { scope, results }`, `player_resumed`, `player_completed`, `player_background_audio`, `player_pip`, `player_airplay`, `player_autoplay_next`, `player_sleep_timer`, `item_saved`, `item_downloaded`, `download_removed { reason }`, `pwa_installed`, `library_theme_fallback`. Server events: `inbox_content_fanout { recipients }`, `digest_sent`. Ids and types only, never titles of gated items.

KPIs 90 days after general availability (proposed): 60 percent of paying fans open the Library weekly; 35 percent of plays start from Continue; 25 percent of creator section visits by members include a play; past due recovery from the Library above 50 percent; install rate above 10 percent of phone fans.

### 3.10 PR plan

Every PR from a fresh `development`, into `development`, reviewer Gustavo, flag `VITE_FAN_LIBRARY` off in production, lockfile changes as a patch in `docs/fixes` when the connector cannot push the lockfile.

| PR | Branch | Ships | Rows | Needs first |
| --- | --- | --- | --- | --- |
| PR 6a (#346) | feat/media-player | Signed delivery, shared player, `ViewerProgress`, captions | 128 (phase A) | in review |
| FL-0 | docs/fan-library-r3 | This spec, the overview, the design QA | none | nothing |
| FL-1 | feat/player-mobile | Phone video and audio (m6, m7), mini player gestures, sleep timer, queue and autoplay, viewers (m8), desktop shortcuts button (d10) | 128, 184 | #346 and #348 merged |
| FL-2 | feat/library-api | `SavedItem`, `LibraryCreatorVisit`, `library` router (continue, newest, creators, creator, creatorItems, search, saved), `follow.listFollowing`, server `accessSource` | none | #348 merged |
| FL-3 | feat/library-page | Library destination, rail and dock, one page Library (m1, d1), Filter sheet, search (m2), Your creators (m3), states (m12), item menu | 124, 180, 183 | FL-2 |
| FL-4 | feat/library-creator-section | `CreatorThemeScope`, creator section and status sheet (m4, d4), Yours segment | 181 | FL-2 |
| FL-5 | feat/library-offline | Installable web app, Downloads (m10), offline video, audio and files, access sync | 129 | FL-3 |
| FL-6 | feat/library-gated | Gated items through `checkAccessBatch`, plan labels, Shop with locked items (Join and Buy show Later until FL-7), Access ended, `InboxItem` fan out, digest, notification settings (m11) | 130, 182 | Gating engine (#21) and content PR 8 |
| FL-7 | feat/library-money | Memberships and Manage (m9), status sheet membership and purchases, Wallet change, Purchased labels, Join, Buy, Renew and Rejoin through the creator payment sheet (m5) | 125, 182 | Content PR 10 (checkout), PR 11 and AmpedMemberships (#25 phase C) |
| later | with #27 | Live in the Library | 135 | Live streaming |

Order: #346 and #348 merge; FL-0, FL-1 and FL-2 in parallel; FL-3 and FL-4 in parallel (first fan release: free and follower content, branded creator sections, the phone player); FL-5; FL-6 when the gating engine lands; FL-7 when checkout and memberships land.

### 3.11 Acceptance criteria

1. Every item in any Library list passes the access check at request time and carries the server computed `accessSource` and owner.
2. Every card, row and tile names its owner. A creator section shows only that creator's items.
3. At most one access label per item, per the precedence in 2.1.
4. The creator section renders in the creator's theme; rail, top bar, dock, sheets and notices stay Prism; every text and button pair meets 4.5:1 or falls back.
5. Continue, Newest and search never return an item the viewer cannot open. The Shop never returns a media URL.
6. A purchased item that is also in a membership shows Purchased and stays open after the membership ends.
7. Position written on a phone is the resume point on a desktop within 15 seconds.
8. Audio keeps playing with the phone locked and shows lock screen controls on iOS Safari and Android Chrome.
9. The mini player survives navigation and has no close button; swipe down stops it.
10. Autoplay never starts an item the viewer cannot open and never leaves the creator.
11. Downloads only for allowed items; files open offline for 30 days since the last check; losing access deletes the files at the next check.
12. Publishing a members item creates one inbox item per eligible member within 60 seconds for 10,000 members, none for a public item.
13. Memberships orders past due, active, canceled; Renew opens the creator's sheet and the card updates without a reload.
14. The testnet line appears only on Your creators with a pool row. No banned words. No dashes.
15. Keyboard, reduced motion, 44 px targets and one filled button per screen hold on every Library screen.
16. Typecheck and build pass for `server`, `client`, `landingpage`, `@repo/ui`, `@repo/constants`, `@repo/database`. Tests cover access source precedence, Shop denial, theme fallback, progress guard, autoplay filter, download check, fan out idempotency and the copy scan.

### 3.12 Edits this spec makes to other specs

- **Memberships (#25).** Library Memberships replaces Wallet Memberships; mb9 becomes a Wallet Activity row. The creator payment sheet also opens from the creator section and the Memberships list.
- **Content system (#20).** Player phone layouts, queue, autoplay and sleep timer; viewers in the owner's look; offline video through Stream MP4 where downloads are allowed (replaces "streams are never cached" for allowed items).
- **Theme Engine v2 (D28).** New consumer: `CreatorThemeScope`; still scenes and no motion effects in the Library.
- **Broadcast (#1).** Inbox kinds `content` and `live`; rows carry owner and access label.
- **Fan Graph (#22).** `follow.listFollowing`; Following is shown in Your creators and the creator status sheet.
- **App structure v2.** D01 Library destination; D09 dock order; D19 Wallet tabs revert to three.

### 3.13 Counsel and engineering gates

1. Counsel: daily digest as commercial email and the New content preference as consent (before FL-6); the ownership line (before FL-4); offline copies in the creator and fan terms (before FL-5).
2. Engineering: hls.js token refresh mid session and native HLS on iOS (verify PR 6a on staging).
3. Engineering: iOS Safari Cache Storage limits and eviction for FL-5; Stream MP4 renditions turned on only for items with downloads allowed.
4. Engineering: theme summary payload and font loading for up to 20 creators on one screen.

## Sources

- Patreon, Navigate the Patreon app as a member: https://support.patreon.com/hc/en-us/articles/19501240539405
- MDN, Media Session API: https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API
- MDN, Picture-in-Picture API: https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API
- MDN, Web app manifests: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest
- MDN, Storage API estimate: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate
- Cloudflare Stream, secure your Stream: https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
- Cloudflare Stream, download videos: https://developers.cloudflare.com/stream/viewing-videos/download-videos/
- Cloudflare Stream, adding captions: https://developers.cloudflare.com/stream/edit-videos/adding-captions/
- HTML standard, media elements removed from a document: https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource

## Revision log

- 2026-10-08: First spec, from Rob's direction that fans need multi device consumption, a standalone My Memberships and a standalone My Media organized by relationship.
- 2026-10-08 (later): Payment flow rules applied: Renew and Rejoin open the creator branded payment sheet; no on-ramp in the Library.
- 2026-10-23 (R1, PR 6a): Copied into the repo. Corrections: audio, captions and files are served from R2 through the media gateway, not CloudFront; new tables use UUID v7 `BINARY(16)` ids; positions are milliseconds; hls.js from npm; captions specified. Phase A scope set to PR 6a.
- 2026-10-23 (R2, creator ownership): Rob's direction that a fan holds content from many creators. Ownership and access model, creator sections in the creator's look with a store, access precedence, owner shown everywhere, decisions 10 to 14, rows 180 to 182.
- 2026-10-23 (R3, mobile first): After an expert UI evaluation (four reviewers) with phones as the main surface: one page Library with no tabs, Your creators replaces the Creators and Following tabs, creator sections with Yours and Shop and one status line, one access label per item, Filter sheet, search, phone video and audio players with gestures, queue, autoplay and sleep timer, viewers, offline video and audio where allowed, item menu, phone type and target rules. Boards m1 to m12, d1, d4, d10 replace fl1 to fl15. Decisions A to D. Rob answered decisions 10 to 14 and A to D with the recommendations and approved the screens except row 184. PR plan FL-0 to FL-7.
