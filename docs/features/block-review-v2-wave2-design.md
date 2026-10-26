# Block Review v2, wave 2: design spec

Build Board card #54. Date 26 Oct 2026. Baseline development a3ce3330. Builds after Theme Engine v2 and behind SHOW_BLOCKS_V2, on the block kit and the Block settings row from wave 1.

Wave 2 holds the tier 2 parity gaps. Twelve blocks are designed here. Three wave 2 catalog rows are covered elsewhere. YouTube channel and TikTok feeds are the Feed kind of the Media block (MD2, wave 1 part 2). Native video, audio and files belong to the Content system card. Membership tiers belong to the Memberships card.

## Rules that apply to every block

- Creator page surfaces use only the creator's theme (section 17). Editor surfaces use Amped Prism 2.2 Balanced v1.0.
- Motion: CSS, WAAPI and scroll driven animation behind @supports, with an IntersectionObserver fallback. View Transitions for state changes. Motion (MIT) only for gestures. No GSAP. Reduce motion turns every effect into a fade or nothing.
- Targets are at least 44 by 44. Text contrast is at least 4.5 to 1. Large text and icons are at least 3 to 1.
- Third party content loads after consent. Feeds and stores use official APIs, oEmbed or RSS, fetched and cached on the server.
- Copy: no em or en dashes. Short declarative sentences. Prices of goods and services are fine. No token figures, rates or promises about returns.

## Design pages

| Block | Boards | Design page |
|---|---|---|
| Collections and folders | cl1 (row 233), cl2 (row 234) | https://claude.ai/artifact/AjbXULAiATUETC1PzqTdaM |
| Social icon row | so1 (row 235), so2 (row 236) | https://claude.ai/artifact/WCAcgg8fT5MXYx1KZcJ3c8 |
| RSS and latest posts | rs1 (row 237), rs2 (row 238) | https://claude.ai/artifact/EVAfR1WRqJMsWgLEjh1eEs |
| FAQ | fq1 (row 239), fq2 (row 240) | https://claude.ai/artifact/XBENXfxRahZhvTqeagp4A3 |
| Save contact | sc1 (row 241), sc2 (row 242) | https://claude.ai/artifact/L3xcDD3j2JCqJCbYAjFEHv |
| Media kit | mk1 (row 243), mk2 (row 244) | https://claude.ai/artifact/8aypmgCGih3ChebGTF5vq8 |
| Events and tour dates | ev1 (row 245), ev2 (row 246) | https://claude.ai/artifact/2gQDd89oBVaLMzF7o7KkFP |
| Booking and coaching calls | bk1 (row 247), bk2 (row 248) | https://claude.ai/artifact/FAL6qMSSf9CVWPqPKGYBYm |
| Ask me (AI assistant) | ai1 (row 249), ai2 (row 250) | https://claude.ai/artifact/E7fAe6c82Ap2ZVi497qET4 |
| Course | co1 (row 251), co2 (row 252) | https://claude.ai/artifact/Q5piYpvZUJoAhwRGoxmA61 |
| Shop | sh1 (row 253), sh2 (row 254) | https://claude.ai/artifact/P9KzuwmZLo3zRhf1iow8eP |
| Paid requests | rq1 (row 255), rq2 (row 256) | https://claude.ai/artifact/Re4YXkW3pjo63NfP1ox9am |

## Findings in today's code

