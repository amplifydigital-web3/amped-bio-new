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

**Today (development a3ce3330).** No grouping. Blocks render as one flat list in `order` (`blocks.order`, an Int). The Prisma `Block` model has no parent column. `editBlocks` writes `order` from the array index, one row at a time with no transaction, and can create rows; the singleton check runs only in `addBlock`. Creators fake sections with header text blocks, and long pages push the most used links below the fold.

**Config.** `title` (1 to 40, plain text), `icon` (`{source: icon | emoji | none, icon?, emoji?}`), `cover` (imageId in the Amped image service, Card layout only), `subtitle` (0 to 60, Card layout only), `badge` (0 to 20, Card layout only, shown on the cover), `layout` (`folder`, `card`), `openOnLoad` (bool, default false), `showCount` (bool, default true), `closeOthers` (bool, default false), `slug` (from the title, lowercase a to z, 0 to 9 and hyphens, 1 to 40, unique per page, editable; a clash gains -2, -3). `collection` joins `BaseBlockType`, `CONFIG_SCHEMAS` and `anyBlockConfigSchema`, and its schema extends `blockSettingsSchema`. The collection stores no URL. Common settings: `schedule`, `access`, `attention`, `motion`.

**Parent and order.** A migration adds `parent_id Int?` to `blocks`, a foreign key to `blocks.id` with ON DELETE SET NULL, and an index on (`user_id`, `parent_id`, `order`). `editBlocks` and `addBlock` take `parentId` per row and check, inside one transaction: the parent is a `collection` row of the same user; the parent has no `parentId` (one level, CL1); a `collection` never has a `parentId`; `social`, `follow` and `followers` never have a `parentId` (they are page level, and the capsule Follow rule must see them on screen). A refused batch saves nothing and reads "Collections hold blocks, not other collections" or "This block stays on the page, not in a collection". The singleton check moves into the same transaction for both paths. Top level blocks sort by `order`; children sort by `order` inside their parent and render inside it. Moving a collection moves its children with it. Move out places the block right after its collection. Deleting a collection with Keep its blocks (default) sets their `parent_id` to null and places them where the collection was, in their order; Delete them too deletes the children in the same transaction. A hidden collection hides its children. The page block limit counts children; a collection has no limit of its own.

**Public states.**
- Folder closed: icon, title, count, chevron.
- Folder open: the row grows, children sit in an inner panel.
- Card: cover image with an optional badge, title, one line, chevron.
- Count: counts only children the visitor can see now. Scheduled and expired children are not counted.
- Empty for this visitor: the collection is not rendered.
- Locked (rule on the collection): title, the rule summary, one next step from the engine hint (Follow to open, View pool, Sign in). Only kinds the engine has live apply (`LIVE_ACCESS_RULE_KINDS`); Members and Paid stay disabled as Block settings says. The server sends the locked DTO `{ id, type, order, gated: true, gate: { kind, summary }, config: { title, icon, layout } }`: no count, cover, subtitle, badge, child id or child label. Children are not in the HTML until the engine allows.
- Scheduled or expired collection: absent with all its children, as Block settings says. A scheduled child is absent and not counted; with `showCountdown` it shows its countdown row inside the open collection.
- 18+ child: never in the HTML for a viewer without a passed Over 18 check, and not counted. It joins the page's one Adult items card, not a locked row inside the collection.
- Deep link to a slug that is absent, scheduled or empty for this viewer: the page opens at the top with no error. A deep link to a locked collection scrolls to its locked row.
- Deep link: `#slug` opens the collection and scrolls to it on load.

**Rules.** Children render inside a native `details` element, so they are in the HTML for search and assistive tech, and the page works without script. The server applies the Block settings server rule to each child for the viewer first, then the collection's own rule to the whole group. The count is computed on the server from the children left. Rules on a child still apply inside a collection. Attention on a child inside a closed collection plays on the collection row instead; the one attention block per page rule is unchanged. The collection title follows the heading rule (h3 after a section header, h2 before the first one) and sits inside the `summary`. `openOnLoad` renders the `open` attribute in the server HTML. `closeOthers` needs script; without it each collection opens on its own.

**Motion.** Height morph on open and close, 377 ms. CSS `interpolate-size: allow-keywords` with `::details-content` where supported, a WAAPI height animation elsewhere. A tap during the morph is ignored until it ends. Chevron turns 90 degrees. Children rise in 34 ms apart. Reduced motion and Pause motion: instant. The Block settings Motion row reads the shared value (Entrance on, Rise, Fade, Scale or Off) for the collection row's entrance. The open and close morph is the block's own motion and is named in the Motion helper, not as the row value.

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

**Today (development a3ce3330).** No icon row. Each profile is a `link` block with a platform from `allowedPlatforms` (24 values, `onlyfans`, `email` and `custom` among them), rendered as a full width CreatorButton with a 21 px platform icon (Screen Review 040). Five profiles take five rows above the first link that sells. Custom links load their icon from `https://www.google.com/s2/favicons` in the visitor's browser (`LinkIcon` in ProfileView), and the editor Preview and BlockRow do the same. That sends the visitor's IP to Google before consent.

**Config.** `items[]` (1 to 16: `{platform, url}`, platform detected from the URL), `color` (`theme`, `brand`), `shape` (`plain`, `circle`, `square`), `size` (`s`, `m`, `l`), `placement` (`bio`, `list`), `counts` (bool, default false). `url` follows the D57 rule: https, or mailto for `email`, checked on every save path; render refuses any other scheme. `platform` is a new `socialPlatforms` list with one Amped glyph and one brand color each, plus `other`. Adult platforms (`onlyfans` and the like) are refused in the row with "Add this as a link marked 18+", because the row has no per item rule and is always in the page HTML. A link to the creator's own Amped page is refused with "Your Amped page is already here". Singleton: one per page. `social` joins `BaseBlockType`, `CONFIG_SCHEMAS`, `anyBlockConfigSchema` and `SINGLETON_BLOCK_TYPES`, its schema extends `blockSettingsSchema`, and the singleton check runs in `addBlock` and `editBlocks` alike (today `editBlocks` can create a row without it). Common settings: `schedule`, `access`, `attention`, `motion`.

**Icons.** Every glyph is an SVG bundled with Amped and served from Amped. The page HTML holds no third party icon address and the visitor's browser calls no third party for an icon. `other` shows the generic link glyph. A favicon for `other`, if shown, is fetched on save by the LK1 guarded fetch (`services/import/fetchPage.ts`, built with the Link block; it is not in the code at a3ce3330), re-encoded and stored by Amped, as the Link block spec says for custom link favicons.

