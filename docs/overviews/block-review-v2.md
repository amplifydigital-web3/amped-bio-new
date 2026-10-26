# Block Review v2: overview

Build Board #54. Drafted by Claude for Rob Frasca, 24 Oct 2026. Research: claude/amped-block-review-research-2026-10-24.md. Matrix: https://claude.ai/artifact/4SW2ejxWWdivEGymtH9zn9.

## What it does

Block Review v2 rebuilds every block on an Amped.Bio page and adds every block the market ships that Amped lacks. Rob chose full parity on 24 Oct: all 49 gap families go to design. Each block gets best in class function, a layout choice, and motion from the Theme Engine v2 registry. Creators keep their pages. Existing blocks move to v2 in place.

The result: a creator switching from Linktree, Beacons or Stan finds every block they used, plus the blocks only Amped has: Creator pool, Referral, RNS ID, Telegram doors, the native Follow graph, and new Amped native blocks such as Unlock card, Drop and Live now.

## Why now

- Amped has 8 of 59 block families in full. 32 are missing. Email signup, the block 9 of 16 products ship, is hidden because the old one drops the address.
- Paid content, the store, memberships and live streaming all land in the next weeks. Each needs a page block. Building them on one kit avoids five one off designs.
- Theme Engine v2 phase 1 puts one renderer and one effect registry in packages/ui. Blocks built after it are written once and inherit the theme. Blocks built before it are written twice. Build waits for it (decided 24 Oct).
- No competitor ties block motion to the theme or to a device budget. Linktree's motion is 8 attention presets on a link. Amped can lead on motion, not only match.

## How it works

**One block kit.** Every block is a registry entry in packages/constants/src/blocks/, the same pattern as the effect registry. An entry holds a stable id, the family, the zod config schema with defaults, the legacy map from v1 config, singleton or not, the layouts it offers, the motion slots it uses, its cost class (still, light, heavy), the gating support, and its analytics events. One renderer per block lives in packages/ui/src/blocks/ and serves the editor preview and the public page. Adding a block touches one folder.

**One anatomy.** Each block is a shell (container shape, border and transparency from the theme), an optional eyebrow and title, a body, and at most one primary action. The creator's font, colors and button style apply everywhere. No Prism token appears inside creator content.

