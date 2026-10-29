# Block Review v2, wave 3 Full QA

Build Board card #54. Date 28 Oct 2026. Baseline development a3ce3330.

Four independent reviewers ran the Full QA checklist on the sixteen wave 3 blocks: spec completeness, decisions, accessibility with axe-core and keyboard, motion and reduce motion, copy and compliance, and edge cases. Legacy maps were checked against the code at a3ce3330. Board and prototype fixes are made, and all sixteen design pages are republished. All 75 spec edits are applied to `docs/features/block-review-v2-wave3-design.md`. Three SMS edits are applied to `docs/features/block-review-v2-wave1-design.md`.

The 80 wave 3 decisions are still open. The reviewers checked every block against its recommendation. Full QA closes for each block when its decisions are answered as recommended. An answer that differs reopens QA for that block.

## Verdicts

| Block | Rows | Verdict | Fixed on boards and prototype |
|---|---|---|---|
| Marquee and announcement bar | 257, 258 | Pass with fixes | Wrong weekdays; the bar countdown reset per visitor (CD1), now one fixed moment; paused or reduced motion wraps the ribbon and removes the duplicate copy; focus kept on close |
| Release and pre save | 259, 260 | Pass with fixes | Wrong weekday; preview named Spotify, which gives no previews to new apps, now Apple Music; 30 day limit on unused pre save access |
| Podcast player | 261, 262 | Pass with fixes | Apple and Spotify links were drawn as coming from the feed; chapters are real buttons |
| Social posts | 263, 264 | Pass with fixes | Instagram, TikTok and Facebook also load scripts on page open today; Facebook added with Load post |
| SMS signup | 265, 266 | Pass with fixes, blocker fixed | Text me too counted a pre ticked box as text consent. It now opens a number field with its own unticked consent box. Privacy link added to the email line. Monthly frequency in every consent line |
| Lead magnet | 267, 268 | Pass with fixes | Signed in fans get the file at once and the list join still waits for the confirm link (ES1); Already on the list shows Check your inbox |
| Poll and survey | 269, 270 | Pass with fixes | Counts under 10 were shown; wrong weekdays; closes shows the time zone |
| Testimonials | 271, 272 | Pass with fixes, blocker fixed | "Mara does not pay for reviews" showed beside a stockist quote. It now shows only while every quote has no connection, enforced on the server. Source on every quote in every layout |
| Timeline | 273, 274 | Pass with fixes, blocker fixed | Members lock, which is not live, now Followers; the Now pulse ran 6 s, now under 5 s; future steps read as planned |
| Map and location | 275, 276 | Pass with fixes, blockers fixed | The locked state showed the area circle; Members now Followers; OpenStreetMap attribution |
| Community channels | 277, 278 | Pass with fixes, blockers fixed | Today's Telegram group block renders nothing, the board drew a Join button; Members now Pool fans; read only rows on cm2 |
| Fundraising goal | 279, 280 | Pass with fixes, blocker fixed | Show me as a supporter was ticked by default, now opt in; the sheet names who receives the money and the fee; refund line matches AmpedPay |
| Discount code | 281, 282 | Pass with fixes | dc2 schedule drift; compact rows had no end time; Copy said Copied when it failed |
| Price list | 283, 284 | Pass with fixes, blocker fixed | Rows were invisible under reduce motion; period, pick and includes controls added |
| Collectibles and Swap retirement | 285, 286 | Pass with fixes, blocker fixed | Cards were invisible under reduce motion; testnet line on the carousel; focus on open and close |
| Token price | 287, 288 | Pass with fixes | The default title read "REVO price", the exact phrase Telegram bans, now "REVO token"; compliance line on the compact row; the price is no longer read aloud on every update; read only rows on tk2 |

Every board passes the gate. axe-core finds zero serious or critical issues in every prototype in Graphite and Sand, with motion on and off, at 320 wide. The remaining board hits come from the board harness.

## Needs Rob

- **80 wave 3 decisions** on card #54 (MQ1 to TK5).
- **Counsel:** SMS wording, the four fixed texts and the SMS Terms section; Token price before `SHOW_TOKEN_PRICE` leaves staging; fundraising goals raised for another person or a cause.
- **Hotfix, outside v2.** At a3ce3330 the hidden `nft-collection` and `uniswap` types still render on public pages through EmbedFrame with no sandbox and no allowlist. `uniswap` frames any https address. Recommended: ship the stops as a hotfix now, ahead of SHOW_BLOCKS_V2, like D57.

## Fix before build, now in the spec

- **Marquee.** Links in the moving copy appear twice and are focusable while hidden from screen readers. The plain list under the ribbon is the keyboard path. One bar per page, checked on save. IANA time zones.
- **Release.** Today's Spotify frames go to the Media Music kind behind consent. Pre save tokens are deleted after 30 days, on cancel and on deletion. Apple MusicKit loads only after Pre add. Spotify's 2025 quota rules may block library writes; confirm before build or launch pre save on Apple Music and Deezer.
- **Podcast.** Feed, chapters and art through the LK1 guarded fetch. Feeds stream with a 10 MB cap and keep the newest 50 episodes. https enclosures only.
- **Social posts.** react-tweet and react-social-media-embed leave both apps, editor preview included. Deleted or private posts need a signal per network: Reddit answers 200 for removed posts and X answers 403 for protected accounts. SP5 leaves out Facebook while the network list includes it.
- **SMS.** STOP and HELP texts, full opt out keywords, Florida's 3 texts in 24 hours, consent records kept 5 years after the last text, a suppression hash after deletion. Wave 1 and wave 3 now share one field: `sms {on, listId}`.
- **Lead magnet.** `freeToGive` and `Entitlement` are new; neither is in a3ce3330. Files deliver only after a clean scan, with a gateway recheck at download.
- **Poll.** A vote row holds only a keyed hash, deleted 30 days after close. The option index stays out of analytics.
- **Testimonials.** Quotes can be trimmed, never reworded. No incentive for positive reviews. Review form rate limited with a bot check.
- **Timeline.** Dates stored as plain calendar values, so they never shift a day.
- **Map.** Street and address render only at exact precision. The area offset is at least 150 m and fixed per point. Public OpenStreetMap tiles and Nominatim do not allow this use: contracted or self hosted tiles, search on submit.
- **Community.** Invites single use with a 24 hour expiry. The Discord bot needs the Server Members intent and a role above the role it gives.
- **Fundraising.** Why it matters is required. Progress counts only final payments, minus refunds. AmpedPay #50 rules apply.
- **Discount code.** `discount.reveal` rate limited, no-store, never logged. Cache ends at the code's end.
- **Price list.** USDC prices follow AmpedPay #50 and show only with `PAYMENTS_ENABLED`.
- **Collectibles.** Items the creator did not issue start hidden, so spam sent to a wallet never shows. Chain text is plain with links stripped.
- **Token price.** Never in share tags, JSON-LD, llms.txt or Telegram. Since 040 D3 the public page renders nothing for `token-price`; the mock shows only in the editor preview (spec finding corrected).
- **Every block.** URL fields follow D57. Every config extends `blockSettingsSchema` and joins `CONFIG_SCHEMAS`.

## Configurator drift

Fixed in every wave 3 configurator: block motion moved out of the shared Motion value, read only rows on cm2 and tk2, schedule formats on mq2 and dc2. This closes the drift list from the wave 1 redesign QA.

## Screen Review images

The fixed boards are on each design page. Rows 257 to 288 still show the earlier images until Rob approves the asset upload.
