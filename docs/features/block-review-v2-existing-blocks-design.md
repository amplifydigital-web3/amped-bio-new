# Block Review v2, wave 1 part 2: existing blocks design spec

Build Board card #54. Date 26 Oct 2026. Baseline development a3ce3330. Builds after Theme Engine v2 and behind SHOW_BLOCKS_V2.

This part redesigns the blocks Amped already ships, plus the shared settings row every block gets. Every existing config migrates in place through a legacy map. At default settings, nothing a visitor sees changes until the creator opts in.

## Rules that apply to every block

- Creator page surfaces use only the creator's theme (section 17). Editor surfaces use Amped Prism 2.2 Balanced v1.0.
- Motion: CSS, WAAPI and scroll driven animation behind @supports, with an IntersectionObserver fallback. View Transitions for state changes. Motion (MIT) only for gestures. No GSAP. Reduce motion turns every effect into a fade or nothing.
- Targets are at least 44 by 44. Text contrast is at least 4.5 to 1. Large text and icons are at least 3 to 1.
- Copy: no em or en dashes. Short declarative sentences. No figures, rates or promises about returns on creator pages.

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

- The pool block shows the Network Reward Rate on the creator page. PL1 recommended removing it. Rob answered 26 Oct: keep the figures and the rate with the helper, as today.
- textConfigSchema rejects headings and lists that the sanitizer allows. TX1 aligns the schema with the sanitizer.

## Link block (`link`)

**Job.** Send a visitor to the right place, with the most important links standing out.

**Today (development a3ce3330).** One CreatorButton per link: 55 min height, the platform icon at left, the label centered, two lines then truncate, in the creator's button style and color (Screen Review 040). Config is `{platform, url, label}`. No image, no layout, no schedule, no attention.

**Config.** `url`, `platform` (detected from the URL, changeable), `label` (1 to 60), `layout` (`button`, `thumbnail`, `featured`, `tile`), `thumb` (`{source: link | upload | icon | emoji, imageId?, icon?, emoji?}`), `subtitle` (0 to 60, thumbnail and featured), `preview` (`{title, imageId, fetchedAt}` from the server). Common settings: `schedule`, `rule` (gating engine), `attention`, `motion`.

**Legacy map.** `{platform, url, label}` becomes `{platform, url, label, layout: "button", thumb: {source: "icon"}}`. Snapshot tests prove no visible change at default.

**Public states.**
- Button: today's anatomy.
- Thumbnail: 64 high row, 48 image, icon or emoji at left, label and one line, chevron.
- Featured: 16:9 image from the link, optional badge (Video, New), title, one line, the action line.
- Tile: square image with the label; two per row on a phone, three on desktop; an odd last tile spans the row.
- Scheduled: not in the page HTML before it goes live, and not after it expires.
- Locked: label, the rule (Members only, Followers only, Pool fans), one action (Join to open, Follow to open, View pool). The URL stays on the server until the gating engine allows it.
- Attention: shimmer, glow or pop in the creator's colors.
- Preview missing: falls back to the platform icon.

**Motion.** Entrance rise and stagger. Hover lift 2 px, press 1 px. Attention plays on view, then every 8 s, stops after 3 plays. Layout change in the editor preview uses a View Transition. Everything off under prefers-reduced-motion and Pause motion.

**Editor.** URL well with the detected platform chip and Change. Label with counter. Layout as four option tiles. Thumbnail source chips with the fetched preview and Refresh. Block settings row. Page list rows carry a Scheduled chip while a schedule is pending.

