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
- **Targets.** 44 minimum, 55 for the primary action. Focus is a 2px outline in the creator's text color.
- **Common settings row** at the bottom of every configurator: Schedule, Who can open this, Attention, Motion. Same order, same place, every block. Each row shows its current value and opens in place.
- **Motion slots.** Entrance on first view (rise 13 px and fade, 377 ms, children staggered 55 ms), Interaction (theme hover and press), State change (View Transitions, 233 ms), Attention (one block per page). Every slot is off under prefers-reduced-motion and the page's Pause motion control. Entrance uses CSS scroll driven animation behind `@supports (animation-timeline: view())` with an IntersectionObserver fallback.
- **Editor.** Each block opens inline in the Page list (D18). Valid changes autosave after 800 ms (D11). Invalid input shows its fix on blur and never saves. The preview updates within 100 ms.
- **Copy.** No earn, yield, income, profit, invest or staking language in any block, default or helper. No dashes.
- **Data.** Anything a fan types goes to the server once, over the existing tRPC client, with Cap captcha on the public page and a rate limit per IP and per block.

## 2. Email signup (`email_signup`)

**Job.** Turn a visitor into a subscriber in one step, with consent the creator can prove.

**Config.** `title` (1 to 40), `description` (0 to 160), `eyebrow` (0 to 24), `buttonLabel` (1 to 24, default Subscribe), `layout` (`card`, `inline`, `cover`), `coverId` (content library image, cover layout only), `askName` (bool), `welcome` (`{on, subject}`), `destinations` (Amped list always, plus connected providers).

**Public states.** Default; signed in fan (one tap: Subscribe as their account email, with Use a different email); invalid email on blur (Enter an email like name@example.com); sending (button holds its width, spinner, 233 ms minimum); sent (Check your inbox card replaces the form, Resend the link with a 60 second cooldown); already subscribed (You are already on Studio notes); confirmed (after the email link, the page opens with a toast You joined Studio notes); rate limited (Try again in a minute).

**Consent line, fixed.** You agree to get emails from {creator}. Unsubscribe any time. Privacy. The creator cannot edit or hide it. The subscriber row stores the line the fan saw, the page, the time and the IP hash.

**Double opt in.** Always on. The confirm link lasts 7 days. Unconfirmed rows delete after 30 days.

**People, Subscribers tab.** Totals (subscribers, waiting, joined in 30 days), filter chips (All, Confirmed, Waiting, Unsubscribed), search, table (email, name, source block, status, joined, More), Export CSV, sync status for each connected provider. Broadcast (#1) sends to confirmed subscribers.

**Decisions.**
- ES1 Double opt in for every list. Recommended: always on. Why: proves consent in the EU and keeps bad addresses off provider lists. Alternative: optional, per block.
- ES2 Signed in fans subscribe in one tap with their account email. Recommended: yes, after an explicit tap. Alternative: always type an email.
- ES3 Subscribers live in People, Subscribers tab. Recommended. Alternative: inside Analytics.

**Analytics.** `email_signup_viewed`, `email_signup_started`, `email_signup_sent`, `email_signup_confirmed`, each with block id. Conversion = confirmed over viewed.

## 3. Form (`form`)

**Job.** Collect a structured request (contact, booking request, collab, RSVP) without sending the fan off the page.

**Config.** `template` (`contact`, `booking`, `collab`, `rsvp`, `custom`), `title`, `description`, `fields[]` (max 12: `shortText`, `longText`, `email`, `phone`, `choice` single or multi, `dropdown`, `date`, `checkbox`, `file`), each with `label`, `required`, `help`; `submitLabel`; `confirmation` (message, 0 to 200); `notify` (email the creator on each response); `steps` (auto: more than 5 fields splits into steps of up to 4).

**Public states.** Default; focused field; multi step with step bar in the creator's font; validation on blur and on submit (focus moves to the first invalid field); file chosen with name and size, upload progress, scan; sending; sent (the creator's confirmation message, Send another); error (Your message did not send. Check your connection, then try again).

