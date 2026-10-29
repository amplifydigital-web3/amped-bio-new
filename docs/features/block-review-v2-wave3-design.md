# Block Review v2, wave 3: design spec

Build Board card #54. Date 26 Oct 2026. Baseline development a3ce3330. Builds after Theme Engine v2 and behind SHOW_BLOCKS_V2, on the block kit and the Block settings row from wave 1.

Wave 3 holds the tier 3 parity gaps and the legacy Web3 blocks. Rob answered parity bar: match every competitor block. With this wave every family in the research matrix has a design, except three that live elsewhere: Sub pages (own card), Webinar and live stream tickets (Live streaming card) and Upsell and order bump (a store checkout feature, not a block).

## Decisions answered 26 Oct that change earlier waves

- Parity bar: match every competitor block. Wave 3 covers every remaining family.
- SMS signup ships with Email signup in wave 1. It is drawn here; the build slot is the wave 1 Email signup slot. Counsel signs the consent copy before launch.
- Legacy Web3: rebuild Token price with real REVO data. Swap retires. NFT collection becomes the Collectibles shelf.
- PL1: the pool block keeps Total staked, Fans, Creator share and the Network Reward Rate with its helper, as today. Boards pl1 and pl2 and the part 2 spec are updated.
- SH5: Etsy and Printful join Shopify, Fourthwall and Spring at launch. Board sh2 and the wave 2 spec are updated.

## Rules that apply to every block

- Creator page surfaces use only the creator's theme (section 17). Editor surfaces use Amped Prism 2.2 Balanced v1.0.
- Motion: CSS, WAAPI and scroll driven animation behind @supports, with an IntersectionObserver fallback. View Transitions for state changes. Motion (MIT) only for gestures. No GSAP. Loops pause on hover, focus, touch, reduce motion and the page Pause motion control.
- Targets are at least 44 by 44. Text contrast is at least 4.5 to 1. Large text and icons are at least 3 to 1.
- Third party content loads after consent. Feeds use official APIs, oEmbed or RSS, fetched and cached on the server.
- Copy: no em or en dashes. Short declarative sentences. Prices of goods and services are fine.

## Design pages

| Block | Boards | Design page |
|---|---|---|
| Marquee and announcement bar | mq1 (row 257), mq2 (row 258) | https://claude.ai/artifact/2VCZJ2TfdJHmj82CUWonau |
| Release and pre save | rl1 (row 259), rl2 (row 260) | https://claude.ai/artifact/GBAySG8kVHfTsLo2hBhcjF |
| Podcast player | pc1 (row 261), pc2 (row 262) | https://claude.ai/artifact/1ZNiabsxvMoF44LxjyV5nG |
| Social posts | sp1 (row 263), sp2 (row 264) | https://claude.ai/artifact/A18Kv9mqwkwQFPPY9d1Z9H |
| SMS signup | sm1 (row 265), sm2 (row 266) | https://claude.ai/artifact/QDY1CH6fdYvzBPK8eLbNgn |
| Lead magnet | lm1 (row 267), lm2 (row 268) | https://claude.ai/artifact/Ljvf2xzMQKVi25aswE9Dgn |
| Poll and survey | po1 (row 269), po2 (row 270) | https://claude.ai/artifact/4bvxCNaiL5jT52yZLh33Mg |
| Testimonials | ts1 (row 271), ts2 (row 272) | https://claude.ai/artifact/FQNjctyZXoDjbjFSftQvcm |
| Timeline | tl1 (row 273), tl2 (row 274) | https://claude.ai/artifact/5ibSquvDaJe9CTQZJWe3nT |
| Map and location | mp1 (row 275), mp2 (row 276) | https://claude.ai/artifact/5nZRDZ5mPFkv4M18fwZTHf |
| Community channels | cm1 (row 277), cm2 (row 278) | https://claude.ai/artifact/6KsJoCoAV1a2Z2iNXg45Ho |
| Fundraising goal | fg1 (row 279), fg2 (row 280) | https://claude.ai/artifact/UmJVSawnxzfKmWVLcEubdM |
| Discount code | dc1 (row 281), dc2 (row 282) | https://claude.ai/artifact/SGxZhu5ey1YDGXg9Dwh9BQ |
| Price list and service plans | ps1 (row 283), ps2 (row 284) | https://claude.ai/artifact/NBujZfpDVKntgXMCU7WVLT |
| Collectibles shelf, and the Swap retirement | cs1 (row 285), cs2 (row 286) | https://claude.ai/artifact/1zr4uvSHfN5DXAmcHb3DVA |
| Token price | tk1 (row 287), tk2 (row 288) | https://claude.ai/artifact/NwUXNhXoagkDfFyM3WEfMu |

## Findings in today's code

- Token price: `TokenPriceBlock.tsx` shows hard coded mock data under the REVO label: Ethereum's name and logo, $2,235.67 with a green up arrow, market cap and volume. Since 040 D3 the public page renders nothing for `token-price`; the editor preview still shows the mock. No REVO price source exists on the server. `TELEGRAM_BANNED_PHRASES` bans "revo price", which conflicts with the rebuild (TK1).
- The hidden `nft-collection` and `uniswap` types still render on public pages, framing third party content on page open before consent. The uniswap type frames any https address with no host allowlist and no sandbox. CS4 retires Swap; CS3 replaces the OpenSea frame.
- X posts use react-tweet, which fetches the post from a third party API in the visitor's browser before consent and renders outside the creator's theme. SP1 replaces it with a server copy.
- Discord invites sit as plain link blocks in the public page HTML for anyone. Community doors keep invites on the server for locked doors.
- Releases and podcasts today are Spotify frames loaded on page open, before consent.

## Marquee and announcement bar (`marquee`), new

**Job.** Put short, time bound news in front of every visitor, as a slow ribbon in the list or a single bar at the top of the page.

**Today (development a3ce3330).** Missing on creator pages. The only announcement is Amped's own app banner (`apps/client/src/components/Banner.tsx`, set from the admin dashboard), which shows inside the editor, not on public pages. Creators use a link block or a text block for news.

**Config.** `mode` (`ribbon`, `bar`). Ribbon: `items[]` (1 to 8: `{kind: text | logo, text 1 to 40, imageId?, alt 1 to 60, url?}`), `speed` (`slow`, `medium`, `fast`: 30, 45, 60 px/s), `direction` (`rtl`, `ltr`), `path` (`straight`, `wave`), `separator` (`star`, `dot`, `none`). Bar: `text` (1 to 60), `url` (optional), `countdown` (`{at: ISO datetime stored in UTC, tz: IANA name}` or null), `atZero` (`onnow`, `hide`), `dismissible` (bool, default true). The bar is a singleton and renders above the profile. The save transaction refuses a second bar on the page with "Only one announcement bar per page". Item `url` and bar `url` pass the D57 scheme rule: http, https, mailto and tel only. `marqueeConfigSchema` extends `blockSettingsSchema` and is listed in CONFIG_SCHEMAS. A bar with Who can open this is not shown to visitors who cannot open it; no locked bar is drawn. Common settings: `schedule`, `access`, `motion`. Attention is not offered on a ribbon.

**Public states.**
- Ribbon: items loop in one row inside the theme's card, with a pause button at the end.
- Wave: the same items on a gentle curve.
- Logos: uploaded logos with alt text, plus a plain list of names under the ribbon for screen readers.
- Paused, reduce motion or Pause motion: items wrap into rows and stay still.
- Bar before zero: text, the opening time in the visitor's time, days and hours left, close.
- Bar at zero: On now and the text, until the schedule ends; or hidden. With no schedule end, On now shows for 24 hours after zero, then the bar shows the text alone. On now never shows before the real moment.
- Bar closed by the visitor: not shown again until the text changes (a hash of the text in local storage). No visitor id is stored. When storage is blocked the bar shows again on the next visit.

**Rules.** The ribbon has `role="region"` and an `aria-label` that lists every item once; the moving copy is `aria-hidden`, and links inside it carry `tabindex="-1"`. Item links are reached by keyboard through the plain list under the ribbon, which every ribbon renders (visually hidden for text items, shown for logos). The pause button is a native button with `aria-pressed` and the names Pause scrolling and Play scrolling. Closing the bar moves focus to the next focusable control on the page. Below 360 wide the countdown wraps under the bar text. Countdown uses a real date stored in UTC and shown in the visitor's time zone (CD1). No per visitor timers, no reset loops.

**Motion.** CSS transform loop with the items duplicated once for a seamless wrap. Wave offsets each word with a sine based custom property. Pauses on hover, `:focus-within` and touch. Bar slides down 233 ms on first view. Countdown ticks each minute, each second in the last hour. Reduce motion, Pause motion and the pause button: static; items wrap into rows and the duplicated copy is removed. The bar slide is off under reduce motion.

**Editor.** Type tiles Ribbon and Announcement bar. Items chips Text and Logos, item list with drag and remove, Add item, helper on limits and screen readers. Speed, Direction, Path and Between items chips. Pause notice. Announcement bar fields: Text with counter, Link, Count down to a date, At zero chips, Visitors can close it. Then the Block settings rows. Attention is a read only row with no chevron: Not available on this block. Motion reads the shared value (Entrance on); the loop is set by Speed. Schedule reads a real weekday, the date and the creator's time zone (Until Mon 9 Nov, 23:59 WET).

**Decisions.**
- MQ1 Pause control. Recommended: every ribbon shows a 44 pause button; loops stop on hover, focus and touch, under reduce motion and Pause motion. Why: motion that runs longer than 5 seconds needs a way to stop it (WCAG 2.2.2), and moving text is hard to read for many visitors. Alternative: rely on reduce motion only.
- MQ2 Announcement bar. Recommended: one per page, above the profile, closable, closed until the text changes. Why: one bar is a signal; a bar that cannot be closed becomes noise. Alternative: allow a bar on any block and keep it fixed.
- MQ3 Countdown. Recommended: real dates only, the same moment for every visitor, at zero On now or hide. Why: per visitor timers are a false urgency pattern, the same rule as CD1. Alternative: per visitor and daily reset timers.
- MQ4 Speed. Recommended: three speeds capped at 60 px a second. Why: faster loops cannot be read and trigger motion discomfort. Alternative: a free speed slider.
- MQ5 Logos. Recommended: creator uploads with alt text, only brands they work with. Why: no fetched brand marks and no implied endorsements. Alternative: fetch logos from a brand logo service.

**Analytics.** `marquee_viewed`, `marquee_paused` (source: button, hover, reduce), `marquee_item_click` (position), `announcement_closed`, `announcement_click`, each with block id.

## Release and pre save (`release`), new

**Job.** Turn a page visit into a listen on release day: pre save before the date, every service after it, from one card.