**Decisions.**
- LK1 Link previews. Recommended: the server fetches Open Graph title and image with an SSRF guard and a 7 day cache; the creator can replace either. Why: no browser fetch of third party pages, and previews stay fast. Alternative: creator uploads every image.
- LK2 Featured layout. Recommended: allowed on any link, any number; the editor suggests no more than 3 per page. Why: the creator decides the page's emphasis. Alternative: one featured link per page.
- LK3 Tiles. Recommended: tiles pair two by two; an odd last tile spans the row. Why: no empty gap on the grid. Alternative: require an even count.
- LK4 Attention. Recommended: one attention block per page; plays on view, then every 8 s, stops after 3 plays; off under reduced motion. Why: attention that never stops reads as an ad and costs battery. Alternative: loop while on screen.
- LK5 Migration. Recommended: existing links map to Button with the platform icon. Why: no page changes without the creator. Alternative: auto upgrade links with previews to Thumbnail.

**Analytics.** Clicks keep today's event with `layout`, `attention` (bool) and `locked` (bool) added. New `link_unlock_started` for locked links.

**Decisions on the card (drawn with the recommendation).**
- LK1 Link previews. Recommended: The server fetches title and image from the link (Open Graph), with an SSRF guard and a 7 day cache. The creator can replace either.
- LK2 Featured layout. Recommended: Allowed on any link, any number. The editor suggests no more than 3 per page.
- LK3 Tiles. Recommended: Tiles pair two by two. An odd last tile spans the row as a wide tile.
- LK4 Attention. Recommended: One attention block per page. Plays on view, then every 8 s, stops after 3 plays. Off under reduced motion.
- LK5 Migration. Recommended: Today's links map to the Button layout with the platform icon. No visible change until the creator picks a layout.

## Media blocks (`media`, redesign)

**Job.** Play a creator's video, music or latest posts on the page, without loading anything a fan did not ask for.

**Today (development a3ce3330).** One `media` type with `{platform, url, label, content}`. YouTube, Vimeo and Spotify render an iframe at their final size on page open (`EmbedFrame`); Instagram, TikTok and Facebook use `react-social-media-embed` in a 377 high self sizing frame; X renders a single post. Players set third party cookies before the fan chooses. No title, length or chapters. Spotify is the only music service. Feeds show one post, not the latest posts.

**Config.** `kind` (`video`, `music`, `feed`, `post`), `url`, `provider` (detected), `title` (0 to 60, defaults from the provider), `caption` (0 to 160). Video: `startAt` (seconds), `shape` (`wide`, `vertical`, `square`), `chapters[]` (max 30: `t`, `title`), `showChapters`. Music: `size` (`compact`, `card`, `full`), `otherServices` (bool), `services[]` (resolved links). Feed: `source` (`instagram`, `tiktok`, `youtube`), `accountId` (connected account), `count` (3, 6, 9, 12), `layout` (`grid`, `carousel`), `followButton`.

**Legacy map.** `platform` youtube, vimeo, twitch, facebook to `kind: video`; spotify to `kind: music, size: compact` (track, episode) or `card` (playlist, album, show, artist), using today's 152 and 352 rule; instagram, tiktok, twitter to `kind: post` (single post, as today) until the creator connects an account and switches to `feed`; `url` to `url`; `content` to `caption` (video, post) or ignored for Spotify, where it held the URL; `label` to `title`. token-price, nft-collection, uniswap, substack keep their legacy handling (see legacy-web3 and the RSS block).

**Public states.** Facade (poster, provider name, title, length, chapters, Load {provider} player, cookie line); loading (skeleton at the same size); playing (provider player, chapter list marks the current chapter); feed (latest posts, each a link to the post, Follow button, Updated time); error or disconnected (renders nothing to visitors, Fix chip in the preview).

**Server.** `media.resolve` reads oEmbed and provider metadata on save (title, poster, length, description chapters), cached. `music.resolve` matches a release across services through a link resolver. `feeds` refreshes connected Instagram (Instagram API with Instagram Login), TikTok (Display API) and YouTube (Data API) accounts hourly, stores post ids, thumbnails and captions only, and deletes them on disconnect.