**Responses.** Inbox gets a Forms tab beside Messages: list with unread dot, form name, first line, time; detail with every answer, Reply by email (opens the fan's address), Mark done, Delete. People, Forms tab has Export CSV per form.

**Decisions.**
- FM1 File uploads. Recommended: one file field per form, images and PDF only, 10 MB, through the existing upload validation and scan; files stay private to the creator. Alternative: no files.
- FM2 Where responses live. Recommended: Inbox, Forms tab, plus Export in People. Alternative: email only.
- FM3 Spam. Recommended: Cap captcha (invisible), 5 responses per hour per IP per form, honeypot field. Alternative: visible captcha.
- FM4 Retention. Recommended: responses delete after 12 months; the creator can export or delete any time; the confirmation screen links the creator's privacy line. Alternative: keep forever.

## 4. Gallery (`gallery`)

**Job.** Show work as images, with a viewer that feels native on a phone.

**Config.** `layout` (`grid` 2 or 3 columns, `masonry`, `carousel`, `slideshow`), `aspect` (`square`, `4:5`, `16:9`, `original`), `images[]` (max 24: content library id, `alt`, `caption`, `link`), `showCaptions`, `autoplay` (slideshow only, 5 s, pauses on touch and when off screen).

**Public states.** Grid, masonry, carousel with peek of the next image and a counter, slideshow with pause control; lightbox (full screen, swipe, pinch zoom, caption, link button, counter 3 of 12, Close 44, Escape and swipe down close); loading (blurred placeholder from the stored dominant color).

**Motion.** Grid items stagger in. Carousel uses scroll snap with momentum. Lightbox opens with a shared element View Transition from the tapped image. Slideshow cross fades with a slow 1.05 zoom; under reduced motion it shows one image with arrows.

**Decisions.**
- GA1 Alt text. Recommended: asked for every image, with a count in the editor (3 images need a description) and a Fix chip in the preview; not blocking publish. Alternative: required before the block shows.
- GA2 Storage. Recommended: images live in the content library (R2), counted in storage, with the existing upload validation. Alternative: separate block storage.
- GA3 18+ images. Recommended: images labeled 18+ cannot be added to a gallery; they belong in the content block with the age check. Alternative: blurred gallery tiles.

## 5. Affiliate picks (`picks`)

**Job.** Recommend products and send fans to the shop, with the commission disclosed.

**Config.** `title`, `layout` (`carousel`, `grid`, `list`), `collections[]` (optional tabs, 0 to 6), `items[]` (max 30: `url`, `title`, `imageId` or fetched image, `merchant`, `price` text optional, `note` optional, `collection`), `amazonTag` read from account settings.

**Public.** Product cards: image 1:1, merchant, title (2 lines), creator's note, price when the creator typed one, Shop button. Collection chips above when used. A fixed disclosure line: Affiliate links. Mara gets a commission on purchases. Each card carries an Affiliate label. Taps open the merchant in a new tab and count as clicks.

**Editor.** Paste a product link; the server fetches title, image and merchant (Open Graph, cached, SSRF guarded) and the creator edits them. Amazon links get the creator's Associates tag added. Drag to reorder. Price field says Shown as typed. Prices are not updated.

**Decisions.**
- AF1 Disclosure. Recommended: fixed line on the block and a label on each card; cannot be turned off. Why: FTC endorsement guides. Alternative: one line only.
- AF2 Prices. Recommended: optional, typed by the creator, with Prices may change in the footer. Alternative: live prices (needs merchant APIs).
- AF3 Amazon tag. Recommended: one field in Account, added to Amazon links on save. Alternative: per link.

## 6. Header and divider (`section`)

**Job.** Give long pages structure and a way to jump.

**Config.** `mode` (`header`, `divider`, `spacer`). Header: `eyebrow`, `title`, `size` (S, M, L), `align`. Divider: `style` (`line`, `dots`, `icon`, `text`, `wave`), `icon` or `text`. Spacer: `height` (13, 34, 55, 89). Page level: `sectionMenu` (bool) on any header block.

**Public.** Headers in the creator's font. Section menu: a chip row of header titles that pins under the status bar after the visitor scrolls past the profile; the current section's chip is filled; tapping scrolls smoothly; hidden under 3 headers.

**Motion.** Divider line draws from the center on view (scroll driven scale). The section menu chip moves with a View Transition when the section changes.

**Decisions.**
- HD1 One block with three modes. Recommended. Alternative: three block types.
- HD2 Section menu. Recommended: opt in on a header block, pins after the profile, needs 3 or more headers. Alternative: always on for long pages.

## 7. Countdown (`countdown`)

**Job.** Count down to a real date and act at zero.

**Config.** `title`, `date` and `time` with the creator's time zone, `style` (`digits`, `cards`, `minimal`), `units` (days, hours, minutes, seconds), `atZero` (`message` with text, `hide`, `reveal` a chosen hidden block), `button` (`none`, `calendar`, `link`).

**Public.** Digits in the creator's font, tabular, with labels. The line under it reads the moment in the visitor's own time (Fri 7 Nov, 8:00 PM your time). Add to calendar offers Apple, Google and Outlook (.ics). At zero: the message, or the block disappears, or the chosen block appears in its place.

**Server rules.** A revealed block is not in the page HTML before zero; the server includes it from the first request after zero. A hidden block with a countdown attached shows Revealed at zero in the editor.

**Decisions.**
- CD1 Real dates only. Recommended: no per visitor or daily reset timers. Why: FTC treats fake countdown timers as a dark pattern. Alternative: offer evergreen timers.
- CD2 Reveal on the server. Recommended. Why: nothing to find in the HTML early. Alternative: hide with CSS until zero.
- CD3 Visitor time. Recommended: show the visitor's local time with a label. Alternative: the creator's time zone.

## 8. Embed (`embed`)

**Job.** Bring an approved tool onto the page without raw code.

**Config.** `url`; the provider is detected and the URL is rewritten to the provider's embed URL. `title` (used as the iframe title), `height` (`auto` per provider, S, M, L).

**Allowlist v1.** Calendly, Cal.com, Typeform, Tally, Google Forms, Google Maps, Bandcamp, Apple Podcasts, Substack, Luma, Eventbrite, Gumroad, Loom, Figma, Canva.

**Public.** Before consent: a facade at the final height with the provider name, the title, a poster when the provider offers one, and Load {provider}; a line says {Provider} may set cookies. After Load or a page level Allow embedded content choice: the iframe at its final size, with a skeleton until it loads.

**Editor.** Paste a URL; a chip shows the detected provider with Change. An unsupported URL says We cannot embed this site yet. Add it as a link instead, with Add as link. Suggest a provider opens the Telegram link.

**Decisions.**
- EM1 Allowlisted providers only, no raw HTML (custom-html on the card). Recommended.
- EM2 Consent. Recommended: a new Embedded content choice in the consent banner; until it is allowed, each embed loads on its own tap. Alternative: load embeds on every visit.

## 9. Add block catalog

**Job.** Find any of about 60 blocks fast.

**Design.** The Add block dialog keeps Link first. Below it: a search field (Search blocks), family chips (All, Links and structure, Media, Audience, Commerce, Identity), then tiles by family. Each tile: icon, name, one line, New badge for these seven, On your page for singletons, Coming soon (not pickable) for blocks on other cards. Focus or hover on a tile shows a small live preview in the creator's theme. On phones the dialog is a full height sheet.

**Decision.**
- AB1 Coming soon tiles. Recommended: show them, not pickable, so creators see what is next. Alternative: hide until built.

## 10. Build notes

- New types join `BaseBlockType`, `CONFIG_SCHEMAS` and the block registry in `packages/constants/src/blocks/`. Renderers live in `packages/ui/src/blocks/` and serve the editor preview and amped.bio (Theme Engine v2 phase 1 is the prerequisite).
- Server: `audience` router (subscribers, double opt in, provider sync), `forms` router (responses, files, retention sweep), `picks.preview` (Open Graph fetch with SSRF guard and cache), countdown reveal in `getHandle`, embed allowlist and URL rewrite in `@repo/constants`.
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