**Public states.**
- Under the bio: centered row between the bio and the first block.
- In the list: the row sits where the creator placed it.
- Theme color: every icon in the theme text color on the button surface.
- Brand color: each platform's color, with a fallback to the text color for any icon under 3 to 1 on its background, checked when the theme or style changes.
- Counts: under each icon from a connected account, rounded (860, 3.1K, 12.4K, 1.2M). No count for unconnected accounts, platforms with no count API (Spotify, LinkedIn) or under 10. The count is part of the icon's accessible name ("Instagram, 12.4K followers") and the visible number is hidden from assistive tech. These are platform follower numbers. The row never shows the Amped follower count.
- Wrap: more than fit on one line wrap into balanced rows, centered. Rows = ceil(n / what fits); each row holds ceil(n / rows), the last row fewer. Ten icons that fit six to a line wrap as five and five.
- Names: each icon is a link named by the platform, opens in the same tab, 44 by 44 at every size.
- Not a Follow surface: the row carries no Amped Follow, does not count in `blockCarriesFollow`, and leaves the capsule and the one Follow on screen rule (FO2, wave 1 part 2) unchanged.

**Server.** `social.counts` reads follower counts from accounts the creator connects (Instagram API with Instagram Login, TikTok Display API, YouTube Data API, X API where available), daily, and stores the number only. Tokens are stored encrypted and used for nothing else. Disconnect deletes the token and the number; account deletion does the same. A failed read keeps the last number for 7 days, then hides it.

**Motion.** Pop in once on first view: scale from 0.6, 34 ms apart, spring curve, scroll driven where supported with an IntersectionObserver fallback. Hover lift 2 px, press 1 px. Color change crossfades in 233 ms. Reduced motion and Pause motion: static. The pop in is the block's entrance: the Block settings Motion row reads Entrance on or Off, and the pop is named in the Motion helper, not as the row value. Entrance off turns the pop off.

**Editor.** Profiles list with platform glyph, URL well, drag handle and Remove. Add a profile. A URL with another scheme shows "Use a web or email link". A notice offers to move existing social link buttons into the row (Move N here). Move here takes only link blocks with a social platform and no schedule, no rule, no 18+ and no attention; the notice names the others as staying where they are. Moved links leave the page list in the same save. Color, Size, Shape and Where it shows chips. Show follower counts with the connected accounts, Connect for platforms that offer a count, and a line naming platforms that offer none. A notice names any brand icon that falls back for contrast. Then the Block settings rows.

**Decisions.**
- SO1 Placement. Recommended: one icon row per page, under the bio by default, or placed in the list. Why: one predictable place to look, and no duplicate profile links. Alternative: any number of icon rows anywhere.
- SO2 Brand colors. Recommended: offer Brand color with a fallback to the text color under 3 to 1. Why: brand marks help recognition, but some fail contrast on some themes. Alternative: theme color only.
- SO3 Follower counts. Recommended: off by default; only from connected accounts through official APIs, daily, rounded, hidden under 10. Why: real numbers from a source we can name, and no small counts that read as weak. Alternative: let the creator type counts.
- SO4 Size and targets. Recommended: three sizes, each icon a 44 by 44 target with an accessible name. Why: small icons are the most common tap misses on link pages. Alternative: free sizing.
- SO5 Existing social link buttons. Recommended: offer one tap to move them into the row; never move them on our own. Why: no page changes without the creator. Alternative: convert social link buttons automatically when the row is added.

**Analytics.** `social_icon_click` (platform, position, color), `social_counts_connected` (platform).

## RSS and latest posts (`feed`), new

**Job.** Show the creator's latest writing from any feed, so the page stays current without edits.

**Today (development a3ce3330).** A hidden `media` platform `substack` (not in Add block) renders `SubstackBlock`: Substack's own signup frame at `{content}/embed`, a fixed 320 high iframe, loaded on page open before any consent. The page renders it only when `content` starts with `https://`; the editor preview (apps/client `SubstackBlock`) loads the same frame with no scheme check. `mediaConfigSchema` is `{platform, url (required), label, content?, hidden?}`. It shows a signup form in Substack's fonts and colors, not posts. No other feed source exists, and no guarded server fetch exists yet (`services/import/fetchPage.ts` is planned with the Link block, LK1).

**Config.** `url` (feed address, or a site address where the feed is discovered from the page's alternate link; https only under the D57 rule, checked on every save path), `source` (detected: `substack`, `beehiiv`, `ghost`, `medium`, `wordpress`, `rss`), `title` (0 to 40, defaults to the feed title), `layout` (`list`, `cards`, `compact`), `count` (3, 5, 10), `show` (`{date, excerpt, image, newLabel}`), `subscribe` (bool; opens the source's subscribe page in a new tab). The subscribe address is built by Amped from the source and the feed's site (Substack and beehiiv `{site}/subscribe`, Ghost `{site}/#/portal/signup`, others the site home), https only; the creator does not type it. `feed` joins `BaseBlockType`, `CONFIG_SCHEMAS` and `anyBlockConfigSchema`, and its schema extends `blockSettingsSchema`. Common settings: `schedule`, `access`, `attention`, `motion`.

**Legacy map.** `media {platform: "substack", content, url, label, hidden}` becomes `feed {url: content if it starts with https, else url if it starts with https, source: "substack", title: label, layout: "list", count: 3, show: {date: true, excerpt: true, image: false, newLabel: true}, subscribe: true, hidden}`. The row keeps its `id`, `order` and `clicks`; only `type` and `config` change. A row with neither https address becomes a `feed` with an empty `url` that renders nothing to visitors (as today) and shows Fix in the editor. The migration is one idempotent script that runs before the first feed fetch; after it, `substack` leaves `mediaPlataforms` and the frame is removed from both the page and the editor preview. The editor shows a one time notice on the block.

**Public states.**
- List: title, date and read time, two line excerpt, optional New label (posts from the last 7 days).
- Cards: 16:9 image, title, date and read time.
- Compact: titles and dates.
- Subscribe button under the posts, in the creator's button style.
- Loading: skeleton at the final size, shown only after 400 ms. Posts are server rendered from the cache, so a visitor sees loading only in the editor preview right after save.
- Failing feed: the last good copy, with no error to visitors.
- Empty feed: the block is not rendered.
- Show more: shows when the cache holds more posts than `count`; it reveals the rest, up to 10, in place. The extra posts are in the HTML with the `hidden` attribute. The button has `aria-expanded` and reads Show less when open.
- Title: the block title follows the heading rule (h3 after a section header, h2 before the first one) and names the section. Post titles are links.
- Subscribe opens in a new tab and its name says so ("Subscribe on Substack, opens in a new tab").
- Post links: each post links straight to its address with `rel="noopener noreferrer"`. A post whose link is not http or https is dropped (D57 render rule).