**Decisions.**
- MD1 Poster facade for every third party player. Recommended: nothing loads until the fan taps or allows embedded content (same model as Embed, EM2). Alternative: load players on view as today.
- MD2 Feeds through a connected account. Recommended: official APIs, account connect, cached server side, refreshed hourly. Alternative: scrape public profiles.
- MD3 Chapters. Recommended: read from the description on save, editable, shown by default. Alternative: creator types them.
- MD4 One music player for every service. Recommended: resolve the release on each service and show Listen on chips; preview plays from the pasted service. Alternative: one block per service.
- MD5 Autoplay. Recommended: never with sound; muted autoplay only for vertical clips the creator turns on, off under reduced motion and data saver. Alternative: muted autoplay for every video.

**Analytics.** `media_viewed`, `media_loaded` (facade tap), `media_chapter`, `music_service_open` (service), `feed_post_open`, each with block id.

**Design.** Boards md1 and md2, Screen Review 221 and 222.

**Decisions on the card (drawn with the recommendation).**
- MD1 Poster facade for every third party player. Recommended: Yes. Video, music and feeds load nothing until the fan taps or allows embedded content. Same model as the Embed block.
- MD2 Feeds through a connected account. Recommended: Official Instagram and TikTok APIs with an account connect, cached server side, refreshed hourly. No scraping.
- MD3 Chapters. Recommended: Read from the video description on save, editable, shown under the video by default.
- MD4 One music player for every service. Recommended: Match the release across services with a link resolver and show Listen on chips. The preview plays from the pasted service.
- MD5 Autoplay. Recommended: Never with sound. Muted autoplay only for Vertical clips the creator turns on, paused under reduced motion and data saver.

## Text block (`text`), redesign

**Job.** Say something in the creator's own words, with enough structure to scan.

**Today (development a3ce3330).** `TextBlock` renders `config.content` straight on the page at 16/26 in the creator's font, through `sanitizeRichHtml`. The editor toolbar offers Bold, Italic, Underline and an Align menu. `textConfigSchema` accepts only p, a, span, strong, em, u, b, i and s on save, while the sanitizer already allows h1 to h3, ul, ol, li and blockquote. `platform` values `telegram`, `team` and `email-collect` route to other renderers.

**Config.** `content` (sanitized HTML, 0 to 2,000 characters), `platform` (kept for legacy routing), `style` (`plain`, `card`, `quote`), `quoteCaption` (0 to 60, quote style only), `button` (`{label 1 to 24, url}` or null), `collapse` (bool), `reveal` (`block`, `lines`).

**Legacy map.** `{content, platform}` reads as `{content, platform, style: "plain", button: null, collapse: false, reveal: "block"}`. No visual change until the creator edits the block. New blocks default to `style: "card"`, `collapse: true`.

**Public states.** Plain, Card, Quote; collapsed with Read more after 6 lines (the fade uses the container color); open with Show less; line by line reveal on first view.

**Editor.** Toolbar: Heading, Bold, Italic, Link, Bulleted list, Numbered list, Quote, Align menu. One tab stop, arrow keys move, Ctrl B, I and K. Style chips, Add a button (label, link), Collapse long text, Reveal chips, then the common Block settings row. Counter 0 to 2,000.

**Decisions.**
- TX1 Allowed formatting. Recommended: add h3, ul, ol, li and blockquote to `textConfigSchema`, matching `sanitizeRichHtml`. Alternative: keep the narrow list and drop lists and quotes from the toolbar.
- TX2 Styles. Recommended: Plain, Card, Quote; existing blocks keep Plain. Alternative: Card only.
- TX3 Button. Recommended: one optional button per text block. Alternative: no button; use a link block below.
- TX4 Read more. Recommended: on for new blocks, after 6 lines. Alternative: always show full text.
- TX5 Reveal. Recommended: with the block by default; line by line opt in. Alternative: line by line for every text block.

**Analytics.** `text_read_more` with block id; button clicks count as link clicks.

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

