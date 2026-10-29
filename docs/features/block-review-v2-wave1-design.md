# Block Review v2, wave 1: design spec for new blocks

Build Board #54. Drafted by Claude for Rob Frasca, 26 Oct 2026. Overview: docs/overviews/block-review-v2.md. Research: docs/features/block-review-v2-research.md.

Scope: the seven tier 1 blocks Amped does not have today, and the Add block catalog that holds them. Existing blocks (link, media, text, pool, referral, follow, followers, RNS ID, Telegram) are redesigned in the next design pass. Store, Tip and Membership blocks follow their own cards (#20, #25). Sub pages get their own card (decision subpages-scope).

| Block | Type id | Family | Singleton | Screen Review |
| --- | --- | --- | --- | --- |
| Email signup | `email_signup` | Audience | No | 204, 205 |
| Form | `form` | Audience | No | 206, 207 |
| Gallery | `gallery` | Links and structure | No | 208, 209 |
| Affiliate picks | `picks` | Commerce | No | 210, 211 |
| Header and divider | `section` | Links and structure | No | 212, 213 |
| Countdown | `countdown` | Audience | No | 214, 215 |
| Embed | `embed` | Links and structure | No | 216, 217 |
| Add block catalog | none | Editor | n/a | 218 |

## 1. Rules for every block

- **Creator theme only on the page.** Font, font color, button color, button style, container color and transparency come from the creator's theme. No Prism token appears inside a block on amped.bio (section 17).
- **Anatomy.** Card shell (container color, r21 on the sample themes), optional eyebrow, title 20/26 700, one line of text 16/24, body, at most one primary action. Every action is the CreatorButton (55 high, full width) unless stated.
- **Heading levels.** The page name is the only h1 (ProfileView today). A section header is an h2. A block title is an h3 after a section header and an h2 before the first one, so no level is skipped. Header size S, M or L never changes the level. Today every block title is an h3 directly under the h1; the renderer sets the level from block order.
- **Targets.** 44 minimum, 55 for the primary action. Focus is a 2px outline in the creator's text color.
- **Common settings row** at the bottom of every configurator: Schedule, Who can open this, Attention, Motion. Same order, same place, every block. Each row shows its current value and opens in place.
- **Motion slots.** Entrance on first view (rise 13 px and fade, 377 ms, children staggered 55 ms), Interaction (theme hover and press), State change (View Transitions, 233 ms), Attention (one block per page). Every slot is off under prefers-reduced-motion and the page's Pause motion control. Entrance uses CSS scroll driven animation behind `@supports (animation-timeline: view())` with an IntersectionObserver fallback.
- **Editor.** Each block opens inline in the Page list (D18). Valid changes autosave after 800 ms (D11). Invalid input shows its fix on blur and never saves. The preview updates within 100 ms.
- **Copy.** No earn, yield, income, profit, invest or staking language in any block, default or helper. No dashes.
- **Data.** Anything a fan types goes to the server once, over the existing tRPC client, with Cap captcha on the public page and a rate limit per IP and per block.

## 2. Email signup (`email_signup`)

**Job.** Turn a visitor into a subscriber in one step, with consent the creator can prove.

**Config.** `title` (1 to 40), `description` (0 to 160), `eyebrow` (0 to 24), `buttonLabel` (1 to 24, default Subscribe), `layout` (`card`, `inline`, `cover`), `coverId` (content library image, cover layout only), `askName` (bool), `welcome` (`{on, subject}`), `destinations` (Amped list always, plus connected providers); `sms` (`{on, listId}`, Text me too, off by default). `sms` is one setting shown in two places: this configurator and the Text signup block (boards sm1, sm2). `listId` is the list of the SMS block that turned it on; Text me too uses that block's `monthlyMax` and title. Removing that SMS block turns `sms.on` off. It renders on the card and cover layouts only. The inline layout keeps one row, so Text me too never shows there. Texts go live after counsel signs the consent wording.

**Public states.** Default; signed in fan (one tap: Subscribe as their account email, with Use a different email; an email over 24 characters is cut in the middle of the name part, the domain stays whole, and the button's accessible name carries the full address; the account email still gets the confirm link, ES1); invalid email on blur (Enter an email like name@example.com); sending (button holds its width, spinner, 233 ms minimum); sent (Check your inbox card replaces the form, Resend the link with a 60 second cooldown); already subscribed (a typed email gets the same Check your inbox card as a new one, and the email itself says You are already on Studio notes, so the page never shows whether an address is on the list; a signed in fan sees You are already on Studio notes on the card); Text me too ticked (the Mobile number field, the full text consent with its own unticked consent box, and Terms and Privacy links open under the email field, as in sm1; ticking Text me too is not consent; with a number typed and the consent box unticked, Subscribe shows Tick the box to get texts, or untick Text me too, tied to the box; after Subscribe, Check your inbox shows a second line: Reply YES to the text from Amped for {creator}); confirmed (after the email link, the page opens with a toast You joined Studio notes); rate limited (Try again in a minute); network error or offline (the typed email stays, the button comes back, and the line Your signup did not send. Check your connection, then try again. shows under it and is announced).

**Consent line, fixed.** You agree to get emails from {creator}. Unsubscribe any time. Privacy. The creator cannot edit or hide it, in every layout, Inline and Cover included. The text consent from Text me too is a separate line with its own unticked box (SM1), in the exact SMS signup wording (spec-wave3.md, SMS signup), with Terms and Privacy under it. The email consent line keeps its Privacy link on every layout, including when Text me too is open (fixed on board sm1 in the wave 3 Full QA). The subscriber row stores the line the fan saw, the page, the time and the IP hash.

**Double opt in.** Always on. The confirm link lasts 7 days. Unconfirmed rows delete after 30 days.

**Legacy map.** Today's email collect block is a `text` row with `config.platform === "email-collect"` and `config.content` as its heading (`packages/constants/src/blocks.ts`, `TextBlock`; no own type or schema). It never stored an address: `apps/client/src/components/blocks/EmailCollectionBlock.tsx` shows Thanks for subscribing and drops the input (TODO in the code). amped.bio hides it (`apps/landingpage/src/components/blocks/text/TextBlock.tsx`, 040 D3), but the editor preview still renders the fake form. Migration: each such row becomes `email_signup` with `title` = the heading as plain text cut to 40 (empty heading gives Get updates), `description` empty, `eyebrow` empty, `buttonLabel` Subscribe, `layout` card, `askName` false, `welcome.on` false, `destinations` Amped list, `sms.on` false, same `order`. It migrates with `hidden: true`, because visitors never saw it and the creator has not seen the new consent line; the Page list shows Ready to turn on. There are no subscriber rows to carry over. Delete both `EmailCollectionBlock.tsx` files and the `email-collect` branch in both `TextBlock.tsx` files. Count the rows before the migration and log the count.

**People, Subscribers tab.** Totals (subscribers, waiting, joined in 30 days), filter chips (All, Confirmed, Waiting, Unsubscribed), search, table (email, name, source block, status, joined, More), Export CSV, sync status for each connected provider, and Email and Texts chips once Text me too is on (sm2). Broadcast (#1) sends to confirmed subscribers. Today People has no tabs (Followers, with Pool fans as a filter chip); the tab bar Followers, Subscribers, Forms is new and the Fan Graph owner signs it off.

**Decisions.**
- ES1 Double opt in for every list. Recommended: always on. Why: proves consent in the EU and keeps bad addresses off provider lists. Alternative: optional, per block.
- ES2 Signed in fans subscribe in one tap with their account email. Recommended: yes, after an explicit tap. Alternative: always type an email.
- ES3 Subscribers live in People, Subscribers tab. Recommended. Alternative: inside Analytics.

**Analytics.** `email_signup_viewed`, `email_signup_started`, `email_signup_sent`, `email_signup_confirmed`, each with block id and layout. No email, name, phone or IP hash in any event. Text me too events follow the SMS signup spec. Conversion = confirmed over viewed.

## 3. Form (`form`)

**Job.** Collect a structured request (contact, booking request, collab, RSVP) without sending the fan off the page.

**Config.** `template` (`contact`, `booking`, `collab`, `rsvp`, `custom`), `title` (1 to 40), `description` (0 to 160), `eyebrow` (0 to 24), `fields[]` (max 12: `shortText`, `longText`, `email`, `phone`, `choice` single or multi, `dropdown`, `date`, `checkbox`, `file`), each with `label` (1 to 60), `required`, `help` (0 to 120), and `options` (2 to 20, each 1 to 40) for choice and dropdown; at most one `file` field (FM1); `submitLabel` (1 to 24); `confirmation` (message, 0 to 200); `notify` (email the creator on each response); `steps` (auto: more than 5 fields splits into steps of up to 4).

**Public states.** Default; focused field; multi step with step bar in the creator's font; validation on blur and on submit (focus moves to the first invalid field); file field with the line Images or PDF, up to 10 MB. Only {creator} sees it.; file chosen with name and size, upload progress, scan; wrong type (Add an image or a PDF); too big (This file is over 10 MB); scan failed (We could not check this file. Try another one.); sending; sent (the creator's confirmation message, Send another, and the line {creator} keeps responses for 12 months. Privacy, FM4); rate limited (You sent a few already. Try again in an hour.); error (Your message did not send. Check your connection, then try again. Every answer and the chosen file stay in place, and the line is announced).

**Responses.** Inbox gets a Forms tab between Messages and Settings (today's tabs are Updates, Messages, Settings in `InboxPanel.tsx`; Inbox opens from the top bar, not the rail): list with unread dot, form name, first line, time; detail with every answer, Reply by email (opens the fan's address), Mark done, Delete. People, Forms tab has Export CSV per form. A fan's file opens only when its `scanStatus` is CLEAN; INFECTED or ERROR shows This file could not be checked and the file is withheld. Fan files never enter the creator's content library and never get a public URL; they open through a signed link for the creator only and delete with the response. The new response email holds the form name, the fan's name and the first line, with Open in Inbox. It never attaches the file.

**Decisions.**
- FM1 File uploads. Recommended: one file field per form, images and PDF only, 10 MB, through the existing upload validation and scan; files stay private to the creator. Alternative: no files.
- FM2 Where responses live. Recommended: Inbox, Forms tab, plus Export in People. Alternative: email only.
- FM3 Spam. Recommended: Cap captcha (invisible), 5 responses per hour per IP per form, honeypot field. The honeypot sits off screen with aria-hidden, tabindex -1 and autocomplete off, so keyboard and screen reader users never reach it. Alternative: visible captcha.
- FM4 Retention. Recommended: responses delete after 12 months; the creator can export or delete any time; the confirmation screen links the creator's privacy line. Alternative: keep forever.

**Analytics.** `form_viewed`, `form_started`, `form_step_viewed` (step number), `form_submitted`, `form_failed` (reason code: invalid, rate_limited, network, file), each with block id and template. No answers, names, emails, phone numbers, file names or IP hash in any event. Conversion = submitted over viewed.

**Legacy map.** None. At a3ce3330 `BaseBlockType` has no form type, and the `email` link platform is a mailto link, not a form. Nothing migrates. Today every upload procedure is `privateProcedure` (`apps/server/src/trpc/content.ts`, `upload.ts`), so fan files from a visitor who is not signed in need a public upload route behind Cap and the rate limit.

## 4. Gallery (`gallery`)

**Job.** Show work as images, with a viewer that feels native on a phone.

**Config.** `title` (optional, 1 to 40), `layout` (`grid`, `masonry`, `carousel`, `slideshow`), `columns` (2 or 3, grid only), `aspect` (`square`, `4:5`, `16:9`, `original`; masonry always uses `original`), `images[]` (max 24: content library id, `alt` 0 to 250, `caption` 0 to 140, `link` https, optional), `showCaptions`, `autoplay` (slideshow only, off by default, 5 s per image, pauses on the Pause button, touch, hover, keyboard focus inside the block and when off screen). Common settings: `schedule`, `access`, `attention`, `motion`.

**Public states.** Grid (shows 6 images in 2 columns or 9 in 3 columns, then See all N expands the grid in place), masonry, carousel with peek of the next image and a counter, slideshow with pause control; lightbox (full screen, swipe, pinch zoom, caption, link button Shop this piece, counter 3 of 12, Close 44, Escape and swipe down close); loading (blurred placeholder from the stored dominant color); image without a description (the image gets an empty alt and the tile button is named Image 3 of 12, never the file name); image fails to load (the dominant color stays and the description shows as text); locked by Who can open this (the lock card only, no image URL in the HTML); zero images or every image removed (the block renders nothing on the page and shows Add images in the preview); scheduled (absent from the HTML).

**Motion.** Grid items stagger in. Carousel uses scroll snap with momentum. Lightbox opens with a shared element View Transition from the tapped image. Focus moves to Close when the transition ends, stays inside the lightbox while it is open (the page behind is inert), and goes back to the tile of the image in view when it closes. Slideshow cross fades with a slow 1.05 zoom. The zoom runs only while the slideshow plays and freezes when it pauses. Under reduced motion or the page's Pause motion control there is no autoplay, no zoom and no Pause button: one image with Previous and Next.

**Rules.** The 18+ check runs when the page renders, not only when an image is added. An image labeled `adult` after it joined a gallery, or held by moderation, leaves the public HTML at once, and the editor says 1 image left this gallery. It is labeled 18+. Gallery images never feed the page's share image, JSON-LD or sitemap (today these use the avatar only; keep it that way). Analytics: Shop this piece sends the existing `click` event with `blockId` and the link `url`. Opening the lightbox is not tracked. No visitor data beyond the existing event identity.

**Decisions.**
- GA1 Alt text. Recommended: asked for every image, with a count in the editor (3 images need a description) and a Fix chip in the preview; not blocking publish. Alternative: required before the block shows.
- GA2 Storage. Recommended: images live in the content library (R2), counted in storage, with the existing upload validation. Alternative: separate block storage.
- GA3 18+ images. Recommended: images labeled 18+ cannot be added to a gallery; they belong in the content block with the age check. Alternative: blurred gallery tiles.

## 5. Affiliate picks (`picks`)

**Job.** Recommend products and send fans to the shop, with the commission disclosed.

**Config.** `title`, `layout` (`carousel`, `grid`, `list`), `collections[]` (optional tabs, 0 to 6), `items[]` (max 30: `url`, `title`, `imageId` or fetched image, `merchant`, `price` text optional, `note` optional, `collection`), `amazonTag` and its Amazon store (for example amazon.es) read from account settings. The tag is added only to links on that store. Links to other Amazon stores get no tag, and the editor says so. Common settings: `schedule`, `access`, `attention`, `motion`.

**Public.** Product cards: image 1:1, merchant, title (2 lines), creator's note, price when the creator typed one, Shop button. Collection chips above when used. A fixed disclosure line under the title, before any product: Affiliate links. Mara gets a commission on purchases. Each card carries an Affiliate label. When the block holds an Amazon link, a second fixed line shows Amazon's required Associate statement, word for word from the Operating Agreement section 5. Shop is a plain link to the merchant URL with the tag in place, `target="_blank"` and `rel="sponsored noopener"`. No redirect through Amped. The tap sends the existing `click` event with `blockId` and the link `url` by beacon. No visitor data is added. Amazon picks never show a price. Locked by Who can open this: the title, the disclosure and the lock card, no product links in the HTML. Zero picks: the block renders nothing on the page.

**Editor.** Paste a product link; the server fetches title, image and merchant (Open Graph, cached, SSRF guarded) and the creator edits them. Amazon links are not fetched, because Amazon does not allow scraped or cached product images. The server expands short links (amzn.to), reads the store and the product id, removes any tag already in the link and adds the creator's tag. The creator types a title and adds her own photo. Drag to reorder. Price field says Shown as typed. Prices are not updated. Amazon picks have no price field, because Amazon allows prices only from its own API. Each typed price stores the date it was typed; after 30 days the editor shows Check 2 prices on the block row. Account, Affiliate links reminds the creator to add amped.bio/{handle} to the sites in her Associates account.

**Decisions.**
- AF1 Disclosure. Recommended: fixed line on the block and a label on each card; cannot be turned off. Why: FTC endorsement guides. Alternative: one line only.
- AF2 Prices. Recommended: optional, typed by the creator, with Prices may change in the footer. Alternative: live prices (needs merchant APIs).
- AF3 Amazon tag. Recommended: one field in Account, added to Amazon links on save. Alternative: per link.

## 6. Header and divider (`section`)

**Job.** Give long pages structure and a way to jump.

**Config.** `mode` (`header`, `divider`, `spacer`). Header: `eyebrow`, `title`, `size` (S, M, L), `align`. Divider: `style` (`line`, `dots`, `icon`, `text`, `wave`), `icon` or `text`. Spacer: `height` (13, 34, 55, 89). Page level: `sectionMenu` (bool), stored once on the page. The checkbox on every header block shows and sets the same value. Limits: eyebrow up to 24 characters; title 1 to 40 and required in Header mode; divider text 1 to 24 and required for the text style. Invalid input shows its fix on blur and never saves.

**Public.** Headers in the creator's font. Each header is an h2 with a stable id (section 1, Heading levels). Section menu: a chip row of header titles that pins under the status bar after the visitor scrolls past the profile; the current section's chip is filled; tapping scrolls smoothly; hidden under 3 headers.

- The menu is a `nav` with the label Sections. Each chip is a link to its header id. The current chip carries `aria-current="location"`.
- Enter on a chip scrolls to the header and moves focus to it (the header has `tabindex="-1"`), so keyboard and screen reader users land in the section they chose.
- The page sets `scroll-padding-top` to the pinned menu height, so a focused control or a target header is never hidden under the menu (WCAG 2.4.11).
- Chips show the full header title on one line, up to 233 wide, and truncate with an ellipsis. The text stays whole in the DOM. When the chips do not fit, the row scrolls sideways and keeps the current chip in view.
- Only headers present in the HTML for this visitor count toward the 3. A scheduled header that is not yet live, or a header whose Who can open this hides it, gets no chip.
- Dividers in line, dots, icon and wave are decorative and `aria-hidden`. A text divider is a `role="separator"` with its text as the label.
- Spacers render empty space with no role.

**Motion.** Divider line draws from the center on view (scroll driven scale behind `@supports (animation-timeline: view())`, IntersectionObserver fallback). The section menu chip moves with a View Transition when the section changes, or a 233 ms CSS color change where View Transitions are not available. Under prefers-reduced-motion and the page's Pause motion control, lines show at full length, the chip fill changes without movement, and tapping a chip jumps.

**Analytics.** `section_menu_tap` with block id and section index. No personal data.

**Decisions.**
- HD1 One block with three modes. Recommended. Alternative: three block types.
- HD2 Section menu. Recommended: opt in on a header block, pins after the profile, needs 3 or more headers. Alternative: always on for long pages.

## 7. Countdown (`countdown`)

**Job.** Count down to a real date and act at zero.

**Config.** `title`, `date` and `time` with the creator's time zone, `style` (`digits`, `cards`, `minimal`), `units` (days, hours, minutes, seconds), `atZero` (`message` with text, `hide`, `reveal` a chosen hidden block), `button` (`none`, `calendar`, `link`).

- The schema stores one absolute moment (`target`, ISO 8601 UTC) and the creator's IANA zone. It has no duration, per visitor or daily reset field, and the editor never offers one (CD1).
- A moment in the past does not save. The fix reads: Pick a time in the future.
- The reveal picker lists only hidden blocks on this page. It never lists the countdown itself or another countdown.
- If the chosen hidden block is deleted, At zero falls back to Hide this block and the editor says so on the countdown row.
- A unit that is off folds into the next larger unit that is on. With Seconds off, the block updates once a minute.

**Public.** Digits in the creator's font, tabular, with labels. The line under it reads the moment in the visitor's own time (Fri 6 Nov, 8:00 PM your time). The server renders it in the creator's zone with the zone name, and the client switches it to the visitor's zone after load. Add to calendar offers Apple, Google and Outlook (.ics). At zero: the message, or the block disappears, or the chosen block appears in its place.

- The digits sit in a `role="timer"` element, which is not live. Its accessible name reads the time left in words (11 days, 4 hours, 32 minutes left) and changes at most once a minute. Nothing is announced every second.
- At zero, one polite status message announces the outcome (for example: The kiln sale is open). If focus was inside the block, it moves to the new block's action, or to the message.
- Add to calendar opens a modal sheet (`dialog` with a label). Focus goes to the first calendar. Tab stays inside. Escape and Close shut it and focus goes back to Add to calendar. If zero arrives while the sheet is open, the sheet closes first.
- The count runs on server time: the page carries the server's now, and the client keeps the offset, so a wrong device clock never shows a wrong count.
- Pause motion stops the digit flip and the seconds unit; the block then updates once a minute (WCAG 2.2.2). Reduced motion keeps the count but changes digits in place with no flip.

**Server rules.** A revealed block is not in the page HTML before zero; the server includes it from the first request after zero. A hidden block with a countdown attached shows Revealed at zero in the editor.

- Today (development a3ce3330) `handle.getHandle` sends every block row, hidden ones included, and the page drops them on the client with `isHidden`. The build must drop hidden blocks and reveal targets before zero on the server for everyone except the owner, in the getHandle response, the page HTML and its data payload, sitemaps, llms.txt and any preview.
- In an open tab at zero, the client asks the server for the block (`countdown.reveal` with the countdown block id). The server sends it only when its own time is at or past `target`. If the client is early, the server sends the time left and the client waits.
- Hide this block: the server drops the countdown from the first request after zero.
- A revealed block keeps its own Who can open this, Schedule and 18+ rules after zero.

**Analytics.** `countdown_calendar_add` with block id and calendar (apple, google, outlook). `countdown_reveal` with block id. No personal data and no visitor time zone.

**Decisions.**
- CD1 Real dates only. Recommended: no per visitor or daily reset timers. Why: FTC treats fake countdown timers as a dark pattern. Alternative: offer evergreen timers.
- CD2 Reveal on the server. Recommended. Why: nothing to find in the HTML early. Alternative: hide with CSS until zero.
- CD3 Visitor time. Recommended: show the visitor's local time with a label. Alternative: the creator's time zone.

## 8. Embed (`embed`)

**Job.** Bring an approved tool onto the page without raw code.

**Config.** `url`; the provider is detected and the URL is rewritten to the provider's embed URL. `title` (used as the iframe title), `height` (`auto` per provider, S, M, L).

**Allowlist v1.** Calendly, Cal.com, Typeform, Tally, Google Forms, Google Maps, Bandcamp, Apple Podcasts, Substack, Luma, Eventbrite, Gumroad, Loom, Figma, Canva.

**Provider registry.** One registry in `@repo/constants` serves Embed and every block that loads a third party after consent: Media (MD1), Booking (BK1), Map live map (MP4, OpenStreetMap), Release and Podcast players. Each entry holds: host patterns, the rewrite to the embed address, the Auto height at 390 wide, the `allow` list, the name used in the cookie line and in Privacy choices, and the block that serves it better, if any. The public page CSP `frame-src` lists only registry hosts.

**Rewrite on the server.** `embed.resolve` runs on save. It rewrites the link, fetches the provider poster when one exists, and stores both. Bandcamp needs the album or track id from the page. Google Maps share links resolve to a place before the embed address is built. A provider that only embeds through its own script on our page is not offered: Eventbrite and Gumroad are checked at build, and if no script free embed address works, the link saves as a link block with Add as link.

**Frame.** `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"`. No `allow-top-navigation`. `allow` from the registry only: `fullscreen` for Loom, Figma, Canva and Google Maps; `autoplay; encrypted-media` for Bandcamp and Apple Podcasts; `payment` for Calendly, Cal.com and Gumroad; nothing for the rest. `referrerpolicy="strict-origin-when-cross-origin"`. `title` is the block title. Auto height is measured per provider at build so the provider's main action shows without scrolling inside the frame.

**Public.** Before consent: a facade at the final height with the provider name, the title, a poster when the provider offers one, and Load {provider}; a line says {Provider} may set cookies. The poster is served by Amped from the copy stored on save, never from the provider. The page HTML holds no provider address; the client sets the frame `src` only after Load or the stored Embedded content choice. After Load or a page level Embedded content choice: the iframe at its final size, with a skeleton until it loads. Focus moves to the frame region on Load, and a status line says Loading {Provider}, then {Provider} loaded.
- Load failure: no load event after 15 seconds shows "{Provider} did not load." with Try again and Open on {Provider}, at the same height.
- Locked: the Block settings locked card (BS4). The provider address is not in the HTML until the rule passes.
- Scheduled: absent from the HTML before go live and after expire (BS1).
- 18+: the allowlist holds no adult providers. If the creator sets an age rule in Who can open this, the locked card applies, and no poster or provider name for that block reaches previews or the HTML.

**Editor.** Paste a URL; a chip shows the detected provider with Change. An unsupported URL says We cannot embed this site yet. Add it as a link instead, with Add as link. Suggest a provider opens the Telegram link. When a dedicated block serves the provider better, a hint under the chip offers it and never blocks the embed: Cal.com and Calendly to Booking, Google Maps to Map and location, Bandcamp to Release and pre save, Apple Podcasts to Podcast, Substack to Latest posts, Luma and Eventbrite to Events, Typeform, Tally and Google Forms to Form.

**Decisions.**
- EM1 Allowlisted providers only, no raw HTML (custom-html on the card). Recommended.
- EM2 Consent. Recommended: a new Embedded content choice in the consent banner; until it is allowed, each embed loads on its own tap. Alternative: load embeds on every visit.

**Consent build.** Embedded content is a new category `embeds` in `ConsentState` (apps/landingpage/src/lib/consent.ts) and a new row in `TrackingConsentBanner`, "Embedded content", listing the providers on this page. The banner keeps its Amped chrome, its title Your privacy choices, and its equal Reject all and Accept all buttons. Accept all turns `embeds` on; Reject all turns it off. `CONSENT_POLICY_VERSION` is bumped so every visitor sees the new row once. Load on one facade loads that frame for this page view only and stores no choice. Withdrawing the choice puts every frame on the page back to its facade without a reload. Under Global Privacy Control the row starts off and stays a free choice. The banner's link is Privacy choices, as today.

**Analytics.** `embed_viewed` (provider), `embed_loaded` (provider, `via`: tap or allowed), `embed_load_failed` (provider), each with block id. Editor: `embed_unsupported_pasted` with the host only. No visitor data and no full addresses.

**Legacy map.** No `embed` type exists at development a3ce3330, so no stored rows map to it. Today's code frames third parties on page open through `EmbedFrame` and `SelfSizingFrame` (apps/landingpage/src/components/blocks/frame.tsx). Each path moves behind the same consent model: YouTube, Vimeo and Spotify to the Media facade (MD1); Instagram, TikTok and Facebook (`react-social-media-embed`, provider scripts on page open) to the Media facade or the Social posts server copy (SP1); X (`react-tweet`) to SP1; Substack to Latest posts (RS4); NFT collection to the Collectibles shelf (CS3); Uniswap retires (CS4). All of these load before consent today, so the registry and the `embeds` consent category ship before or with the first of these blocks.

## 9. Add block catalog

**Job.** Find any of about 60 blocks fast.

**Design.** The Add block dialog keeps Link first. Below it: a search field (Search blocks), family chips (All, Links and structure, Media, Audience, Commerce, Identity), then tiles by family. Each tile: icon, name, one line, New badge, One per page or On your page for singletons, Coming soon (not pickable) for blocks waiting on another card. Focus or hover on a tile shows a small live preview in the creator's theme. On phones the dialog is a full height sheet.

**Registry fields the catalog reads.** `family`, `singleton` (bool, or a mode for Marquee: only the bar is one per page), `status` (`available`, `soon`), `dependsOn` (card ids), `releasedAt`, `keywords[]`. New shows for 30 days after `releasedAt`, so wave 2 and 3 blocks get it when they ship. A block whose `dependsOn` card has not shipped shows Coming soon automatically.

**Tiles, in All order (board ab1).** Link stays above search.
- Links and structure: Text, Header and divider, Gallery, Embed, Collection, Social icons (one per page), Marquee and bar (bar one per page). Coming soon: Sub pages.
- Media: Video, Music, Social post, Social feed (the Media block kinds), Latest posts, Podcast, Release and pre save. Coming soon: Video, audio and files (Content system card).
- Audience: Email signup, SMS signup (ships with Email signup), Form, Countdown, Follow button (one per page), Followers (one per page), FAQ, Save contact, Media kit, Events, Booking, Lead magnet, Poll and survey, Testimonials, Timeline, Map and location, Community. Coming soon: Ask me (AI builder, #14).
- Commerce: Affiliate picks, Shop, Course, Paid requests, Fundraising goal, Discount code, Price list. Coming soon: Store (#20), Tip and Membership (#25), Live tickets (Live streaming card). Course and Paid requests depend on store offers (#20) and show Coming soon until those ship.
- Identity: RNS ID (one per page), Telegram message (one per page), Creator pool, Referral (one per page), Collectibles, Token price. Coming soon: Quests (#23), Superfans (#24).
- Not in the catalog: Telegram group (new doors go in Community; existing rows stay), Swap (retired, CS4), and the hidden legacy types `token-price`, `nft-collection`, `uniswap`, `substack`.

**Singletons.** Today's `SINGLETON_BLOCK_TYPES` (referral, follow, followers, rnsid, telegram_message, telegram_group) plus `social` and the Marquee bar. A singleton already on the page shows On your page with a check, and picking it opens that block, as today.

**Search.** Matches names, one lines and `keywords[]`, which hold the providers each block works with (YouTube finds Video and Social feed; Calendly finds Booking and Embed). Coming soon tiles appear in results, marked. No match: "No blocks match {query}. Paste the link above to add it as a link." with Suggest a block, which opens the Telegram link.

**Analytics.** `add_block_opened`, `add_block_picked` (type, `via`: browse or search), `add_block_search_empty` (result count only, never the query text), `add_block_soon_tapped` (type).

**Decision.**
- AB1 Coming soon tiles. Recommended: show them, not pickable, so creators see what is next. Alternative: hide until built.

## 10. Build notes

- New types join `BaseBlockType`, `CONFIG_SCHEMAS` and the block registry in `packages/constants/src/blocks.ts` (one file at a3ce3330, not a folder). Renderers live in `packages/ui/src/blocks/` and serve the editor preview and amped.bio (Theme Engine v2 phase 1 is the prerequisite).
- Server: `audience` router (subscribers, double opt in, provider sync), `forms` router (responses, files, retention sweep), `picks.preview` (Open Graph fetch with SSRF guard and cache; never for Amazon hosts; keep the name `picks`, because `affiliate` already names the referral rewards router and AFFILIATES_PRIVATE_KEY), countdown reveal in `getHandle`, embed allowlist and URL rewrite in `@repo/constants`.
- Flags: `SHOW_BLOCKS_V2` on the server, `VITE_SHOW_BLOCKS_V2` on the client, `NEXT_PUBLIC_SHOW_BLOCKS_V2` on the public page.

## 11. Design pages

Boards drawn in Prism 2.2 for the editor and in two sample creator themes for the page. Each page has a live motion prototype. All 15 boards pass the gate (contrast, 44 targets, words, dashes, overflow). Screen Review rows 204 to 218.

- Email signup: https://claude.ai/artifact/YHxikEHSXB6tLfNQdNTGKM
- Form: https://claude.ai/artifact/QcmgC8qfpdvAzHDCkhUQNH
- Gallery: https://claude.ai/artifact/QuY3RL2P4AztqNCXN8bRB3
- Affiliate picks: https://claude.ai/artifact/KFVEUd93n6na2qNxp6C9B2
- Header and divider: https://claude.ai/artifact/SJzFE1sRqCDnT81i3uhwiN
- Countdown: https://claude.ai/artifact/UDVXSebVTShbCdmuHvv18U
- Embed: https://claude.ai/artifact/4NVRQrDRJYajxD2xnBj9ky
- Add block catalog: https://claude.ai/artifact/HsJ9wFcrtw5YLak4yvQ3o4