**Server.** `feeds.rss` fetches on save, then hourly with conditional GET (ETag, Last-Modified). Every fetch, feed discovery and image goes through the LK1 guarded fetch (`services/import/fetchPage.ts`), the same one the Link block and the AI builder (#14) use: https only on port 443, every resolved address checked against private, loopback, link local, carrier grade NAT, multicast and metadata ranges before connect and after each of up to 3 redirects, 5 s timeout, no cookies. Feed body cap 1 MB, content type XML, RSS 2.0 and Atom, parsed with entity expansion off. Images follow the LK1 image rules: 5 MB, sniffed as PNG, JPEG, WebP or GIF, never SVG, re-encoded to WebP without metadata and served by Amped. Titles are plain text, cut to 120. Excerpts are stripped to plain text, 160 characters. Each feed URL is fetched once per hour however many blocks use it, with jitter; after a failure it backs off up to 6 hours. Each block keeps its last good copy. Read time is computed from the post body when the feed includes it, otherwise omitted. The New label is computed by the server at render from the post date.

**Motion.** Posts rise in 55 ms apart on view, scroll driven with an IntersectionObserver fallback. Card hover lift 2 px. Show more uses a View Transition. Reduced motion and Pause motion: static. The rise is the block's entrance: the Block settings Motion row reads Entrance on or Off, and the stagger is named in the Motion helper, not as the row value.

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

**Config.** `title` (0 to 40), `items[]` (1 to 40: `id`, `q` 1 to 120, `a` sanitized HTML 1 to 600, `slug` made from the question when it is added, kept when the question is edited so shared links keep working, unique on the page), `style` (`card`, `plain`), `openFirst` (bool, default true), `single` (bool, default true), `search` (bool, default true; shows when items over 8), `noMatch` (`{ askBlockId?: string }`). Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.** Card style; plain style; one answer open; search with a live count and the match marked; opened from a link (`#faq-{slug}` scrolls, opens and marks once); no match with Clear search and the optional Ask button that jumps to the chosen block, shown only when that block is in this visitor's HTML (not hidden, scheduled, expired or locked for them); locked (rule summary and one next step, answers not in the HTML).

**Markup.** Each question is a `details` element with a `summary` that holds the question text in a span. One answer open at a time gives the block's `details` the same `name` (exclusive accordion), with a small script that closes the others where `name` is not supported. No `aria-expanded` on `summary`; the browser exposes the state. The question is not a heading. The block title is an h3 after a section header and an h2 before the first one (wave 1 heading rule), in both styles; the plain style shows the title in eyebrow type and keeps the heading element. Closed answers stay in the HTML (FQ5). Search is `input type=search` named Search questions; the count is a polite live region updated 300 ms after typing stops; matches are wrapped in `mark`; filtered questions are `display:none` so they leave the tab order. Copy link to this question sits in each open answer and announces Link copied.

**Motion.** Height morph with `interpolate-size` and `::details-content` where supported, View Transition elsewhere. Chevron turns 180 degrees. Search filters with a View Transition. Deep link scrolls smoothly and highlights the question edge once. Reduced motion and Pause motion: instant.

**Editor.** Title with counter. Question list with drag to reorder; one question open for editing with Question, Answer (Bold, Italic, Link), and its link with Copy. Add question. Paste a list parses `Q:` and `A:` lines or alternating lines into questions, with a review before saving. Style chips, Open the first answer, One answer open at a time, Search box, When nothing matches chips listing the creator's Contact form, Email signup or Telegram blocks. Block settings row.

**Server.** Answers pass a new `sanitizeInlineHtml` in `packages/constants/src/html.ts` that keeps only b, strong, i, em and a, reusing the `sanitizeRichHtml` tag rebuilder. `sanitizeRichHtml` alone is not enough: its allowlist keeps h1 to h3, lists, blockquote and style attributes, and an h1 inside an answer breaks the heading rule. Link hrefs follow D57 (http, https, mailto). The config schema extends `blockSettingsSchema` and `faq` joins `CONFIG_SCHEMAS`. Slugs are unique per page. `FAQPage` data comes from the first FAQ block that this visitor's HTML holds. Hidden, scheduled, not yet live, expired and locked blocks are out of the response (Block settings server rule), so they add no FAQ data and never count as the first. The data joins the page's one JSON-LD script (`buildProfileJsonLd`, `serializeJsonLd`) as a second node in `@graph`, with answers as plain text (tags stripped) and `<` escaped. Its questions and answers match the visible block exactly. The CI leak test covers this script.

**Decisions.**
- FQ1 Answer formatting. Recommended: bold, italic and links only, through the Text block sanitizer; no images or embeds. Why: answers stay short and safe, and one sanitizer covers both blocks. Alternative: full rich text with images.
- FQ2 Open state. Recommended: first answer open, one open at a time, both switchable. Why: fans see an answer at once and the block stays short. Alternative: all closed and several open at once.
- FQ3 Deep links. Recommended: a stable link per question from its slug; opening it scrolls, opens and marks once. Why: creators can answer a DM with a link. Alternative: no per question links.
- FQ4 When nothing matches. Recommended: Clear search, plus Ask only when pointed at a block the creator already has. Why: no new inbox to manage and no dead ends. Alternative: a built in question form on the FAQ block.
- FQ5 Search engines. Recommended: closed answers stay in the HTML; the first FAQ block adds FAQPage structured data. Why: search engines and screen readers read every answer. Alternative: render answers only when opened.

**Analytics.** `faq_opened` (block id, question id, source `tap` or `link`), `faq_search` (block id, result count; sent once after typing stops for 1 s; no query text sent or stored), `faq_ask_tapped`.

## Save contact (`contact`), new

**Job.** Let a fan save the creator as a phone contact in one tap, with only the details the creator chose to share.

**Today (development a3ce3330).** Missing. No vCard or contact block. Creators paste a phone number or email into a Text or Link block. The page owner's account email must never reach a public page (see the fix-email-exposure card), so this block never reads it.

**Config.** Depends on Amped Card #58 D12 (open; aligned to its recommendation). The contact details live in one contact record shared with the Amped Card, not in the block config: `name` (1 to 60, defaults to the page name; fills `FN`, and `N` when first and last name are set on the card), `title` (0 to 60), `company` (0 to 60), `email` (0 to 120, typed, validated), `phone` (0 to 32, E.164 on save), `website` (0 to 200, https), `location` (0 to 60, city and country). #58 adds `website` and `location` to that record under D12; if D12 closes without them, both fields leave this block. The block config holds `includePhotoAndLink` (bool, default true), `includeSocials` (bool), `layout` (`card`, `button`), `qr` (bool). One record per account, so a page holds at most one Save contact block. Common settings: `schedule`, `access`, `attention`, `motion`. The schema extends `blockSettingsSchema` and `contact` joins `CONFIG_SCHEMAS`. `website` and every link follow the D57 URL scheme rule.

**Public states.** Card with name, title and company, website and location, the line Phone and email are inside the saved contact, and Save contact. Phone and email never appear on the page or in its HTML, only inside the downloaded file (#58 section 11). Ready (Contact card ready, the platform hint for 30 s: iPhone, scroll down and tap Create New Contact; Android, tap Open, then Save; Download again; focus moves to Download again). Button layout. QR sheet (Scan to save, the card link `amped.bio/c/{token}` as text, Copy link, Close sends focus back to Show QR code). In app browser (Instagram, TikTok, X: Open in your browser to save, with Copy link). Locked (name, title, rule summary, one next step; no field values in the HTML). Empty fields hide their row.

**Motion.** Press, then the button morphs into the ready card with a View Transition. The check draws once. QR sheet scales from its row. Reduced motion and Pause motion: instant.

**Editor.** Name on the card, Title and Company, with the notice These details are your Amped Card. Editing them here changes the card too. Fields fans save: Photo and page link checkbox, Email for this card with the helper that the sign in email is never added, Phone, Website, Location (city and country only), Social links checkbox. Layout chips Card and Button. Show QR code. Notice: Anyone who can see this block can download these details. Block settings row.

**Server.** One vCard builder, shared with the Amped Card (#58 section 6). vCard 3.0, UTF-8, CRLF, lines folded at 75 octets, values escaped (comma, semicolon, backslash, newline). `N:;Display Name;;;` unless first and last name are set. `FN`, `NICKNAME` @handle, `PHOTO` base64 JPEG 256 by 256 under 40 KB when Photo and page link is ticked (best effort). `ORG`, `TITLE`, `TEL;TYPE=CELL`, `EMAIL;TYPE=INTERNET` and `ADR;TYPE=WORK:;;;{city};;;{country}` only when set. Links as `itemN.URL` with `itemN.X-ABLabel`: the page URL first when ticked, then the website, then up to 12 visible link blocks when Social links is ticked. Only https links. No `X-SOCIALPROFILE`. Hidden blocks, gated links, paid links and 18+ items never enter the file. Save contact calls `GET /api/card/{token}.vcf?block={id}`, which runs the block's access rule first and answers 403 with the hint when locked. It serves `text/vcard; charset=utf-8`, `Content-Disposition: inline; filename="{Name}.vcf"` and `Cache-Control: private, max-age=60`, or `private, no-store` when the block is not open to Everyone. Rate limit 30 per minute per IP, shared with the card route (D11). The QR encodes `https://amped.bio/c/{token}?s=b`. `amped.bio/{handle}/contact` answers 302 to the card link, so printed codes survive a handle change. SC3 on both surfaces: while Who can open this is not Everyone, the public card page and the card vCard without a passing block check leave out phone, email, website and location; the QR option is off with the helper Only when Who can open this is Everyone; the editor says Your Amped Card leaves these out while this block is locked. The handler never reads `user.email`. Phone, email and location are personal data: removed on account deletion and listed in `docs/legal/privacy-parameters.md`.

**Decisions.**
- SC1 What goes in the file. Recommended: only the fields filled in on the block, plus photo and page link if ticked. Why: the fan gets exactly what the card shows, nothing hidden. Alternative: pull every field from the profile.
- SC2 Email source. Recommended: a typed email on the block only; the account email is never read or added. Why: the sign in email is private, and an exposure fix is already on the board. Alternative: prefill with the account email.
- SC3 Locked contact details. Recommended: Who can open this applies, checked server side; details stay out of the HTML until it opens. Why: a direct line can be a member perk without leaking. Alternative: no lock on this block.
- SC4 QR code. Recommended: optional QR to amped.bio/handle/contact, same card, same rule. Under #58 D12 the QR encodes the card link amped.bio/c/{token}, and amped.bio/handle/contact redirects there. Why: fairs and studio days need a scan, not a search. Alternative: no QR.
- SC5 Address detail. Recommended: city and country only. Why: a home or studio street address on a public page is a safety risk. Alternative: a full address field.

**Analytics.** `contact_saved` (block id, source `tap`), `contact_qr_opened` (block id), `contact_locked_viewed` (block id). A scan of the block's QR lands on the card page and counts as `card_view` with source `block` (`?s=b`); its save counts once, as `card_contact_saved`. No personal data.

## Media kit (`mediakit`), new

**Job.** Give a brand what it needs to book the creator: real audience figures, rates and past work, on the page and as a PDF.

**Today (development a3ce3330).** Missing. The creator's Analytics panel already has the data (`apps/server/src/services/analytics/queries.ts`: `getSummary`, `getBreakdown` by country, `getAudienceSummary`), but nothing can show it on the page. Creators paste screenshots or link out to a PDF.

**Config.** `title` (1 to 40), `eyebrow` (0 to 24), `intro` (0 to 160), `figures` (`visitors`, `followers`, `clicks`, `countries`, each bool), `accounts[]` (connected `instagram`, `tiktok`, `youtube` ids, follower count only), `period` (`30d`, `90d`), `rates[]` (0 to 8: `name` 1 to 40, `line` 0 to 60, `usd` integer 0 to 100000), `brands[]` (0 to 12, 1 to 32 each), `ask` (`{ blockId }` of a Contact form, Email signup or Booking block, or `{ email }`, an email typed on the block, 0 to 120, opened as mailto; the account email is never read), `pdf` (bool). Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.** Summary (up to 4 figures, each tile naming its source and period, such as Amped, last 30 days; Amped, total; Instagram, connected account; one update date for the block; no figure is labelled verified, Download media kit, open control); open (top 3 countries as share of visits, past work, rates, Ask about a project); new page (figures hidden under 10, a short line, rates and past work still shown); account disconnected (that figure drops; nothing to visitors, Fix chip in the preview); locked (title, rule summary, one next step; no figures in the HTML).

**Motion.** Count up once on first view (WAAPI on a number, `requestAnimationFrame` fallback). The accessible text is the final value from the start; the counting text is `aria-hidden`. Count up belongs to this block's own motion; the shared Motion value in Block settings stays Entrance on or off. Country bars grow on view with scroll driven animation behind `@supports`, IntersectionObserver fallback. Open and close with a View Transition. Reduced motion and Pause motion: final values at once.

**Editor.** Title, Eyebrow, Intro. Figures checkboxes with today's value as helper text and the line that they update daily and cannot be edited. Connected accounts with Disconnect and Connect TikTok or YouTube. Period chips. Rates list with name, line and USD price, each row opens to edit all three, Add a rate, helper Prices in USD. Past work chips with Add and the helper Only list brands you worked with. Ask about a project opens chips: Contact form, Email (shows an email field; the sign in email is never used) and Booking. Download as PDF. Block settings row.

**Server.** `mediakit.figures(userId, period)` reads `getSummary` (visitors, clicks) and `getBreakdown(country)` for the period, and the Fan Graph follower total through `publicCount` (`services/follow/rules.ts`, floor 10). When the creator has turned off `show_follower_count`, the Amped followers figure is unavailable and its checkbox says Turned off in your follower settings. Any value under 10 drops. Cached hourly. Followers are a total on the update date, not a period figure, and the tile says so. Connected accounts use official APIs: Instagram API with Instagram Login (professional accounts only), TikTok Display API (`user.info.stats`), YouTube Data API (`channels.list` statistics). The daily refresh needs an access token: it is stored encrypted, with the narrowest read scope, used only for the daily count, and deleted with the count on disconnect or when the platform revokes access. Only the count and fetch date are kept from each response. YouTube publishes subscriber counts rounded to 3 significant figures and a channel can hide them: the tile reads YouTube subscribers and drops when hidden. A failed refresh or a count older than 3 days drops that figure for visitors and shows the Fix chip in the preview. Figures are never typed in and never labelled verified. The PDF renders server side once a day per block and on save or disconnect, carries the date and each figure's source on every page, and is served at `/{handle}/media-kit.pdf` under the block's access rule with `X-Robots-Tag: noindex` and `Cache-Control: private`; it stays out of sitemaps and llms.txt. The schema extends `blockSettingsSchema` and `mediakit` joins `CONFIG_SCHEMAS`.

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

**Config.** `title` (1 to 40), `source` (`bandsintown`, `seated`, `manual`), `artistId` (connected source), `layout` (`list`, `next`), `count` (3, 5, 10), `ticketLabel` (1 to 24, default Tickets), `showUnavailable` (bool, default true), `showPast` (bool, default false), `hidden[]` (event ids the creator hid), `manual[]` (max 50: `{startsAt, tz, doorsAt?, city, venue, url?, seller?, status: onsale | few | soldout | cancelled}`). `startsAt` and `doorsAt` are local date times; `tz` is an IANA zone (Europe/Lisbon), never an offset or abbreviation. `url` follows the D57 rule: save and render allow only https and http; any other scheme is refused on save and never rendered. `seller` (1 to 40) is the ticket seller's name; when empty, the name comes from the URL host. The config schema extends the shared `blockSettingsSchema` and is listed in `CONFIG_SCHEMAS`, or the Block settings are stripped on save. Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.** List (date chip, city and venue, weekday, venue time and zone abbreviation such as Sat 9:00 PM WET, Tickets); Few left line; Sold out and Cancelled with status and no button; Next show (featured date with the full weekday, doors and show time with the zone, Get tickets, See all); date sheet (venue time with zone, visitor time with zone when the offsets differ, address, support act, Get tickets, Add to calendar, Share, seller line Tickets sold by {seller}. Amped does not sell this ticket.); no upcoming dates (plain line and Follow); past shows folded under Past shows ({n}) only when `showPast` is on; source disconnected (renders nothing to visitors, Fix chip in the preview). Weekday, zone abbreviation and day are computed from `startsAt` in `tz` on the server, never typed or stored as text, so a date can never show the wrong weekday. The year shows when the date is not in the current year in the venue zone. A date moves to past 6 hours after `startsAt` in its zone, and a past date never shows a ticket button. Every ticket control is a link with `target=_blank` and `rel=noopener noreferrer`, named Tickets for {city}, {venue}, on {seller}, opens in a new tab. Few left comes only from the source status or the creator's manual status; nothing counts down or changes it on a timer (CD1). Locked and scheduled use the shared Block settings states; while locked, ticket URLs stay on the server.

**Motion.** Date chips flip in on first view, 89 ms apart. A date opens in place or in a sheet with a View Transition. Reduce motion and Pause motion show everything at once.

**Editor.** Title, source chips, sync line with Change, synced dates with weekday, status and a hide toggle (`aria-pressed`), layout and count chips, ticket label, Show sold out and cancelled, Show past shows, Block settings rows. The Motion row value reads Entrance on, Rise, Fade, Scale or Off like every block; the date chip flip is the block's own motion and is described in the Motion helper. Manual source shows Add date with date, time, doors, time zone (prefilled with the creator's `schedule.zone`), city, venue, ticket link, seller and status; the weekday shows next to the date field as it is picked. A Luma or Eventbrite link sent here from the Embed hint lands in Add date as the ticket link with the seller filled; Events has no Luma or Eventbrite sync.

**Server.** `events.sync` reads Bandsintown and Seated artist events every 6 hours and on save, stores id, start, IANA time zone, venue, city, status, seller and ticket URL only. Bandsintown and Seated both issue API access per partner: Amped needs a Bandsintown partner app id and a Seated partner agreement before EV1 ships; until then the source chips show Coming soon and Manual works. `events.ics` builds a calendar file per event with `DTSTART;TZID` and a VTIMEZONE block, so the event lands at the venue time in any calendar. Ticket URLs pass the D57 URL scheme rule on save and on render, then the link safety check used by link blocks. The public payload holds only upcoming dates within `count`, plus past dates only when `showPast` is on.

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

**Config.** `title` (1 to 40), `eyebrow` (0 to 24), `provider` (`calcom`, `calendly`, detected from `url`), `url` (booking page), `sessions[]` (max 8: `{eventUrl, name 1 to 40, minutes, paid: bool, icon}`), `layout` (`sessions`, `button`), `open` (`page`, `tab`). `url` and every `eventUrl` follow the D57 rule (https only here, since the provider registry lists only https hosts) and must match a Cal.com or Calendly host pattern in the shared provider registry; anything else is refused on save with Use a Link block for other booking pages. The config schema extends the shared `blockSettingsSchema` and is listed in `CONFIG_SCHEMAS`. Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.** Sessions list (name, length, Free or Paid on {provider}; each Book button named Book {session}); One button; sheet before consent (session, length and Paid on {provider} when paid, Load {provider} to pick a time, line {provider} may set cookies. Payment happens on {provider}. Amped does not take it.); loading skeleton at the frame height; provider scheduler loaded; provider error (after 15 seconds: {provider} did not load, with Try again and Open {provider} in a new tab); locked (the shared Block settings locked card with session names, lengths and the rule; no booking or event URL in the HTML or payload until the rule passes); provider link broken (renders nothing to visitors, Fix chip in the preview). Consent uses the wave 1 `embeds` category and the shared provider registry: the HTML holds no provider address until Load or the stored Allow embedded content choice. The frame uses the registry sandbox, `allow="payment"` for Cal.com and Calendly, and the registry Auto height for the provider, measured at 390 wide on the month view (wave 1 Embed QA found 331 too short for Cal.com). The sheet is at most 90 percent of the viewport high; when the provider's booking form is taller, the provider scrolls inside its own frame and the page behind does not move. No provider script runs on the Amped page; only the frame. Open in a new tab (`open: tab`) skips the sheet and needs no consent, since nothing loads on Amped.

**Motion.** Sheet or pane opens with a View Transition from the Book button; focus moves to Load. After Load, focus moves to the frame region named {provider} scheduler and a status line says Loading {provider}, then {provider} loaded. Close and Escape close the sheet and return focus to the Book button that opened it. Provider frame fades in. Reduce motion and Pause motion: instant.

**Editor.** Title, eyebrow, booking page well with the provider chip, sessions list with Import from Cal.com, drag order and edit, layout and Book opens chips, Coming with the store note, Block settings rows.

**Server.** `booking.import` reads Cal.com public event types (name, length, paid flag) on save through the guarded fetch (`services/import/fetchPage.ts`, LK1). Confirm before build that Cal.com exposes event types for a username without an API key; if not, the creator adds sessions by hand and Import shows Coming soon. Calendly import needs the creator's Calendly connect and ships after Cal.com. The scheduler URL passes the D57 rule and the provider registry. BK5 uses the rules live in the gating engine today: follower, pool member, stake minimum, and any or all of these. Members and Paid show disabled until Memberships and content PR 10 ship. Amped is not a party to any payment taken on the provider and stores no price.

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

**Config.** `title` (1 to 40), `hint` (0 to 40), `starters[]` (max 4, 1 to 40 each), `sources` (`{publicBlocks: true, answers: true, libraryPublic: bool}`), `fallback` (`telegram`, `form`, `email`; required, default `telegram` when Telegram is connected, else `form` when the page has a Form block, else `email`), `fallbackEmail` (only for `email`: an address the creator types for this purpose, never the account email, saved under the D57 rule as mailto), `dailyLimit` (5, 10, 20). Server side: `answers[]` written by the creator (`{question, answer}`). The config schema extends the shared `blockSettingsSchema` and is listed in `CONFIG_SCHEMAS`. Common settings: `schedule`, `access`, `attention`, `motion`. There is no `none`: a visitor always has a visible way to reach the creator.

**Public states.** Closed (AI answers label, intro, starters, field, disclosure Answers are written by AI, not by {name}. AI can be wrong. Questions are kept 90 days without your name., and Message {name} instead, always visible); typing; answer with sources and a link to the named block; rule named for a locked block whose title and rule are already public (Go to {block}); not on the page with the reach me button; daily limit reached; turned off (renders nothing); service down or budget cap reached (Ask me is resting. Try again later., plus the reach me button). An 18+ item is never named or hinted at: a question about it gets the not on the page answer. Questions about prices, fees, payments, tokens, pools or rates never get a figure or a promise; the answer points to the block that shows it (Prices are in Time in the studio). The reach me button is rendered by Amped from config, never written by the model.

**Motion.** Question rises in, typing dots, answer fades in. Source chips scroll to the block. Reduce motion and Pause motion: answer appears at once.

**Editor.** Dependency note naming card #14 (same Claude setup, budget cap and safety rules), title, field hint, starter questions, Answers can use checkboxes with the never used line and the no prices line, Reach me instead chips (Telegram, Contact form, Email me), Questions per visitor a day chips, Block settings rows. The Motion row value reads Entrance on, Rise, Fade, Scale or Off like every block; the typing dots and answer fade are the block's own motion and are described in the Motion helper. People gains a Questions tab: filter chips, question, answer, result, date, Edit or Write answer, Turn off Ask me.

**Server.** `ask.answer` reuses the AI builder card #14 stack (AB2): Anthropic Claude through the API, called from `apps/server` only, under the same provider agreement with zero data retention and no training on inputs; the model is a config value (`ASK_MODEL`, defaulting to `BUILDER_MODEL`). Context is built only from public blocks, bio, creator answers and opted in public library metadata; gated, paid and 18+ items, hidden, scheduled and expired blocks, Save contact details, email addresses, phone numbers and wallet addresses are excluded at index time, not by the prompt. Token price, pool, swap, NFT, tip and paid request blocks are indexed by title only. The visitor's question and all page text go to the model inside a delimited block with an instruction that it is untrusted and may contain instructions to ignore (the #14 prompt injection rule). Output is checked before it is shown: max 80 words, no URL except Amped block links, no figures for prices, tokens or rates, abuse filter on input and output. Cost is tracked per call against a daily budget cap (`ASK_DAILY_BUDGET_USD`, page and platform totals); when the call fails, times out after 10 seconds, or the cap is reached, a rules only fallback answers from an exact or close match in the creator's `answers[]`, else shows the service down state. Rate limits come from D11 through `hitRateLimit`: the per visitor `dailyLimit` keyed by a rotating anonymous token plus a salted IP hash that lives only in Redis for the window, a per IP per minute burst cap, and a page wide daily cap. Stores question, answer, sources and result for 90 days with no identity; the question text is personal data and is removed with the creator's account. The privacy notice gains an Ask me paragraph and the subprocessor entry added by #14 in `docs/legal/privacy-parameters.md` covers Ask me. Gates before launch: #14 provider agreement, D57, D11 and counsel review.

**Decisions.**
- AI1 Label and disclosure. Recommended: AI answers label and the can be wrong line, always on. Why: visitors must know they are not talking to the creator. Alternative: creator chooses whether to label.
- AI2 Sources. Recommended: public content and creator answers only; gated and 18+ excluded at index time for everyone. Why: a model must never be the thing that leaks paid or adult content. Alternative: answer from gated content for visitors who pass the rule.
- AI3 Creator review. Recommended: Questions tab with written answers that win and one tap off. Why: the creator stays responsible for what the page says. Alternative: no log.
- AI4 Limits. Recommended: 10 a day per visitor by default, page cap, 80 word answers. Why: controls cost and abuse. Alternative: unlimited with a captcha.
- AI5 Privacy. Recommended: 90 days, no name, email, account or IP, no question text in analytics. Why: questions can be personal. Alternative: tie questions to signed in fans.

**Analytics.** `ask_opened`, `ask_question` (counts only), `ask_answered` (result: answered, rule, unknown, limit, resting), `ask_feedback` (helpful: true or false), `ask_source_clicked`, `ask_fallback_clicked` (channel), each with block id. No question or answer text, no visitor token.

## Course (`course`), new

**Job.** Sell a set of lessons as one course, with one free lesson that shows what the fan will get.

**Today (development a3ce3330).** Missing. No course block type in `packages/constants/src/blocks.ts`. The content library panel exists (`apps/client/src/components/panels/content`), and the store spec (#20) defines bundles over library items, but nothing presents a bundle as numbered lessons on the page.

**Config.** `offerId` (a store bundle with `showAsCourse: true`), `layout` (`card`, `compact`), `previewItemId` (one video or audio item in the bundle, or null), `lessonsShown` (3, 5, `all`), `buttonLabel` (1 to 24, default Buy course; the price is appended), `showLength` (bool, default true), `membersContinue` (bool, default true when the bundle is in the membership). Common settings: `schedule`, `attention`, `motion`. `access` is read only and comes from the product. The editor draws it as a read only row with a lock and no chevron: Paid, set in Store. `membersContinue` is disabled with Available when Memberships launch until the Memberships card ships. The config schema extends `blockSettingsSchema` and is listed in `CONFIG_SCHEMAS`.

**Store change.** Product editor gains `showAsCourse` on bundles: items are numbered as lessons in the stored order. Store refund lines gain `within_7_days_2_lessons` for course bundles (23 characters, fits `refundLine` VarChar(24)). Every refund is the full amount (AmpedPay spec 3.2), so the fan copy reads Full refund within 7 days if you open 2 lessons or fewer.

**Public states.** Visitor card (cover, Course tag, total length, lessons count, kinds, access period, first lessons with the free one marked, the rest locked, Buy course with price); free lesson playing in place (shared player, chapter aware); pay sheet (Paying @handle, item, price, Includes the Amped.Bio fee of {fee}%, refund rule, required checkbox, Pay, wallet note, Powered by Amped.Bio; {fee} is `platform_fee_bps` from `paymentSettings()`, 5% at launch, fixed in the quote); short balance (Your wallet needs N USDC more, Add USDC links to Wallet); owned or member (progress bar, last done, Up next, Continue lesson N, In your Library); bundle archived or paused (renders nothing to visitors, Fix chip in the preview).

**Rules.** Locked lessons ship title and length only. No media reference in the page HTML until `checkAccessBatch` passes. Progress is private to the fan.

**Availability and locking.** The block ships with content PR 10, when the `paid` kind is live in the gating engine, and behind `PAYMENTS_ENABLED` and the payments pilot list. Until then Course is not offered in Add block. A lesson unlocks only through the `paid` leaf (a confirmed Purchase of the bundle) and, once Memberships ship, the `member` leaf. No other gating kind locks or unlocks a lesson. 18+: a bundle that holds an 18+ item follows the content system 18+ rules. Its cover, lesson titles and preview never appear in public HTML, share tags or previews, and an 18+ item cannot be the free preview lesson.

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

**Job.** Put the creator's merch from Shopify, Fourthwall, Spring, Etsy or Printful on the page with live prices and stock, and send buyers to that store's checkout.

**Today (development a3ce3330).** Missing. No shop block type and no store connection. Creators paste single product links as link blocks.

**Config.** `title` (1 to 40), `connectionId` (a connected store), `source` (`newest`, `picked`, `collection`), `productIds[]` (max 24, when picked), `collectionId` (when collection), `layout` (`grid`, `carousel`, `list`, `featured`), `soldOut` (`show`, `hide`), `tap` (`quicklook`, `store`), `partner` (bool: this is not my store; adds the Affiliate label). Common settings: `schedule`, `access`, `attention`, `motion`. The config schema extends `blockSettingsSchema` and is listed in `CONFIG_SCHEMAS`. Product and Buy URLs come from the store API, never typed, and pass the D57 URL scheme rule (https only here) on save and on render.

**Server.** `stores.connect` runs OAuth with read only product scope (Shopify Admin API `read_products`, Fourthwall and Spring product APIs, Etsy Open API v3 `listings_r` for active listings, Printful API store products). Printful products show only when they sync to a store page with a public product URL; Buy opens that page. `stores.sync` caches title, images, price, compare at price, currency, variants and stock hourly and on Refresh; webhooks update stock when the platform offers them. Disconnect deletes the cache. Amped never reads orders, buyers or payouts. Product images are copied to Amped on sync and served by Amped, so the page loads nothing from the store before the visitor taps Buy. Etsy: data shown is never older than 24 hours (Etsy API terms), so an Etsy block hides when its last good sync passes 24 hours, and the Etsy notice shows on the Etsy row in Connected stores and in the block footer: Etsy is a trademark of Etsy, Inc. This uses the Etsy API but is not endorsed or certified by Etsy. Spring: confirm an official product API with creator authorization before build; SH1 rules out scraping, so Spring waits if none exists. Partner stores: open. OAuth needs an account the store grants, so the connection path for a store the creator does not own (store granted access, or Etsy public listings by shop) needs a decision before build (QA finding).

**Public states.** Grid (header with store name, 2 columns, New and Sale badges as the store sets them, Shop all N); carousel; list (rows with a 44 Buy icon button); featured (one product, image, description, price and compare at price); quick look (image, price, sizes from variants with sold out sizes disabled, Buy on {store}); sold out (grey image and label, no Buy); partner store (Affiliate on each product and the commission line); store disconnected or sync failed for 24 hours (renders nothing to visitors, Fix chip in the preview).

**Rules.** Prices show as the store reports them. Every layout and the quick look show the currency and the last sync time: Prices in {currency}. Prices and stock updated {time}. No price is typed by hand in this block. Buy links carry `utm_source=amped`. Partner stores always show Affiliate.

**Motion.** Cards rise in, 55 ms apart. Hover lift 2 px, press 0.97. Quick look grows from the tapped image with a View Transition; Back returns focus to the card. Carousel uses CSS scroll snap. Reduce motion: no stagger, no lift, instant swap.

**Editor.** Title, store row with sync time and Refresh, source chips, picked product list with drag order and remove, Add products, layout chips, sold out and tap chips, This is not my store checkbox, Block settings rows. Account, Connected stores lists Shopify, Fourthwall, Spring, Etsy and Printful, each with Connect or Disconnect and its limit: Shopify published products, Spring live listings, Etsy active listings only, Printful only products with a public product page.

**Decisions.**
- SH1 Product data. Recommended: official APIs with read only product scope, cached and refreshed hourly, plus Refresh. Why: accurate stock and price without slowing the page or breaking store terms. Alternative: scrape the public store pages.
- SH2 Checkout. Recommended: Buy opens the merchant checkout; Amped takes no orders for third party stores. Why: fulfilment, tax and refunds stay with the store that ships. Alternative: an embedded cart on Amped.
- SH3 Sold out. Recommended: show with a Sold out label by default; the creator can hide them. Why: fans see the range and come back. Alternative: hide sold out items always.
- SH4 Partner stores. Recommended: Affiliate label on every product and the commission line when the store is not the creator's. Why: same FTC rule as Affiliate picks. Alternative: a single disclosure line on the block.
- SH5 Stores at launch. Answered 26 Oct: Shopify, Fourthwall, Spring, Etsy and Printful at launch. Recommended was: Shopify, Fourthwall and Spring. Why the recommendation: they cover most creator merch and have public product APIs. Alternative: add Etsy and Printful at launch.

**Analytics.** `shop_viewed`, `shop_quicklook_opened`, `shop_buy_tapped` (product id, store), `shop_all_tapped`, each with block id. Sales are not tracked by Amped.

## Paid requests (`requests`), new

**Job.** Let fans pay for something made for them, a shoutout, a review or a commission, with clear price, timing and refund terms before they commit.

**Today (development a3ce3330).** Missing. No request block, no request queue and no offer kind for requests.

**Config.** `title` (1 to 40), `types[]` (max 6), each: `name` (1 to 40), `line` (0 to 40), `icon`, `amountUnits` (USDC, inside `one_time_price_min` and `one_time_price_max` from `paymentSettings()`, 0.50 to 1,000 at launch), `deliverDays` (1 to 60), `slotsPerMonth` (1 to 100), `answerWithinHours` (24, 48, 72), `questions[]` (max 5: `label` 1 to 60, `kind` text or photo, `required`). Common settings: `schedule`, `access`, `attention`, `motion`. The config schema extends `blockSettingsSchema` and is listed in `CONFIG_SCHEMAS`. The block ships behind `PAYMENTS_ENABLED` and the payments pilot list.

**Store change.** New offer kind `request` (never listed in the storefront). New `Request` row: offer, fan, brief answers, status (`sent`, `accepted`, `declined`, `expired`, `delivered`, `refunded`), signed authorization, due date, delivery item id.

**Payment flow.** Built on AmpedPay (claude/amped-ampedpay-spec-2026-10-28.md). At request the API builds the split table: `paymentRef` is the Request id, payer, amount, creator and platform rows, platform bps from `platform_fee_bps` (5% at launch), and `validBefore`. The split signer signs it. The fan signs an EIP-3009 `receiveWithAuthorization` to AmpedPay for the total, with the nonce equal to the EIP-712 hash of that split, and with `validBefore` past the answer window plus 24 hours. Nothing moves at request. The fee is fixed at request; a later fee change does not touch it. Accept submits `pay` through the relayer; one transaction pays every recipient. If the fan's balance is short at accept, the fan has 24 hours to add USDC, then the request expires. Decline or no answer lets the authorization lapse. Amped never holds the fan's funds. Not delivered by the due date triggers the AmpedPay `refund` of the full amount: the creator shares from the creator's wallet and the platform share from the treasury. Open before build (QA blocker): AmpedPay caps `split.validBefore` at `maxSplitValidity` (at most 24 hours) from submit time, which a split signed at request cannot meet for any answer window; and `refund` needs the creator's EIP-712 Refund signature and permit at refund time, which an automatic refund does not have. Card #50 must add a request path for both before this block builds.

**Public states.** Menu (types with price, delivery and open slots, slots bar, Request a {type}, You pay only if Mara accepts); brief (the creator's questions, counters, optional photo); review (price, fee line, answer window, charged only on accept, refund rule, required checkbox, Send request); status (sent, accepted with due date, in progress, delivered to Library); full type (Full this month, opens date, Remind me for signed in fans); declined (Mara declined. You were not charged.); expired (Mara did not answer in time. You were not charged.); short balance at accept (Mara accepted. Add N USDC. Your wallet has M USDC. Add N USDC by {weekday date, time} or the request expires. Nothing is charged until then. Add USDC opens Wallet, Fund); refunded (Refunded N USDC. Not delivered by {weekday date}. The full amount is back in your wallet.); payments paused on the server (Requests are paused. Try again later. Send request is off); paused block (renders nothing). The review lists: Your wallet is charged only when Mara accepts. Keep N USDC in it until then. Declined or no answer? You are not charged. Not delivered by the due date? Full refund to your wallet. The brief carries: Briefs follow the Amped.Bio acceptable use rules. No 18+ requests.

**Motion.** Slots bar fills on view: scroll driven behind @supports, IntersectionObserver fallback. Selected type ring transitions 233 ms. Status steps tick in order. View Transition between menu, brief and review. Reduce motion: no fill, instant steps.

**Editor.** Title, request type list with drag order, one type open with price and fee helper, deliver within, slots, answer window, brief questions with required chips, locked refund rule (Not delivered on time: the fan gets a full refund. Accept also signs the refund for the due date. It is paid from your wallet, and the fee part from Amped.Bio), Block settings. Store, Requests: New, In progress, Done tabs; each row shows fan name and handle, type, price, answer by time and the brief, with Decline and Accept; delivery upload goes to the fan's Library.

**Decisions.**
- RQ1 When the fan pays. Recommended: the fan signs at request; the payment is submitted only on accept. Why: no refunds for declines, and Amped never holds funds. Alternative: charge at request and refund on decline.
- RQ2 Slots. Recommended: per type per calendar month; full types stay visible with the open date. Why: protects the creator's time and keeps demand visible. Alternative: unlimited with a queue.
- RQ3 Late delivery refund. Recommended: automatic full refund after the due date, shown before signing, cannot be turned off. Why: fans pay before the work exists, so the rule must be firm. Alternative: refund at the creator's discretion.
- RQ4 What can be requested. Recommended: the creator's own type names, acceptable use on every brief, no 18+ requests. Why: briefs are user content and need the same moderation as messages. Alternative: allow 18+ types behind the age check.
- RQ5 Delivery. Recommended: upload in Store, Requests; the result lands in the fan's Library. Why: reuses the content system, the gateway and access checks. Alternative: deliver by email link.

**Analytics.** `requests_viewed`, `request_type_selected`, `request_sent`, `request_accepted`, `request_declined`, `request_expired`, `request_delivered`, `request_refunded`, each with block id and type.
