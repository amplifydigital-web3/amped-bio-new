# Block Review v2, wave 1 redesigns Full QA

Build Board card #54. Date 26 Oct 2026. Baseline development a3ce3330.

Full QA of the redesigns of today's blocks and the shared Block settings row. Four independent reviewers ran the Full QA checklist (spec completeness, decisions, accessibility with axe-core and keyboard, motion and reduce motion, copy and compliance, edge cases). Because these blocks exist today, each reviewer checked the legacy map against the code at a3ce3330. Board and prototype fixes are made and republished. All spec edits are applied to `docs/features/block-review-v2-existing-blocks-design.md`; one Social posts edit is applied to `docs/features/block-review-v2-wave3-design.md`.

## Verdicts

| Block | Rows | Verdict | Fixed on boards and prototype |
|---|---|---|---|
| Link | 219, 220 | Pass with fixes | Subtitle field; schedule value and weekday; attention starts in view, 3 plays; labels wrap at 200 percent text |
| Media | 221, 222 | Pass with fixes | One Load button and focus to the player; TikTok carousel gets Previous and Next; Caption and muted autoplay controls; 19 missing ARIA states |
| Text | 223, 224 | Pass with fixes | Plain keeps today's 16/26 metrics; collapse fade is a mask; hidden links open the note on focus |
| Pool and referral | 225, 226 | Pass with fixes | QR sheet is a modal with focus return; Compact note corrected; reflow at 320 |
| Follow and Followers | 227, 228 | Pass with fixes, blocker fixed | Ticker had no pause control (WCAG 2.2.2); it now has a Pause names button |
| Identity and Telegram | 229, 230 | Pass with fixes | Gender switch; RNS ID access row read only; identity sheet focus return under reduce motion; Tab trap |
| Block settings | 231, 232 | Pass with fixes | Weekdays and Opens in copy; the countdown row is full color and passes the gate; Any of these takes two to four rules |

Every board passes the gate. axe-core finds zero serious or critical issues in every prototype in Graphite and Sand, with motion on and off.

## Urgent, today's code (outside v2)

- **Link URLs accept `javascript:`.** `linkConfigSchema` checks `url` with `z.string().url()`, which accepts `javascript:alert(1)` (confirmed with zod 3.25). `editBlock` takes `config: z.any()`, and `sanitizeBlockConfig` returns link configs unchanged. `ProfileView.tsx` renders `href={block.config.url}`, and `TelegramBlock.tsx` renders `href={block.config.content}`. A creator can store a link that runs script on amped.bio when a visitor taps it. Fix now: allow only http, https, mailto and tel on every save path, and refuse other schemes at render.

## Fix before build, from today's code (now in the spec)

- **Block settings server rule.** getHandle sends every block row, hidden ones included. For everyone but the owner, hidden, not yet live, expired and locked content must leave the response, HTML, payload, sitemaps, llms.txt, share tags and previews. A CI test checks nothing leaks.
- **Config fields are stripped on save.** zod drops unknown keys and `sanitizeBlockConfig` keeps schema fields only for some types. Every config schema must extend a shared `blockSettingsSchema`, or the four settings never save. The same strip already removes `platform` from Telegram, team and email collect text rows when the whole page saves.
- **Text schema.** `textConfigSchema` allows 9 tags while the editor writes br, code, h1, h2, blockquote, ol and li, so one such text block fails the whole page save. TX1 now takes one exported tag list shared with the sanitizer.
- **Link previews.** Custom link icons load from Google's favicon service in the visitor's browser. Amped fetches and serves them, with the full SSRF and redirect rules (LK1). Locked links show no preview, host or pixel URL.
- **Media consent.** Media joins the wave 1 provider registry and the `embeds` consent category. Posters, covers and feed thumbnails are served by Amped. Muted autoplay runs only after the visitor allowed embedded content. Spotify no longer gives previews to new apps, so its preview plays only inside its own frame.
- **Media legacy map.** Every platform now has a home: creator-pool rows go to Pool, discord to a hidden link, twitch to video kept hidden. Facebook videos go to Media video; other Facebook links go to Social posts behind the Embed facade.
- **Identity.** `rnsIdBlockOptions` must respect Schedule. Over 18 never shows when false. The Telegram group block renders nothing today; its open state is per viewer after load.
- **Who can open this.** Only follower, pool_member, stake_min and any or all are live in the gating engine. Members and Paid show disabled with stated copy until Memberships and content PR 10 ship. The schedule stores its own time zone.
- **Follow.** Pages that show a Follow block and a card Follow button lose the card button under the one Follow rule. The stored value is kept.

## Pool and PL1 (Rob's answer kept)

The helper, the rate format and the testnet line match today's code word for word. The copy around them adds no new offer language. Faces, a backer count, the rate and a Join pool button now share one card, which reads more like an offer than today's View pool card. Controls in the spec: the helper and testnet line are never clamped or hidden, the rate never shows without its helper, and a save check rejects banned words, percent signs and amounts in creator text. Counsel review of the card as drawn is advised before launch.

## Drift across configurators

Row order and placement of Block settings match in all 42 configurators. Three kinds of drift belong to their owners and are logged for the wave 2 and 3 QA: read only rows drawn as active rows (cm2, co2, mq2, tk2), block specific motion in the shared Motion value (20 boards), and schedule value formats (lk2 fixed; mq2 and dc2 open; mq2 reads Sun 9 Nov, which is a Monday).

## Screen Review images

The fixed boards are on each design page. Rows 219 to 232 still show the earlier images until Rob approves the asset upload.
