# Block Review v2, wave 1 part 2: existing blocks design spec

Build Board card #54. Date 26 Oct 2026. Baseline development a3ce3330. Builds after Theme Engine v2 and behind SHOW_BLOCKS_V2.

This part redesigns the blocks Amped already ships, plus the shared settings row every block gets. Every existing config migrates in place through a legacy map. At default settings, nothing a visitor sees changes until the creator opts in.

## Rules that apply to every block

- Creator page surfaces use only the creator's theme (section 17). Editor surfaces use Amped Prism 2.2 Balanced v1.0.
- Motion: CSS, WAAPI and scroll driven animation behind @supports, with an IntersectionObserver fallback. View Transitions for state changes. Motion (MIT) only for gestures. No GSAP. Reduce motion turns every effect into a fade or nothing.
- Targets are at least 44 by 44. Text contrast is at least 4.5 to 1. Large text and icons are at least 3 to 1.
- Copy: no em or en dashes. Short declarative sentences. No figures, rates or promises about returns on creator pages. One exception, answered by Rob on 26 Oct (PL1): the Creator pool block keeps Total staked, Fans, Creator share and the Network Reward Rate with its helper, as today.

## Design pages

| Block | Boards | Design page |
|---|---|---|
| Link block | lk1 (row 219), lk2 (row 220) | https://claude.ai/artifact/7sMWgrRcZXTZnzSBvfdy3u |
| Media blocks | md1 (row 221), md2 (row 222) | https://claude.ai/artifact/7xG2zM86Fx2B5sUo9TgWG2 |
| Text block | tx1 (row 223), tx2 (row 224) | https://claude.ai/artifact/9M7EJgcjCgckEhrkFGY5Qt |
| Pool and referral blocks | pl1 (row 225), pl2 (row 226) | https://claude.ai/artifact/JkQfBEoTLDHShs1BUzk2NJ |
| Follow and Followers | fo1 (row 227), fo2 (row 228) | https://claude.ai/artifact/Kgrze2vaGcjXwTHNALNeuQ |
| Identity and Telegram blocks | it1 (row 229), it2 (row 230) | https://claude.ai/artifact/GXdyf9TpEpMJNk74sQfWMJ |
| Block settings | bs1 (row 231), bs2 (row 232) | https://claude.ai/artifact/JMZC6qEPxqmTX3HGaNqSAX |

## Findings in today's code

- `linkConfigSchema` checks `url` with `z.string().url()`, which accepts `javascript:` URLs, and `CreatorButton` renders the stored URL as the href. `editBlock` takes `config: z.any()` and checks no schema at all. A stored `javascript:` link runs on amped.bio when a visitor taps it. Fix now, outside v2: allow http, https, mailto and tel only, in the schema and on every save path, `editBlock` included.
- `addBlock` and `editBlocks` parse each config with a zod object, which drops unknown keys. Every v2 field must be in the block's schema before it ships, or the next page save strips it.
- The pool block shows the Network Reward Rate on the creator page. PL1 recommended removing it. Rob answered 26 Oct: keep the figures and the rate with the helper, as today.
- textConfigSchema rejects headings and lists that the sanitizer allows. TX1 aligns the schema with the sanitizer: the schema accepts exactly the sanitizer's tag list (export `ALLOWED_TAGS` from html.ts and use it in both), so br, code, h1 and h2 written by Slate stop failing. Today one such text block makes `editBlocks` refuse the whole page save. The schema's JavaScript regex check goes: the sanitizer already removes scripts and handlers, and the regex refuses plain prose such as "Monday = open" or "the function (x)".
- `textConfigSchema` has no `platform` field and zod drops unknown keys, so a full page save strips `platform` from telegram, team and email-collect rows. They then render as plain text, raw JSON for team.

## Link block (`link`)

**Job.** Send a visitor to the right place, with the most important links standing out.

**Today (development a3ce3330).** One CreatorButton per link: 55 min height, the platform icon at left, the label centered, two lines then truncate, in the creator's button style and color (Screen Review 040). Config is `{platform, url, label}`. No image, no layout, no schedule, no attention.

**Config.** `url` (http, https, mailto or tel only, checked on the server on every save path), `platform` (detected from the URL, changeable), `label` (1 to 60; a stored label over 60 keeps rendering and saving until the creator edits it), `layout` (`button`, `thumbnail`, `featured`, `tile`), `thumb` (`{source: link | upload | icon | emoji, imageId?, icon?, emoji?}`), `subtitle` (0 to 60, thumbnail and featured; empty shows the site name), `badge` (`none`, `video`, `new`; featured only), `preview` (`{title, imageId, faviconId, fetchedAt}` from the server). Common settings: `schedule`, `access`, `attention`, `motion`, as named in the Block settings row. `linkConfigSchema` gains every field above as optional with the legacy defaults.

**Legacy map.** `{platform, url, label}` becomes `{platform, url, label, layout: "button", thumb: {source: "icon"}, badge: "none"}`. For `platform: "custom"` the icon stays the site favicon, as today, but the server fetches and stores it under the LK1 fetch rules and the page serves it from Amped. The visitor's browser no longer calls Google's favicon service. Until the favicon is stored, the generic link icon shows. The editor's BlockRow and Preview drop the Google favicon URL too. Snapshot tests prove no visible change at default, apart from the favicon source.

**Public states.**
- Button: today's anatomy.
- Thumbnail: 64 high row, 48 image, icon or emoji at left, label and one line, chevron. In every layout the label wraps to 2 lines and then truncates, long words break, and the subtitle is 1 line with an ellipsis; the row grows in height, never in width, at 320 wide and at 200 percent text.
- Featured: 16:9 image from the link, optional badge (Video, New), title, one line, the action line.
- Tile: square image with the label. Tiles pair only inside a run of consecutive tile links, counted after scheduled and hidden links are removed. Phone: two per row, and an odd last tile spans the row as a wide tile. Desktop: three per row; a single last tile spans the row, and a last pair shares it at half width each.
- Scheduled: not in the page HTML before it goes live, and not after it expires.
- Locked: label, the rule (Members only, Followers only, Pool fans), one action (Join to open, Follow to open, View pool). Every layout renders as the locked row. No preview image, preview title, favicon or site name from the link; an uploaded, icon or emoji thumbnail may show. The subtitle shows the rule, never the URL or host. The URL stays on the server until the gating engine allows it, and no ad pixel event carries it.
- Attention: any Block settings preset (shimmer, glow, pulse, edge, pop) in the creator's colors. One block per page (BS2).
- Preview missing or fetch failed: falls back to the platform icon. The editor shows "No preview found. Upload an image or pick an icon."