**Today (development a3ce3330).** Missing. A creator can add a `media` block with platform `spotify`, which renders Spotify's frame (152 or 352 high) on page open, before consent. One service only. No release date, no pre save and no Apple Music, Deezer, YouTube Music or Bandcamp links (`packages/constants/src/platforms.ts`). Legacy: `spotify` rows migrate to the Media block's Music kind, loaded after consent (spec part 2, Media; `SpotifyBlock` reads `content` before `url`). A track or album row gets a Release hint in the editor, like PC5. Nothing switches on its own.

**Config.** `source` (release URL from Spotify, Apple Music or Deezer, or a UPC), `title` (1 to 60, from the service), `coverId` (from the service, replaceable), `releaseAt` (ISO datetime, stored in UTC) and `tz` (IANA name), `countdown` (bool, default true), `presave` (`{spotify, apple, deezer}` bools, default all on), `offerFollow` (bool, default false), `services[]` (resolved by `music.resolve`: `{id, url, action: play | buy, hidden}` in creator order; `source` and every `url` pass the D57 scheme rule), `layout` (`card`, `compact`, `cover`). Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.**
- Before release: cover, New single or New album, date, countdown, Pre save rows per service, consent line.
- Pre saved: check, the date the song lands, Add to calendar, and the follow state stated plainly.
- Release day before a service confirms: that service shows On release day; others show Play.
- After release: Out now, length, Preview (30 seconds, after a tap), Play or Buy per service. Preview follows the part 2 Music previews rule: Spotify gives no `preview_url` to new apps, so the 30 second file comes from Apple Music or Deezer and plays in Amped's `<audio preload="none">` with the source set on tap. The line under the chip names the service. A release found only on Spotify shows no Preview chip. One audio plays at a time, shared with Podcast and Media.
- Source removed or not found: renders nothing to visitors, Fix chip in the preview.

**Server.** `music.resolve` (MD4) matches the release across services on save, then every 15 minutes from the release date for 48 hours. `presave.connect` runs each service's OAuth with the smallest library write scope (Spotify `user-library-modify`, plus `user-follow-modify` only when the fan ticks Follow; Apple Music user token; Deezer `manage_library`), stores the token encrypted with the release id, adds the release when it goes live, then deletes the token. A token is also deleted 30 days after `releaseAt` if the release never goes live, when the block or the creator's account is deleted, and when the fan cancels from the confirmation email or the service's own app settings. Tokens are encrypted at rest with a key from the secret store and never sent to the page. The privacy notice gains a pre save paragraph naming Spotify, Apple and Deezer and the 30 day limit. Apple Music's MusicKit JS loads only after the fan taps Pre add. `releaseConfigSchema` extends `blockSettingsSchema` and is listed in CONFIG_SCHEMAS. Risk before build: Spotify's 2025 extended quota rules limit which apps may write to fan libraries beyond 25 test users. Confirm Amped qualifies, or launch pre save on Apple Music and Deezer and show Spotify as Play after release. `presave.ics` builds the calendar file. Counts are stored per block; no fan profile is stored.

**Motion.** Countdown ticks each minute, each second in the last hour. Cover flips once at release (610 ms) and the card swaps with a View Transition. Pre save morphs into the check. Rows stagger in. Reduce motion and Pause motion: instant.

**Editor.** Release link or UPC with a found line. Cover and Title with counter and helper. Release date and Time zone. Before release: Show a countdown, Pre save on each service, Offer a follow on Spotify. After release: service list with drag order and hide. Layout chips Card, Compact, Cover first. Pre save and calendar counts. Block settings rows. Motion reads the shared value (Entrance on); the cover flip at release belongs to the block and is named in the Motion helper.

**Decisions.**
- RL1 Pre save access. Recommended: official APIs with the smallest library scope; the token is used once on release day, then deleted. Why: fans grant access to their account, so Amped keeps it for the shortest time and the least reach. Alternative: keep the token to add future releases.
- RL2 Follow on pre save. Recommended: off by default; when on, a separate unticked checkbox for the fan. Why: bundling a follow into a pre save is a consent pattern fans and services object to. Alternative: follow the artist with every pre save.
- RL3 Release flip. Recommended: flip at the release date in the creator's time zone; services join as the resolver confirms them. Why: the date is what fans were told, and no dead link shows before a service is live. Alternative: flip only when every service confirms.
- RL4 Services after release. Recommended: every matched service in the creator's order, Play or Buy, hidden ones stay hidden. Why: fans use different services and the creator decides the order. Alternative: a fixed order for every page.
- RL5 Fan data. Recommended: counts only; no fan email or service profile kept; release day email goes through the Email signup block. Why: a pre save is not consent to marketing. Alternative: collect an email with every pre save.

**Analytics.** `release_viewed`, `presave_started` (service), `presave_done` (service), `release_calendar_added`, `release_preview_played`, `release_service_open` (service), each with block id.

## Podcast player (`podcast`), new

**Job.** Let a visitor hear the creator's podcast on the page in one tap, in any podcast app they already use.

**Today (development a3ce3330).** Missing. The closest is a `media` block with platform `spotify` and a show URL, which renders Spotify's 352 high frame on page open, before consent, in Spotify's fonts and colors. Only Spotify listeners can play it. There is no podcast or Apple Podcasts platform (`packages/constants/src/platforms.ts`).

**Config.** `feedUrl` (RSS, or a podcast page where the feed is discovered), `layout` (`latest`, `list`, `single`), `episodeGuid` (single layout), `count` (3, 4, 10), `skip` (`on`, `off`: back 15 s, forward 30 s), `show` (`{chapters, speed, mini}` bools, default all on), `listenOn` (`{apple, spotify, youtube}` URLs). Apple is matched on the server in Apple's public podcast directory by feed URL. Spotify and YouTube are typed by the creator; no standard feed tag carries them. Every URL passes the D57 scheme rule. `podcastConfigSchema` extends `blockSettingsSchema` and is listed in CONFIG_SCHEMAS. Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.**
- Latest episode: cover, show name, episode title, date, length, play, skip, speed, progress, Listen on chips, the host line.
- Episode list: show header and episodes, each with a play button. The playing one shows bars and its position.
- One episode: a single pinned episode.
- Playing: progress ring on play, current chapter marked, mini player at the bottom once the card leaves the view.
- Feed failing: the last good copy. Feed empty or gone: renders nothing, Fix chip in the preview.

**Server.** `feeds.podcast` uses the LK1 guarded fetch (`services/import/fetchPage.ts`) with the Latest posts rules (RS1 to RS3): on save and hourly, conditional GET, https only, every resolved address checked before connect and after each redirect (max 3), 5 s timeout, XML content type. Podcast feeds stream into the parser with a 10 MB cap and keep the newest 50 items, since a 2 MB cap fails many long running shows. The chapter JSON (1 MB cap, JSON type) and cover art go through the same guarded fetch. Reads episode guid, title, date, duration, enclosure URL, Podcasting 2.0 `podcast:chapters` (JSON fetched and cached) or timestamps in show notes. Cover art is copied to the Amped image service. Enclosure URLs are not proxied.

**Rules.** `<audio preload="none">` with the enclosure URL set only on play. Enclosures must be https: an http enclosure is tried once as https on the server, and if that fails the episode shows Listen on links only. Measurement prefixes in the enclosure (for example Podtrac) also receive the request; the host line names the final host. Progress is a slider with `aria-valuetext` (12 of 41 minutes); arrow keys move 5 seconds. Chapters are buttons in a list; the current one has `aria-current`. The single audio rule is shared with Media music previews and Release previews. One audio element plays at a time across every block on the page. The block names the host (Plays from Buzzsprout). Media Session API shows title and cover on the lock screen.

**Motion.** Progress ring tied to `currentTime` with WAAPI. Playing bars in the theme color. Mini player slides up when the card leaves the view. Chapter marker moves with a View Transition. Reduce motion and Pause motion: static.

**Editor.** Podcast feed or page with a found line. Replace it notice when a Spotify show frame sits on the page. Layout, Episodes in the list and Skip buttons chips. Show checkboxes: Chapters, Speed control, Keep playing as fans scroll. Listen on links with source. Last checked line with Check now. Block settings rows. Motion reads the shared value (Entrance on); the progress ring and playing bars belong to the block.

**Decisions.**
- PC1 Feed on the server. Recommended: Amped reads the feed on save and hourly with the Latest posts rules, and copies cover art. Why: fast pages and no third party calls before a fan acts. Alternative: read the feed in the browser.
- PC2 Where audio plays from. Recommended: the host's own file, only after a tap, nothing preloaded, host named. Why: hosts count downloads for the creator, and visitors who never press play send nothing. Alternative: proxy the audio through Amped.
- PC3 Mini player. Recommended: on by default, one audio at a time, closable. Why: fans keep listening while they browse the page, which is how podcasts are heard. Alternative: audio stops when the card leaves the view.
- PC4 Chapters. Recommended: from the feed's chapter file or show note times, shown by default, current one marked. Why: chapters let a fan jump to the part they came for. Alternative: creator types chapters in Amped.
- PC5 Spotify show frames. Recommended: offer Replace it in the editor; never switch automatically. Why: no page changes without the creator. Alternative: convert every Spotify show frame to this block.

**Analytics.** `podcast_viewed`, `podcast_play` (episode guid), `podcast_complete_50`, `podcast_chapter_jump`, `podcast_listen_on` (app), each with block id. Plays are counted by Amped; downloads stay with the host.

## Social posts (`media`, kind `post`), extended

**Job.** Show one post the creator is proud of, from any network they use, in the creator's own theme.

**Today (development a3ce3330).** The Media block has a `twitter` platform. `TwitterBlock` uses `react-tweet`, whose `useTweet` hook fetches the post in the visitor's browser from a third party API on page open, before consent, then renders X's own white card with a Twitter blue label outside the creator's theme. `instagram`, `tiktok` and `facebook` single posts use `react-social-media-embed`, which loads each network's script on page open. The same renderers run in the editor preview (`apps/client/src/components/blocks`), so the creator's browser calls the same third parties. SP1 removes `react-tweet` and `react-social-media-embed` from both `apps/landingpage` and `apps/client`. Threads, Bluesky, Reddit, Pinterest and Farcaster are not supported.

**Config.** Media block with `kind: "post"`: `url`, `network` (detected: `x`, `threads`, `bluesky`, `reddit`, `pinterest`, `farcaster`, `instagram`, `tiktok`, `facebook`), `layout` (`card`, `compact`), `show` (`{image, author, date}`), `cache` (server: `{text, authorName, authorHandle, avatarId, imageId, postedAt, community?, fetchedAt, status}`). Common settings: `schedule`, `access`, `attention`, `motion`.

**Legacy map.** `media {platform: "twitter", url, content}` becomes `media {kind: "post", network: "x", url, caption: content, layout: "card", show: {image: true, author: true, date: true}}`. `instagram` and `tiktok` single posts map the same way with their network. `facebook` links that are not videos map the same way with `network: facebook` (Facebook videos go to the Media video kind). The cache fills on the first save or by a one time backfill job. `label` is dropped; it is never shown today. A `content` longer than 160 characters is kept until the creator edits; the 160 cap applies on the next save. A row whose backfill fails is not rendered for visitors, as today, and the editor shows a Fix chip.