- Link icons for custom links load from Google's favicon service in the visitor's browser on page open. That sends the visitor's IP to Google before consent. The Social icons block serves icons from Amped.
- The hidden `substack` media type loads Substack's signup frame on page open, before consent. RS4 moves these blocks to Latest posts with a Subscribe on Substack button and no frame.
- Ask me has no LLM SDK in the repo and waits for the AI builder card (#14). Gated and 18+ content is excluded when content is indexed (AI2).
- Paid requests need a new store offer kind `request`. RQ1 recommends the fan signs the USDC payment at request and it submits only when the creator accepts. Amped never holds funds.

## Collections and folders (`collection`), new

**Job.** Group related blocks under one titled row that opens and closes, so a long page stays short and easy to scan.

**Today (development a3ce3330).** No grouping. Blocks render as one flat list in `sortOrder`. Creators fake sections with header text blocks, and long pages push the most used links below the fold.

**Config.** `title` (1 to 40), `icon` (`{source: icon | emoji | none, icon?, emoji?}`), `cover` (imageId, Card layout only), `subtitle` (0 to 60, Card layout only), `layout` (`folder`, `card`), `openOnLoad` (bool, default false), `showCount` (bool, default true), `closeOthers` (bool, default false), `slug` (from the title, unique per page, editable). Children carry `parentId` on the base block row. A block with a `parentId` cannot be a collection. Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.**
- Folder closed: icon, title, count, chevron.
- Folder open: the row grows, children sit in an inner panel.
- Card: cover image with an optional badge, title, one line, chevron.
- Count: counts only children the visitor can see now. Scheduled and expired children are not counted.
- Empty for this visitor: the collection is not rendered.
- Locked (rule on the collection): title, the rule, one next step from the engine hint. Children are not in the HTML until the engine allows.
- Deep link: `#slug` opens the collection and scrolls to it on load.

**Rules.** Children render inside a native `details` element, so they are in the HTML for search and assistive tech, and the page works without script. Rules on a child still apply inside a collection. Attention on a child inside a closed collection plays on the collection row instead.

**Motion.** Height morph on open and close, 377 ms. CSS `interpolate-size: allow-keywords` with `::details-content` where supported, a WAAPI height animation elsewhere. Chevron turns 90 degrees. Children rise in 34 ms apart. Reduced motion and Pause motion: instant.

**Editor.** In the page list, children sit indented under their collection with a guide line. Drag a block onto a collection to move it in. Every block menu gains Move into collection. Configurator: Title with counter, Icon (Icon, Emoji, None, Change), Layout tiles Folder and Card, When the page loads (Closed, Open), Show the count, Close other collections when this opens, Link to this collection with Copy, a help notice, then the Block settings rows. Deleting a collection asks whether to keep its blocks (moved out, the default) or delete them too.

**Decisions.**
- CL1 Nesting. Recommended: one level; a collection holds blocks, not other collections. Why: deep trees hide content and are hard to use on a phone. Alternative: two levels of folders.
- CL2 State on load. Recommended: closed for new collections, with the count; the creator can set Open. Why: a closed folder is what keeps the page short. Alternative: open by default.
- CL3 Content in the page HTML. Recommended: children render in the HTML inside a native details element, even when closed; locked and scheduled children stay out. Why: search engines and screen readers find them, and the page works without script. Alternative: fetch children when the visitor opens the collection.
- CL4 One open at a time. Recommended: off by default, with an option to close others. Why: visitors often compare two groups. Alternative: accordion behavior on every page.
- CL5 Deep link. Recommended: an anchor from the title that opens the collection on load. Why: creators can share one group, for example a sale, from a post. Alternative: no deep link.

**Analytics.** `collection_opened` (block id, source: tap or link), `collection_closed`. Clicks on children carry `collectionId`.

## Social icon row (`social`), new

**Job.** Show every profile the creator keeps in one compact row, so the page leads with what the creator wants clicked.

**Today (development a3ce3330).** No icon row. Each profile is a `link` block with a platform, rendered as a full width CreatorButton with the 21 platform icon (Screen Review 040). Five profiles take five rows above the first link that sells. Custom links load their icon from Google's favicon service in the visitor's browser.

**Config.** `items[]` (1 to 16: `{platform, url}`, platform detected from the URL), `color` (`theme`, `brand`), `shape` (`plain`, `circle`, `square`), `size` (`s`, `m`, `l`), `placement` (`bio`, `list`), `counts` (bool, default false). Singleton: one per page. Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.**
- Under the bio: centered row between the bio and the first block.
- In the list: the row sits where the creator placed it.
- Theme color: every icon in the theme text color on the button surface.
- Brand color: each platform's color, with a fallback to the text color for any icon under 3 to 1 on its background, checked when the theme or style changes.
- Counts: under each icon from a connected account, rounded (860, 3.1K, 12.4K). No count for unconnected accounts or under 10.
- Wrap: more than fit on one line wrap into balanced rows, centered.

**Server.** `social.counts` reads follower counts from accounts the creator connects (Instagram API with Instagram Login, TikTok Display API, YouTube Data API, X API where available), daily, and stores the number only. Disconnect deletes it.

**Motion.** Pop in once on first view: scale from 0.6, 34 ms apart, spring curve, scroll driven where supported with an IntersectionObserver fallback. Hover lift 2 px, press 1 px. Color change crossfades in 233 ms. Reduced motion and Pause motion: static.

**Editor.** Profiles list with platform glyph, URL well, drag handle and Remove. Add a profile. A notice offers to move existing social link buttons into the row (Move N here). Color, Size, Shape and Where it shows chips. Show follower counts with the connected accounts and Connect for the rest. A notice names any brand icon that falls back for contrast. Then the Block settings rows.

**Decisions.**
- SO1 Placement. Recommended: one icon row per page, under the bio by default, or placed in the list. Why: one predictable place to look, and no duplicate profile links. Alternative: any number of icon rows anywhere.
- SO2 Brand colors. Recommended: offer Brand color with a fallback to the text color under 3 to 1. Why: brand marks help recognition, but some fail contrast on some themes. Alternative: theme color only.
- SO3 Follower counts. Recommended: off by default; only from connected accounts through official APIs, daily, rounded, hidden under 10. Why: real numbers from a source we can name, and no small counts that read as weak. Alternative: let the creator type counts.
- SO4 Size and targets. Recommended: three sizes, each icon a 44 by 44 target with an accessible name. Why: small icons are the most common tap misses on link pages. Alternative: free sizing.
- SO5 Existing social link buttons. Recommended: offer one tap to move them into the row; never move them on our own. Why: no page changes without the creator. Alternative: convert social link buttons automatically when the row is added.

**Analytics.** `social_icon_click` (platform, position, color), `social_counts_connected` (platform).

## RSS and latest posts (`feed`), new

**Job.** Show the creator's latest writing from any feed, so the page stays current without edits.

**Today (development a3ce3330).** A hidden `media` platform `substack` (not in Add block) renders `SubstackBlock`: Substack's own signup frame at `{url}/embed`, a fixed 320 high iframe, loaded on page open before any consent. It shows a signup form in Substack's fonts and colors, not posts. No other feed source exists.

**Config.** `url` (feed address, or a site address where the feed is discovered from the page's alternate link), `source` (detected: `substack`, `beehiiv`, `ghost`, `medium`, `wordpress`, `rss`), `title` (0 to 40, defaults to the feed title), `layout` (`list`, `cards`, `compact`), `count` (3, 5, 10), `show` (`{date, excerpt, image, newLabel}`), `subscribe` (bool; opens the source's subscribe page in a new tab). Common settings: `schedule`, `access`, `attention`, `motion`.

**Legacy map.** `media {platform: "substack", content: url, label}` becomes `feed {url: content, source: "substack", title: label, layout: "list", count: 3, show: {date: true, excerpt: true, image: false, newLabel: true}, subscribe: true}`. The iframe is removed. The editor shows a one time notice on the block.

**Public states.**
- List: title, date and read time, two line excerpt, optional New label (posts from the last 7 days).
- Cards: 16:9 image, title, date and read time.
- Compact: titles and dates.
- Subscribe button under the posts, in the creator's button style.
- Loading: skeleton at the final size, shown only after 400 ms.
- Failing feed: the last good copy, with no error to visitors.
- Empty feed: the block is not rendered.

**Server.** `feeds.rss` fetches on save, then hourly with conditional GET (ETag, Last-Modified). SSRF guard (public addresses only, no redirects to private ranges), 5 s timeout, 1 MB cap, RSS 2.0 and Atom. Excerpts are stripped to plain text, 160 characters. Images are copied to the Amped image service at fetch time and served from there. Each block keeps its last good copy. Read time is computed from the post body when the feed includes it, otherwise omitted.

**Motion.** Posts rise in 55 ms apart on view, scroll driven with an IntersectionObserver fallback. Card hover lift 2 px. Show more uses a View Transition. Reduced motion and Pause motion: static.

**Editor.** Feed or site address with a found line (source, feed title, post count). Title with counter. Layout and Posts chips. Show checkboxes: Date and read time, Excerpt, Post image, New label. Subscribe button. A last checked line with Check now. After 24 hours of failed checks, a Fix notice names the error in plain words. Then the Block settings rows.

**Decisions.**
- RS1 Fetch on the server. Recommended: Amped fetches on save and hourly with an SSRF guard, size cap and timeout; the browser never calls the source. Why: fast pages, no third party scripts, and visitors stay private. Alternative: fetch in the browser through a CORS proxy.
- RS2 Post images. Recommended: copy images to the Amped image service at fetch time. Why: visitors' browsers never call the source, and images keep loading if the source blocks hotlinking. Alternative: hotlink the original images.
- RS3 Excerpts. Recommended: plain text, 160 characters, HTML stripped. Why: no foreign markup or scripts on the creator page. Alternative: sanitized HTML excerpts.
- RS4 Substack migration. Recommended: today's hidden Substack embeds become Latest posts blocks with a Subscribe on Substack button, no frame. Why: the frame loads before consent and shows a signup, not posts. Alternative: keep the Substack frame behind a click to load facade.
- RS5 Failing feed. Recommended: visitors see the last good copy; the editor shows Fix after 24 hours of failures. Why: a flaky source should not break the page. Alternative: hide the block while the feed fails.

**Analytics.** `feed_post_open` (block id, position, source), `feed_subscribe_open` (source), `feed_show_more`.

## FAQ (`faq`), new

**Job.** Answer the questions fans ask most, on the page, so they do not have to message the creator.

**Today (development a3ce3330).** Missing. Creators stack Text blocks or link out to a page. The wallet RNS panel (`AboutRns.tsx`) already has a local question list; the block uses the shared accordion instead.

**Config.** `title` (0 to 40), `items[]` (1 to 40: `id`, `q` 1 to 120, `a` sanitized HTML 1 to 600, `slug` from the question, unique on the page), `style` (`card`, `plain`), `openFirst` (bool, default true), `single` (bool, default true), `search` (bool, default true; shows when items over 8), `noMatch` (`{ askBlockId?: string }`). Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.** Card style; plain style; one answer open; search with a live count and the match marked; opened from a link (`#faq-{slug}` scrolls, opens and marks once); no match with Clear search and the optional Ask button that jumps to the chosen block; locked (rule summary and one next step, answers not in the HTML).

**Motion.** Height morph with `interpolate-size` and `::details-content` where supported, View Transition elsewhere. Chevron turns 180 degrees. Search filters with a View Transition. Deep link scrolls smoothly and highlights the question edge once. Reduced motion and Pause motion: instant.

**Editor.** Title with counter. Question list with drag to reorder; one question open for editing with Question, Answer (Bold, Italic, Link), and its link with Copy. Add question. Paste a list parses `Q:` and `A:` lines or alternating lines into questions, with a review before saving. Style chips, Open the first answer, One answer open at a time, Search box, When nothing matches chips listing the creator's Contact form, Email signup or Telegram blocks. Block settings row.

**Server.** Answers pass `sanitizeRichHtml` with the inline allowlist (b, strong, i, em, a). Slugs are unique per page. The first FAQ block on a page adds `FAQPage` JSON-LD with plain text answers; locked FAQ blocks add none.

**Decisions.**
- FQ1 Answer formatting. Recommended: bold, italic and links only, through the Text block sanitizer; no images or embeds. Why: answers stay short and safe, and one sanitizer covers both blocks. Alternative: full rich text with images.
- FQ2 Open state. Recommended: first answer open, one open at a time, both switchable. Why: fans see an answer at once and the block stays short. Alternative: all closed and several open at once.
- FQ3 Deep links. Recommended: a stable link per question from its slug; opening it scrolls, opens and marks once. Why: creators can answer a DM with a link. Alternative: no per question links.
- FQ4 When nothing matches. Recommended: Clear search, plus Ask only when pointed at a block the creator already has. Why: no new inbox to manage and no dead ends. Alternative: a built in question form on the FAQ block.
- FQ5 Search engines. Recommended: closed answers stay in the HTML; the first FAQ block adds FAQPage structured data. Why: search engines and screen readers read every answer. Alternative: render answers only when opened.

**Analytics.** `faq_opened` (block id, question id, source `tap` or `link`), `faq_search` (block id, result count, no query text stored), `faq_ask_tapped`.

## Save contact (`contact`), new

**Job.** Let a fan save the creator as a phone contact in one tap, with only the details the creator chose to share.

**Today (development a3ce3330).** Missing. No vCard or contact block. Creators paste a phone number or email into a Text or Link block. The page owner's account email must never reach a public page (see the fix-email-exposure card), so this block never reads it.

**Config.** `name` (1 to 60, defaults to the page name), `role` (0 to 60), `includePhotoAndLink` (bool, default true), `email` (0 to 120, typed on the block, validated), `phone` (0 to 32, E.164 on save), `website` (0 to 200, https), `location` (0 to 60, city and country), `includeSocials` (bool), `layout` (`card`, `button`), `qr` (bool). Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.** Card with the chosen fields and Save contact; ready (Contact card ready, Download again); button layout; QR sheet (Scan to save, the link as text, Copy link, Close returns focus); locked (name, role, rule summary, one next step; no field values in the HTML); empty fields hide their row.

**Motion.** Press, then the button morphs into the ready card with a View Transition. The check draws once. QR sheet scales from its row. Reduced motion and Pause motion: instant.

**Editor.** Name on the card and Role or line. Fields fans save: Photo and page link checkbox, Email for this card with the helper that the sign in email is never added, Phone, Website, Location (city and country only), Social links checkbox. Layout chips Card and Button. Show QR code. Notice: Anyone who can see this block can download these details. Block settings row.

**Server.** `GET /{handle}/contact.vcf?block={id}` builds a vCard 3.0 with `FN`, `TITLE`, `ORG`, `TEL`, `EMAIL`, `URL`, `ADR` (city and country), `PHOTO` (page avatar URL) and social `URL` entries, from block config only. The handler runs the block's access rule; a locked block returns 403 with the hint. `amped.bio/{handle}/contact` serves the same file for the QR. The handler never reads `user.email`. Rate limited per IP.

**Decisions.**
- SC1 What goes in the file. Recommended: only the fields filled in on the block, plus photo and page link if ticked. Why: the fan gets exactly what the card shows, nothing hidden. Alternative: pull every field from the profile.
- SC2 Email source. Recommended: a typed email on the block only; the account email is never read or added. Why: the sign in email is private, and an exposure fix is already on the board. Alternative: prefill with the account email.
- SC3 Locked contact details. Recommended: Who can open this applies, checked server side; details stay out of the HTML until it opens. Why: a direct line can be a member perk without leaking. Alternative: no lock on this block.
- SC4 QR code. Recommended: optional QR to amped.bio/handle/contact, same card, same rule. Why: fairs and studio days need a scan, not a search. Alternative: no QR.
- SC5 Address detail. Recommended: city and country only. Why: a home or studio street address on a public page is a safety risk. Alternative: a full address field.

**Analytics.** `contact_saved` (block id, source `tap` or `qr`), `contact_qr_opened`, `contact_locked_viewed`.

## Media kit (`mediakit`), new

**Job.** Give a brand what it needs to book the creator: real audience figures, rates and past work, on the page and as a PDF.

**Today (development a3ce3330).** Missing. The creator's Analytics panel already has the data (`apps/server/src/services/analytics/queries.ts`: `getSummary`, `getBreakdown` by country, `getAudienceSummary`), but nothing can show it on the page. Creators paste screenshots or link out to a PDF.

**Config.** `title` (1 to 40), `eyebrow` (0 to 24), `intro` (0 to 160), `figures` (`visitors`, `followers`, `clicks`, `countries`, each bool), `accounts[]` (connected `instagram`, `tiktok`, `youtube` ids, follower count only), `period` (`30d`, `90d`), `rates[]` (0 to 8: `name` 1 to 40, `line` 0 to 60, `usd` integer 0 to 100000), `brands[]` (0 to 12, 1 to 32 each), `ask` (`{ blockId }` of a Contact form, Email signup or Booking block, or `mailto` of the block's typed email), `pdf` (bool). Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.** Summary (up to 4 figures with source, period and update date, Download media kit, open control); open (top 3 countries as share of visits, past work, rates, Ask about a project); new page (figures hidden under 10, a short line, rates and past work still shown); account disconnected (that figure drops; nothing to visitors, Fix chip in the preview); locked (title, rule summary, one next step; no figures in the HTML).

**Motion.** Count up once on first view (WAAPI on a number, `requestAnimationFrame` fallback). Country bars grow on view with scroll driven animation behind `@supports`, IntersectionObserver fallback. Open and close with a View Transition. Reduced motion and Pause motion: final values at once.

**Editor.** Title, Eyebrow, Intro. Figures checkboxes with today's value as helper text and the line that they update daily and cannot be edited. Connected accounts with Disconnect and Connect TikTok or YouTube. Period chips. Rates list with name and USD price, Add a rate, helper Prices in USD. Past work chips with Add and the helper Only list brands you worked with. Ask about a project opens chips. Download as PDF. Block settings row.

**Server.** `mediakit.figures(userId, period)` reads `getSummary` and `getBreakdown(country)` and drops any value under 10, cached hourly. Connected accounts use official APIs (Instagram API with Instagram Login, TikTok Display API, YouTube Data API), store the follower count and fetch date only, refresh daily, delete on disconnect. The PDF renders server side once a day per block and on save, carries the date on every page, and is served at `/{handle}/media-kit.pdf` under the block's access rule.

**Decisions.**
- MK1 Where figures come from. Recommended: Amped analytics and connected accounts only, each with source, period and date. Why: brands trust figures they cannot be told were typed in, and a typed number would be an unverified claim. Alternative: let creators type their own figures.
- MK2 Connected accounts. Recommended: official APIs, follower count only, daily refresh, removed on disconnect. Why: stable, allowed, and stores the least data. Alternative: scrape public profiles.
- MK3 Small numbers. Recommended: hide any count under 10 and any country under 10 visits. Why: small counts can identify visitors and read as weak. Alternative: always show every figure.
- MK4 Rates. Recommended: optional USD service prices, with the line that final terms are agreed by email. Why: brands ask for rates first, and the line keeps it an invitation, not an offer. Alternative: no rates on the page.
- MK5 PDF. Recommended: rebuilt daily from the same figures, dated on every page, under the block's rule. Why: a PDF gets forwarded, so its figures must carry their date. Alternative: a static PDF the creator uploads.

**Analytics.** `mediakit_viewed`, `mediakit_opened`, `mediakit_pdf_downloaded`, `mediakit_ask_tapped`, each with block id.

## Events and tour dates (`events`)

**Job.** Show a visitor where and when to see the creator next, with honest status and one way to get a ticket.

**Today (development a3ce3330).** Missing. No events type in `packages/constants/src/blocks.ts` and no Bandsintown or Seated platform. Creators add a link block that leaves the page.

**Config.** `title` (1 to 40), `source` (`bandsintown`, `seated`, `manual`), `artistId` (connected source), `layout` (`list`, `next`), `count` (3, 5, 10), `ticketLabel` (1 to 24, default Tickets), `showUnavailable` (bool, default true), `showPast` (bool), `hidden[]` (event ids the creator hid), `manual[]` (`{startsAt, tz, city, venue, url, status: onsale | few | soldout | cancelled}`). Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.** List (date chip, city and venue, local time, Tickets); Few left line; Sold out and Cancelled with status and no button; Next show (featured date, Get tickets, See all); date sheet (venue time, visitor time when different, address, support act, Get tickets, Add to calendar, Share, seller line); no upcoming dates (plain line and Follow); past shows folded; source disconnected (renders nothing to visitors, Fix chip in the preview).

**Motion.** Date chips flip in on first view, 89 ms apart. A date opens in place or in a sheet with a View Transition. Reduce motion and Pause motion show everything at once.

**Editor.** Title, source chips, sync line with Change, synced dates with status and a hide toggle, layout and count chips, ticket label, Show sold out and cancelled, Show past shows, Block settings rows. Manual source shows Add date with date, time, time zone, city, venue, ticket link and status.

**Server.** `events.sync` reads Bandsintown and Seated artist events every 6 hours and on save, stores id, start, time zone, venue, city, status and ticket URL only. `events.ics` builds a calendar file per event. Ticket URLs pass the link safety check used by link blocks.

**Decisions.**
- EV1 Sources. Recommended: Bandsintown and Seated official artist APIs, refreshed every 6 hours, plus manual dates. Why: official data stays accurate and allowed. Alternative: scrape ticket sites.
- EV2 Sold out and cancelled. Recommended: shown with status and no ticket button; the creator can hide any date. Why: fans trust a list that tells the truth. Alternative: hide them automatically.
- EV3 Time zone. Recommended: venue local time, plus the visitor's time in the sheet when they differ. Why: tickets and posters use venue time; travelling fans need their own. Alternative: visitor time only.
- EV4 Ticket links. Recommended: open the seller's page in a new tab with the seller named; Amped does not sell, mark up or resell tickets. Why: no payment or ticketing liability on Amped. Alternative: in page checkout through a partner.
- EV5 Calendar. Recommended: server built .ics download. Why: works on every device without an account connect. Alternative: Google Calendar connect.

**Analytics.** `events_viewed`, `event_opened`, `event_ticket_clicked` (seller), `event_calendar_added`, each with block id and event id.

## Booking and coaching calls (`booking`)

**Job.** Let a visitor pick a session with the creator and book a time, without leaving the page and without loading a scheduler they did not ask for.

**Today (development a3ce3330).** Missing. No booking type and no Cal.com or Calendly platform in `packages/constants`. Creators add a link block that opens the provider in a new tab. The Embed block (wave 1, EM2) can show a Cal.com scheduler but has no session list.

**Config.** `title` (1 to 40), `eyebrow` (0 to 24), `provider` (`calcom`, `calendly`, detected from `url`), `url` (booking page), `sessions[]` (max 8: `{eventUrl, name 1 to 40, minutes, paid: bool, icon}`), `layout` (`sessions`, `button`), `open` (`page`, `tab`). Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.** Sessions list; One button; sheet before consent (session, Load {provider} to pick a time, cookie and payment line); loading skeleton at the frame height; provider scheduler loaded; locked (sessions and the rule, no booking link in the HTML); provider link broken (renders nothing to visitors, Fix chip in the preview).

**Motion.** Sheet or pane opens with a View Transition from the Book button; focus moves to Load and returns to Book on close. Provider frame fades in. Reduce motion and Pause motion: instant.

**Editor.** Title, eyebrow, booking page well with the provider chip, sessions list with Import from Cal.com, drag order and edit, layout and Book opens chips, Coming with the store note, Block settings rows.

**Server.** `booking.import` reads Cal.com public event types (name, length, paid flag) on save. Calendly import needs the creator's Calendly connect and ships after Cal.com. The scheduler URL passes the embed allowlist.

**Decisions.**
- BK1 Consent before the scheduler. Recommended: providers load only after Load or Allow embedded content. Why: schedulers set cookies and load heavy scripts. Alternative: load on view.
- BK2 Providers. Recommended: Cal.com and Calendly first; names and lengths from public event types. Why: the two creators use most; public data needs no account connect for Cal.com. Alternative: any scheduler URL.
- BK3 Prices. Recommended: show Free or Paid on the provider; no price copied into Amped. Why: a copied price goes stale and implies Amped takes the payment. Alternative: creator types a price.
- BK4 Native paid sessions. Recommended: later with the store and memberships cards, USDC checkout, bookings in People. Why: payments need the store's refunds and records first. Alternative: build a scheduler now.
- BK5 Members only booking. Recommended: through Who can open this; the booking link stays on the server until the rule passes. Why: coaching for members is a common perk. Alternative: no gating on booking.

**Analytics.** `booking_viewed`, `booking_session_opened` (session), `booking_provider_loaded` (provider), each with block id. Completed bookings are not tracked until the native flow.

## Ask me, AI assistant on the page (`ask`)

**Job.** Answer a visitor's quick question from what the creator already shows, and route anything else to the creator.

**Today (development a3ce3330).** Missing. No assistant block, and no LLM SDK in the repo (Build Board #14 AI builder notes). This block depends on #14 for the model, prompt and safety layer.

**Config.** `title` (1 to 40), `hint` (0 to 40), `starters[]` (max 4, 1 to 40 each), `sources` (`{publicBlocks: true, answers: true, libraryPublic: bool}`), `fallback` (`telegram`, `email`, `none`), `dailyLimit` (5, 10, 20). Server side: `answers[]` written by the creator (`{question, answer}`). Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.** Closed (label, intro, starters, field, disclosure); typing; answer with sources and a link to the named block; rule named for gated or 18+ items; not on the page with the fallback; daily limit reached; turned off (renders nothing); service down (Ask me is resting, plus the fallback).

**Motion.** Question rises in, typing dots, answer fades in. Source chips scroll to the block. Reduce motion and Pause motion: answer appears at once.

**Editor.** Dependency note, title, field hint, starter questions, Answers can use checkboxes with the never used line, When it does not know chips, Questions per visitor a day chips, Block settings rows. People gains a Questions tab: filter chips, question, answer, result, date, Edit or Write answer, Turn off Ask me.

**Server.** `ask.answer` builds context only from public blocks, bio, creator answers and opted in public library metadata; gated, paid and 18+ items are excluded at index time, not by the prompt. Answers are capped at 80 words. Per visitor limit by a rotating anonymous token; a page wide daily cap; abuse filter on input and output. Stores question, answer, sources and result for 90 days with no identity.

**Decisions.**
- AI1 Label and disclosure. Recommended: AI answers label and the can be wrong line, always on. Why: visitors must know they are not talking to the creator. Alternative: creator chooses whether to label.
- AI2 Sources. Recommended: public content and creator answers only; gated and 18+ excluded at index time for everyone. Why: a model must never be the thing that leaks paid or adult content. Alternative: answer from gated content for visitors who pass the rule.
- AI3 Creator review. Recommended: Questions tab with written answers that win and one tap off. Why: the creator stays responsible for what the page says. Alternative: no log.
- AI4 Limits. Recommended: 10 a day per visitor by default, page cap, 80 word answers. Why: controls cost and abuse. Alternative: unlimited with a captcha.
- AI5 Privacy. Recommended: 90 days, no name, email, account or IP, no question text in analytics. Why: questions can be personal. Alternative: tie questions to signed in fans.

**Analytics.** `ask_opened`, `ask_question` (counts only), `ask_answered` (result: answered, rule, unknown, limit), `ask_source_clicked`, `ask_fallback_clicked`, each with block id.

## Course (`course`), new

**Job.** Sell a set of lessons as one course, with one free lesson that shows what the fan will get.

**Today (development a3ce3330).** Missing. No course block type in `packages/constants/src/blocks.ts`. The content library panel exists (`apps/client/src/components/panels/content`), and the store spec (#20) defines bundles over library items, but nothing presents a bundle as numbered lessons on the page.

**Config.** `offerId` (a store bundle with `showAsCourse: true`), `layout` (`card`, `compact`), `previewItemId` (one video or audio item in the bundle, or null), `lessonsShown` (3, 5, `all`), `buttonLabel` (1 to 24, default Buy course; the price is appended), `showLength` (bool, default true), `membersContinue` (bool, default true when the bundle is in the membership). Common settings: `schedule`, `attention`, `motion`. `access` is read only and comes from the product.

**Store change.** Product editor gains `showAsCourse` on bundles: items are numbered as lessons in the stored order. Store refund lines gain `within_7_days_2_lessons` for course bundles.

**Public states.** Visitor card (cover, Course tag, total length, lessons count, kinds, access period, first lessons with the free one marked, the rest locked, Buy course with price); free lesson playing in place (shared player, chapter aware); pay sheet (Paying @handle, item, price, Includes the Amped.Bio fee of 5%, refund rule, required checkbox, Pay, wallet note, Powered by Amped.Bio); short balance (Your wallet needs N USDC more, Add USDC links to Wallet); owned or member (progress bar, last done, Up next, Continue lesson N, In your Library); bundle archived or paused (renders nothing to visitors, Fix chip in the preview).

**Rules.** Locked lessons ship title and length only. No media reference in the page HTML until `checkAccessBatch` passes. Progress is private to the fan.

**Motion.** Lessons stagger in, 55 ms apart. Progress runs with WAAPI. Buy to pay sheet uses a View Transition and moves focus. Owned state counts the progress bar up once on first view. Everything off under reduced motion and Pause motion.

**Editor.** Course picker (bundles with Show as a course), Edit in Store link, layout chips, free preview lesson select, lessons shown chips, button label, total length and members checkboxes, refund notice from the store, Block settings rows.

**Server.** `store.listForBio` returns the course payload: offer, lessons (id, title, kind, length), preview item, total length, viewer access and progress when signed in. `content.progress.set` stores per fan per item position.

**Decisions.**
- CO1 Where a course lives. Recommended: a store bundle with Show as a course on; the block only displays it. Why: one product, one price, one refund flow, and the same item can sit in the membership. Alternative: a separate course object with its own pricing.
- CO2 Free preview lesson. Recommended: one lesson plays for everyone in place with the shared player. Why: a real lesson sells better than a trailer and needs no extra upload. Alternative: a separate trailer clip.
- CO3 Checkout. Recommended: the existing store pay sheet with the fee line, refund rule and checkbox. Why: one compliant checkout to maintain. Alternative: a course specific checkout.
- CO4 Progress. Recommended: stored per fan and shown only to that fan. Why: progress is personal data, and nothing on a public page should reveal who bought. Alternative: show completion counts on the card.
- CO5 Course refund line. Recommended: add within 7 days if 2 lessons or fewer are opened. Why: fair to buyers and stops a full course being watched then refunded. Alternative: only the existing store refund lines.

**Analytics.** `course_viewed`, `course_preview_played`, `course_buy_tapped`, `course_continue_tapped`, each with block id and offer id. Purchases come from the store events.

## Shop (`shop`), new

**Job.** Put the creator's merch from Shopify, Fourthwall or Spring on the page with live prices and stock, and send buyers to that store's checkout.

**Today (development a3ce3330).** Missing. No shop block type and no store connection. Creators paste single product links as link blocks.

**Config.** `title` (1 to 40), `connectionId` (a connected store), `source` (`newest`, `picked`, `collection`), `productIds[]` (max 24, when picked), `collectionId` (when collection), `layout` (`grid`, `carousel`, `list`, `featured`), `soldOut` (`show`, `hide`), `tap` (`quicklook`, `store`), `partner` (bool: this is not my store; adds the Affiliate label). Common settings: `schedule`, `access`, `attention`, `motion`.

**Server.** `stores.connect` runs OAuth with read only product scope (Shopify Admin API `read_products`, Fourthwall and Spring product APIs). `stores.sync` caches title, images, price, compare at price, currency, variants and stock hourly and on Refresh; webhooks update stock when the platform offers them. Disconnect deletes the cache. Amped never reads orders, buyers or payouts.

**Public states.** Grid (header with store name, 2 columns, New and Sale badges as the store sets them, Shop all N); carousel; list (rows with a 44 Buy icon button); featured (one product, image, description, price and compare at price); quick look (image, price, sizes from variants with sold out sizes disabled, Buy on {store}); sold out (grey image and label, no Buy); partner store (Affiliate on each product and the commission line); store disconnected or sync failed for 24 hours (renders nothing to visitors, Fix chip in the preview).

**Rules.** Prices show as the store reports them, with Prices in {currency} or Price updated {time}. No price is typed by hand in this block. Buy links carry `utm_source=amped`. Partner stores always show Affiliate.

**Motion.** Cards rise in, 55 ms apart. Hover lift 2 px, press 0.97. Quick look grows from the tapped image with a View Transition; Back returns focus to the card. Carousel uses CSS scroll snap. Reduce motion: no stagger, no lift, instant swap.

**Editor.** Title, store row with sync time and Refresh, source chips, picked product list with drag order and remove, Add products, layout chips, sold out and tap chips, This is not my store checkbox, Block settings rows. Account, Connected stores lists each platform with Connect or Disconnect.

**Decisions.**
- SH1 Product data. Recommended: official APIs with read only product scope, cached and refreshed hourly, plus Refresh. Why: accurate stock and price without slowing the page or breaking store terms. Alternative: scrape the public store pages.
- SH2 Checkout. Recommended: Buy opens the merchant checkout; Amped takes no orders for third party stores. Why: fulfilment, tax and refunds stay with the store that ships. Alternative: an embedded cart on Amped.
- SH3 Sold out. Recommended: show with a Sold out label by default; the creator can hide them. Why: fans see the range and come back. Alternative: hide sold out items always.
- SH4 Partner stores. Recommended: Affiliate label on every product and the commission line when the store is not the creator's. Why: same FTC rule as Affiliate picks. Alternative: a single disclosure line on the block.
- SH5 Stores at launch. Recommended: Shopify, Fourthwall and Spring. Why: they cover most creator merch and have public product APIs. Alternative: add Etsy and Printful at launch.

**Analytics.** `shop_viewed`, `shop_quicklook_opened`, `shop_buy_tapped` (product id, store), `shop_all_tapped`, each with block id. Sales are not tracked by Amped.

## Paid requests (`requests`), new

**Job.** Let fans pay for something made for them, a shoutout, a review or a commission, with clear price, timing and refund terms before they commit.

**Today (development a3ce3330).** Missing. No request block, no request queue and no offer kind for requests.

**Config.** `title` (1 to 40), `types[]` (max 6), each: `name` (1 to 40), `line` (0 to 40), `icon`, `amountUnits` (USDC), `deliverDays` (1 to 60), `slotsPerMonth` (1 to 100), `answerWithinHours` (24, 48, 72), `questions[]` (max 5: `label` 1 to 60, `kind` text or photo, `required`). Common settings: `schedule`, `access`, `attention`, `motion`.

**Store change.** New offer kind `request` (never listed in the storefront). New `Request` row: offer, fan, brief answers, status (`sent`, `accepted`, `declined`, `expired`, `delivered`, `refunded`), signed authorization, due date, delivery item id.

**Payment flow.** The fan signs an EIP-3009 `receiveWithAuthorization` for the total with `validBefore` set past the answer window. Nothing moves at request. Accept submits the payment through the relayer with the store split (5% fee). If the fan's balance is short at accept, the fan has 24 hours to add USDC, then the request expires. Decline or no answer lets the authorization lapse. Amped never holds the fan's funds. Not delivered by the due date triggers a refund from the creator's wallet through the #25 refund flow.

**Public states.** Menu (types with price, delivery and open slots, slots bar, Request a {type}, You pay only if Mara accepts); brief (the creator's questions, counters, optional photo); review (price, fee line, answer window, charged only on accept, refund rule, required checkbox, Send request); status (sent, accepted with due date, in progress, delivered to Library); full type (Full this month, opens date, Remind me for signed in fans); declined or expired (Not charged); paused block (renders nothing).

**Motion.** Slots bar fills on view: scroll driven behind @supports, IntersectionObserver fallback. Selected type ring transitions 233 ms. Status steps tick in order. View Transition between menu, brief and review. Reduce motion: no fill, instant steps.

**Editor.** Title, request type list with drag order, one type open with price and fee helper, deliver within, slots, answer window, brief questions with required chips, locked refund rule, Block settings. Store, Requests: New, In progress, Done tabs; each row shows fan name and handle, type, price, answer by time and the brief, with Decline and Accept; delivery upload goes to the fan's Library.

**Decisions.**
- RQ1 When the fan pays. Recommended: the fan signs at request; the payment is submitted only on accept. Why: no refunds for declines, and Amped never holds funds. Alternative: charge at request and refund on decline.
- RQ2 Slots. Recommended: per type per calendar month; full types stay visible with the open date. Why: protects the creator's time and keeps demand visible. Alternative: unlimited with a queue.
- RQ3 Late delivery refund. Recommended: automatic full refund after the due date, shown before signing, cannot be turned off. Why: fans pay before the work exists, so the rule must be firm. Alternative: refund at the creator's discretion.
- RQ4 What can be requested. Recommended: the creator's own type names, acceptable use on every brief, no 18+ requests. Why: briefs are user content and need the same moderation as messages. Alternative: allow 18+ types behind the age check.
- RQ5 Delivery. Recommended: upload in Store, Requests; the result lands in the fan's Library. Why: reuses the content system, the gateway and access checks. Alternative: deliver by email link.

**Analytics.** `requests_viewed`, `request_type_selected`, `request_sent`, `request_accepted`, `request_declined`, `request_expired`, `request_delivered`, `request_refunded`, each with block id and type.