**Preview fetch (LK1).** The server fetches on save and on Refresh, never on a visitor's page view. http and https only, ports 80 and 443. It resolves the host and refuses loopback, private, link local, carrier grade NAT, multicast and cloud metadata addresses, IPv4 and IPv6, IPv4 mapped IPv6 included, then connects to the checked address so a DNS rebind cannot swap it. Up to 3 redirects, each checked the same way. 5 s timeout. At most 1 MB of HTML and 5 MB per image. Images must sniff as PNG, JPEG, WebP or GIF, never SVG; they are re-encoded to WebP without metadata and stored by Amped. The title is plain text from `htmlToPlainText`, cut to 60. Cache 7 days per URL. Refresh skips the cache, at most 10 per creator per hour. The favicon follows the same path. The fetch sends no cookies and no creator identity.

**Motion.** Entrance rise and stagger. Hover lift 2 px, press 1 px. Attention plays on view, then every 8 s, stops after 3 plays. Layout change in the editor preview uses a View Transition. Everything off under prefers-reduced-motion and Pause motion.

**Editor.** URL well with the detected platform chip and Change. A URL that is not http, https, mailto or tel shows "Use a web, email or phone link" and does not save. Label with counter. Subtitle with counter (Thumbnail and Featured). Layout as four option tiles. Featured adds a Badge choice: None, Video, New. Thumbnail source chips with the fetched preview and Refresh. Block settings row. Page list rows carry a Scheduled chip while a schedule is pending.

**Decisions.**
- LK1 Link previews. Recommended: the server fetches Open Graph title and image with an SSRF guard and a 7 day cache; the creator can replace either. Why: no browser fetch of third party pages, and previews stay fast. Alternative: creator uploads every image.
- LK2 Featured layout. Recommended: allowed on any link, any number; the editor suggests no more than 3 per page. Why: the creator decides the page's emphasis. Alternative: one featured link per page.
- LK3 Tiles. Recommended: tiles pair two by two; an odd last tile spans the row. Why: no empty gap on the grid. Alternative: require an even count.
- LK4 Attention. Recommended: one attention block per page; plays on view, then every 8 s, stops after 3 plays; off under reduced motion. Why: attention that never stops reads as an ad and costs battery. Alternative: loop while on screen.
- LK5 Migration. Recommended: existing links map to Button with the platform icon. Why: no page changes without the creator. Alternative: auto upgrade links with previews to Thumbnail.

**Analytics.** Clicks keep today's `click` event (block id) with `layout`, `attention` (bool) and `locked` (bool) added. No URL, label or visitor identity is added. New `link_unlock_started` (block id, rule kind) for locked links. A tap on a locked link fires no ad pixel; after unlock the pixel follows today's consent rule.

**Decisions on the card (drawn with the recommendation).**
- LK1 Link previews. Recommended: The server fetches title and image from the link (Open Graph), with an SSRF guard and a 7 day cache. The creator can replace either.
- LK2 Featured layout. Recommended: Allowed on any link, any number. The editor suggests no more than 3 per page.
- LK3 Tiles. Recommended: Tiles pair two by two. An odd last tile spans the row as a wide tile.
- LK4 Attention. Recommended: One attention block per page. Plays on view, then every 8 s, stops after 3 plays. Off under reduced motion.
- LK5 Migration. Recommended: Today's links map to the Button layout with the platform icon. No visible change until the creator picks a layout.

## Media blocks (`media`, redesign)

**Job.** Play a creator's video, music or latest posts on the page, without loading anything a fan did not ask for.

**Today (development a3ce3330).** One `media` type with `{platform, url, label, content}` (`mediaConfigSchema`, packages/constants/src/blocks.ts). `mediaPlataforms` lists spotify, instagram, youtube, twitter, token-price, nft-collection, uniswap, substack, creator-pool, facebook, tiktok, discord, twitch and vimeo. YouTube (youtube-nocookie.com), Vimeo and Spotify render an iframe at their final size on page open (`EmbedFrame`, apps/landingpage/src/components/blocks/frame.tsx); Instagram, TikTok and Facebook use `react-social-media-embed` in a 377 high `SelfSizingFrame`, which loads each network's script on page open; X uses `react-tweet`, whose `useTweet` fetches the post in the visitor's browser. Twitch and Discord have no renderer, so those rows show nothing today. `creator-pool` rows hold a pool address in `url` and the pool name in `label`. Spotify reads `content` before `url`, because old Spotify blocks stored the link in `content`. `label` is empty on every block added since Screen Review 037 and is never shown on the page (040 I02); it only feeds the iframe title. The Add block tile for Facebook is Facebook post, and its link rule accepts any facebook.com or fb.watch address. Players set third party cookies before the fan chooses. No title, length or chapters. Spotify is the only music service. Feeds show one post, not the latest posts.

**Config.** `kind` (`video`, `music`, `feed`, `post`), `url`, `provider` (detected), `title` (0 to 60, defaults from the provider), `caption` (0 to 160). Video: `startAt` (seconds), `shape` (`wide`, `vertical`, `square`), `autoplayMuted` (bool, default false, only when `shape` is `vertical`, MD5), `chapters[]` (max 30: `t`, `title`; the first at 0:00, ascending, at least 10 seconds apart), `showChapters`. Post: the fields in the Social posts section (`network`, `layout`, `show`, `cache`); Media owns no post fields of its own. Music: `size` (`compact`, `card`, `full`), `otherServices` (bool), `services[]` (resolved links). Feed: `source` (`instagram`, `tiktok`, `youtube`), `accountId` (connected account), `count` (3, 6, 9, 12), `layout` (`grid`, `carousel`), `followButton`.

