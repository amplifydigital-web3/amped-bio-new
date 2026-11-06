# Amped Bio Block Review v2: research

Build Board #54. Research stage. Drafted by Claude, 24 Oct 2026. Owner: Rob Frasca.
Matrix page: https://claude.ai/artifact/4SW2ejxWWdivEGymtH9zn9

## 1. Summary

Amped has 59 block families in scope. 8 are built, 8 are partial, 6 are on the Build Board, 5 are built but hidden, and 32 are missing.
Amped leads on identity and Web3. Creator pool, Referral, RNS ID, Telegram doors and the native Follow graph exist in none of the 16 products reviewed.
Amped trails on everyday blocks. Email signup is the widest gap: 9 of 16 products ship it, and Amped's old block is hidden because it drops the address (Screen Review 040 D3).
No competitor ties block motion to the page theme or to a device budget. Theme Engine v2 does both, so motion is where Amped can lead, not only match.

## 2. Method

16 products: Linktree, Beacons, Stan, Taplink, Liinks, Campsite, hoo.be, Milkshake, Carrd, Fourthwall, Ko-fi, Creator Store (Snipfeed), Komi, Lnk.Bio, Later, Bio Link.
A mark means the source reviewed shows the block. A blank means the source did not show it. Komi, Lnk.Bio, Later and Bio Link come from thinner sources and are likely undercounts.
Amped status comes from development at the time of writing: packages/constants/src/blocks.ts, AddBlockDialog.tsx and the public renderers.

## 3. Amped blocks today

