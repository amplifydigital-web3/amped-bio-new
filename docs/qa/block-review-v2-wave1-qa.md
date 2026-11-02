# Block Review v2, wave 1 Full QA

Build Board card #54. Date 26 Oct 2026. Baseline development a3ce3330.

Full QA is the last design check before handoff to development. Four independent reviewers, who did not make the designs, ran the same checklist on each wave 1 design: spec completeness, decisions, accessibility (WCAG 2.2 AA with axe-core, keyboard, contrast, targets, reflow at 320 and 200 percent text), motion and reduce motion, copy and compliance, and edge cases. They fixed design level problems on the boards and prototypes, re-ran the gate, and wrote exact spec edits. All spec edits are applied to `docs/features/block-review-v2-wave1-design.md`.

## Verdicts

| Block | Rows | Verdict | Blockers | Fixed on boards and prototype |
|---|---|---|---|---|
| Email signup | 204, 205 | Pass with fixes | 1, fixed | Consent line was cut on Inline and missing on Cover; Welcome subject field; Text me too option; error tied to the field and announced; focus to Check your inbox |
| Form | 206, 207 | Pass with fixes | 0 | Retention line on Sent (FM4); file hint (FM1); Description field; Inbox tabs; errors announced, focus to the first invalid field; topic chips one tab stop |
| Gallery | 208, 209 | Pass with fixes | 0 | Lightbox focus, trap and return; tile names from the description (GA1); slideshow with Pause, no autoplay or zoom under reduce motion; long text wraps |
| Affiliate picks | 210, 211 | Fail, one decision open | 1, needs Rob | Typed prices removed from Amazon picks; no fetched Amazon images; tag tied to one Amazon store; rel sponsored; collection chips are toggle buttons |
| Header and divider | 212, 213 | Pass with fixes | 0 | Section headers are h2; jump menu moves focus and marks the current section; decorative dividers hidden from screen readers |
| Countdown | 214, 215 | Pass with fixes | 0 | Wrong weekdays fixed; timer name changes at most once a minute; one announcement at zero; calendar sheet is a modal dialog |
| Embed | 216, 217 | Pass with fixes | 1, fixed | Consent board redrawn as today's privacy banner with an Embedded content row; focus moves to the frame after Load |
| Add block catalog | 218 | Pass with fixes | 0 | Catalog now lists every block from all three waves: 44 pickable, 9 Coming soon, singleton markers, search and no match states |

Every board passes the gate after the fixes. axe-core found zero serious or critical issues in every prototype in Graphite and Sand. The remaining board hits come from the board harness (document title, lang, the kit's Phone and Desktop tabs) and will not exist in the build. Nothing loops past 5 seconds, and reduce motion leaves no running animation.

## Needs Rob

- **Amazon Associate statement (Affiliate picks).** Amazon's Operating Agreement section 5 requires a fixed statement, word for word, on any page with Amazon links. It contains a word on the compliance banned list. Recommended: allow it as quoted legal text, only on Affiliate picks blocks that hold an Amazon link. Alternative: no Amazon links in v2. Without an answer, Amazon links cannot ship.

## Fix before build, now in the spec

- **Countdown reveal (CD2).** At a3ce3330 the public page receives every block, hidden ones included, and hides them in the browser. A reveal at zero, scheduled blocks and locked blocks only stay private if the server drops them from the response for everyone but the owner. The spec now says so.
- **Email signup.** The already subscribed state told anyone whether an address is on the list. A typed address now always gets Check your inbox; the email itself says already subscribed. Legacy map written: the old `email-collect` text rows never stored an address, so they migrate hidden with no subscribers.
- **Form.** Visitors who are not signed in need a public upload route behind the captcha and rate limit. Fan files open only when the scan is clean, never get a public URL and never go in the notify email.
- **Gallery.** The 18+ check runs at render, so an image labeled 18+ after it joined a gallery leaves the public HTML at once.
- **Embed.** Posters are stored by Amped on save, so no provider request happens before consent. One shared provider registry for Embed, Media, Booking, Map, Release and Podcast. Fixed sandbox, per provider allow list, CSP frame-src. Legacy map covers every frame that loads third party content today.
- **Header.** Heading levels rule for every block: the page name is the only h1, section headers are h2.

## Open for build

- Eventbrite and Gumroad embed only through their own scripts. Find a script free address or save them as link blocks.
- Measure provider auto heights at 390 wide (Cal.com 331 is likely short).
- Facebook posts have no v2 home (Media maps facebook to video; Social posts has no Facebook).
- At 320 wide and 200 percent text, the shared creator button's empty icon slots push 34 px out.
- Section 10 build paths: `packages/constants/src/blocks.ts` is one file today, not a folder.
- The SMS Text me too card (sm1) has no Privacy link on its email consent line. Wave 3 QA picks it up.

## Screen Review images

The fixed boards are on each design page. The new board images were not uploaded to the Screen Review asset store: the permission check refused the reviewers' upload, and the upload waits for Rob's OK. Rows 204 to 218 carry a note pointing to the design pages until then.