**Legacy map.** Every value of `mediaPlataforms` has a home.
- `youtube` to `kind: video`; a `/shorts/` link sets `shape: vertical`, any other link `wide`.
- `vimeo` to `kind: video, shape: wide`; the player address adds `dnt=1`.
- `twitch` to `kind: video`. Twitch renders nothing today, so the row keeps rendering nothing: it migrates with `hidden: true` and the editor shows Twitch now plays on your page, with Show it. The player address carries `parent` for amped.bio and each custom domain.
- `facebook` splits by link. `/videos/`, `/watch`, `/reel/` and `fb.watch` links go to `kind: video, provider: facebook`, loaded after consent as Facebook's video plugin iframe. Every other Facebook link (`/posts/`, `/permalink.php`, `/photo`, `/share/p/`) goes to `kind: post, network: facebook` in Social posts. A `/share/` short link is resolved on the server once, at migration, before the split.
- `spotify` to `kind: music`. The source is `content` when it starts with https://open.spotify.com, else `url`, the same order as today's renderer. `size: compact` for track and episode, `card` for playlist, album, show and artist (today's 152 and 352 rule). `caption` is empty. A show or episode gets the Podcast hint (PC5); nothing switches on its own.
- `instagram`, `tiktok` and `twitter` to `kind: post` with `network` `instagram`, `tiktok` or `x`, as the Social posts section defines. A creator who later connects an account can switch the block to `feed`.
- `creator-pool` to the `pool` block: `url` to `address`, `label` to `label`, as today's editor already treats it (037 I12).
- `discord` renders nothing today. It migrates to a `link` block with `platform: discord` and `hidden: true`, and is offered to the Community block (CM4).
- `url` to `url`. `content` to `caption` for video and post. `label` to `title` only when it is not empty; an empty label takes the provider title from `media.resolve` at migration.
- token-price, nft-collection, uniswap and substack keep their legacy handling (see legacy-web3 and the RSS block).

Visible change. The part 2 rule that nothing a visitor sees changes until the creator opts in has one exception here: every migrated player becomes a facade (MD1), because today's players load before consent. The facade, its title and its poster are the only visible change at migration.

**Public states.** Facade (poster, provider name, title, length, chapters, Load {provider} player, cookie line); loading (skeleton at the same size); playing (provider player, chapter list marks the current chapter); feed (latest posts, each a link to the post, Follow button, Updated time); error or disconnected (renders nothing to visitors, Fix chip in the preview).
- Consent. Media uses the Embed provider registry, the `embeds` consent category and the Embed frame rules (sandbox, `allow` from the registry, referrer policy, CSP `frame-src`). Posters, cover art and feed thumbnails are copied to the Amped image service on save and served by Amped, never from a provider address. The page HTML holds no provider address until Load, a chapter tap, a preview tap or the stored Embedded content choice. Withdrawing the choice puts every Media player back to its facade without a reload.
- Facade controls. One named control loads the player: the button Load {Provider} player. The poster forwards a click to it and is not focusable. Before load, each chapter is a button named Play from {time}, {chapter title}; it loads the player at that time and counts as the tap. After load, focus moves to the player region, named {Provider} player, {title}, unless the tap came from a chapter, which keeps focus. A status line says Loading {Provider}, then {Provider} loaded. The iframe title is {Provider} player: {title}.
- Captions and chapters. The provider player keeps its own captions control; the chapter list is a real list of buttons outside the frame, and the current one carries `aria-current`. Chapter changes during play are not announced.
- Music. The play button is named Play a preview of {title}, then Pause the preview of {title}, with no `aria-pressed`. Every size, Compact included, shows a line naming where the preview loads from. Listen on chips are links named Listen on {Service}, opening in a new tab.
- Feed. Each tile is a link named {Post, Reel or Clip}: {first 60 characters of the caption}, opens {Network}. With no caption the name is {Network} post from {date}. Tiles never play inline. The carousel has Previous and Next buttons (44), every tile is in the tab order, a focused tile scrolls into view, and nothing advances on its own.
- Load failure. As Embed: no load event after 15 seconds shows "{Provider} did not load." with Try again and Open on {Provider}, at the same size.
- Locked. The Block settings locked card (BS4). No poster, title or provider address in the HTML until the rule passes.
- Scheduled. Absent from the HTML before go live and after expire (BS1).
- 18+. If Who can open this has an age rule, the locked card applies and no poster, cover, title or provider name for the block reaches previews or the HTML.

**Server.** `media.resolve` reads oEmbed and provider metadata on save (title, poster, length, description chapters), cached. `music.resolve` matches a release across services through a link resolver. `feeds` refreshes connected Instagram (Instagram API with Instagram Login), TikTok (Display API) and YouTube (Data API) accounts hourly, stores post ids, thumbnails and captions only, and deletes them on disconnect.
- Instagram API with Instagram Login connects professional accounts only (Creator or Business). The Basic Display API for personal accounts ended in December 2024. The Connect Instagram dialog says so.
- Instagram `media_url` and TikTok `cover_image_url` are signed and expire. Each refresh copies thumbnails to the Amped image service; the page never hotlinks them. A failed refresh keeps the last good copy. A revoked or expired token hides the block for visitors and shows Reconnect in the editor. Disconnect deletes stored posts and images at once.
- Music previews. Spotify's Web API no longer gives `preview_url` to new apps (since November 2024), so a Spotify preview plays only in Spotify's own frame: after the tap, the frame replaces the row at 80 high in Compact and the cover at 152 high in Card, and 352 in Full. Apple Music (iTunes Search `previewUrl`) and Deezer (`preview`) return 30 second files that play in Amped's own `<audio preload="none">`, with the source set on tap. SoundCloud, Audiomack, Bandcamp and YouTube Music play in their own frame after the tap. The line on the card names the service the preview loads from. One audio plays at a time across the page, shared with Podcast (PC3).
- The link resolver runs on the server on save. No visitor request goes to it.
- Autoplay (MD5). `autoplayMuted` plays a Vertical video muted only when the visitor's stored Embedded content choice is on; a facade never autoplays, because it loads nothing. It is off under prefers-reduced-motion, the page Pause motion control, Save-Data or `navigator.connection.saveData`, and for locked blocks. It starts at half in view and pauses out of view. Amped draws a Pause button (44) on the player, named Pause {title}, because the provider controls can hide during muted play (WCAG 2.2.2). One autoplaying player per page. Sound starts only when the fan unmutes.

**Decisions.**
- MD1 Poster facade for every third party player. Recommended: nothing loads until the fan taps or allows embedded content (same model as Embed, EM2). Alternative: load players on view as today.
- MD2 Feeds through a connected account. Recommended: official APIs, account connect, cached server side, refreshed hourly. Alternative: scrape public profiles.
- MD3 Chapters. Recommended: read from the description on save, editable, shown by default. Alternative: creator types them.
- MD4 One music player for every service. Recommended: resolve the release on each service and show Listen on chips; preview plays from the pasted service. Alternative: one block per service.
- MD5 Autoplay. Recommended: never with sound; muted autoplay only for vertical clips the creator turns on, off under reduced motion and data saver. Alternative: muted autoplay for every video.

**Analytics.** `media_viewed` (kind, provider), `media_loaded` (provider, `via`: tap, chapter or allowed), `media_load_failed` (provider), `media_chapter`, `music_preview_played` (service), `music_service_open` (service), `feed_post_open` (network), each with block id. Editor: `feed_connected` and `feed_disconnected` (source). No visitor data, no post ids and no full addresses.