- In the picker: Link (24 platforms), Media (Spotify, YouTube, Instagram post, X post, TikTok, Facebook post, Vimeo), Text, Referral, Creator pool, Follow and Followers (fan graph flag), RNS ID (RNS flag), Telegram message (Telegram flag). Telegram group exists as a type.
- Built but not in the picker: Email collection (drops the address), Token price (mock data), NFT collection, Uniswap, Substack, Team.
- In flight: Content block (#20, PR 6). On the board: Store block (#20), Tip block (#25 phase C), Membership page block (#25), Paid links (#16), Live stream (#27).

## 4. Parity matrix

| Block family | Amped | Products | Who ships it | Note |
|---|---|---|---|---|
| Link button | Have | 13 | Linktree, Beacons, Stan, Taplink, Liinks, Campsite, hoo.be, Milkshake, Carrd, Fourthwall, Lnk.Bio, Later, Bio Link | Link block, 24 platforms. |
| Featured link card (thumbnail, 16:9 image, preview) | Missing | 4 | Linktree, Beacons, Liinks, Later | No thumbnails or layouts on the link block. |
| Link attention animation (prioritize) | Partial | 3 | Linktree, Beacons, Taplink | Theme hover effects only. No per link animation. |
| Scheduled links (go live, expire) | Missing | 5 | Linktree, Beacons, Campsite, Lnk.Bio, hoo.be |  |
| Locked links (code, age, subscribe) | On the board | 2 | Linktree, Campsite | Paid links (#16) and the gating engine (#21) cover paid and rule locks. |
| Header, divider, spacer | Partial | 6 | Linktree, Beacons, Taplink, Liinks, Carrd, Fourthwall | Text block only. |
| Collections and folders | Missing | 3 | Linktree, Liinks, Campsite |  |
| Sub pages | Missing | 5 | Beacons, Taplink, Carrd, Lnk.Bio, Bio Link | Page level feature, listed for parity. |
| Text block | Have | 7 | Linktree, Beacons, Taplink, Liinks, Carrd, Fourthwall, Milkshake | Sanitized HTML (#15). |
| Image, gallery, carousel | Missing | 7 | Linktree, Beacons, Taplink, Carrd, Fourthwall, Campsite, Liinks |  |
| Social icon row | Partial | 3 | Taplink, Liinks, Carrd | Platform links render as buttons. |
| Marquee and announcement bar | Missing | 2 | Liinks, Fourthwall |  |
| Generic embed and custom HTML | Missing | 5 | Taplink, Fourthwall, Campsite, Lnk.Bio, Bio Link | Kept out by design. Allowlisted embeds only. |
| Video embed (YouTube, Vimeo, TikTok, Twitch) | Have | 7 | Linktree, Beacons, Taplink, Carrd, Fourthwall, Milkshake, Campsite | Media block. Twitch is in the platform list but not the picker. |
| YouTube channel feed and playlist | Missing | 3 | Linktree, Beacons, Fourthwall |  |
| Music player (Spotify, Apple Music, SoundCloud, Audiomack) | Partial | 6 | Linktree, Beacons, Taplink, Liinks, Carrd, hoo.be | Spotify only. |
| Release smart link and pre save | Missing | 2 | Linktree, hoo.be |  |
| Podcast player | Missing | 2 | Linktree, Taplink |  |
| Instagram feed and grid | Partial | 5 | Linktree, Liinks, Fourthwall, Later, Lnk.Bio | Single post only. |
| TikTok feed | Partial | 3 | Linktree, Fourthwall, Later | Single video only. |
| X, Threads, Pinterest, Reddit posts | Partial | 1 | Linktree | Single X post only. |
| Native video, audio and file player | On the board | 3 | Fourthwall, Carrd, Linktree | Content block (#20, PR 6 in flight). |
| RSS and latest posts | Hidden | 3 | Linktree, Campsite, Bio Link | Substack renderer exists, not in the picker. |
| Email signup | Hidden | 9 | Linktree, Beacons, Liinks, Fourthwall, Campsite, Milkshake, Later, Lnk.Bio, Bio Link | Hidden. The old block drops the address (Screen Review 040 D3). |
| SMS signup | Missing | 2 | Linktree, Beacons |  |
| Contact and custom form | Missing | 7 | Linktree, Taplink, Liinks, Milkshake, Campsite, hoo.be, Lnk.Bio |  |
| Lead magnet (free download for an email) | Missing | 2 | Stan, Beacons |  |
| Poll and survey | Missing | 1 | Linktree |  |
| Save contact card | Missing | 3 | Linktree, Campsite, Taplink |  |
| Follow button and follower proof | Have | 2 | Linktree, Beacons | Follow and Followers blocks. Native follow graph. |
| FAQ accordion | Missing | 3 | Linktree, Taplink, Liinks |  |
| Testimonials and reviews | Missing | 2 | Linktree, Liinks |  |
| Countdown timer | Missing | 5 | Beacons, Taplink, Liinks, Carrd, Fourthwall |  |
| Media kit, stats and resume | Missing | 3 | Beacons, Linktree, Liinks |  |
| Timeline | Missing | 1 | Liinks |  |
| Map and location | Missing | 2 | Linktree, Taplink |  |
| Events and tour dates | Missing | 3 | Linktree, Beacons, hoo.be |  |
| Booking and coaching calls | Missing | 3 | Linktree, Stan, Creator Store (Snipfeed) |  |
| Community channels (Discord, Slack, WhatsApp) | Partial | 2 | Linktree, Taplink | Telegram message and group blocks. Discord as a link. |
| AI assistant on the page | Missing | 3 | Linktree, Bio Link, Beacons |  |
| Tip jar | On the board | 7 | Beacons, hoo.be, Ko-fi, Creator Store (Snipfeed), Campsite, Liinks, Fourthwall | Tip block in memberships phase C. |
| Fundraising goal | Missing | 2 | Ko-fi, Linktree |  |
| Digital products and downloads | On the board | 10 | Linktree, Beacons, Stan, Taplink, Milkshake, Ko-fi, Creator Store (Snipfeed), Komi, Lnk.Bio, Fourthwall | Store block in the content system (#20). |
| Courses | Missing | 3 | Linktree, Stan, Komi |  |
| Membership tiers and member posts | On the board | 3 | Stan, Ko-fi, Fourthwall | Memberships (#25). |
| Merch and shop integrations | Missing | 4 | Linktree, Beacons, Fourthwall, Ko-fi |  |
| Affiliate picks and shoppable products | Missing | 6 | Linktree, Beacons, Milkshake, hoo.be, Komi, Later |  |
| Discount code | Missing | 2 | Linktree, Taplink |  |
| Price list and service plans | Missing | 1 | Taplink |  |
| Paid requests and commissions | Missing | 4 | Linktree, Ko-fi, Creator Store (Snipfeed), Campsite |  |
| Webinar and live stream tickets | On the board | 2 | Stan, Creator Store (Snipfeed) | Live streaming (#27). |
| Upsell and order bump | Missing | 1 | Stan | Checkout feature, not a block. |
| Creator pool | Have | 0 |  | Amped only. |
| Referral link | Have | 0 |  | Amped only. |
| RNS ID (verified identity) | Have | 0 |  | Amped only. |
| Telegram message and group | Have | 0 |  | Server side door rules. |
| Token price | Hidden | 0 |  | Hidden. Showed mock Ethereum data (040 D3). |
| NFT collection | Hidden | 1 | Beacons | Renderer exists, not in the picker. |
| Swap widget (Uniswap) | Hidden | 0 |  | Renderer exists, not in the picker. |

## 5. Parity order

Rob chose full parity on 24 Oct: every gap goes to design. Tiers set the design order by how many of the 16 ship the block.

**Tier 1, shipped by 5 or more**

- Digital products and downloads (10, On the board)
- Email signup (9, Hidden)
- Contact and custom form (7, Missing)
- Image, gallery, carousel (7, Missing)
- Tip jar (7, On the board)
- Affiliate picks and shoppable products (6, Missing)
- Header, divider, spacer (6, Partial)
- Music player (Spotify, Apple Music, SoundCloud, Audiomack) (6, Partial)
- Countdown timer (5, Missing)
- Generic embed and custom HTML (5, Missing)
- Instagram feed and grid (5, Partial)
- Scheduled links (go live, expire) (5, Missing)
- Sub pages (5, Missing)

**Tier 2, shipped by 3 or 4**

- Featured link card (thumbnail, 16:9 image, preview) (4, Missing)
- Merch and shop integrations (4, Missing)
- Paid requests and commissions (4, Missing)
- AI assistant on the page (3, Missing)
- Booking and coaching calls (3, Missing)
- Collections and folders (3, Missing)
- Courses (3, Missing)
- Events and tour dates (3, Missing)
- FAQ accordion (3, Missing)
- Link attention animation (prioritize) (3, Partial)
- Media kit, stats and resume (3, Missing)
- Membership tiers and member posts (3, On the board)
- Native video, audio and file player (3, On the board)
- RSS and latest posts (3, Hidden)
- Save contact card (3, Missing)
- Social icon row (3, Partial)
- TikTok feed (3, Partial)
- YouTube channel feed and playlist (3, Missing)

**Tier 3, shipped by 1 or 2**

- Community channels (Discord, Slack, WhatsApp) (2, Partial)
- Discount code (2, Missing)
- Fundraising goal (2, Missing)
- Lead magnet (free download for an email) (2, Missing)
- Locked links (code, age, subscribe) (2, On the board)
- Map and location (2, Missing)
- Marquee and announcement bar (2, Missing)
- Podcast player (2, Missing)
- Release smart link and pre save (2, Missing)
- SMS signup (2, Missing)
- Testimonials and reviews (2, Missing)
- Webinar and live stream tickets (2, On the board)
- NFT collection (1, Hidden)
- Poll and survey (1, Missing)
- Price list and service plans (1, Missing)
- Timeline (1, Missing)
- Upsell and order bump (1, Missing)
- X, Threads, Pinterest, Reddit posts (1, Partial)

## 6. Amped native blocks beyond parity

- **Back this creator.** Pool join card with live backer count and Join pool, no yield or price language. Source: Creator pool block redesign, GTM strategy.
- **Quests and rewards.** Live quest list from Amplify Reward with progress for the signed in fan. Source: Rewards Programs (#23), growth strategy.
- **Superfan leaderboard and Passport.** Top fans by Fan Score with opt in faces. Source: Superfans (#24), growth strategy leaderboard.
- **Badge shelf.** Earned badges such as Growth Champion on the profile. Source: Growth strategy section 3.4.
- **Unlock card.** One gated item that names its rule (followers, members, pool fans, paid) and unlocks in place. Source: Gating engine (#21), paid links (#16).
- **Live now.** Live state with viewer count and the access rule, falls back to next stream time. Source: Live streaming (#27).
- **Drop.** Countdown that reveals a gated item or link at zero. Source: Liinks countdown reveal, gating engine.
- **Collectible moments.** On chain collectible tied to a moment, with claim flow. Source: Aston Martin F1 fan engagement analysis.
- **USDC tip.** Tip in USDC from the Amped wallet with a fixed fee line. Source: USDC wallet (#29), memberships phase C.
- **Linktree import mapping.** Every imported Linktree link lands in the matching block type. Source: Linktree to Amped conversion agent (Feb 2026).

## 7. Competitor motion

- Linktree: Prioritize a link with Wiggle, Pop, Shimmer, Electricity, Glitch, Scramble, Orbit or Emoji, Starter plan and up. Featured layout expands links into media previews.
- Beacons: a star adds an attention animation to a link. Countdown links stay inactive until zero.
- Taplink: animation setting on link, messenger and social buttons. Carousel auto scroll. Wavy and zigzag dividers.
- Liinks: marquee on a waving ribbon with speed, direction and rise. Countdown reveals a hidden block at zero.
- Carrd: slideshow with transition types and per image timing.
- Bento: mixed size tile grid. Shuts down 13 Feb 2026 after Linktree acquired it. Linktree added Bento inspired visual layouts.

## 8. Motion technology for v2 blocks

| Technology | Status | Use |
|---|---|---|
| View Transitions, same document | All three engines. Baseline since 14 Oct 2025 (Firefox 144). | Block reorder, expand to sheet, tab and filter changes. |
| Scroll driven animations | Chromium since 2023. Safari 26.0. Firefox 159 enables it by default, shipping 27 Oct 2026. | Reveal on scroll, parallax media, progress rails, behind @supports. |
| WAAPI and CSS | Everywhere. | Default for every block. |
| Motion (MIT) | Mini animate about 3 KB, full about 18 to 22 KB, scroll +2.5 KB, inView +0.5 KB. Layout animation in the React package. | Gestures, springs, layout moves. |
| WebGL | Theme Engine v2 showcase engine and motion layer watchdog. | Shader accents inside the device budget. |
| GSAP | Excluded by the motion layer decision. | None. |

Correction made in research: one secondary source claimed Firefox shipped scroll driven animations in version 133. MDN's Firefox 159 notes show it is enabled by default only from 159.

## 9. Open for the overview step

- Parity bar decided: full parity, tiers set the order.
- Rive and dotLottie for authored animation were not assessed. Assess at the design step.
- Twitch and Discord exist in the platform lists but not the picker. Decide whether they join Media and Community.

## Sources

- Linktree: [Linktree Marketplace, all apps](https://linktr.ee/marketplace/browse), [Linktree help, Links and content](https://linktr.ee/help/en/collections/7058291-links-and-content), [Linktree help, paid plan features](https://linktr.ee/help/en/articles/5434140-an-overview-of-paid-features-available-on-linktree), [Linktree help, prioritize a link](https://linktr.ee/help/en/articles/5434173-how-to-prioritize-a-link), [Linktree blog, four visual features](https://linktr.ee/blog/big-bold-and-visual-four-new-features-that-just-dropped-on-linktree)
- Beacons: [Beacons help, Link in Bio articles](https://help.beacons.ai/en/categories/1086529), [Beacons help, Links Block](https://help.beacons.ai/en/articles/4696577), [Beacons Link in Bio page](https://beacons.ai/i/app-pages/link-in-bio)
- Stan: [Stan help, Webinar product](https://help.stan.store/article/88-webinar-product), [Stan help, pre sell a digital product](https://help.stan.store/article/146-how-to-pre-sell-a-digital-product)
- Taplink: [Taplink guide, content blocks](https://taplink.at/en/guide/content-blocks.html)
- Liinks: [Liinks help, block types](https://liinks.co/help/article/block-types)
- Campsite: [Campsite.bio support, features](https://support.campsite.bio/en/collections/3754649-features)
- hoo.be: [hoo.be blog, link in bio features 2026](https://hoo.be/blog/link-in-bio-tool-features-2026)
- Milkshake: [Milkshake, how it works](https://milkshake.app/how-it-works/)
- Carrd: [How to make a Carrd](https://howtomakea.carrd.co/)
- Fourthwall: [Fourthwall help, page sections](https://help.fourthwall.com/getting-started/design-my-storefront/managing-page-layout-sections)
- Ko-fi: [Ko-fi help, getting started](https://help.ko-fi.com/hc/en-us/articles/360014098514-Getting-started-on-Ko-fi)
- Creator Store (Snipfeed): [Planoly help, Creator Store (Snipfeed redirects here)](https://help.planoly.com/knowledge/what-is-the-creator-store)
- Komi: [ainfluencer, Komi review 2026](https://ainfluencer.com/komi-review/)
- Lnk.Bio: [Lnk.Bio compare page](https://lnk.bio/compare-linkinbio)
- Later: [Later Link in Bio](https://later.com/link-in-bio/)
- Bio Link: [Bio Link home](https://bio.link/)
- Motion and platform: [web.dev, same document view transitions Baseline](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available?hl=en), [MDN, Firefox 159 release notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/159), [WebKit, features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [Motion, GSAP vs Motion](https://motion.dev/docs/gsap-vs-motion), [AlternativeTo, Bento shutting down](https://alternativeto.net/news/2025/12/bento-to-shut-down-in-2026-as-linktree-takes-over-and-offers-migration-path/)
- Amped: [blocks.ts](https://github.com/amplifydigital-web3/amped-bio-new/blob/development/packages/constants/src/blocks.ts), [AddBlockDialog.tsx](https://github.com/amplifydigital-web3/amped-bio-new/blob/development/apps/client/src/components/panels/page/blocks/AddBlockDialog.tsx)