**Common settings on every block.** Hidden, Schedule (go live and expire, creator's timezone), Who can open this (gating engine), Layout (the variants the block offers), Attention (one per page), and Motion (entrance on or off). The same row, in the same place, on every block's configurator.

**Four motion slots, all from the registry.**

| Slot | When it plays | Technology |
| --- | --- | --- |
| Entrance | First time the block scrolls into view; staggered children | Scroll driven animations behind @supports, WAAPI fallback |
| Attention | On view, then every 8 s, stops after 3 plays | Registry button effects (CSS, WAAPI) |
| Interaction | Hover, press, focus | Theme v2 hover and press row |
| State change | Expand, unlock, reorder, poster to player, lightbox | View Transitions, Motion (MIT) only for gestures and springs |

Every slot honors prefers-reduced-motion and the page's Pause motion control. Heavy block motion counts toward the page budget of 1 heavy or 3 light effects, and weak devices get the still version.

**Data blocks.** Three shared services back the new blocks: Audience (email and SMS subscribers, form responses, consent records, export, list sync), Feeds (server side fetch through official APIs and oEmbed, cached, refreshed on a schedule, used by Instagram, TikTok, YouTube, RSS and podcast blocks), and Schedule (go live and expire, countdown reveal). Paid and gated blocks use the content system, the store, memberships, USDC payments and the gating engine. None evaluates access on its own.

**Embeds.** Third party players and widgets render as a facade with the provider name and a poster until the visitor consents, then load (decision 3, answered 24 Oct).

**Editor.** Add block becomes a searchable catalog by family with a live preview on each tile, the singleton rule, and On the board items marked Coming soon. Each block opens inline in the page list, as today (D18).

**Migration.** Existing blocks keep their type and rows. A legacy map reads v1 config into v2 defaults, snapshot tests prove no visual change at default, and v2 renders behind SHOW_BLOCKS_V2 (staging, then Rob's handle, then all). Hidden legacy blocks with no picker entry stay hidden until their v2 block ships or they retire.

## Block catalog

Wave 1 holds the tier 1 gaps and the redesign of every existing block. Wave 2 holds tier 2. Wave 3 holds tier 3 and the retirements. Blocks on other board cards (store, tip, memberships, content, live) follow those cards' order and use this kit.

### Links and structure

| Block | Today | Wave | v2 function | Motion |
| --- | --- | --- | --- | --- |
| Link button | Have | 1 | Layouts per link: button, thumbnail row, featured 16:9 card, grid tile. Auto fetched preview image and title. Platform icon or emoji. Per link schedule, lock and attention. | Entrance stagger, theme hover and press, attention preset |
| Featured link card (thumbnail, 16:9 image, preview) | Missing | 1 | Large card with image or short looping video, title, one line and the action. Auto expands a YouTube, Spotify or store link into a live preview after consent. | Media reveal on view, gentle parallax on scroll |
| Link attention animation (prioritize) | Partial | 1 | Attention presets on any block, not only links: wiggle, pop, shimmer, glow in the button color, edge trace, spark. One attention block per page. | Registry button effects; plays on view, then every 8 s, stops after 3 |
| Scheduled links (go live, expire) | Missing | 1 | Go live and expire times on every block, creator's timezone, visible Scheduled chip in the editor, optional countdown before go live. | Fade in at go live without reload |
| Locked links (code, age, subscribe) | On the board | 1 | Who can open this on every block through the gating engine: followers, members, pool fans, paid, age. Code lock is not offered (gating decision 7). | Lock to unlock View Transition in place |
| Header, divider, spacer | Partial | 1 | Section header with eyebrow and title, divider styles (line, icon, text, wave), spacer. Optional jump menu built from headers. | Line draw on view |
| Collections and folders | Missing | 2 | Collapsible group of blocks with a count, open by default or closed. Nested one level. | Height and chevron morph with View Transitions |
| Sub pages | Missing | 1 | Extra pages under amped.bio/handle/name with their own blocks and the same theme. Page level work. Recommended as its own board card (decision 8). | Cross page View Transitions on supported browsers |
| Text block | Have | 1 | Rich text with headings, lists, quote style and an optional button. Sanitized HTML. | Line by line reveal option |
| Image, gallery, carousel | Missing | 1 | Grid, masonry, carousel and full width slideshow. Up to 24 images from the content library, captions, per image link, lightbox with swipe. | Carousel momentum, lightbox shared element transition, Ken Burns option |
| Social icon row | Partial | 2 | Icon row for every platform, brand or theme color, size, optional follower counts from connected accounts. | Staggered pop in, hover lift |
| Marquee and announcement bar | Missing | 3 | Scrolling text or logo ribbon with speed, direction and wave; announcement bar at the top with optional countdown. | Continuous loop, paused under reduced motion and the pause control |
| Generic embed and custom HTML | Missing | 1 | Allowlisted embed block: paste a URL from an approved provider (Calendly, Typeform, Google Maps, Bandcamp and more). No raw HTML or script. | Click to load facade, then fade in |

### Media

| Block | Today | Wave | v2 function | Motion |
| --- | --- | --- | --- | --- |
| Video embed (YouTube, Vimeo, TikTok, Twitch) | Have | 1 | YouTube, Vimeo, TikTok, Twitch, Facebook with a poster facade, chapters, start time, autoplay muted inline option. | Poster to player View Transition |
| YouTube channel feed and playlist | Missing | 2 | Latest videos from a channel or playlist, auto updated, grid or carousel. | Carousel momentum |
| Music player (Spotify, Apple Music, SoundCloud, Audiomack) | Partial | 1 | One player for Spotify, Apple Music, SoundCloud, Audiomack, Bandcamp, YouTube Music. Compact, card or full size. | Equalizer bars in the button color while playing |
| Release smart link and pre save | Missing | 3 | Release card: cover, date, Pre save before release, every service after release from one link. | Countdown to release, cover flip at release |
| Podcast player | Missing | 3 | Latest episodes from an RSS feed with in page player and platform buttons. | Progress ring |
| Instagram feed and grid | Partial | 1 | Instagram grid or carousel of the latest posts and reels, 3 to 12 items, each clickable. | Grid stagger, hover zoom |
| TikTok feed | Partial | 2 | Latest TikToks as a vertical carousel with play in place. | Swipe momentum |
| X, Threads, Pinterest, Reddit posts | Partial | 3 | Single posts from X, Threads, Pinterest, Reddit, Bluesky, Farcaster. | Card rise on view |
| Native video, audio and file player | On the board | 2 | Content block from the content system: Amped hosted video, audio and files with the shared player and gating. | Player chrome fade, scrubber spring |
| RSS and latest posts | Hidden | 2 | Latest posts from any RSS feed (Substack, beehiiv, Ghost, Medium) with title, date and excerpt. | List stagger |

### Audience

| Block | Today | Wave | v2 function | Motion |
| --- | --- | --- | --- | --- |
| Email signup | Hidden | 1 | Email signup that stores subscribers in Amped with double opt in, consent record, export, and sync to Mailchimp, Kit, beehiiv, Klaviyo. Feeds broadcast. | Field focus glow, success morph |
| SMS signup | Missing | 3 | SMS signup with explicit consent text and keyword opt out. After email. | Same as email |
| Contact and custom form | Missing | 1 | Form builder: text, email, phone, choice, date, file. Responses in Amped with notifications and export. | Step transitions for multi step forms |
| Lead magnet (free download for an email) | Missing | 3 | Free download for an email: picks a content item, delivers it after the signup. | Unlock reveal |
| Poll and survey | Missing | 3 | Poll with live results after voting; optional followers only. | Result bars grow |
| Save contact card | Missing | 2 | Save contact button that downloads a vCard with the fields the creator chooses. | Press ripple |
| Follow button and follower proof | Have | 1 | Follow and Followers keep their behavior, rebuilt on the kit with new layouts. | Faces stack in, count up |
| FAQ accordion | Missing | 2 | Accordion of questions with search when over 8, deep link to a question. | Height morph, chevron rotate |
| Testimonials and reviews | Missing | 3 | Quotes with photo, name and role; carousel or stack; optional source link. | Crossfade carousel |
| Countdown timer | Missing | 1 | Countdown to a date, per visitor duration, or daily reset. At zero: message, hide, or reveal a chosen block. | Digit flip in the theme font |
| Media kit, stats and resume | Missing | 2 | Media kit: audience stats from Amped analytics and connected accounts, rates, past brands, PDF download. | Count up figures |
| Timeline | Missing | 3 | Steps or milestones with dates, badges and a highlighted current step. | Progress line draws with scroll |
| Map and location | Missing | 3 | Location card with a static map image, address and Directions; map loads only after consent. | Pin drop |
| Events and tour dates | Missing | 2 | Tour and event list from Bandsintown, Seated or manual entry, with ticket buttons and Sold out states. | List stagger, date chip flip |
| Booking and coaching calls | Missing | 2 | Booking from Calendly or Cal.com embeds now; native paid sessions later with the store. | Slot picker transitions |
| Community channels (Discord, Slack, WhatsApp) | Partial | 3 | Community doors for Telegram, Discord, WhatsApp, Slack with the access rule shown, through the gating engine. | Door open on unlock |
| AI assistant on the page | Missing | 2 | Ask me block answered from the creator's page and content. Depends on the AI builder card. | Typing indicator |

### Commerce

| Block | Today | Wave | v2 function | Motion |
| --- | --- | --- | --- | --- |
| Tip jar | On the board | 1 | Tip in USDC from the Amped wallet with preset amounts and a message. On the memberships card. | Coin burst in the button color, reduced motion still |
| Fundraising goal | Missing | 3 | Goal bar with target, raised so far and supporters; tips or sales count toward it. | Bar fills on view |
| Digital products and downloads | On the board | 1 | Store block from the content system: product cards, price in USDC, one tap checkout. | Card tilt on hover, buy morph |
| Courses | Missing | 2 | Course card with lessons count and preview; lessons live in the content system. | Lesson list stagger |
| Membership tiers and member posts | On the board | 2 | Membership tiers with perks and Join, member posts preview. | Tier card lift, Join morph |
| Merch and shop integrations | Missing | 2 | Products from Shopify, Fourthwall and Spring as cards with price and Buy. | Image swap on hover |
| Affiliate picks and shoppable products | Missing | 1 | Shoppable picks: product cards from any URL with image, price and the creator's affiliate tag, with an Affiliate label. | Carousel momentum |
| Discount code | Missing | 3 | Discount code card with tap to copy and expiry. | Copy confirm morph |
| Price list and service plans | Missing | 3 | Service menu with prices and an action per item. | Row reveal |
| Paid requests and commissions | Missing | 2 | Paid requests: shoutouts, reviews, commissions with slots and a brief form; pays through the store. | Slot counter |
| Webinar and live stream tickets | On the board | 3 | Live now and next stream with access rule; tickets through the live streaming card. | Live pulse |
| Upsell and order bump | Missing | 3 | Checkout feature. Handled in the store, not a block. | None |

### Identity and Web3

| Block | Today | Wave | v2 function | Motion |
| --- | --- | --- | --- | --- |
| Creator pool | Have | 1 | Back this creator: pool card with backer count and Join pool. No yield, price or reward language. | Backer faces stack in |
| Referral link | Have | 1 | Referral card rebuilt on the kit with share sheet and QR. | QR draw in |
| RNS ID (verified identity) | Have | 1 | Keeps its four styles, rebuilt on the kit. | Seal shimmer on verify |
| Telegram message and group | Have | 1 | Keeps server side door rules, rebuilt on the kit. | Door open on unlock |
| Token price | Hidden | 3 | Retire. Real REVO data only after counsel; no price block until then. | None |
| NFT collection | Hidden | 3 | Collectibles shelf for REVO chain items the creator owns or issues. | Card flip |
| Swap widget (Uniswap) | Hidden | 3 | Retire. No swap widget on creator pages. | None |

### Amped native blocks

| Block | v2 function | Source |
| --- | --- | --- |
| Back this creator | Pool join card with live backer count and Join pool, no yield or price language. | Creator pool block redesign, GTM strategy |
| Quests and rewards | Live quest list from Amplify Reward with progress for the signed in fan. | Rewards Programs (#23), growth strategy |
| Superfan leaderboard and Passport | Top fans by Fan Score with opt in faces. | Superfans (#24), growth strategy leaderboard |
| Badge shelf | Earned badges such as Growth Champion on the profile. | Growth strategy section 3.4 |
| Unlock card | One gated item that names its rule (followers, members, pool fans, paid) and unlocks in place. | Gating engine (#21), paid links (#16) |
| Live now | Live state with viewer count and the access rule, falls back to next stream time. | Live streaming (#27) |
| Drop | Countdown that reveals a gated item or link at zero. | Liinks countdown reveal, gating engine |
| Collectible moments | On chain collectible tied to a moment, with claim flow. | Aston Martin F1 fan engagement analysis |
| USDC tip | Tip in USDC from the Amped wallet with a fixed fee line. | USDC wallet (#29), memberships phase C |
| Linktree import mapping | Every imported Linktree link lands in the matching block type. | Linktree to Amped conversion agent (Feb 2026) |

## Competition

| Product | Blocks and motion today | Our edge |
| --- | --- | --- |
| Linktree | Largest catalog: 61 apps, featured layouts, 8 attention animations, code, age and subscribe locks, scheduling, mostly on paid plans | Every block free, motion from the page theme, locks from one gating engine with members, pool fans and paid |
| Beacons | Store, email and SMS, media kit, follower counts, countdown links, star animation | Native follow graph, USDC payments direct to the creator, verified identity |
| Stan | Product types only: downloads, coaching, courses, memberships, webinars, lead magnets | Same commerce on a full page builder with the creator's theme |
| Taplink, Liinks, Carrd | Design blocks: timer, price list, marquee, timeline, testimonials, slideshow | Same design range plus commerce, gating and identity |
| Fourthwall, Ko-fi | Shop, memberships, donations, goals on a storefront | Link in bio first, with storefront blocks inside |
| Bento | Grid tiles; shut down 13 Feb 2026 after Linktree acquired it | Grid tile layout on every link and gallery block |

## Marketing

- Headline: Every block you use today, plus the ones only Amped has.
- Switch story: Import from Linktree lands every link in the matching v2 block (mapping from the conversion agent work, Feb 2026).
- Show motion, not features: short clips of a page with entrances, an attention pulse and an unlock in place, recorded on a mid range phone to prove it stays fast.
- Free means free: blocks Linktree keeps for Starter or Pro (scheduling, attention, thumbnails, galleries over 3 images) are free on Amped.
- Pool block copy says Back this creator and Join pool. Never earn, yield, APR, returns or price.

## Compliance guardrails

- Compliance scan on every block's copy and defaults: no earn, yield, APR, returns or price language near pool, tip or rewards blocks.
- Email and SMS: consent text at signup, double opt in for email, a stored consent record, one tap unsubscribe. SMS waits for counsel on TCPA (decision 5).
- Affiliate picks carry a visible Affiliate label (FTC).
- Embeds and maps load after consent. Feeds use official APIs and oEmbed only.
- 18+ items never render in public HTML, share previews or feeds without the age check.
- Token price and swap widgets retire. No price data on creator pages until counsel clears it.

## Decisions for Rob

1. Answered 24 Oct: build after Theme Engine v2 phase 1; one block kit; motion stack; full parity.
2. Answered 24 Oct: existing blocks are redesigned in place with a legacy map and a flag.
3. Answered 24 Oct: embeds show a click to load facade until consent.
4. Custom HTML: no raw HTML or script; an allowlisted embed block instead (recommended), or a sandboxed HTML block.
5. SMS signup: after email, with counsel on TCPA consent (recommended), or with email in wave 1.
6. Subscribers: stored in Amped with optional sync to Mailchimp, Kit, beehiiv and Klaviyo (recommended), or sync only.
7. Feeds: official APIs and oEmbed, cached server side (recommended), or page scraping.
8. Sub pages: their own board card, since they change routing, SEO and analytics (recommended), or inside this card.
9. Legacy Web3 blocks: retire token price and swap; NFT becomes a collectibles shelf for REVO chain items (recommended), or rebuild token price with real data.

## Next steps

1. Spec: one spec per family with configurator fields, states, data, analytics events and acceptance criteria, starting with wave 1.
2. Gather the current UI of every existing block (both renderers, every theme state) for the Screen Review.
3. UI design: one Prism 2.2 design page per family, linked on the card, rows added to the Screen Review.
4. Build in waves after Theme Engine v2 phase 1 lands on development.