**Design.** Boards md1 and md2, Screen Review 221 and 222.

**Decisions on the card (drawn with the recommendation).**
- MD1 Poster facade for every third party player. Recommended: Yes. Video, music and feeds load nothing until the fan taps or allows embedded content. Same model as the Embed block.
- MD2 Feeds through a connected account. Recommended: Official Instagram and TikTok APIs with an account connect, cached server side, refreshed hourly. No scraping.
- MD3 Chapters. Recommended: Read from the video description on save, editable, shown under the video by default.
- MD4 One music player for every service. Recommended: Match the release across services with a link resolver and show Listen on chips. The preview plays from the pasted service.
- MD5 Autoplay. Recommended: Never with sound. Muted autoplay only for Vertical clips the creator turns on, paused under reduced motion and data saver.

## Text block (`text`), redesign

**Job.** Say something in the creator's own words, with enough structure to scan.

**Today (development a3ce3330).** `TextBlock` renders `config.content` straight on the page at 16/26 in the creator's font, through `sanitizeRichHtml`. Content with no tags renders as one paragraph with pre-wrap. The editor toolbar offers Bold, Italic, Underline and an Align menu. `textConfigSchema` accepts only p, a, span, strong, em, u, b, i and s on save, while the sanitizer allows p, span, br, strong, b, em, i, u, s, code, blockquote, h1, h2, h3, ul, ol, li and a. `slateToHtml` writes h1, h2, blockquote, ol, li and code, and writes a bulleted list as p with li inside, because it has no ul case. `platform` values `telegram` (content is a t.me URL), `team` (content is JSON) and `email-collect` route to other renderers.

**Config.** `content` (sanitized HTML; 0 to 2,000 characters counted on the visible text from `htmlToPlainText`, not the markup), `platform` (kept for legacy routing and added to `textConfigSchema`), `style` (`plain`, `card`, `quote`), `quoteCaption` (0 to 60, quote style only), `button` (`{label 1 to 24, url}` or null; url http, https, mailto or tel only), `collapse` (bool), `reveal` (`block`, `lines`). A stored row over 2,000 keeps rendering and saving unchanged; the counter shows it over the limit, and the block saves edits again once the creator shortens it. Style, button, collapse and reveal apply only when `platform` is `text` or absent.

**Legacy map.** `{content, platform}` reads as `{content, platform, style: "plain", button: null, collapse: false, reveal: "block"}`. Plain keeps today's metrics exactly: 16/26 in the creator's font, padding 13 by 21, 13 between paragraphs, plain text with pre-wrap. Snapshot tests prove no visual change until the creator edits the block. Rows with `platform` `telegram` or `team` keep today's renderers and take no style, button, collapse or reveal. `email-collect` rows migrate to `email_signup` (wave 1 spec). Before the migration, count text rows with no `platform` whose content is a JSON member list or a bare t.me URL; they lost `platform` to the save bug and are restored to `team` or `telegram`. New blocks default to `style: "card"`, `collapse: true`.

**Public states.** Plain, Card, Quote. Headings inside the text render at the level the page needs: h2 before the first section header, h3 after one, never h1. Stored h1, h2 and h3 all map to that level (wave 1 heading rule). Collapsed with Read more after 6 lines: the fade is a mask on the text, so it works on Plain over an image or gradient background. The hidden part stays in the HTML for search and screen readers, and a link that takes focus in it opens the note. Read more is a button with aria-expanded and aria-controls; focus stays on it. Open with Show less. Line by line reveal on first view, once per visit: each paragraph, heading and list item, not each visual line. The text is visible in the HTML and hides only once the script arms the reveal, so a failed script never hides text. Reduce motion and Pause motion show it at once.

**Editor.** Toolbar: Heading, Bold, Italic, Link, Bulleted list, Numbered list, Quote, Align menu. One tab stop, arrow keys move, Ctrl B, I, U and K. Underline has no button; Ctrl U still toggles it and stored underline keeps rendering. Heading stores h3; the page sets the level. `slateToHtml` gains a bulleted list case that writes ul. Style chips, Quote caption (Quote only), Add a button (label, link), Collapse long text, Reveal chips, then the common Block settings row. Counter 0 to 2,000 on the visible text.

**Decisions.**
- TX1 Allowed formatting. Recommended: add h3, ul, ol, li and blockquote to `textConfigSchema`, matching `sanitizeRichHtml`. Alternative: keep the narrow list and drop lists and quotes from the toolbar.
- TX2 Styles. Recommended: Plain, Card, Quote; existing blocks keep Plain. Alternative: Card only.
- TX3 Button. Recommended: one optional button per text block. Alternative: no button; use a link block below.
- TX4 Read more. Recommended: on for new blocks, after 6 lines. Alternative: always show full text.
- TX5 Reveal. Recommended: with the block by default; line by line opt in. Alternative: line by line for every text block.

**Analytics.** `text_read_more` with block id. Button clicks send today's `click` event with the text block id; the page's click handler accepts a text block with a button, not only link blocks. No text content in any event.

**Decisions on the card (drawn with the recommendation).**
- TX1 Allowed formatting. Recommended: Align the save schema with the sanitizer: add h3, ul, ol, li and blockquote to textConfigSchema. Both pass through sanitizeRichHtml on render.
- TX2 Styles. Recommended: Plain (default for existing blocks), Card and Quote. Existing blocks keep Plain so no page changes.
- TX3 Button. Recommended: One optional button per text block in the creator's button style.
- TX4 Read more. Recommended: On by default for new blocks. Collapses after 6 lines and opens in place.
- TX5 Reveal. Recommended: With the block by default. Line by line is opt in and off under reduced motion.

## Creator pool (`pool`) and Referral (`referral`)

**Job.** Pool: let a visitor back the creator, with nothing on the page that reads as a financial offer. Referral: invite a visitor to start their own Amped page.

**Today (development a3ce3330).** The pool card shows the pool art, name and handle, description, Total staked, Fans, Creator share, the Network Reward Rate with its helper, View pool and the testnet line, on the creator's button color. The referral block is one CreatorButton, Create your own Amped.Bio page, shown only while a referee reward is set.

**Config, pool.** `address` (required, 0x 40 hex), `label` (1 to 40, the title), `layout` (`card`, `compact`), `showFaces` (bool, default true). Legacy map: today's `{address, label}` reads as `{address, label, layout: "card", showFaces: true}`.