Facebook and Instagram. Facebook has no public path to a post's text, and Meta oEmbed Read needs an app token, an app review, and gives back markup built for Meta's script. So a Facebook post renders as the Embed facade: provider name, the creator's caption, Load Facebook post and the cookie line, and after the tap or the stored Embedded content choice, Facebook's post plugin iframe (no Facebook SDK script on the page). Instagram single posts use the server copy only if Meta oEmbed Read is approved and its terms allow storing the text and image; until then they use the same facade with Instagram's `/embed` iframe. TikTok single posts use TikTok's public oEmbed for the server copy.

Visible change. Today's X, Instagram, TikTok and Facebook posts load before consent, so moving them to a server copy or a facade is a visible change at migration. SP2's "no visible change until the creator edits" applies to the layout and fields, not to the loading model.

**Public states.**
- Card: avatar, name, handle, network chip, text, image, date, View on {network}.
- Compact: text as a quote, name and network, date, link.
- Reddit: community and title first, then the link.
- Pinterest: image first, pin title, link.
- Removed at the source: the block is not rendered for visitors.
- Fetch failed on first save: the editor shows the error; nothing is published.

**Server.** `posts.resolve` runs on save and daily: X and Threads through oEmbed (text, author, date) with images where the public API allows; Bluesky through the public AppView `getPostThread`; Reddit through `.json` of the post with a registered user agent; Pinterest through oEmbed; Farcaster through a public hub. Text is stored as plain text with links kept as links, 600 characters. Images and avatars are copied to the Amped image service. Every fetch, image and avatar copies included, uses the LK1 guarded fetch: https only, address checks before connect and after each redirect, 5 s timeout, 2 MB cap. The network is detected from an exact host allowlist, and the Reddit `.json` call runs only for a reddit.com post path. Links in post text keep http and https only (D57) and render with `rel="nofollow ugc noopener"`. Removed means: X oEmbed 404, or 403 for a protected account; Threads and Pinterest 404; Bluesky NotFound, blocked or taken down; Reddit `removed_by_category` set, author `[deleted]`, or body `[removed]` or `[deleted]`; TikTok oEmbed 400 or 404; Farcaster cast not found. Each sets `status: removed`. A 5xx or a timeout keeps the last copy.

**Motion.** Card rise on view, scroll driven behind `@supports` with an IntersectionObserver fallback. Card and Compact switch with a View Transition in the editor preview. Reduced motion and Pause motion: static.

**Editor.** Post link with a found line (network, author, copied time). Works with chips. Layout chips Card and Compact. Show checkboxes: Image from the post, Author name and handle, Date. Notice that counts are not shown and deleted posts hide. Checked daily line with Check now. Block settings rows. Works with lists Facebook with a helper: Facebook posts, and Instagram until Meta approves access, show the caption and a Load post button. Motion reads the shared value (Entrance on); the card rise belongs to the block.

**Decisions.**
- SP1 Native card from a server copy. Recommended: Amped fetches the post on save through oEmbed or the network's public API and renders a card in the creator's theme; no provider script on the page. Why: no third party calls from the visitor's browser, no foreign styling, and the page stays fast. Alternative: the provider's embed script behind a click to load facade.
- SP2 One block with the Media block. Recommended: social posts are the Post kind of the Media block, and today's X, Instagram and TikTok single posts move to it with no visible change until the creator edits. Why: one block for one job, and one legacy map. Alternative: a separate block per network.
- SP3 Engagement counts. Recommended: no like, repost or reply counts on the card. Why: a cached count goes stale and reads as a claim about popularity. Alternative: show counts refreshed daily.
- SP4 Deleted or private posts. Recommended: checked daily; a removed or private post hides for visitors at once and the editor shows Removed at the source. Why: it respects the author's choice and the networks' terms. Alternative: keep showing the last copy.
- SP5 Networks at launch. Recommended: X, Threads, Bluesky, Reddit, Pinterest and Farcaster, plus Instagram and TikTok single posts. Why: Rob set the parity bar at every competitor block, and each has a public path that needs no account connect. Alternative: X and Threads only.

**Analytics.** `post_viewed`, `post_open` (network), each with block id.

## SMS signup (`sms`), new, ships with Email signup

**Job.** Let a fan ask for texts from the creator, with consent that holds up and an exit that always works.

**Today (development a3ce3330).** Missing. No phone capture, no SMS provider and no consent record. Rob set SMS to ship with Email signup in wave 1 (sms-timing answered 26 Oct). It is drawn here and builds in the wave 1 Email signup slot.

**Config.** Standalone block `sms`: `title` (1 to 40), `description` (0 to 160), `buttonLabel` (1 to 24, default Text me), `monthlyMax` (2, 4, 8), `listId`. Email signup keeps its wave 1 setting `sms` and it gains one key: `sms` (`{on, listId}`), off by default. `listId` is the list of the SMS block that turned Text me too on (sm2, Also offer Text me too on {email block}); Text me too uses that block's `monthlyMax` and title in its consent text and texts. Removing that SMS block turns `sms.on` off. There is no `textMeToo` or `textListId` key. Fixed by Amped, not editable: sender number, consent wording, keywords, quiet hours, the 24 hour cap, countries. Common settings: `schedule`, `access`, `attention`, `motion`. The schema extends `blockSettingsSchema` and `sms` joins `CONFIG_SCHEMAS`.

**Consent wording (counsel signs before launch).** "I agree to get recurring automated texts from {creator} at this number, about {monthlyMax} a month. Consent is not a condition of purchase. Msg and data rates may apply. Reply STOP to cancel, HELP for help." The same wording shows on the standalone block and on Text me too, each beside its own unticked box. Links to Terms and Privacy sit right under it on both. The email consent line on Email signup keeps its own Privacy link (wave 1). Before launch the Privacy notice states that mobile numbers and text consent are never shared with or sold to third parties for their marketing, and Terms gains an SMS section (program name, frequency, rates, STOP, HELP, support contact). Toll free verification asks for both. Both go into `docs/legal/privacy-parameters.md` and the published notice.

**Texts the fan gets (fixed).** Confirm: "{creator}: Reply YES to get about {monthlyMax} texts a month about {title}. Msg and data rates may apply. Reply HELP for help, STOP to cancel." Welcome after YES: "{creator}: You're in. About {monthlyMax} texts a month. Msg and data rates may apply. Reply HELP for help, STOP to cancel." After STOP: one text, "{creator}: You will get no more texts. Reply START to rejoin.", with no marketing in it. HELP: "{creator} texts through Amped. Help: {support link}. Reply STOP to cancel."

**Public states.**
- Email signup with Text me too: unticked box. Ticking it opens the Mobile number field, the full consent text with its own unticked consent box, and Terms and Privacy. Ticking Text me too is not consent. Subscribe still sends the email signup. With a number typed and the consent box unticked, Subscribe shows Tick the box to get texts, or untick Text me too, tied to the box. Card and cover layouts only (wave 1).
- Standalone: visible Mobile number label, field with US +1, unticked consent box, Terms and Privacy, button disabled until ticked.
- Invalid number: Enter a 10 digit US mobile number. Not a mobile number after the carrier lookup: This number cannot get texts. Both tied to the field with aria-describedby and announced.
- Sending, network error and rate limited: the wave 1 Email signup states, with the typed number kept.
- Sent: Reply YES to start, the number, nothing sends until the reply. Focus moves to the card title.
- Confirmed: You get these texts, with STOP help.
- Non US number: Texts go to US numbers only for now, with Get emails instead.
- Signed in fan already joined: You get these texts.
- A number that texted STOP signs up again on the page: a new consent record and a new confirm text; nothing sends until YES.

**Server.** `sms.subscribe` validates E.164 US mobile numbers through a carrier lookup, stores the consent record (wording version, page, block id, time, hashed IP, number, and the YES reply time), and sends the confirm text from the verified Amped toll free number. Rate limited per IP and per number, with the bot check used by Email signup. YES activates. STOP, STOPALL, END, CANCEL, UNSUBSCRIBE, QUIT, REVOKE, OPTOUT and any reply that reasonably asks to stop end texts at once (FCC revocation rule, which allows up to 10 business days; Amped acts at once). They are permanent until the fan texts START or signs up again. HELP replies with the creator's name and Amped support. Sends are blocked between 8 pm and 8 am in the fan's time zone (area code), capped at 3 texts in 24 hours (Florida FTSA), and capped at `monthlyMax`. Numbers are encrypted at rest and masked in the dashboard. Consent and opt out records are kept 5 years after the last text, which covers the 4 year TCPA claim window, then deleted. On account deletion of the fan or the creator, numbers are deleted; a keyed hash of each stopped number stays on the suppression list so it is never texted again.

**Motion.** Text me too opens with a height morph. Text me morphs into the confirm card with a View Transition. Bubbles rise in 233 ms apart. Reduced motion and Pause motion: instant.

**Editor.** Counsel notice until approval. Title, Description, Texts a month chips, Button label, Sender (read only text, not a field), the locked rules panel (no prechecked box, reply YES, quiet hours, 3 in 24 hours and the monthly cap, the stop keywords, HELP, US only), Also offer Text me too on {email block}, Block settings rows. People, Subscribers gains Email and Texts chips; Texts shows counts, masked numbers, source, consent record and status. A stopped number cannot be added back by the creator.

**Decisions.**
- SM1 Consent capture. Recommended: an unticked box next to the full disclosure, separate from email consent, with a stored record of wording, page, time and number. Why: TCPA and carrier rules need express written consent the fan clearly gave. Alternative: consent implied by tapping the button.
- SM2 Confirm by reply. Recommended: double opt in; the fan replies YES before any marketing text, and no reply in 24 hours drops the number. Why: proves the number's owner asked, which stops texts to numbers typed by someone else. Alternative: single opt in on the page.
- SM3 Sending number. Recommended: one verified Amped toll free number at launch, every text starting with the creator's name; short codes later. Why: toll free verification takes weeks, short codes take months, and creator owned numbers each need their own registration. Alternative: creators connect their own Twilio numbers.
- SM4 Quiet hours and frequency. Recommended: no texts between 8 pm and 8 am in the fan's time zone, and sends capped at the monthly number in the consent text. Why: covers the strictest state rules, such as Florida's, and keeps the promise the fan agreed to. Alternative: the creator picks send times freely.
- SM5 Countries at launch. Recommended: US mobile numbers only, with email offered to others. Why: consent and carrier rules differ by country, and counsel reviews the US first. Alternative: US and Canada at launch.

**Analytics.** `sms_signup_started`, `sms_consent_checked`, `sms_confirm_sent`, `sms_confirmed`, `sms_stopped`, each with block id. No numbers in analytics.

## Lead magnet (`leadmagnet`), new

**Job.** Give a fan something useful for free in exchange for joining the creator's list.

