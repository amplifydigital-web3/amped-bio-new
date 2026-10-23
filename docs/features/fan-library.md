# Fan Library: My Media, My Memberships, player and multi device consumption

Status: spec approved for phase A build, 2026-10-23. Boards (UI design) for rows 124 to 130 follow.
Owner: Rob Frasca. Drafted by Claude, 2026-10-08. Repo copy 2026-10-23 (see Revision log).
Build Board: #26 Fan Library. Amends #25 Memberships (Wallet tab), #20 Content system (player, progress, feed page), #1 Broadcast (inbox kinds), #22 Fan Graph (Following view). Live tab is specified in #27 Live streaming.
Parents: Access Gating Engine (#21, `docs/features/access-gating-engine.md`) owns access. Content system (#20, `docs/features/content-system.md`) owns items, storage and signed delivery. This document reads both and changes only what section 3.12 lists.
Screens: Screen Review rows 124 to 130.

## 1. Research

### 1.1 What the current specs give a fan

| Need                                  | Where it is today                                                                            | Gap                                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| See my memberships                    | Wallet, Memberships tab (mb9): creator, plan, interval, renewal, allowance, Cancel, Renew    | Billing only. No content, no benefits list, sits beside token balances. A fan with no interest in tokens must open Wallet to find it. |
| Open members only content             | The creator page content block and the standalone content page amped.bio/handle/c/{publicId} | Per creator. No cross creator view. No newest first. No continue watching.                                                            |
| Know something new was published      | Nothing. Broadcast is a manual message.                                                      | A creator must write a broadcast for every drop or fans never hear about it.                                                          |
| Resume a video                        | Nothing. The Stream player keeps position in the tab only.                                   | Lost between devices and sessions.                                                                                                    |
| Listen on a phone with the screen off | Nothing specified.                                                                           | Audio stops on lock without Media Session handling.                                                                                   |
| Download a file                       | Content system: single use signed URL when allow download is on                              | Works per item. No list of what I downloaded.                                                                                         |
| Following                             | Fan Graph: the Following menu on the creator page and People for creators                    | No fan side list of who I follow with their content.                                                                                  |
| Live                                  | Out of scope in the content system                                                           | #27.                                                                                                                                  |

### 1.2 What is on development (23 Oct 2026)

- **Destinations.** Seven rail items (app structure D01). Fan accounts (page UNPUBLISHED) see the creator shell with a Home card Make your own page. There is no fan first destination.
- **Inbox.** A top bar bell opens the broadcast inbox. The list is a feed of items with a `kind`; v1 has `broadcast`. Unread polling every 60 seconds.
- **Content.** Content system PRs 1 to 5 are merged: `ContentItem` and `ContentAsset` with `publishedAt` and `chapters` (`[{ startMs, title }]`), uploads to R2 and Cloudflare Stream, the processor Worker and the media gateway Worker. Video plays from Stream with signed RS256 tokens; audio, images and documents are R2 objects served through the media gateway (`media.ampedusercontent.com`) with HMAC tokens (content system 3.6).
- **Memberships.** Specified (#25), not built: `Membership`, `memberships.mine`, mb9 in Wallet.
- **Fan Graph.** `Follow` with ACTIVE computed at read. `follow.listFollowing` does not exist; People lists followers for creators only.
- **Gating.** Specified (#21), not on development. A batch check per item list is the right call for a Library page.
- **PWA.** `apps/client` has no manifest and no service worker.

### 1.3 Patterns in the market

| Product                                                     | What it does                                                                                                                                                                                                                                                                  | Take                                                                                 | Avoid                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Patreon app (member)                                        | Home feed mixes discovery and memberships; a Memberships feed shows only supported creators; Library holds recently played, recently viewed, saved and downloads with auto download and quality settings; memberships are edited from the creator page More menu or Settings. | A memberships only feed. Library with continue, saved, downloads. Download settings. | Mixing discovery into the paid feed. Burying membership management three taps deep. |
| Substack app                                                | Inbox of posts, audio and video with background playback, podcast downloads.                                                                                                                                                                                                  | Background audio with lock screen controls.                                          | Email as the primary surface.                                                       |
| Spotify, YouTube                                            | Position sync per account across devices. Mini player that persists across navigation. Queue for audio.                                                                                                                                                                       | Server side position. Mini player. Queue.                                            | Autoplay into content the fan cannot open.                                          |
| Netflix                                                     | Continue watching row first, by profile.                                                                                                                                                                                                                                      | Continue watching at the top of Media.                                               | Downloads of streams with DRM expiry. Out of scope.                                 |
| Gumroad library                                             | Every purchase in one list with the file and a Receipt link.                                                                                                                                                                                                                  | Purchased as a relationship filter.                                                  | Handing out raw file URLs.                                                          |
| Media Session API, Picture in Picture API, Web App Manifest | Lock screen controls and metadata for audio and video on iOS 15 plus and Android; PiP in Chrome, Safari and Edge; home screen install with standalone display.                                                                                                                | All three in the shared player and the client shell.                                 | A native app before the web app has proven the flows.                               |
| Chromecast and AirPlay                                      | AirPlay works from Safari video elements with HLS. Chromecast needs DASH (Cloudflare Stream serves both) or a Cast SDK receiver.                                                                                                                                              | AirPlay now through the HLS stream. Cast later through the DASH manifest.            | Building a custom Cast receiver in v1.                                              |

### 1.4 Patterns we adopt

1. The Library is a view over grants. Every item shown is the result of `checkAccessBatch` for the viewer. No separate permission model.
2. Position, completion, saved and download state are per account, server side, written in the background.
3. One player component, two layouts, used on every surface that plays media. It owns Media Session, PiP, captions, speed, AirPlay and the mini player.
4. New content reaches fans through the inbox with the existing per creator email consent.
5. Downloads are the content system's single use URLs, stored by the browser for offline opening, only when the creator allows download.
6. Phone first layouts at 390, desktop at 1440, one codebase, installable as a web app.

## 2. Overview

### What ships

1. **Library destination** at /library, for every account, with tabs Media | Memberships | Following | Live (Live arrives with #27 and is not rendered before it, D07).
2. **Media tab.** Continue watching, Newest from your creators, one rail per creator, filters (kind, relationship), Saved, Downloads.
3. **Memberships tab.** The standalone My Memberships screen. One card per membership: plan, benefits, status, next renewal, three newest members only items, Manage, Receipts. Manage opens a Prism sheet for the non money actions (cancel, interval, receipts). Renew, top up and Rejoin open the creator branded payment sheet (memberships payment flow rule 3): the fan pays that creator, in that creator's theme, with the Amped.Bio fee shown as a line. A short balance links to Wallet; the on-ramp is never embedded in the Library.
4. **Following tab.** Creators followed and pools staked, with the newest items each opened to this fan.
5. **Shared media player.** Video and audio, full and mini layouts, resume, captions, speed, PiP, Media Session, AirPlay, keyboard shortcuts, queue for audio.
6. **Creator feed page** at amped.bio/handle/content, newest first, public and locked cards with rules.
7. **Inbox content items.** Kind `content` in the inbox feed when a creator publishes a gated item the fan can open; Library badge on the dock and rail.
8. **Installable web app.** Manifest, icons, standalone display, service worker for the shell and downloaded files.

### Decisions for Rob (recommended answers; alternatives on the board card)

1. **Where it lives.** Recommended: a Library destination in the Start group, after Explore: Home, Explore, Library. Desktop rail goes to eight items. Phone dock: Home, Page, Library, Wallet, More for creators; Home, Explore, Library, Wallet, More for fan accounts (no Page until published). Why: a fan needs a first class place, and the Inbox bell is for messages, not a catalog. Alternative: tabs under Home. Hides the catalog behind a creator checklist.
2. **Memberships leave Wallet.** Recommended: yes. Library, Memberships is the only management screen. Wallet, Memberships tab (mb9) becomes a row in Wallet Activity: Memberships, with the next charge and a link Manage in Library. Wallet tabs return to Tokens | Activity | Names. Why: a membership is a relationship with content, not an asset. Alternative: keep mb9 and add a read only list in Library. Two screens for one object.
3. **Progress per account.** Recommended: yes, server side, written every 10 seconds of playback and on pause, per item per account. Why: cross device resume is the whole point. Alternative: browser only. Lost on every new device.
4. **Downloads.** Recommended: only items with allow download, through the single use signed URL, stored in the browser (Cache Storage or OPFS) and listed under Downloads. Streams are never cached. Why: matches the content system's stream, do not download rule. Alternative: offline streams with expiring keys. That is DRM; out of scope.
5. **Web app before native.** Recommended: installable PWA now; native apps evaluated after 90 days of Library data. Why: one codebase, no app store review on gated content, no 30% fee on memberships. Alternative: native wrappers now. App store digital goods rules would take 30% of every membership joined in the app.
6. **New content notifications.** Recommended: an inbox item of kind `content` for every account that qualifies at publish time, with the existing per creator email consent; email is a digest, at most one per creator per day. Why: one inbox, one consent record. Alternative: push and email per item. Noise and consent risk.
7. **Creator feed page.** Recommended: amped.bio/handle/content, server rendered, indexable for public items only, locked items present as cards with the rule and no media URL. Why: gives search engines and fans one place per creator; locked cards sell the membership. Alternative: no feed page, content block only.
8. **Casting.** Recommended: AirPlay in v1 through the native video element; Chromecast in phase 2 through DASH. Why: AirPlay is free with HLS in Safari. Alternative: both now.
9. **Relationship labels in the Library.** Recommended: Members, Followers, Pool fans, Purchased, matching memberships decision 8. Stake rows carry the verbatim testnet line in the Following tab footer.

### Out of scope

- Native iOS and Android apps. Comments, likes, reactions on content. Playlists and collections (content system phase 3). Cross creator recommendations inside the Library (Explore owns discovery). Offline streams. Chromecast (phase 2). Watch parties.

## 3. Detailed spec

### 3.1 Screens

| Row | Surface                                                      | Boards         | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 124 | Library, Media tab, desktop and phone                        | fl1, fl2       | Continue watching rail (poster, title, creator, progress bar, resume label), Newest from your creators, one rail per creator with the relationship chip, filter chips Kind and Relationship, Saved and Downloads sections. Empty state for a new fan: Follow a creator or join a membership to fill your Library, with Explore as the next step.                                                                                                                     |
| 125 | Library, Memberships tab (My Memberships), desktop and phone | fl3, fl4       | One card per membership in Prism: creator avatar, name, handle, plan name, status chip (Active, Past due, Canceled, access until date), price and interval, next renewal, benefits (up to 6), three newest members only items, Manage, Receipts. Past due shows Renew as the primary. Canceled shows Rejoin. Renew and Rejoin open the creator branded payment sheet; Cancel and interval changes stay in a Prism sheet. Sort: past due first, then by next renewal. |
| 126 | Library, Following tab, desktop and phone                    | fl5            | Creators followed (ACTIVE follows) and pools staked, one row each: avatar, name, handle, relationship chips (Following, Pool fan, Member), newest item thumbnails, Open page. Footer carries the verbatim testnet line when any pool row is present.                                                                                                                                                                                                                 |
| 127 | Creator feed page, public site, phone and desktop            | fl6, fl7       | amped.bio/handle/content in the creator's theme: header with avatar and name, filter chips by kind, newest first grid. Public items play inline. Locked items show the blurred cover, the rule label and open the unlock sheet or the pool page. Membership card pinned at the top for non members when a plan exists. Footer: Powered by Amped.Bio. Content system board cs6 draws the PR 6 version.                                                                |
| 128 | Shared media player, full and mini, desktop and phone        | fl8, fl9, fl10 | Full video: 16:9 well, controls (play, seek with chapters when present, volume, captions, speed 0.75 to 2, PiP, AirPlay, full screen), title, creator, Save, Download when allowed, Report. Full audio: cover, waveform, 15 second skip. Mini player: 55 high bar above the phone dock and in the desktop context field footer, with play, title, progress, expand and close. Keyboard: space, arrows, f, m, c on desktop. Reduced motion honored.                   |
| 129 | Content item page and Downloads, phone                       | fl11, fl12     | Content page gains Resume at 12:40 on the primary, Save and Download when allowed. Downloads list: item, size, creator, Open, Remove; storage used line; offline notice.                                                                                                                                                                                                                                                                                             |
| 130 | Inbox content items and new content preferences              | fl13, fl14     | Inbox list gains a Content filter chip and content rows. Notification preferences gain New content per creator. Library dock and rail badge for unseen items.                                                                                                                                                                                                                                                                                                        |

### 3.2 Data model

New Prisma models in `packages/database/prisma/schema.prisma`. New tables use UUID v7 ids in `BINARY(16)` (AGENTS.md); times are milliseconds, as `ContentItem.durationMs` and chapters are.

```prisma
// Phase A (PR 6a)
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

// Phase B and D: SavedItem, DownloadRecord, InboxItem, same id and cascade rules
```

`SavedItem` (userId, contentItemId, createdAt, unique pair), `DownloadRecord` (userId, contentItemId, bytes, grantJti, createdAt, removedAt) and `InboxItem` (userId, kind `content` | `live`, creatorUserId, refType, refId, readAt, unique on userId plus ref) follow in their phases with the same conventions.

Changes to existing models: `ContentItem.publishedAt` and `chapters` already exist (content system PR 2). `NotificationPreference` gains `newContentEnabled Boolean @default(true)` in phase B.

### 3.3 Access and listing (gating engine contract)

- Every Library list runs `checkAccessBatch(viewer, items)` and returns only `allowed: true` items, plus the item's rule summary for the relationship chip. The creator feed page returns every PUBLISHED item and marks each with the decision and `unlockHint`, with no media URL on denied items.
- Relationship chips come from the rule kind: `member` to Members, `follower` to Followers, `pool_member` and `stake_min` to Pool fans, `paid` to Purchased, no rule to Public.
- The Library never issues a grant on list. Grants are issued when the fan opens an item, through `access.issueGrant` and `content.getReadUrl`. The player refreshes the stream token before expiry through the same call; a denied refresh stops playback at the next segment (stream exception, content system 3.6).
- New content fan out: on the first PUBLISHED transition of a gated item, a job calls `listEligibleUserIds(ruleId)` and writes one `InboxItem` per user in chunks of 1,000. Public items create no inbox item.

### 3.4 tRPC procedures

Phase A (PR 6a), `apps/server/src/trpc/progress.ts`:

| Procedure      | Input                                              | Output                                                                                                                                                                |
| -------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `progress.get` | `{ publicId }`                                     | `{ positionMs, durationMs, completed, updatedAt }` or null; never says whether an item exists                                                                         |
| `progress.set` | `{ publicId, positionMs, durationMs?, completed }` | `{ saved }`; 12 a minute per item per account; ignored (saved false) when the viewer may not open the item; position clamped to the duration; completed at 95 percent |

Content system additions in PR 6a: `content.getReadUrl` (signed delivery, spec 3.6 of the content system), `content.setCaptions` and `content.removeCaptions`.

Phase B, new `library` router, all private, cursor pagination: `library.continue`, `library.newest`, `library.byCreator`, `library.saved`, `library.save`, `library.unsave`, `library.downloads`, `library.recordDownload`, `library.removeDownload`, `library.memberships`, `library.following`; `inbox.list` and `inbox.unreadCount` amended; `notifications.setNewContent`.

### 3.5 Client structure

- **Player** (`packages/ui/src/player/`, PR 6a): `PlayerProvider` owns one `<video>` and one `<audio>` element per page and never unmounts them. The full player (`MediaPlayer`) borrows the video element by moving it into its well; on unmount it goes back and the `MiniPlayer` shows. A media element moved within the document keeps playing, so play survives navigation. The provider is mounted once in the editor (`pages/Editor.tsx`) and in the public site's handle layout (PR 6).
- **Video** plays the Cloudflare Stream HLS manifest with the signed token: native HLS on Safari and iOS, hls.js elsewhere (npm `hls.js` 1.6.15, imported only when needed). The Stream iframe player is not used: it cannot carry Media Session, the mini player or our token refresh.
- **Audio** plays a native `<audio>` element from the media gateway URL (`audio/{publicId}/full.m4a`), with Range support. Waveform peaks come from the processor's `derived/{publicId}/waveform/peaks.json`.
- **Refresh.** Every source carries `expiresAt`. The provider asks `content.getReadUrl` again a minute before it, swaps the URLs and keeps its place. A refused refresh stops at the next segment and shows Try again.
- **Progress.** Written every 10 seconds of play, on pause, on seek, on `visibilitychange` hidden and on `pagehide`, through a `ProgressAdapter` the host app provides (signed in viewers only). Resume shows Resume at mm:ss and Start over when the saved position is past 30 seconds and before 95 percent.
- **Media Session.** Title, creator, cover, play, pause, seek forward and back, seek to, stop. Lock screen and headset controls work on iOS 15 plus and Android Chrome.
- **Picture in picture.** `requestPictureInPicture` on the video element; hidden when unsupported.
- **AirPlay.** `x-webkit-airplay="allow"` on the video element and the AirPlay button when the Safari route picker reports a target. Chromecast is phase 2.
- **Captions.** WebVTT, one file per language, up to 5 per item, 512 KB each. Video captions are uploaded to the Stream video and ride in the HLS manifest. Audio captions are an R2 object at `derived/{publicId}/captions/{lang}.vtt`, served through the gateway, shown as text under the audio player. The creator adds them in the item editor. Speed 0.75, 1, 1.25, 1.5, 2.
- **Keyboard.** Space and k play or pause, left and right or j and l seek 10 seconds, up and down volume, f full screen, m mute, c captions. Arrows stay with the seek slider when it has focus.
- **Downloads** (phase D). For allowed items: `content.getReadUrl` with `download: true`, fetch to Cache Storage under `downloads/{publicId}`, write `DownloadRecord`. Opening offline serves from the cache through the service worker.
- **Installable web app** (phase D). `manifest.webmanifest`, a service worker that caches the app shell and the `downloads/` cache only. Never caches streams, signed URLs, API responses or creator pages.

### 3.6 Public site

- `apps/landingpage` adds `/[handle]/content` (decision 7), server rendered from `content.feed`, in the creator's theme. Content system PR 6 ships it for public items; locked cards arrive with gating (content system PR 8).
- Public items get JSON-LD `VideoObject` or `AudioObject` with no content URL. Locked items are rendered as cards with no media reference.
- The content page gains Resume, Save and Download per row 129.

### 3.7 Copy, compliance and privacy

- No earn, reward, yield, return, APY, invest or price words anywhere in the Library or the player.
- Stake relationships show the verbatim testnet line in the Following tab footer and nowhere else in the Library.
- Payment flow rules (memberships spec, 8 Oct): every payment launched from the Library is a USDC transfer from the fan to that creator in the creator's branded sheet; the Library never shows an Amped.Bio balance and never embeds the on-ramp.
- Progress, saved and download records are personal data: deleted with the account (cascade) and with the item. Creators never see per fan progress; creator stats stay aggregate.
- 18+ items play only for age assured accounts (#28). Until age assurance ships, every public read refuses them.
- No em or en dashes in shipped copy.

### 3.8 Analytics

Client events: `library_opened { tab }`, `library_item_opened { kind, relationship, source }`, `player_resumed`, `player_completed`, `player_background_audio`, `player_pip`, `player_airplay`, `item_saved`, `item_downloaded`, `pwa_installed`, `creator_feed_viewed { locked_items, public_items }`. Server events: `inbox_content_fanout { recipients }`, `digest_sent`.

### 3.9 Phases

- **Phase A, player and progress (PR 6a).** Shared player, mini player, Media Session, PiP, AirPlay, captions, speed, keyboard, `ViewerProgress`, `progress.*`, captions upload in the item editor, owner preview in the editor. Ships with content system phase 1.
- **Phase B, Library.** Destination with Media and Following tabs, `library.*`, Saved, inbox content items and digest, dock and rail changes. Needs Fan Graph and content system phase 2 (gated items).
- **Phase C, Memberships tab and Wallet change.** With memberships phase C.
- **Phase D, downloads list and installable app.**
- **Phase E, Live tab.** With #27.

### 3.10 Acceptance criteria

1. Every item in any Library list passes `checkAccessBatch` for the viewer at request time.
2. Position written on a phone is the resume point on a desktop within 15 seconds of the last write.
3. Audio keeps playing with the phone locked and shows title, creator and controls on the lock screen on iOS Safari and Android Chrome.
4. The mini player survives navigation across every destination and public page without a reload or restart.
5. A download works only for items with allow download on.
6. Publishing a members only item creates one inbox item per eligible member within 60 seconds for 10,000 members, none for non members, and no item for a public item.
7. The Memberships tab shows every membership with the right status chip and renewal date.
8. The creator feed page renders locked cards with no media URL in HTML, JSON-LD or the payload.
9. The Following tab shows the verbatim testnet line only when a pool row is present.
10. No Library, player, feed page or inbox string contains a banned term. No dashes.
11. Reduced motion, keyboard reachability and the 44 target rule hold on every control; the player is operable by keyboard alone.
12. Typecheck and build pass for `server`, `client`, `landingpage`, `@repo/ui`, `@repo/constants`.

### 3.11 Counsel and engineering gates before build

1. Counsel: the daily digest email as commercial email and the per creator New content preference as consent (phase B).
2. Engineering: hls.js token refresh mid session (PR 6a swaps the manifest with a fresh token and resumes at the same position) and native HLS on iOS Safari (PR 6a reloads the source and seeks back). Verify both on staging.
3. Engineering: Cache Storage quotas on iOS Safari for phase D.
4. Design approval: rows 124 to 130 and decisions 1 to 9.

### 3.12 Edits this spec makes to other specs

- **Memberships (#25).** Library, Memberships tab replaces Wallet, Memberships as the management screen.
- **Content system (#20).** Video vendor is Cloudflare Stream; the shared player, Media Session, PiP, captions, speed, keyboard; captions upload in the item editor; new creator feed page; standalone content page gains Resume, Save, Download.
- **Broadcast (#1).** Inbox feed gains kinds `content` and `live`.
- **Fan Graph (#22).** New fan side Following view; `follow.listFollowing` added.
- **App structure v2.** D01 gains the Library destination; D09 dock order per decision 1; D19 Wallet tabs revert to three.
- **SEO (#10).** Reserved segment `content`; feed page in the sitemap for creators with public items.

## Sources

- Patreon, Navigate the Patreon app as a member: https://support.patreon.com/hc/en-us/articles/19501240539405
- MDN, Media Session API: https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API
- MDN, Picture-in-Picture API: https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API
- MDN, Web app manifests: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest
- Cloudflare Stream, secure your Stream (signed URLs and tokens): https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
- Cloudflare Stream, adding captions: https://developers.cloudflare.com/stream/edit-videos/adding-captions/
- HTML standard, media elements removed from a document: https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource

## Revision log

- 2026-10-08: First spec, from Rob's direction that fans need multi device consumption, a standalone My Memberships and a standalone My Media organized by relationship.
- 2026-10-08 (later): Payment flow rules applied: Renew and Rejoin open the creator branded payment sheet; no on-ramp in the Library.
- 2026-10-23: Copied into the repo for PR 6a. Corrections: audio, captions and files are served from R2 through the media gateway (Rob moved all storage to Cloudflare on 12 Oct), not CloudFront; new tables use UUID v7 `BINARY(16)` ids per AGENTS.md; positions are milliseconds; hls.js is an npm dependency loaded on demand, not a CDN script; captions specified (Stream for video, R2 for audio, 5 languages, 512 KB). Phase A scope set to PR 6a.