- Today's renderer titles the card with the pool name from the pool record, not `label`. The editor sets `label` to the pool name on pick. Legacy rows keep showing the pool name until the creator edits Title, so nothing changes at default.
- Today's schema accepts `^0x[a-fA-F0-9]+$` of any length and `label` with no maximum. A legacy row with a short address already renders nothing; it keeps its row and the editor shows the Fix chip. A legacy `label` over 40 characters keeps rendering and must be shortened on the next save.
- Title and the pool description sit next to the rate. Both pass the copy check on save: no banned words (earn, yield, income, profit, invest, staking, APY, APR, return, guaranteed), no percent sign and no token amount. A failing title does not save and reads: Titles cannot promise rewards.
- Legacy `media` blocks with `platform: "creator-pool"` (see block-validity.ts) are not migrated by this map. They keep today's rendering. Decide in build whether to convert them to `pool` rows.

**Config, referral.** `title` (1 to 40, default Start your own page), `description` (0 to 120), `layout` (`card`, `button`), `share` (bool: Copy link, Share and QR). Legacy map: today's `{}` reads as `{layout: "button", title: "Create your own Amped.Bio page", share: false}`, so existing pages look the same until the creator edits the block.

**Public states, pool.** Card (eyebrow Creator pool, art, name, faces of opted in backers with "Lina, Joao and 212 others back Studio Circle.", Total staked, Fans, Creator share, the Network Reward Rate with its helper verbatim, Join pool, testnet line verbatim); compact (one row with Join pool, testnet line); signed in fan who backs the pool (You back this pool, since month, Manage in Wallet, View pool); under 10 backers (no faces, count reads New pool); pool missing or failed (nothing to visitors, Fix chip in the preview).

- Rate branches, as today: when the creator share is 100 percent, the rate and helper are replaced by "The creator keeps 100% of pool rewards. Fans in this pool receive no rewards." When the pool has no rate, the rate row and helper are left out. The helper never shows without the rate, and the rate never shows without the helper.
- Compact shows no figures and no rate. The configurator note says so. The testnet line stays in Compact.
- Under 10 backers: the header reads New pool, faces and the backers sentence are hidden. The Fans figure in the figure grid still shows its value, as today (PL1). This is the one place a number under 10 can appear.
- The fan state shows no figures, no rate and no amount (PL2). It keeps View pool and the testnet line.
- Loading: a skeleton at the card's final height with no text, as today (motion-safe pulse only). The skeleton never shows to visitors once the pool read fails.
- Faces and the backers sentence never name a fan who did not choose Show me on public lists. The faces row needs 3 or more such fans, as in the Followers block.

**Public states, referral.** Card (title, description, Create your page, then Copy link, Share and Show QR); button layout; QR sheet (scan to start a page, the link as text, Copy invite, Close returns focus); copied (Copied with a check for 2 seconds, announced). Hidden when no referral program is active, as today.

- Link: boards show amped.bio/join/{handle}. Today the referral is a `?r=` query with the creator's user id in hex (useReferralHandler). Build adds a `/join/{handle}` route that sets the same referrer cookie, so no user id appears in the link or the QR.
- QR sheet: a modal dialog labelled by its heading. Focus goes to Close on open. Tab stays inside. Escape and Close shut it and return focus to Show QR. Share, Show QR and Close are 44 by 44 icon buttons with names (Share, Show QR, Close).
- Copy link and Copy invite announce "Link copied" through one polite live region. The region clears before each write, so a second copy announces again.
- Title and description are free text. They pass the same save check as the pool title, plus no token amounts and no token names (PL3).
- Reflow: at 320 wide and 200 percent text, the Copy link row wraps; Share and Show QR move to the next line.

**Rules.** The page block shows Total staked, Fans, Creator share and the Network Reward Rate with its helper, as today (PL1, answered 26 Oct). No other rate, yield, return, price, APY or APR on the page block. The testnet line is verbatim: Testnet only. Pool rewards come from the network, vary, and are not guaranteed. Referral copy carries no token amounts. Join pool opens the pool panel (Screen Review 046), which keeps the review, the required checkbox and the calm commit state.

**Decisions.**
- PL1 No figures or rate on the page block. Answered 26 Oct: alternative chosen; the figures and the Network Reward Rate with its helper stay on the page block, as today. Recommended was: remove them. Why the recommendation: a creator page is a promotional surface; figures and a rate there read as an offer while counsel reviews staking. Alternative: keep the figures and the rate with the helper, as today.
- PL2 Fans who back the pool see status, not amounts. Recommended. Alternative: show the fan's stake.
- PL3 Referral without amounts. Recommended until counsel clears faucets. Alternative: show the referee reward on the card.
- PL4 Backer faces opt in only, hidden under 10 backers. Recommended, same rule as the Followers block. Alternative: always show counts and faces.
- PL5 Join pool opens the existing pool panel. Recommended. Alternative: an inline stake sheet on the creator page.

**Analytics.** `pool_block_viewed`, `pool_join_tapped`, `referral_block_viewed`, `referral_create_tapped`, `referral_link_copied`, `referral_share_tapped`, `referral_qr_opened`, each with block id and `layout`. No pool amount, wallet address, visitor id or referrer id in any event.

**Decisions on the card.**
- PL1 Figures and rate on the page block. Answered 26 Oct: keep the figures and the rate with the helper, as today. Recommended was to remove them from the page.
- PL2 Fans who already back the pool. Recommended: Show You back this pool, the month, and Manage in Wallet. Never the amount staked.
- PL3 Referral without amounts. Recommended: The card invites visitors to start a page. Reward amounts show only in Wallet and the sign up flow, until counsel clears faucets.
- PL4 Backer faces. Recommended: Opt in only, from fans who chose Show me on public lists, hidden under 10 backers, the same rule as the Followers block.
- PL5 Join pool action. Recommended: Join pool opens the existing pool panel, which holds the review and confirm steps. The block never stakes in one tap.

## Follow and Followers (`follow`, `followers`), v2

**Job.** Turn a visitor into a follower from anywhere on the page, and show proof the creator chose, without exposing anyone who did not opt in.

**Today (development a3ce3330).** Follow: a full width CreatorButton with a label (24 max) that runs the capsule flows and opens the Following menu. Followers: one card in the button color at the container transparency with title, count line, growth line and sparkline, opted in faces with a two name sentence, pool fans line, milestone badge, sources, and an optional Follow button. Both are singletons. Config: `follow {label}`, `followers {title, show {count, faces, poolFans, milestone, sources}, growthRange, facesOrder, facesMax, followButton}`.

**v2 config.** `follow {label, layout: button | chip | card, line}`. `followers {title, layout: stack | wall | ticker, show {...}, growthRange, facesOrder, facesMax, followButton}`.