**Config, referral.** `title` (1 to 40, default Start your own page), `description` (0 to 120), `layout` (`card`, `button`), `share` (bool: Copy link, Share and QR). Legacy map: today's `{}` reads as `{layout: "button", title: "Create your own Amped.Bio page", share: false}`, so existing pages look the same until the creator edits the block.

**Public states, pool.** Card (eyebrow Creator pool, art, name, faces of opted in backers with "Lina, Joao and 212 others back Studio Circle.", Total staked, Fans, Creator share, the Network Reward Rate with its helper verbatim, Join pool, testnet line verbatim); compact (one row with Join pool, testnet line); signed in fan who backs the pool (You back this pool, since month, Manage in Wallet, View pool); under 10 backers (no faces, count reads New pool); pool missing or failed (nothing to visitors, Fix chip in the preview).

**Public states, referral.** Card (title, description, Create your page, then Copy link, Share and Show QR); button layout; QR sheet (scan to start a page, the link as text, Copy invite, Close returns focus); copied (Copied with a check for 2 seconds, announced). Hidden when no referral program is active, as today.

**Rules.** The page block shows Total staked, Fans, Creator share and the Network Reward Rate with its helper, as today (PL1, answered 26 Oct). No other rate, yield, return, price, APY or APR on the page block. The testnet line is verbatim: Testnet only. Pool rewards come from the network, vary, and are not guaranteed. Referral copy carries no token amounts. Join pool opens the pool panel (Screen Review 046), which keeps the review, the required checkbox and the calm commit state.

**Decisions.**
- PL1 No figures or rate on the page block. Answered 26 Oct: alternative chosen; the figures and the Network Reward Rate with its helper stay on the page block, as today. Recommended was: remove them. Why the recommendation: a creator page is a promotional surface; figures and a rate there read as an offer while counsel reviews staking. Alternative: keep the figures and the rate with the helper, as today.
- PL2 Fans who back the pool see status, not amounts. Recommended. Alternative: show the fan's stake.
- PL3 Referral without amounts. Recommended until counsel clears faucets. Alternative: show the referee reward on the card.
- PL4 Backer faces opt in only, hidden under 10 backers. Recommended, same rule as the Followers block. Alternative: always show counts and faces.
- PL5 Join pool opens the existing pool panel. Recommended. Alternative: an inline stake sheet on the creator page.

**Analytics.** `pool_block_viewed`, `pool_join_tapped`, `referral_block_viewed`, `referral_create_tapped`, `referral_link_copied`, `referral_qr_opened`, each with block id.

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

**Legacy map.** `follow` without `layout` reads as `button`, `line` empty. `followers` without `layout` reads as `stack`; every other field keeps its value. Snapshot tests prove no visual change at default.

**Public states.** Chip by the name; card with one line; full button; Following with the capsule menu; Stack, Wall (8 faces on phones, 12 wider, hidden under 3 opted in), Ticker (first names of opted in followers, 34 s loop, paused on hover, focus and touch); New on Amped under 10; count hidden by the creator shows no number anywhere.

**Rules kept.** No number under 10. No face, name or handle of a follower who did not opt in. Growth only positive. Sources as kinds, never campaigns. One Follow on screen at a time: a chip, a Follow block or a card button with its switch on removes Follow from the capsule and from any other card.

**Motion.** Faces stack in 55 ms apart. Follow morphs to Following with a View Transition and the count bumps by one. Count up once on first view. Reduced motion: static ticker, no count up, instant changes.

**Decisions.**
- FO1 Ticker contents. Recommended: first names of opted in followers, never under 10, no time stamps or handles. Alternative: full names with time.
- FO2 Compact chip and the capsule rule. Recommended: the chip counts as the one Follow on screen. Alternative: keep the capsule Follow beside the chip.
- FO3 Count motion. Recommended: count up once on first view. Alternative: no count motion.
- FO4 Wall size. Recommended: 8 faces on phones, 12 wider, hidden under 3 opted in. Alternative: always 12.