**Today (development a3ce3330).** Missing. The content library exists and the wave 1 Email signup block handles double opt in, but nothing ties a free file to a signup.

**Config.** `itemId` (a Library `ContentItem` with `freeToGive: true`, `adult: false`, `moderationState` CLEAR and every asset `scanStatus` CLEAN), `title` (1 to 40), `description` (0 to 160), `buttonLabel` (1 to 24, default Send me the file), `listId` (the Email signup list fans join), `frequency` (`weekly`, `monthly`, `fewTimesYear`, default `monthly`; shown in the consent line), `cover` (from the item, or an image). `freeToGive` is a new `ContentItem` column; it does not exist at a3ce3330. Fixed: delivery after confirm, 7 day links. Common settings: `schedule`, `access`, `attention`, `motion`. The schema extends `blockSettingsSchema` and `leadmagnet` joins `CONFIG_SCHEMAS`.

**Public states.**
- Visitor: cover, Free tag, title, file type and length, description, email field, button, the list consent line: You join {list}, {frequency} from {creator}. Unsubscribe any time. Privacy. The consent line and its Privacy link show in every state that collects an email, signed in included.
- Invalid email, sending, rate limited, network error or offline: the wave 1 Email signup states and copy, with the typed email kept.
- Sent: Check your inbox, the email, Resend (60 second cooldown), Use a different email. Focus moves to the card title.
- Signed in fan: Get it as {email} with the consent line, then In your Library with Open. The list join still follows wave 1 ES1: the account email gets the confirm link and the card says To join {list}, tap the link we sent to {email}. The file reaches the Library at once; the list join waits for the confirm.
- Confirmed page: You're in, Download {type}, {size}, the link also emailed, Keep it in a free Amped Library.
- Already on the list: the page shows the same Check your inbox card as a new signup, so it never shows whether an address is on the list (wave 1 rule). The confirm step is skipped and the file email is sent at once. An address that unsubscribed gets a new confirm link first.
- Expired link: Download links expire after 7 days, with Send me a new link, which emails a fresh link to the same address.
- Item removed or marked 18+: the block is not rendered; the editor shows Fix.

**Server.** Uses the Email signup flow (`subscribers.create` with `source: leadmagnet`), so double opt in, the 7 day confirm link and the consent record (line seen, page, time, IP hash) are the wave 1 ones. On confirm, `leadmagnet.deliver` creates a signed download URL from the media gateway, valid 7 days, and emails it. The gateway checks again at download: the item still exists, is still free to give, is not 18+, and its assets are CLEAN; otherwise the link answers This file is no longer available. For signed in fans, it adds a free `Entitlement` so the item shows in their Library at once; the `Entitlement` model arrives with the content library work and is not in a3ce3330. The page HTML, the confirm email preview and analytics never contain the item URL. Rate limited per IP and per email, with the Email signup bot check.

**Motion.** The button morphs into Check your inbox with a View Transition; the cover keeps its place. After confirm, the download reveals top to bottom in 610 ms. Reduced motion and Pause motion: instant.

**Editor.** What fans get (Library picker with Change and the 18+ helper), Title, Description, Button label, Fans join (list picker), How often you email this list chips, the locked How delivery works panel, Block settings rows. The Motion row reads Entrance on; the download reveal is the block's own motion and is not a Motion value.

**Decisions.**
- LM1 Delivery after confirm. Recommended: the file link is sent only after the fan confirms their email, and the page never contains it. Why: a fake email cannot take the file, and the confirm proves consent to the list. Alternative: instant download on the page after the email is typed.
- LM2 What can be given. Recommended: any Library item the creator marks free to give; 18+ items cannot be lead magnets. Why: one source of files with the gateway's access checks, and no adult content behind an email alone. Alternative: a separate upload on the block.
- LM3 Signed in fans. Recommended: one tap with their verified Amped email; the item goes to their Library and the consent record is stored. Why: the email is already verified, so a second confirm adds friction for no gain. Alternative: always ask for an email and confirm.
- LM4 Link expiry. Recommended: signed links expire after 7 days and the fan can ask for a new one. Why: stops the file being passed around by a public link. Alternative: a permanent link.
- LM5 List consent. Recommended: the card names the list and how often it sends; no hidden list joins. Why: CAN-SPAM and GDPR need the fan to know what they joined. Alternative: download only, with no list join.

**Analytics.** `leadmagnet_viewed`, `leadmagnet_requested`, `leadmagnet_confirmed`, `leadmagnet_downloaded`, each with block id and item id.

## Poll and survey (`poll`), new

**Job.** Ask fans one quick question and show them where they stand, or ask a few questions and hear back privately.

**Today (development a3ce3330).** Missing. No poll or survey type in `packages/constants/src/blocks.ts`. Creators link out to an Instagram story poll or a Google Form.

**Config.** `mode` (`poll`, `survey`). Poll: `question` (1 to 120), `options[]` (2 to 6, 1 to 60 each, locked at 10 votes), `voters` (`anyone`, `signedIn`), `results` (`afterVote`, `atClose`), `closesAt` (required, at most 90 days out, stored in UTC and shown in the editor with a real weekday and the creator's time zone, for example Sat 31 Oct, 8:00 pm, Lisbon time; the page shows it in the visitor's time zone), `showCount` (bool, default true), `allowChange` (bool, default true). Survey: `title` (1 to 60), `questions[]` (1 to 5: `label` 1 to 120, `kind` `single`, `multi`, `text` 0 to 500, `rating` 1 to 5, `required`), `askName` (bool: signed in fans may share their name). Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.**
- Poll open: question, options as radio buttons, count and close date.
- Voted: result bars with shares, the fan's pick marked, Change my vote while open.
- Under 10 votes: Vote counted: {their pick}. Results show once 10 people vote. No shares, no count and no how many so far (PO2).
- Results at close: Thanks, results on {date}.
- Closed: final results, no more votes.
- Closed with under 10 votes: Too few votes to show results. No shares and no count, at any time.
- Vote did not send (offline or network error): Your vote did not send. Try again. The pick stays selected and the line is announced.
- Locked: question, the rule (Followers vote on this one), one next step (Follow to vote, Join to vote).
- Survey: one question per step, progress, Back and Next, Send, then a thank you. Answers never show on the page.

**Server.** `poll.vote` stores one vote per poll per voter key: the account id for signed in fans, or a signed anonymous device token for anyone else. The vote row holds only a keyed hash of poll id and voter key (HMAC with a server secret), the option and the time. It never holds the account id, the token, the IP or the user agent, so neither the creator nor a database read alone can tell how a person voted. The device token is a first party token set only when the fan votes. A rate limit per IP and a bot check run before a vote counts; rate limit counters expire within an hour and are not joined to votes. 30 days after the poll closes the voter hashes are deleted and only the tallies stay. Shares are computed on the server and sent only when the count is 10 or more and the viewer may see results; under 10, the response carries no count. `survey.submit` writes to `SurveyResponse` (block id, answers, optional account id when the fan ticks Share my name), shown in People, Surveys, and exported as CSV, with the same rate limit and bot check. Responses are kept until the creator deletes them or the block. A fan's account deletion removes their account id from shared responses. Survey answers and shared names are listed in `docs/legal/privacy-parameters.md` before launch.

**Motion.** Voting swaps options for result bars with a View Transition; bars grow to their share in 610 ms. Survey steps slide with a View Transition and the progress bar fills. Reduced motion and Pause motion: final state at once.

**Editor.** Type chips Poll and Survey. Question with counter. The Motion row reads Entrance on; the result bars are the block's own motion and are not a Motion value. Options list with drag, remove, Add option, and the lock notice. Who can vote chips with the helper pointing to Who can open this. Show results chips and Closes date. Show the vote count and Let fans change their vote. Survey adds a question list with kind chips and Required, and Ask signed in fans to share their name. Block settings rows. People gains a Surveys tab with a chip per survey, a table of answers and Export CSV.

**Decisions.**
- PO1 One vote each. Recommended: one vote per device through an anonymous token for anyone, or one per account when limited to signed in fans. Why: fans can vote without an account, and a creator who needs a firmer count can require sign in. Alternative: require sign in for every poll.
- PO2 Small counts. Recommended: results and counts hidden until 10 votes; the fan sees their vote counted. Why: tiny counts read as weak and can reveal how one person voted. Alternative: show results from the first vote.
- PO3 When results show. Recommended: after the fan votes by default; the creator can hold them until close. Why: seeing results is the reward for voting, and a hold keeps a contest fair. Alternative: always show results before voting.
- PO4 Survey answers. Recommended: answers go to People, Surveys, never to the page; names attach only when a signed in fan chooses to share. Why: survey answers are personal and the creator asked for them, not the public. Alternative: show survey summaries on the page.
- PO5 Editing a live poll. Recommended: options lock once 10 people vote; the question can still take typo fixes. Why: changing options after votes would change what people voted for. Alternative: free editing with a reset of votes.

**Analytics.** `poll_viewed`, `poll_voted` (block id, voter kind), `poll_vote_changed`, `poll_locked_viewed`, `survey_started`, `survey_submitted` (block id, question count). No option index, answer text or account id in analytics: analytics rows tie to a visitor, so a pick there would show how one person voted. Tallies come from the poll table.

## Testimonials (`testimonials`), new

**Job.** Show what real customers and partners say about the creator, with honest sources, so a visitor can trust it.

**Today (development a3ce3330).** Missing. No testimonial or review type in `packages/constants/src/blocks.ts`. Creators paste quotes into Text blocks with no source or disclosure.