- `label` stays 1 to 24 (FOLLOW_LABEL_MAX). `line` is 0 to 80 and shows only in the card layout. The Follow block configurator shows Label, Layout tiles (Button, Chip, Card) and Line under Card. It is not drawn on fo2; build follows the Followers configurator pattern.
- `facesMax` (6 or 12) applies to Stack only. Wall uses 8 on phones and 12 wider (FO4). Ticker uses up to 12 names.
- With layout Chip the block renders in the hero by the name, whatever its row order. The editor row meta says: compact chip by your name.

**Legacy map.** `follow` without `layout` reads as `button`, `line` empty. `followers` without `layout` reads as `stack`; every other field keeps its value. Snapshot tests prove no visual change at default.

- One exception. Today a page can show a Follow block and a Followers card button together; the editor only shows "Two Follow buttons are on your page" (FollowBlockFields.tsx). In v2 the Follow block wins: the card button does not render while a visible Follow block exists, in any layout. The configurator shows Follow button in this card unchecked and disabled, with the notice and Open it. The stored `followButton` value is kept, so the card button returns if the Follow block is hidden or deleted. Snapshot tests cover this case separately.
- Under 10 followers the Stack keeps today's rule: faces show when 3 or more followers chose to appear, and the sentence reads "and others follow" with no number. The fo1 caption now says this.

**Public states.** Chip by the name; card with one line; full button; Following with the capsule menu; Stack, Wall (8 faces on phones, 12 wider, hidden under 3 opted in), Ticker (first names of opted in followers, 34 s loop, paused on hover, focus and touch); New on Amped under 10; count hidden by the creator shows no number anywhere.

- Ticker carries a Pause button at its end: 44 by 44, named Pause names, then Play names, with aria-pressed. The paused state holds until the visitor presses Play. Hover, keyboard focus inside the row and touch pause it as well. This meets WCAG 2.2.2 on its own, without relying on the page Pause motion control.
- Ticker semantics: one group named "Followers who chose to appear: Lina, Joao, Ana" with the moving copy aria-hidden, so a screen reader hears the names once and never the loop.
- Ticker needs 10 or more followers and 3 or more who chose to appear. Below that it renders as Stack. It shows no time stamp, no "just now" and no live insertion of new names while a visitor watches, so a name cannot be tied to a moment.
- Wall and Stack faces are decorative for screen readers; the sentence carries the names.
- Count up starts from the server rendered final value: the number is painted at its value, then animates from 0 only when the block first enters view after hydration. The live region on the count is off during the count up and on afterwards, so it announces only the viewer's own follow.
- Reflow: at 320 wide with 200 percent text the title and the count wrap onto two lines.

**Rules kept.** No number under 10. No face, name or handle of a follower who did not opt in. Growth only positive. Sources as kinds, never campaigns. One Follow on screen at a time: a chip, a Follow block or a card button with its switch on removes Follow from the capsule and from any other card.

**Motion.** Faces stack in 55 ms apart. Follow morphs to Following with a View Transition and the count bumps by one. Count up once on first view. Reduced motion: static ticker, no count up, instant changes.

**Decisions.**
- FO1 Ticker contents. Recommended: first names of opted in followers, never under 10, no time stamps or handles. Alternative: full names with time.
- FO2 Compact chip and the capsule rule. Recommended: the chip counts as the one Follow on screen. Alternative: keep the capsule Follow beside the chip.
- FO3 Count motion. Recommended: count up once on first view. Alternative: no count motion.
- FO4 Wall size. Recommended: 8 faces on phones, 12 wider, hidden under 3 opted in. Alternative: always 12.

**Analytics.** Existing `follow_started`, `follow_created` with `source = block` plus `layout`; `followers_block_viewed` gains `layout`. `followers_ticker_paused` with block id only. No follower name, handle or visitor id in any event.

**Decisions on the card (drawn with the recommendation).**
- FO1 Ticker contents. Recommended: First names of followers who chose to appear, never under 10 followers, never a time stamp or a handle.
- FO2 Compact chip and the capsule rule. Recommended: The chip by the name counts as the one Follow on screen. The capsule and any card button drop their Follow while it is on.
- FO3 Count motion. Recommended: Count up once on first view, then static. A new follow by the viewer bumps the number by one.
- FO4 Wall size. Recommended: 8 faces on phones, 12 on wider screens, then the others line. Hidden under 3 opted in followers.

## Identity and Telegram (`rnsid`, `telegram_message`, `telegram_group`)

**Job.** Show who runs the page, from the server's identity rule, and open a Telegram conversation or group to the fans the creator's rule admits.

**Today (development a3ce3330).** RNS ID: four styles in `packages/ui/src/creator/rns-id-card.tsx`, on the button color at the container transparency, with fixed sizes and its own anatomy. Message me on Telegram: a CreatorButton with the rule label floating under it. Join my Telegram group: renders nothing on amped.bio today (`ProfileView` renders null for `telegram_group`), and the editor shows the Telegram groups coming soon notice; groups wait on `TELEGRAM_GROUPS` (off) and Telegram groups PR 5. Message me on Telegram renders nothing while the creator's Fan messages are off or the bot is missing (`door.open` false). No motion on any of them.

**v2 config.** Unchanged types and fields. RNS ID keeps `style` (`nameplate`, `idcard`, `proofstrip`, `seal`), `label`, `tap` (`rnsIdTapsFor`), `show` (displayName, avatar, since, nameOnId, ageOver18, gender, country). The configurator shows all seven switches; Gender was missing from it2 and is now drawn. Telegram blocks keep `label` only. Every block gains the common settings row; on Telegram blocks Who can open this is read only and reads Set in Inbox settings. On the RNS ID block Who can open this is read only and reads "Everyone. Identity is public": the same identity reaches the header chip, so a rule on the block would protect nothing. The server drops `access` on `rnsid`, `telegram_message` and `telegram_group`.