**Analytics.** Existing `follow_started`, `follow_created` with `source = block` plus `layout`; `followers_block_viewed` gains `layout`.

**Decisions on the card (drawn with the recommendation).**
- FO1 Ticker contents. Recommended: First names of followers who chose to appear, never under 10 followers, never a time stamp or a handle.
- FO2 Compact chip and the capsule rule. Recommended: The chip by the name counts as the one Follow on screen. The capsule and any card button drop their Follow while it is on.
- FO3 Count motion. Recommended: Count up once on first view, then static. A new follow by the viewer bumps the number by one.
- FO4 Wall size. Recommended: 8 faces on phones, 12 on wider screens, then the others line. Hidden under 3 opted in followers.

## Identity and Telegram (`rnsid`, `telegram_message`, `telegram_group`)

**Job.** Show who runs the page, from the server's identity rule, and open a Telegram conversation or group to the fans the creator's rule admits.

**Today (development a3ce3330).** RNS ID: four styles in `packages/ui/src/creator/rns-id-card.tsx`, on the button color at the container transparency, with fixed sizes and its own anatomy. Message me on Telegram: a CreatorButton with the rule label floating under it. Join my Telegram group: the same button pattern. No motion on any of them.

**v2 config.** Unchanged types and fields. RNS ID keeps `style` (`nameplate`, `idcard`, `proofstrip`, `seal`), `label`, `tap` (`rnsIdTapsFor`), `show` (displayName, avatar, since, nameOnId, ageOver18, gender, country). Telegram blocks keep `label` only. Every block gains the common settings row; on Telegram blocks Who can open this is read only and reads Set in Inbox settings.