**Config.** `title` (0 to 40), `items[]` (1 to 12: `id`, `quote` 1 to 400, `name` 1 to 60, `line` 0 to 60, `photoId?`, `source` (`link`, `email`, `google`, `etsy`, `other`), `sourceUrl?` (https, required for google, etsy and other), `connection` (`none`, `gift`, `paid`, `business`, `personal`), `connectionNote` (0 to 80), `verifiedBuyer` (server set only), `attestedAt` (server set when the creator ticks the attestation), `originalQuote` (server set, the first saved text for a hand added quote, or the fan's text for a link review)), `layout` (`stack`, `carousel`, `featured`), `noPayLine` (bool, default false; allowed only while every item has `connection` `none`, and the server turns it off when one does not). There is no `showSource` key: every quote always shows its source (TS2). `sourceUrl` follows the D57 URL scheme rule (https only) and renders with `rel="nofollow noopener"`; Amped does not fetch it. Common settings: `schedule`, `access`, `attention`, `motion`. The schema extends `blockSettingsSchema` and `testimonials` joins `CONFIG_SCHEMAS`.

**Public states.**
- Stack: quotes with name, line, source tag or source link.
- Carousel: one quote, 44 arrows (Previous quote, Next quote), dots hidden from assistive tech, a visually hidden Quote {n} of {total} that is announced, swipe, keyboard arrows. No autoplay. Every quote keeps its source tag and its connection line.
- Featured: one quote large with an optional photo, with its source tag.
- Long quote: folds after 4 lines with Read all; opens in place.
- Connection line: Got it as a gift from {name}, Paid by {name}, {Business} sells {name}'s work, Friend or family of {name}.
- Footer line when the creator turns on `noPayLine`: {Name} does not pay for these reviews or give anything for them. Only while every quote has Connection None. The block never says the quotes are all reviews or all customers.
- Photo missing or slow: the initial disc shows. Offline: the quotes are in the page HTML, so they still show.

**Server.** `testimonials.link` gives each creator a review link (`amped.bio/{handle}/review`). A fan writes a quote, a name and a line, and ticks consent to show it on the creator's page. The form is rate limited per IP and runs the bot check. After sending, the fan gets a private manage link (shown once, and emailed when they give an email) to edit or remove the review; removal takes it off the page at once. When the fan is signed in and bought from the creator's store, the server sets `verifiedBuyer` and the product name. Link reviews land in a waiting list in the block until the creator approves them; the original text is stored and the shown quote may only be a trimmed copy (checked as a substring with ellipsis). The name on a link review is the fan's and the creator cannot change it. Hand added quotes need the attestation checkbox; the server stores who attested and when, and keeps the first saved text as `originalQuote`; later edits may only trim it. A creator may not offer anything for a review that depends on it being positive. Reviewer names, lines and photos are personal data: removed when the fan asks or deletes their account, and listed in `docs/legal/privacy-parameters.md`.

**Motion.** Quotes rise in on first view, 55 ms apart. The carousel crossfades with a View Transition and the active dot stretches. CSS scroll snap for swipe. Long quotes open with a height morph. Reduced motion and Pause motion: instant.

**Editor.** Title with counter. A notice when link reviews wait, with Review them. Quote list with drag; one quote open with Quote as written (counter, helper that it may be shortened, not changed), Name, Line under the name, Where it came from chips with the source link well when needed, Connection to you chips, and the attestation checkbox. Add a quote and Copy review link. Layout chips. Add the line: {Name} does not pay for these reviews, a checkbox disabled with its helper while any quote has a connection. There is no toggle that hides sources. Block settings rows. The Motion row reads Entrance on; the carousel crossfade is the block's own motion and is not a Motion value.

**Decisions.**
- TS1 Where quotes come from. Recommended: a review link fans fill in with consent, plus hand added quotes with an attestation; link reviews wait for approval. Why: the FTC rule on consumer reviews bans fake reviews, and consent plus a record shows each one is real. Alternative: hand added quotes only.
- TS2 Source on every quote. Recommended: every quote shows its source, as a tag or a link to the original. Why: a visitor can check it, and a creator cannot pass off invented praise. Alternative: sources optional and hidden by default.
- TS3 Bought on Amped tag. Recommended: set only by the server for buyers who used the review link. Why: a verified buyer claim must be true, so no one can type it. Alternative: let creators mark buyers by hand.
- TS4 Material connection. Recommended: a required Connection choice; anything but None shows a line under the quote. Why: the FTC endorsement guides require disclosure of gifts, payment and business ties near the claim. Alternative: one disclosure line for the whole block.
- TS5 Edits. Recommended: quotes can be shortened but not reworded; the original is kept on file. Why: changing what a reviewer said would misrepresent them. Alternative: free editing of quote text.

**Analytics.** `testimonials_viewed`, `testimonial_source_opened` (source), `testimonial_carousel_moved`, `review_link_submitted`, `review_approved`, each with block id.

## Timeline (`timeline`), new

**Job.** Show where a project, a process or the creator's story stands, so fans can follow along.

**Today (development a3ce3330).** Missing. No timeline type in `packages/constants/src/blocks.ts`. Creators post progress as separate Text blocks or on other platforms.

**Config.** `eyebrow` (0 to 24), `title` (0 to 40), `layout` (`milestones`, `steps`, `history`), `items[]` (1 to 20; steps layout 2 to 6: `id`, `date` ISO, `precision` (`day`, `month`, `year`), `status` (`done`, `now`, `next`; history uses `done` only), `title` 1 to 60, `note` 0 to 280, `photoId?`, `badge` 0 to 16, `button?` `{label 1 to 24, url}`), `order` (`oldest`, `newest`), `foldDone` (bool, default true). `date` is stored as a calendar value at its precision (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`), never as a timestamp, so it never shifts a day across time zones. `button.url` follows the D57 rule: http, https, mailto and tel on every save path; render refuses other schemes. `timeline` joins `BaseBlockType`, `CONFIG_SCHEMAS` and `anyBlockConfigSchema`, and its schema extends `blockSettingsSchema`. Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.**
- Milestones: dots on a line; done dots filled with a check; the Now dot ringed with a Now badge; next dots open.
- Steps: numbered circles across; the current step's panel underneath.
- History: years down the side, no current step.
- Opened milestone: photo, note and one button in place.
- Folded: Earlier steps opens done milestones beyond 3.
- Locked: eyebrow, title, rule summary, one next step, and a count of steps with the last update date. No milestones in the HTML.

**Rules.** At most one `now`. Future milestones read as plans: no countdown, no promised dates in copy. Dates format in the visitor's locale at the chosen precision. A `next` milestone dated after today reads "Planned for" before its date (Planned for March 2027). A day precision date shows its real weekday from the stored date (Mon 9 Nov 2026), never a computed one. Each milestone carries its status as text for screen readers (Done, Now, Next), not only as a check or a ring. In the steps layout, step titles under the circles clamp to two lines and the full title shows in the panel. Who can open this uses the live rules only (follower, pool member, stake minimum, any or all); Members shows disabled until Memberships ship.

**Motion.** The line draws to the Now step as the block enters the screen. Where `animation-timeline: view()` runs (behind `@supports`), the draw is tied to the entry range (`animation-range: entry 0% cover 40%`, `fill: both`), so it tracks scroll inside that range and holds full after it. Elsewhere an IntersectionObserver plays it once per visit with WAAPI. Milestones rise in 89 ms apart. The Now dot pulses 3 times at 1.4 s each and rests within 5 seconds (WCAG 2.2.2). Opening a milestone uses a View Transition. Reduced motion and Pause motion: final state at once, no rise, no pulse.

**Editor.** Eyebrow and Title. Layout chips with a helper. Milestone list with drag, a status mark per row; one open with Date and precision chips, Status chips, Title, Note, Photo from the library and Badge. Add milestone, with the helper that one milestone can be Now. Order chips. Fold done milestones after 3. Block settings rows. The Motion row reads Entrance on; the line draw is the block entrance and is named in the Fold helper, not in the shared Motion value.

**Decisions.**
- TL1 Line motion. Recommended: the line draws to the current step on scroll, scroll driven behind @supports with an IntersectionObserver fallback, once per visit. Why: it shows progress at a glance and costs no script on modern browsers. Alternative: a static line.
- TL2 Current step. Recommended: the creator sets Now by hand, one per timeline. Why: real projects slip, and a date that moves the mark on its own would show a step as done when it is not. Alternative: move Now by date automatically.
- TL3 Date precision. Recommended: day, month or year per milestone; future dates read as plans with no countdown. Why: creators often know only the month, and a plan should not read as a promise. Alternative: exact dates only.
- TL4 Long timelines. Recommended: fold done milestones after 3; up to 20 per block. Why: the current step stays near the top of the block. Alternative: show every milestone always.
- TL5 Follower updates. Recommended: moving Now sends nothing in v2; Broadcast can announce it. Why: no surprise messages, and the creator chooses what is news. Alternative: notify followers on every Now change.

**Analytics.** `timeline_viewed`, `timeline_item_opened` (item id), `timeline_earlier_opened`, `timeline_button_clicked`, each with block id.

## Map and location (`location`), new

**Job.** Show a visitor where to find the creator, at the precision the creator chooses, and hand off to the visitor's own maps app.

**Today (development a3ce3330).** Missing. No location type in `packages/constants/src/blocks.ts`. Creators paste a Google Maps link into a link block, which leaves the page and shows no map.

**Config.** `title` (1 to 40), `eyebrow` (0 to 24), `place` (`{lat, lng, label, area, city, country}` from the address search; `area` is the neighborhood name; `label` holds the street and renders only at exact precision), `address` (0 to 120, exact precision only), `precision` (`exact`, `area`, `city`; default `area`), `hours` (0 to 60), `buttons` (`{directions: bool, copy: bool}`; copy only for exact), `liveMap` (bool, default false), `mapColors` (`theme`, `light`, `dark`). `location` joins `BaseBlockType`, `CONFIG_SCHEMAS` and `anyBlockConfigSchema`, and its schema extends `blockSettingsSchema`. The true point, `label` and `address` never leave the server unless the visitor may see exact precision; `sanitizeBlockConfig` strips them from every public response, share tag and preview. Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.**
- Exact: map image with a pin, address, optional hours, Directions and Copy address.
- Area: map image with a soft circle about 600 m across, offset from the true point, the area name, Directions to the area.
- City: map image of the city, the city name, no pin.
- Directions sheet: Apple Maps, Google Maps, Waze, Copy address, Close.
- Live map facade: Load map with the provider line. After the tap, the live map replaces the image.
- Locked: the city map with no pin and no area circle, the city name, the rule, one next step. The exact address, the area and the true point are not in the HTML until the engine allows.

**Server.** `location.geocode` searches OpenStreetMap Nominatim on save, rate limited, and stores the point and labels. `location.mapImage` renders a 2x static image from OpenStreetMap tiles in the theme colors, cached per block and theme, with attribution. Area precision moves the point by a stable random offset inside the circle before any image or HTML is built. Directions links are built on the server from the precision the visitor may see. Provider terms: Nominatim allows at most 1 request per second, no search as you type and a named user agent, so search runs on submit through a server queue; a hosted geocoder replaces it if volume grows. The public OpenStreetMap tile servers do not allow heavy commercial use, so `location.mapImage` renders from a contracted or self hosted tile source, named before build. The image is served from Amped's own domain; the page HTML holds no tile or geocoder address. Attribution reads "© OpenStreetMap contributors" and links to the OpenStreetMap copyright page. The area offset is at least 150 m, is seeded by block id and point, and changes only when the point changes, so repeat loads cannot be averaged back to the true point. Changing precision or the lock purges cached images and share previews for the block. The live map goes through the shared provider registry: it loads only after the `embeds` consent choice and Load map, and its tile host is listed in CSP `img-src` and `connect-src` for that block only. Point, labels and address are deleted with the block and on account deletion.

**Motion.** The pin drops once on first view with a small settle, scroll driven behind @supports with an IntersectionObserver fallback. Directions opens its sheet with a View Transition and moves focus. The live map fades in over the image. Reduced motion and Pause motion: static.

**Editor.** Title and Eyebrow. Address or place search with a Found chip and a draggable pin in the preview. How precise chips with the safety helper. A notice that anyone who can see the block can see the exact address. Show opening hours. Buttons checkboxes. Let visitors load an interactive map. Map colors chips. Block settings rows. The exact address notice names followers or pool fans; Members shows disabled until Memberships ship. The Motion row reads Entrance on; the pin drop is named in the precision helper.

**Decisions.**
- MP1 Map image. Recommended: Amped renders a static OpenStreetMap image on the server in the creator's colors, cached, with no map script on view. Why: no third party request or cookies before consent, and the page stays fast. Alternative: embed Google Maps on view.
- MP2 Precision. Recommended: Exact, Neighborhood or City only, with new blocks starting at Neighborhood. Why: many creators work from home, and an exact address on a public page is a safety risk. Alternative: always show the exact address.
- MP3 Directions. Recommended: a sheet with Apple Maps, Google Maps, Waze and Copy address, built on the server at the allowed precision. Why: visitors use different apps, and no provider is called before the tap. Alternative: one Google Maps link.
- MP4 Live map. Recommended: optional, off by default, loaded only after Load map. Why: same consent model as the Embed block, and most visitors only need directions. Alternative: no live map at all.
- MP5 Locked address. Recommended: Who can open this can hold back the exact address; locked visitors see the city and one next step. Why: studio days and meetups for members need a private address. Alternative: no lock on location.

**Analytics.** `location_viewed`, `location_directions_opened` (app), `location_address_copied`, `location_live_map_loaded`, each with block id.

## Community channels (`community`), new

**Job.** Open the creator's community spaces to the fans the creator chooses, with the rule shown and one next step.

**Today (development a3ce3330).** Partial. `telegram_group` is a block type whose config is `{label, hidden}` (`telegramGroupConfigSchema`). It renders nothing on the public page (`ProfileView`: `telegram_group ? null`) or in the editor preview (`Preview.tsx`, "The group block waits on PR 5"). Its rule is the shared Inbox rule (`DmRuleKind`: ANYONE, FOLLOWER, PAID_MEMBER, POOL_MEMBER, STAKE_MIN), but `getHandle` builds `telegramDoor` only when the page carries a `telegram_message` block (`hasTelegramMessageBlock`). Discord is a `link` platform (`discord.gg/{code}`), so the invite sits in the public page HTML for anyone. `discord` is also listed in `mediaPlataforms` with no renderer. WhatsApp and Slack have no block.

**Config.** `title` (0 to 40), `eyebrow` (0 to 24), `layout` (`list`, `tiles`), `doors[]` (1 to 6), each: `kind` (`telegram_group`, `discord`, `whatsapp`, `slack`), `label` (1 to 40), `ruleId` (gating engine rule, or none for Everyone; Telegram reads its Inbox rule), `discord` (`{guildId, roleId}` for Discord), `url` (server side only, for WhatsApp and Slack link doors; D57 rule, https only, hosts `chat.whatsapp.com`, `whatsapp.com/channel` and `join.slack.com` only; stripped by `sanitizeBlockConfig` from every public response). `community` joins `BaseBlockType`, `CONFIG_SCHEMAS` and `anyBlockConfigSchema`, and its schema extends `blockSettingsSchema`. `ruleId` uses the live rules only (follower, pool member, stake minimum, any or all); Members shows disabled until Memberships ship. Common settings: `schedule`, `attention`, `motion`. `access` on the block reads Set on each door.

**Legacy map.** A `telegram_group` block stays as it is until the creator taps Move here, then becomes a Telegram door with the same Inbox rule. `link` blocks with `platform: "discord"` are offered the same move; the invite becomes a server side `url` with rule Everyone until the creator connects the Amped bot. The Telegram door keeps the block's `label` as the door label. `community.door` reads the Telegram door itself; it must not depend on a `telegram_message` block being on the page, as `getHandle` does today. Rule labels come from one shared set with Inbox settings; today `DM_RULE_LABELS` reads "Followers and members", "Pool fans only" and "Anyone", while the doors read Followers, Pool fans and Everyone. Pick one set before build.

**Public states.**
- Door open to everyone: icon, name, Everyone, Join or Follow.
- Door locked: lock on the icon, the rule (Followers, Members only, Pool fans), one next step (Follow, Join to open, View pool). No amount and no invite in the HTML.
- Door open to this fan: open lock, You are a member, Join the server or Open the group.
- Discord join: connected account, one time invite, role arrives.
- Role given: confirmation with the role chip and the daily check line.
- Tiles: the same doors two by two.
- Channel disconnected: the door renders nothing to visitors, Fix chip in the preview.

**Server.** `community.door(blockId, doorId)` runs `checkAccess` and returns the open state, the rule kind and, only when open, the link. Telegram keeps `getHandle telegramDoor` and rechecks on join. Discord: the creator adds the Amped bot with Manage Roles and Create Invite in the chosen server; Amped creates a single use invite per qualifying fan with a 24 hour expiry; on `GUILD_MEMBER_ADD` with a connected account that passes, the bot adds `roleId`; a daily job removes the role from fans who no longer pass. WhatsApp and Slack doors return the stored link only after the rule passes. The bot needs the Server Members privileged intent for `GUILD_MEMBER_ADD`, which Discord reviews once the bot is in 100 or more servers; apply before launch. Invites are created with `max_uses: 1`, `max_age: 86400` and `unique: true`. The bot's own role must sit above `roleId`; if not, the door shows the Fix chip in the preview and renders nothing to visitors. The fan's Discord user id is personal data: stored only to give and remove the role, removed on disconnect and on account deletion, and never in analytics or public HTML.

**Motion.** Doors rise in 55 ms apart on first view, scroll driven behind @supports with an IntersectionObserver fallback. Unlock swaps the lock and rule line in place with a View Transition. Discord steps tick in order. Reduced motion and Pause motion: static, instant swaps.

**Editor.** Eyebrow and Title, then Layout chips. Doors list with drag order, kind icon, rule summary, status chip (Connected, Bot added, Link) and edit. Discord door opens with Server, Role to give and Who can join chips. WhatsApp and Slack doors take a link and a rule, with the shared link notice. A notice offers to move existing Telegram group blocks and Discord links (Move N here). Block settings rows. Who can open this is a read only row (no chevron, not a button) that reads Set on each door. The Discord Server field is read only here and changes in Account, Connected apps. The Motion row reads Entrance on.

**Decisions.**
- CM1 Invite links. Recommended: no invite link in the page HTML for a locked door; Amped returns it after the rule passes, and Discord invites are single use per fan. Why: a link in the HTML is open to anyone who views the source, which defeats the rule. Alternative: put every invite in the HTML and rely on the label.
- CM2 Discord role. Recommended: the Amped bot gives a chosen role to fans who connect Discord and pass the rule, rechecks daily and removes it when they lapse. Why: members only channels stay members only after the fan joins. Alternative: invite only, with no role management.
- CM3 WhatsApp and Slack. Recommended: link doors that can carry a rule, with a notice that a shared link can be passed on. Why: neither offers an admission API for creators, so the creator should know the limit. Alternative: support only Telegram and Discord.
- CM4 Today's blocks. Recommended: offer one tap to move Telegram group blocks and Discord links into a Community block; never move them on our own. Why: no page changes without the creator. Alternative: merge them automatically.
- CM5 One block, many doors. Recommended: one Community block with up to 6 doors, each with its own rule, in a list or tiles. Why: a creator's channels belong together and read as one offer. Alternative: one block per channel.

**Analytics.** `community_door_viewed` (kind, open), `community_door_tapped` (kind, next step), `community_discord_connected`, `community_role_granted`, `community_role_removed`, each with block id and door id. No invite URLs, Discord user ids or handles in analytics.

## Fundraising goal (`goal`), new

**Job.** Show fans what the creator is working toward and how close it is, and let them support it in USDC.

**Today (development a3ce3330).** Missing. No goal or fundraising type in `packages/constants/src/blocks.ts` and no tip block yet (the tip jar is on the Memberships card). Creators link out to Ko-fi or GoFundMe.

**Config.** `title` (1 to 40), `why` (1 to 160, required: what the money is for), `targetUnits` (USDC, 1 to 1,000,000), `endsAt` (optional ISO datetime with the creator's time zone), `counts` (`{block: true, tips: bool, store: bool, memberships: bool}`; `tips` and `memberships` show disabled until the tip jar and Memberships ship; `store` counts only Amped store sales paid in USDC through AmpedPay, never outside shops), `buttonLabel` (1 to 24), `presets` (up to 3 amounts in USDC, each and Other inside `one_time_price_min` and `one_time_price_max` from `paymentSettings()`, 0.50 to 1,000 USDC by default), `showSupporters` (bool, default true), `onReached` (`open`, `close`), `wording` (`support`, `donate`; donate only when `charityVerifiedAt` is set on the account). `goal` joins `BaseBlockType`, `CONFIG_SCHEMAS` and `anyBlockConfigSchema`, and its schema extends `blockSettingsSchema`. Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.**
- Running: eyebrow, title, why, raised so far and target, bar, supporters count, end date, opted in faces with a two name sentence, Support button, gift line.
- Support sheet: presets and Other, optional note (0 to 140), You send, then "{Creator} receives N USDC. The Amped.Bio fee is F%." with F from `platform_fee_bps` at quote time, Show me as a supporter (unticked by default), Send, "A gift to {Creator}, sent to their wallet. Refunds are up to {Creator}." and Powered by Amped.Bio.
- Locked: title, the rule, one next step. No totals, bar, supporters or button in the HTML.
- Payments off: when `PAYMENTS_ENABLED` is off, the creator is not on the pilot list or `payments_paused` is on, the Support button is absent and the card reads Support is paused. The bar still shows.
- Reached and open: Goal reached, real total over the target, bar at full, Support button stays.
- Reached and closed, or ended: no button, final total, thank you line from the creator.
- New: under 10 supporters, no count and no faces, New goal pill.
- Short balance: the support sheet shows Your wallet needs N USDC more and Add USDC.

**Rules.** No share, return, interest or money reward is offered or implied. Gift copy is fixed: Support is a gift. You get no share or reward. Thank you gifts (a photo, a mention, early access) are allowed in the creator's own words and pass the compliance word scan. Amounts per supporter are never public. Donate wording and any tax language unlock only for verified registered charities. The card and the sheet always name who receives the money: the creator, by name, to the creator's own wallet. A goal raises only for the creator; raising for another person or a cause is not offered outside verified charities (counsel to confirm). "Gifts are final" is not used, because AmpedPay allows full refunds that the creator starts. Show me as a supporter is consent the fan can withdraw from their account; the name and photo leave the list at once and on account deletion. The supporters list refreshes once a day in random order, so a name cannot be matched to a jump in the total. Who can open this uses the live rules only; Members shows disabled until Memberships ship.

**Server.** Gifts are AmpedPay payments (Build Board #50): a split table with the creator and the platform row at `platform_fee_bps` (5% by default, set in admin and read at quote time, never hard coded), `paymentRef` the Purchase id, tagged with `goalId`, behind `PAYMENTS_ENABLED` and the pilot list, inside the per payment and daily limits. `goal.progress(blockId)` sums `Paid` receipts at `final_confirmations` tagged to the goal between `createdAt` and `endsAt`, minus `Refunded` ones: block gifts, plus the creator's share of Amped store sales and new membership payments when ticked and live. Refunds are full only. A refund lowers the total; `goal_reached` fires once. Cached for 60 seconds. Supporters list reads only fans who ticked Show me as a supporter. Ending is enforced on the server at `endsAt`.

**Motion.** The bar fills once on first view, scroll driven behind @supports with an IntersectionObserver fallback, and the total counts up with it. After a gift, the bar grows and the total bumps. Reduced motion and Pause motion: final values at once.

**Editor.** Goal title and Why it matters with counters. Target in USDC and Ends, optional, with the real date helper. What counts toward the goal checkboxes with the server count helper; Tips and Memberships show disabled with "Available when ... launch". Button label and preset amounts. Show supporters. When the goal is reached chips. Wording chips with Donate disabled until the charity check. Gift notice. Block settings rows. The Motion row reads Entrance on; the bar fill is named in the Show supporters helper.

**Decisions.**
- FG1 Wording. Recommended: Support by default; Donate only for registered charities after Amped checks the charity number; no promise of a share, return or money reward. Why: donation language implies charitable status and tax treatment, and a promised return turns a gift into an offer. Alternative: let the creator pick any wording.
- FG2 What counts. Recommended: gifts through the block plus ticked tips, store sales and memberships, counted on the server; the total cannot be typed in. Why: fans trust a number Amped can stand behind. Alternative: let the creator enter the raised amount.
- FG3 End date. Recommended: optional and real; it cannot reset or roll forward, and the creator can end early. Why: a fake deadline is a dark pattern, the same rule as Countdown (CD1). Alternative: allow rolling deadlines.
- FG4 Supporters. Recommended: opt in only, hidden under 10, never a per person amount. Why: giving is personal, and small counts read as weak. Alternative: show top supporters with amounts.
- FG5 After the goal. Recommended: the creator chooses Keep it open or Close the goal; the bar caps at full and the real total shows. Why: some goals keep going, others are one time. Alternative: always close at the target.

**Analytics.** `goal_viewed`, `goal_support_opened`, `goal_support_sent` (amount bucket, not exact), `goal_reached`, `goal_ended`, each with block id.

## Discount code (`discount`), new

**Job.** Give fans a code for the creator's shop or a partner brand, easy to copy, with an honest end date and the terms up front.

**Today (development a3ce3330).** Missing. No discount code block. Creators paste codes into Text blocks or link labels, with no copy action, no end date and no way to keep a perk code for followers or members.

**Config.** `code` (1 to 24, letters and numbers, shown as typed), `offer` (1 to 40), `shopUrl` (https only, under the D57 URL scheme rule on save and render), `buttonLabel` (1 to 24, default Shop now), `endsAt` (ISO datetime, required, stored in UTC, edited in the creator's time zone), `terms` (1 to 120, required), `partner` (bool: adds the Affiliate label and the commission line), `layout` (`card`, `compact`). Several codes in Compact layout: `codes[]` (max 6) with the same fields. Common settings: `schedule` (ends with `endsAt` unless set earlier), `access`, `attention`, `motion`.

**Public states.** Card (eyebrow, offer, the code with Copy, end date in the visitor's time, terms with the store name, shop button); copied (Copied for 2 seconds, announced, a Paste at checkout line); locked (offer, the rule in place of the code, one next step such as Follow to see the code; no code text in the HTML); compact (one row per code with Copy); partner code (Affiliate label and a commission line); ended (not in the HTML).

**Server.** The code is returned in the page payload only when the block has no rule. With a rule, `discount.reveal(blockId)` runs the gating engine and returns the code on pass. Codes are never put in share previews, JSON-LD or the Open Graph image. An ended code drops out of the payload at `endsAt` without a redeploy. Cached page HTML and payloads carry a max age that ends at the next `endsAt` on the page, so a CDN never serves an ended code. `discount.reveal` is rate limited (D11), answers with `Cache-Control: private, no-store`, and the code never appears in logs or analytics. The server renders the end as a `<time datetime>` in UTC with the creator's time zone named; the browser rewrites it to the visitor's time, so a page without script still shows a true date and zone. The config schema extends `blockSettingsSchema` and is listed in `CONFIG_SCHEMAS`.

**Motion.** Copy morphs to Copied with a View Transition and the code field glows once. The check draws in 233 ms. A locked code opens in place with a View Transition after the rule passes. Reduce motion and Pause motion: instant swap.

**Editor.** Code with counter and helper, Offer, Shop link, Button label, Ends date and time in the creator's time zone with the helper that visitors see their own time, Terms (required, counter), This code is for a partner brand, Layout chips Card and Compact, then the Block settings rows. A notice says that with a rule set the code stays on the server. Page list rows show Ends with the weekday and date (Ends Sun 1 Nov), then Expired. The Schedule row value names the weekday, date, time and the creator's time zone (Ends with the code, Sun 1 Nov, 23:59 Lisbon). Compact rows on the page show the end with weekday, date and time in the visitor's time. If copy fails, the code is selected and the status line says Copy did not work. The code is selected. Copy it by hand. Copied never shows for a copy that did not happen.

**Decisions.**
- DC1 End date. Recommended: every code has a real end date and time, shown in the visitor's time; after it ends the block leaves the page HTML and the editor row says Expired. Why: fake urgency is a dark pattern, and a dead code frustrates fans. Alternative: no end date, or keep ended codes on the page with an Expired label.
- DC2 Locked codes. Recommended: Who can open this applies; the code text stays on the server until the rule passes, then appears in place. Why: a perk code in the page source leaks to everyone. Alternative: hide the block from visitors who do not qualify.
- DC3 Copy. Recommended: one tap copies; the button says Copied for 2 seconds and the change is announced; if copy fails, the code is selected for a manual copy. Why: copying a code by hand on a phone is where fans give up. Alternative: show the code as text only.
- DC4 Terms line. Recommended: a short terms line is required, with the store name from the shop link. Why: fans see the conditions before checkout, and store rules expect it. Alternative: make terms optional.
- DC5 Partner brand codes. Recommended: a code for another brand's store carries the Affiliate label and a commission line, the same rule as Affiliate picks. Why: the FTC requires a clear disclosure of a paid relationship. Alternative: one disclosure line for the whole block.

**Rules.** No countdown timer, and no Ending soon, Last chance or Hurry copy from Amped. Attention effects add no urgency words to this block (CD1). A creator may extend `endsAt`; the page shows only the new real date. Analytics never carry the code text.

**Analytics.** `discount_viewed`, `discount_copied`, `discount_shop_tapped`, `discount_locked_viewed`, `discount_unlock_started`, each with block id.

## Price list and service plans (`pricelist`), new

**Job.** Show what the creator offers and what it costs, and send the fan to the one place that takes the booking, the request or the question.

**Today (development a3ce3330).** Missing. No price list block. Creators type prices into Text blocks or link labels, with no structure and no link to a booking.

**Config.** `title` (1 to 40), `currency` (`USD`, `USDC`, the default for new items), `layout` (`menu`, `plans`, `compact`), `groups[]` (max 4: `name` 1 to 24), `items[]` (max 12: `groupId`, `name` 1 to 40, `line` 0 to 40, `amount` (number or null for On request), `currency`, `from` (bool), `period` (`none`, `visit`, `month`), `details` (0 to 300, plain text), `includes[]` (max 5, 1 to 40), `pick` (bool, Plans layout, one per list), `action` (`{kind: block | link | none, blockId?, url?, label?}`; `url` follows the D57 URL scheme rule, http and https only for this field), `linkedSource` (`{blockId, typeId}` of a Paid requests type or a Course, when linked)). Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.** Menu (groups, rows with name, line, price and chevron); item open in place (details, what is included, one action button, the line that it opens a block on this page); plans (cards with price and period, what each includes, the creator's pick badge, one action); compact (rows with dotted leaders, an Ask about something else button); On request (no number); linked price (reads from its source block); locked (title, the rule and one next step; no prices in the HTML).

**Rules.** No crossed out or compare at prices. Every price shows its currency. The price list never takes payment. Paid actions run through the target block, which shows its own fee line and terms. A USDC price points only to a block that takes USDC through AmpedPay (#50): the fee comes from `platform_fee_bps`, refunds are the full amount only, and the path sits behind `PAYMENTS_ENABLED`. While `PAYMENTS_ENABLED` is off, USDC is not offered as a currency and existing USDC items show a Fix chip in the editor preview. A from label needs a real lowest price on offer today. If the target block is hidden, not yet live, expired or locked for this visitor, the item shows no action button and the editor row shows a Fix chip. The config schema extends `blockSettingsSchema` and is listed in `CONFIG_SCHEMAS`.

**Motion.** Rows reveal on view, 34 ms apart, scroll driven behind @supports with an IntersectionObserver fallback. An item opens in place with a View Transition and the chevron turns. The action scrolls to the target block, which pulses its edge once. Reduce motion and Pause motion: rows at once, instant open.

**Editor.** Title, Default currency, Layout chips. Groups and items list with drag to reorder; one item open for Name, One line, Price with currency, Show as a from price, Price is per (Once, Visit, Month), Mark as my pick (Plans layout only, one per list), Action (a block on this page, a link or none), Details and What is included (up to 5). The Motion row in Block settings reads Entrance on; the row reveal and the edge pulse are this block's own motion. Linked items show a link icon and a notice with Open it. Add an item, Add a group, helper Up to 4 groups and 12 items. Then the Block settings rows.

**Decisions.**
- PS1 Where the action goes. Recommended: each item points to a block on the page (Booking, Paid requests, Form, Course, Shop) or a link; the price list never takes payment itself. Why: one checkout and one refund rule per kind of sale, already designed in those blocks. Alternative: a Buy button and checkout on every price row.
- PS2 Currency. Recommended: USD or USDC, with a default per list; every price shows its currency, and a linked price keeps its source currency. Why: fans never guess which money a number means. Alternative: one currency for the whole list.
- PS3 From prices and crossed out prices. Recommended: a from label is allowed; crossed out previous prices are not offered. Why: a reference price nobody paid is a deceptive pricing pattern. Alternative: allow a compare at price.
- PS4 Size. Recommended: up to 4 groups and 12 items; items open in place. Why: a longer menu belongs on its own page and pushes the rest of the page down. Alternative: no limit.
- PS5 Linked prices. Recommended: an item linked to a Paid request type or a Course reads its price from that block and is never typed twice. Why: two copies of a price drift apart, and the fan would see one price here and another at checkout. Alternative: typed prices everywhere.

**Analytics.** `pricelist_viewed`, `pricelist_item_opened` (item id), `pricelist_action_tapped` (item id, target kind), each with block id.

## Collectibles shelf (`collectibles`), and the Swap retirement

**Job.** Show the Revolution chain items a creator issued or holds, as a shelf fans can browse, with nothing on the page that reads as an offer to trade.

**Today (development a3ce3330).** Two hidden `media` platforms, not in Add block, still render for pages that have them. `nft-collection` (`NFTCollectionBlock.tsx`, both apps) frames `{url}/embed`, an OpenSea collection page, at a fixed 400 high on page open. `uniswap` (`UniswapBlock.tsx`) frames whatever https address the creator pasted, 400 high, on page open. Neither has a host allowlist or a sandbox, and both load before consent through `EmbedFrame`. Checked at a3ce3330: the landing page renderers test only for https, `EmbedFrame` sets no sandbox attribute, and the editor `UniswapBlock` in apps/client frames the stored address with no scheme check. The editor preview shows an "NFT Collection" or "Uniswap Swap" label in fixed brand colors.

**Config, collectibles.** `title` (1 to 40), `source` (`issued`, `held`, `both`), `walletIds[]` (wallets linked to the account; the Amped wallet by default), `hidden[]` (item ids), `order[]` (item ids), `layout` (`grid`, `carousel`), `showEdition` (bool, default true), `explorerLink` (bool, default true). Common settings: `schedule`, `access`, `attention`, `motion`.

**Legacy map.** `media {platform: "nft-collection", content, label}` becomes `collectibles {title: label or "Collectibles", source: "issued", walletIds: [], layout: "grid"}`. The OpenSea URL is dropped. With no linked wallet the block renders nothing to visitors and the preview shows a Fix chip. `media {platform: "uniswap"}` is retired by its platform, not by a stored flag (a `retired` key would be dropped by `parseTypedConfig`): both `MediaBlock` renderers return null for `uniswap`, and the editor reads the platform to show Retired with Remove block and Keep hidden. The uniswap stop and the nft-collection frame stop ship as a hotfix ahead of SHOW_BLOCKS_V2, as 040 D3 did for token price, because both frame third party pages before consent today. `token-price` is handled by the Token price block (legacy-web3 answer: rebuild with real REVO data).

**Public states.** Grid (eyebrow, item count, title, two columns of items with name and Issued by or Held by, testnet line, See all); carousel (scroll snap row); item open (art, name, description, issued by and date, edition, chain, contract, View on the explorer, testnet no value line); signed in holder (You hold N from this shelf, visible only to that fan, items marked You hold this); empty (nothing to visitors).

**Server.** `collectibles.list(blockId)` reads the chain indexer (#ws-chain-indexer) for ERC-721 and ERC-1155 items on Revolution chain minted by or held in the block's wallets. It returns id, name, image (copied to the Amped image service), description, edition, issue date and contract. Metadata is cached and refreshed within 10 minutes of a transfer. No price, sale or listing data is fetched. `collectibles.mine` returns the signed in fan's count for the shelf, never sent to other viewers. It is a separate client call with `Cache-Control: private, no-store`; the count never enters cached page HTML. Chain metadata is untrusted: names and descriptions are plain text with links stripped and lengths capped. Images pass the same upload checks and 18+ review as creator uploads, and an item flagged 18+ never shows. Items in a held wallet that the creator did not issue start hidden until the creator shows them, so unsolicited airdrops never reach the page. The config schema extends `blockSettingsSchema` and is listed in `CONFIG_SCHEMAS`.

**Rules.** No floor price, last sale, volume, buy, sell, bid or marketplace link on the shelf. Testnet items carry "Testnet items have no value." The explorer link goes to the Revolution explorer only.

**Motion.** Cards rise on view, 55 ms apart, scroll driven behind @supports with an IntersectionObserver fallback. An item opens with a View Transition from its card, and focus returns on close. Carousel uses CSS scroll snap. Reduce motion and Pause motion: cards at once, instant open.

**Editor.** A one time notice on migrated blocks. Title, Show items chips, Wallet row with Change and the update helper, item list with drag order and show or hide, Layout chips, Show edition numbers, Link to the chain explorer, the fixed no prices notice, then the Block settings rows. The items list helper says Items others send to your wallet start hidden. The Motion row reads Entrance on; the card rise is this block's own motion. The retired Swap row opens to a notice with Keep hidden and Remove block.

**Decisions.**
- CS1 Source of items. Recommended: Revolution chain only, items the creator issued or holds in wallets linked to the account, read by the chain indexer, with no marketplace frame. Why: the data is verifiable on chain and Amped serves it, so no third party loads on the page. Alternative: keep the OpenSea frame behind a click to load facade.
- CS2 Prices and sales. Recommended: no floor price, last sale, buy, sell or marketplace links on the shelf until counsel clears them; testnet items carry a no value line. Why: prices and trading links on a promotional page read as an offer. Alternative: show the last sale and a marketplace link.
- CS3 Legacy NFT collection blocks. Recommended: existing rows map to the shelf, the marketplace frame stops loading, and until the creator links a wallet the shelf renders nothing to visitors with a Fix chip in the preview. Why: the frame loads before consent and is not Amped data. Alternative: keep rendering the frame until the creator migrates.
- CS4 Swap widget. Recommended: retired; existing rows stop rendering to visitors at once, and the editor row says Retired with Remove block or Keep hidden. Why: a swap on a creator page is a trading prompt, and today it frames any https address with no allowlist or sandbox. Alternative: keep it behind a consent facade with a host allowlist.
- CS5 Holders. Recommended: a signed in fan sees You hold N only for themselves; no public holder list. Why: wallet holdings are private financial data. Alternative: a public list of holders who opt in.

**Analytics.** `collectibles_viewed`, `collectible_opened` (item id), `collectible_explorer_opened`, each with block id. `retired_block_removed` (platform) in the editor.

## Token price (`token`), rebuilt

**Job.** Show the current REVO price from a source we can name, with its time, and nothing that reads as a call to buy.

**Today (development a3ce3330).** A hidden `media` platform `token-price` (not in Add block). The public landing page already returns null for it (040 D3, apps/landingpage `MediaBlock`). The editor preview (apps/client `TokenPriceBlock`) still renders it with hard coded mock data and a TODO to fetch real data: the name Ethereum, Ethereum's logo from CoinMarketCap, the symbol REVO, $2,235.67, a green +2.45% with an up arrow, a $268.90B market cap and $8.75B volume. No REVO price source exists in the server. The Telegram compliance check bans the phrase "revo price" (`TELEGRAM_BANNED_PHRASES`).

**Config.** `token` (fixed `REVO`), `title` (1 to 40, default REVO token; the eyebrow reads Token), `layout` (`card`, `compact`), `showChange` (bool, default false). Source, interval and network are server settings, not block settings. Common settings: `schedule`, `access`, `motion`. `attention` is not available on this block.

**Legacy map.** `media {platform: "token-price", content}` becomes `token {token: "REVO", layout: "card", showChange: false}` when `content` is REVO or tREVO. Any other symbol stays hidden with an editor notice that only REVO is supported. The mock data is removed.

**Public states.**
- Testnet (the launch state): REVO token eyebrow, Testnet chip, the line that tREVO is a test token on the Revolution testnet with no market price, Network and Data source, View on Revoscan. No price.
- Mainnet price: the price in USD per REVO, the source (REVO and USDC pool on Revolution), Updated time, Read by Amped indexer, the line Price data only. Not an offer or advice. Prices change, and View the source.
- 24 hour change on: one plain sentence in the text color, such as 1.8% lower than 24 hours ago. No arrow, no red or green.
- Stale (older than 15 minutes): Last price with its time and Updates are paused. The price fades to 82%.
- Source down for 60 minutes: renders nothing to visitors; Fix chip in the editor preview.
- Compact: one row with REVO and the price, the source and time, a 44 icon link to the source, and the line Price data only. Not an offer or advice.
- Flag off: renders nothing to visitors; the editor shows the counsel review notice.

**Rules.** No Buy, Swap, trade, wallet connect or exchange link. No holdings, balances, market cap, volume, charts or ranking. No words such as up, gain, moon or rally. Price only in USD per REVO. The testnet line for pools does not apply here; the testnet card states that tREVO has no market price.

**Server.** Extend the Amped chain indexer (today it indexes USDC transfers in `services/usdc/indexer.ts`) to read the REVO and USDC pool on Revolution every 60 seconds once a mainnet pool exists. Store price, pool address, block number and time. A price older than 15 minutes is stale; after 60 minutes the block hides. No third party price API. The flag `SHOW_TOKEN_PRICE` gates rendering per page through an allowlist. Flag off, the block leaves the HTML and payload under the Block settings server rule. The price never enters share previews, the Open Graph image, JSON-LD, llms.txt, Telegram messages or broadcasts. `TELEGRAM_BANNED_PHRASES` (revo price) and the amount beside REVO rule stay unchanged for Telegram surfaces. Amped copy on this block avoids the phrase REVO price, so the default title is REVO token. The config schema extends `blockSettingsSchema` and is listed in `CONFIG_SCHEMAS`.

**Motion.** Entrance rise once per visit. A new price crossfades in place over 233 ms. No count up, no flash, no color change on a move. Stale fades the price to 82%. Reduced motion and Pause motion: instant.

**Editor.** Counsel review notice while the flag is off. Token row fixed to REVO. Title with counter. Layout chips Card and Compact. Show the 24 hour change, off by default. Read only Source rows for the pool and the testnet state, drawn with a lock, Set by Amped and no chevron. Attention is a read only row with a lock: Not available on this block. The no trade note. Block settings rows, with Attention marked Not available.

**Decisions.**
- TK1 Ship behind a flag until counsel signs. Recommended: SHOW_TOKEN_PRICE stays off in production; staging and allowlisted pages only until written counsel sign off. Why: a token price on a creator page, next to a pool block, can read as promotion of the token, and today's Telegram rules already ban the phrase revo price. Alternative: ship it with the other v2 blocks.
- TK2 Price source. Recommended: one named on chain source, the REVO and USDC pool on Revolution, read by the Amped chain indexer; on testnet no price shows. Why: real data with a source anyone can check, and a test token has no market. Alternative: a third party price API such as CoinGecko after a listing.
- TK3 24 hour change. Recommended: off by default; when on, plain words in the text color with no arrows or colors. Why: arrows and red or green frame a price as performance. Alternative: no change figure at all.
- TK4 No trade actions. Recommended: no Buy, Swap or trade button; the only link opens the source on Revoscan; the Swap widget retires. Why: a trade action on a creator page is a solicitation. Alternative: link to a DEX page for REVO.
- TK5 Stale and down states. Recommended: older than 15 minutes shows Last price with its time; down for 60 minutes hides the block for visitors with a Fix chip in the preview. Why: an old price shown as current misleads. Alternative: always show the last known price as current.

**Analytics.** `token_block_viewed` (state: testnet, live, stale), `token_source_opened`, each with block id. No price data in analytics.