**Legacy map.** Every stored config renders as v2 with no field change. RNS ID surface moves from the button color to the container (the card shell); the Verified chip keeps its fixed pair (#E6F2EA on #0F4A2C). Telegram blocks gain a subject line (the label as the card title) and the rule line moves under it; the button label becomes Message {first name} or the next step for a locked door. The identity sheet stays the existing Prism `RnsIdentityDialog` (`packages/ui/src/prism/rns-identity.tsx`): an Amped trust surface, the one stated exception to creator theme only (section 17). Its dialog keeps focus inside, Escape and Close shut it, and focus goes back to the surface that opened it (header chip or block).

**Public states.** RNS ID: verified with badge, verified without badge (112 D8), linked name (lapsed or never checked), verified without a linked name (112 D9), identity sheet open, proof strip expanded. Telegram message: open with rule line, refused with the reason (unchanged copy), closed while Fan messages are off or the bot is missing (renders nothing, as today). Telegram group: locked with the rule and one next step (Follow, Become a member, View pool), open for a qualifying fan, closed while the creator's group is disconnected (renders nothing). Until Telegram groups PR 5 ships behind `TELEGRAM_GROUPS`, the group block renders nothing, as today. Open for a qualifying fan is a per viewer state: it comes from a signed in check after hydration (gating engine `access.checkPage`, or the messaging rule evaluator until G2), never from the cached page payload. A signed out visitor sees the locked door with Sign in. Over 18 shows only when the value is true; a false value is never shown.

**Motion.** Entrance rise and fade. Seal: one light sweep on first view, once per visit. Identity sheet: View Transition from the tapped card, focus goes back on close. Door unlock: lock icon and rule line swap in place with a View Transition. Nothing plays under reduced motion or Pause motion. Once per visit means once per page per browser session; a first view under reduced motion or Pause motion counts as the play. The Verified chip pair (#0F4A2C on #E6F2EA, 9.0 to 1) passes on every theme; on light themes the chip fill sits close to the card (1.1 to 1), which is allowed because the chip is not a control.

**Server rules.** Unchanged, with three additions. `computeRnsIdentity` decides what the block may show; attributes come only from a current Authbase check with the owner's switch on. `getHandle telegramDoor` sends the open state and rule kind; the page never receives a stake amount. Telegram rechecks admission when the fan joins. (1) `rnsIdBlockOptions` counts the block only when it is not hidden and is live by its Schedule, so a block before go live or after expire releases no attribute and no `since` month. (2) IT1 "a current check" means `verification.state` is verified by the server clock; it does not depend on the Verified badge (112 D8). Verification is cached up to 5 minutes and never past `valid_until`, so a check that lapses drops the attributes at `valid_until`; a consent change at Authbase can take up to 5 minutes to reach visitors. (3) getHandle reads `telegramDoor` only when a live, visible `telegram_message` block is on the page. The group door needs its own server read (`open`, rule kind) when PR 5 ships; today getHandle has none.

**Decisions.**
- IT1 No attribute without a current check. Recommended: Name on ID, Over 18 and Country show only on a verified page with the owner's switch on; a lapsed check removes them at once. Alternative: keep the last checked values until the owner removes them.
- IT2 Telegram door rules stay in Inbox settings. Recommended: the block shows the server rule read only; doors read the gating engine once it ships (gating G2). Alternative: a rule picker on the block.
- IT3 Seal shimmer. Recommended: once per visit, on first view, never under reduced motion or Pause motion. Alternative: on every view.
- IT4 Locked Telegram door. Recommended: shown with the rule and one next step, never hidden and never with an amount. Alternative: hide the block from fans who do not qualify.
- IT5 Identity sheet. Recommended: one shared sheet for the header chip and the block, opened with a View Transition from the tapped card. Alternative: a separate sheet per surface.

**Analytics.** Unchanged events, plus `rnsid_sheet_opened` with `surface` (`chip` or `block`) and `telegram_door_viewed` with `open` true or false and the door (`message` or `group`). No viewer id, wallet, RNS name of the viewer or attribute value.

**Decisions on the card (drawn with the recommendation).**
- IT1 No attribute without a current check. Recommended: Name on ID, Over 18 and Country show only on a verified page with the owner's switch on; a lapsed check removes them at once.
- IT2 Telegram door rules stay in Inbox settings. Recommended: The block shows the server rule read only. Doors read the gating engine once it ships (gating G2).
- IT3 Seal shimmer. Recommended: Once per visit, on first view, never under reduced motion or Pause motion.
- IT4 Locked Telegram door. Recommended: Shown with the rule and one next step (Follow, Become a member, View pool), never hidden and never with an amount.
- IT5 Identity sheet. Recommended: One shared sheet for the header chip and the block, opened with a View Transition from the tapped card.

## Block settings row (every block)

**Job.** Give every block the same four controls in the same place: when it shows, who can open it, whether it asks for attention, and how it enters.

**Config, shared by every block type.** Added to the base block config next to `hidden`:

- `schedule` `{ start?: ISO datetime, end?: ISO datetime, showCountdown: bool }`. Times are stored in UTC and edited in the creator's time zone. The schedule also stores `zone` (IANA name). Amped has no account time zone today (no field in the Prisma schema), so `zone` is the editor's browser zone when the creator first sets a time, shown in the helper. If the browser zone later differs, the helper names both and offers Use my time zone, which keeps the same wall clock time and recomputes UTC. A local time that does not exist (spring forward) moves to the next valid minute and says so; a repeated local time (fall back) takes the first occurrence.
- `access` `{ ruleId?: uuid }`. The id of an `AccessRule` from the gating engine (#21). No rule means Everyone. Only kinds the engine has live can be picked: today `follower`, `pool_member`, `stake_min` and `any` (`LIVE_ACCESS_RULE_KINDS`). Members waits on Memberships phase C and Paid waits on content PR 10; until then those rows show disabled with "Coming soon". Paid and Members also need the creator's seller identity pass (identity checks spec 5.2); without it the row is disabled with "Verify with Authbase to sell". Any of these takes two to four rules, one level deep.
- `attention` `{ preset: "off" | "shimmer" | "glow" | "pulse" | "edge" | "pop" }`. The server keeps at most one block per page with a preset other than off.
- `motion` `{ entrance: bool, style: "theme" | "rise" | "fade" | "scale" }`. Default `{ entrance: true, style: "theme" }`.
- Every config schema in `CONFIG_SCHEMAS` and `anyBlockConfigSchema` extends one shared `blockSettingsSchema` with these four fields. Today `parseTypedConfig` runs `z.object` parsing on save, which drops unknown keys, and `sanitizeBlockConfig` keeps only the schema fields for Telegram blocks, so without the shared schema the settings never save. The server drops `access` on `rnsid`, `telegram_message` and `telegram_group`, where the row is read only.

**Editor.** The Block settings eyebrow sits at the bottom of every configurator. Four disclosure rows in this order: Schedule, Who can open this, Attention, Motion. Each shows its current value and opens in place. One row open at a time. Each row header is a real button with `aria-expanded` and `aria-controls`; Enter and Space toggle it; opening a row closes the open one and keeps focus on the header just activated. The value text sits inside the button name (Schedule, Fri 6 Nov to Sun 8 Nov). Option tiles and chips are native radio inputs in a fieldset with a legend. A read only row is not a button: no chevron, its value names where the setting lives (Set in Inbox settings, Set on each door, Paid, set by the store), and a block that cannot ask for attention reads "Not available on this block". Row values: Schedule reads Always on, From {date}, Until {date}, {date} to {date} or Expired; Who can open this reads the rule summary; Attention reads the preset or Off; Motion reads Entrance on (theme default), Rise, Fade, Scale or Off. A block's own signature motion is fixed by the block and described in the Motion helper, not as the row value.

- Schedule: Go live and Expire date and time wells in the creator's time zone, the helper that visitors never see the block before it goes live, and Show a countdown before it goes live. Expire before Go live shows "Expire must be after Go live" and does not save. Errors sit under the field they belong to, tied with `aria-describedby`, and are announced once: Expire in the past shows "Pick a time in the future". A Go live in the past is allowed and means live now.
- Who can open this: radio rows Everyone, Followers, Members, Pool fans, Fans with a minimum stake (whole tREVO well, converted to wei on save), Paid (USDC price well, fee shown inside), Any of these (two or more). The stake notice shows while a stake choice is selected. Stake rules stay on the pilot allowlist; a creator off the list sees those rows disabled with "Not available for your page yet". Errors: the stake well shows "A whole number of tREVO" and "At least 1 tREVO" (the floor, `MIN_GATE_STAKE_WEI`); Any of these shows "Pick at least two" and "Pick up to four"; if rules fail to load the row shows "Could not load rules. Try again" and keeps the saved rule. The stake notice copy is fixed: "The amount never shows on your page. Fans see Fans with a minimum stake and View pool. Stake rules stay on the pilot list while counsel reviews them."
- Attention: option tiles with a live mini preview in the creator's theme. If another block has attention, a notice names it with Move here. Move here clears the other block in the same save.
- Motion: Entrance checkbox, Entrance style chips (Theme default, Rise, Fade, Scale), helper that motion stops for visitors who reduce motion and on slow phones.
- Page list rows carry chips: Scheduled (or Expired), the rule summary (Members only, Followers only, Paid, Pool fans, 18+), Attention.

**Public states.**

- Before go live: absent from the page HTML. With `showCountdown`, a closed row shows the label, a clock and "Opens in {n} days · {local time} your time". No link target in the HTML. The countdown line counts whole days, then hours under 24 hours, then minutes under 1 hour, and updates at most once a minute. It never shows seconds (CD1). An 18+ block never shows a countdown, because its label is never in the HTML before a pass.
- After expire: absent. The editor row shows Expired.
- Locked: the label, a lock, the rule summary and one next step from the engine hint (Follow, Join, Buy for {price}, View pool, Sign in, Verify age). Stake rules show "Pool fans" or "Fans with a minimum stake" and View pool; no amount. The destination, text or file is not in the HTML until the engine allows. An 18+ block is never in the server HTML, sitemaps, `llms.txt`, share tags or previews for a viewer without a passed Over 18 check. The page shows one Adult items card with Verify age for all of them (identity checks spec 4.4), not one locked card per block. If the engine check fails, the block stays locked (fail closed) and reads "Could not check right now. Try again".
- Unlocked: the block opens in place after the action, with a View Transition; focus moves to the opened block's action.
- Attention: plays when the block comes into view, then every 8 seconds, 3 plays per visit. A play counts only while the block is in view; a play due while it is out of view waits until it is back. Glow and Edge trace count as light effects; Shimmer, Pulse and Pop count as light too.

**Motion.** Entrance 377 ms once per visit (Rise moves 13 px). Attention presets use the creator's button and text colors; Edge trace and Glow count as light effects in the page budget (1 heavy or 3 light). All motion is off under prefers-reduced-motion and the page's Pause motion control; the attention count still runs so analytics stay comparable.

**Server rules.** Today (development a3ce3330) `handle.getHandle` sends every block row, hidden ones included, and the page drops hidden ones on the client (`isHidden`). Block settings carry the same server rule as the countdown reveal (wave 1 spec, section 7). For everyone except the owner, the server drops blocks that are hidden, before `schedule.start` or after `schedule.end` by server time, from the getHandle response, the page HTML and its data payload, sitemaps, `llms.txt`, share tags and any preview. A scheduled block with `showCountdown` is sent as `{ id, type, order, scheduled: { start }, config: { label } }` and nothing else. A block with `access` is sent as the engine's locked block DTO (`gated: true`, `gate: { kind, summary }`, `config: { label, platform }`, no `clicks`) until `access.checkPage` or `access.open` allows that viewer. `indexable` counts only blocks a signed out visitor can open. The owner gets full rows. One attention block per page is enforced in the save transaction: setting a preset on one block clears it on any other; a batch with two presets is refused with "Only one block can ask for attention". A leak test in CI asserts that a scheduled, expired, hidden or gated block's URL, text or file id is absent from every public response.

**Decisions.**
- BS1 Scheduled blocks. Recommended: absent from the HTML before go live and after expire; optional countdown shows label and time only. Alternative: hide with CSS (content ships early).
- BS2 One attention block per page. Recommended. Alternative: allow several (attention stops meaning anything).
- BS3 Attention cadence. Recommended: on view, then every 8 s, 3 plays. Alternative: loop forever (distracting, fails WCAG 2.2.2 for motion over 5 s without a pause).
- BS4 Locked blocks stay visible with label, requirement and one next step, never an amount someone else set. Alternative: hide locked blocks (loses the reason to follow or join).
- BS5 Entrance style follows the theme by default; per block override. Alternative: per block only.

**Analytics.** `block_locked_viewed` (block id, rule kind), `block_unlock_started` (hint), `block_unlocked`, `block_scheduled_countdown_viewed`, `block_attention_played` (preset, play number), clicks after attention compared with the same block's clicks before.

**Decisions on the card (drawn with the recommendation).**
- BS1 Scheduled blocks. Recommended: Absent from the page HTML before go live and after expire. An optional countdown shows the label and the time only.
- BS2 One attention block per page. Recommended: Yes. Choosing attention on a second block asks to move it there.
- BS3 Attention cadence. Recommended: Plays on view, then every 8 seconds, 3 plays in all. Off under reduce motion and Pause motion.
- BS4 Locked blocks stay visible. Recommended: Show the label, the requirement and one next step. Never a stake amount or someone else's figure.
- BS5 Entrance style. Recommended: Theme default unless the creator picks Rise, Fade or Scale for a block. Entrance plays once per visit.