**Legacy map.** Every stored config renders as v2 with no field change. RNS ID surface moves from the button color to the container (the card shell); the Verified chip keeps its fixed pair (#E6F2EA on #0F4A2C). Telegram blocks gain a subject line (the label as the card title) and the rule line moves under it; the button label becomes Message {first name} or the next step for a locked door.

**Public states.** RNS ID: verified with badge, verified without badge (112 D8), linked name (lapsed or never checked), verified without a linked name (112 D9), identity sheet open, proof strip expanded. Telegram message: open with rule line, refused with the reason (unchanged copy). Telegram group: locked with the rule and one next step (Follow, Become a member, View pool), open for a qualifying fan, closed while the creator's group is disconnected (renders nothing).

**Motion.** Entrance rise and fade. Seal: one light sweep on first view, once per visit. Identity sheet: View Transition from the tapped card, focus returns on close. Door unlock: lock icon and rule line swap in place with a View Transition. Nothing plays under reduced motion or Pause motion.

**Server rules.** Unchanged. `computeRnsIdentity` decides what the block may show; attributes come only from a current Authbase check with the owner's switch on. `getHandle telegramDoor` returns the open state and rule kind; the page never receives a stake amount. Telegram rechecks admission when the fan joins.

**Decisions.**
- IT1 No attribute without a current check. Recommended: Name on ID, Over 18 and Country show only on a verified page with the owner's switch on; a lapsed check removes them at once. Alternative: keep the last checked values until the owner removes them.
- IT2 Telegram door rules stay in Inbox settings. Recommended: the block shows the server rule read only; doors read the gating engine once it ships (gating G2). Alternative: a rule picker on the block.
- IT3 Seal shimmer. Recommended: once per visit, on first view, never under reduced motion or Pause motion. Alternative: on every view.
- IT4 Locked Telegram door. Recommended: shown with the rule and one next step, never hidden and never with an amount. Alternative: hide the block from fans who do not qualify.
- IT5 Identity sheet. Recommended: one shared sheet for the header chip and the block, opened with a View Transition from the tapped card. Alternative: a separate sheet per surface.

**Analytics.** Unchanged events, plus `rnsid_sheet_opened` and `telegram_door_viewed` with `open` true or false.

**Decisions on the card (drawn with the recommendation).**
- IT1 No attribute without a current check. Recommended: Name on ID, Over 18 and Country show only on a verified page with the owner's switch on; a lapsed check removes them at once.
- IT2 Telegram door rules stay in Inbox settings. Recommended: The block shows the server rule read only. Doors read the gating engine once it ships (gating G2).
- IT3 Seal shimmer. Recommended: Once per visit, on first view, never under reduced motion or Pause motion.
- IT4 Locked Telegram door. Recommended: Shown with the rule and one next step (Follow, Become a member, View pool), never hidden and never with an amount.
- IT5 Identity sheet. Recommended: One shared sheet for the header chip and the block, opened with a View Transition from the tapped card.

## Block settings row (every block)

**Job.** Give every block the same four controls in the same place: when it shows, who can open it, whether it asks for attention, and how it enters.

**Config, shared by every block type.** Added to the base block config next to `hidden`:

- `schedule` `{ start?: ISO datetime, end?: ISO datetime, showCountdown: bool }`. Times are stored in UTC and edited in the creator's time zone.
- `access` `{ ruleId?: uuid }`. The id of an `AccessRule` from the gating engine (#21). No rule means Everyone.
- `attention` `{ preset: "off" | "shimmer" | "glow" | "pulse" | "edge" | "pop" }`. The server keeps at most one block per page with a preset other than off.
- `motion` `{ entrance: bool, style: "theme" | "rise" | "fade" | "scale" }`. Default `{ entrance: true, style: "theme" }`.

**Editor.** The Block settings eyebrow sits at the bottom of every configurator. Four disclosure rows in this order: Schedule, Who can open this, Attention, Motion. Each shows its current value and opens in place. One row open at a time.

- Schedule: Go live and Expire date and time wells in the creator's time zone, the helper that visitors never see the block before it goes live, and Show a countdown before it goes live. Expire before Go live shows "Expire must be after Go live" and does not save.
- Who can open this: radio rows Everyone, Followers, Members, Pool fans, Fans with a minimum stake (whole tREVO well, converted to wei on save), Paid (USDC price well, fee shown inside), Any of these (two or more). The stake notice shows while a stake choice is selected. Stake rules stay on the pilot allowlist; a creator off the list sees those rows disabled with "Not available for your page yet".
- Attention: option tiles with a live mini preview in the creator's theme. If another block has attention, a notice names it with Move here. Move here clears the other block in the same save.
- Motion: Entrance checkbox, Entrance style chips (Theme default, Rise, Fade, Scale), helper that motion stops for visitors who reduce motion and on slow phones.
- Page list rows carry chips: Scheduled (or Expired), the rule summary (Members only, Followers only, Paid, Pool fans, 18+), Attention.

**Public states.**

- Before go live: absent from the page HTML. With `showCountdown`, a closed row shows the label, a clock and "Opens in {n} days · {local time} your time". No link target in the HTML.
- After expire: absent. The editor row shows Expired.
- Locked: the label, a lock, the rule summary and one next step from the engine hint (Follow, Join, Buy for {price}, View pool, Sign in, Verify age). Stake rules show "Pool fans" or "Fans with a minimum stake" and View pool; no amount. The destination, text or file is not in the HTML until the engine allows.
- Unlocked: the block opens in place after the action, with a View Transition; focus moves to the opened block's action.
- Attention: plays when the block comes into view, then every 8 seconds, 3 plays per visit.

**Motion.** Entrance 377 ms once per visit (Rise moves 13 px). Attention presets use the creator's button and text colors; Edge trace and Glow count as light effects in the page budget (1 heavy or 3 light). All motion is off under prefers-reduced-motion and the page's Pause motion control; the attention count still runs so analytics stay comparable.

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
