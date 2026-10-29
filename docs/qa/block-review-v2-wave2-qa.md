# Block Review v2, wave 2 Full QA

Build Board card #54. Date 28 Oct 2026. Baseline development a3ce3330.

Four independent reviewers ran the Full QA checklist on the twelve wave 2 blocks: spec completeness, decisions, accessibility with axe-core and keyboard, motion and reduce motion, copy and compliance, and edge cases. They also checked each block against Amped Card #58 (Save contact), AI builder #14 (Ask me) and AmpedPay #50 (Course and Paid requests). Board and prototype fixes are made, and all twelve design pages are republished. All 60 spec edits are applied to `docs/features/block-review-v2-wave2-design.md`.

## Verdicts

| Block | Rows | Verdict | Fixed on boards and prototype |
|---|---|---|---|
| Collections and folders | 233, 234 | Pass with fixes | Locked collection uses Followers, not Members, and shows no count; deep link opens the collection |
| Social icon row | 235, 236 | Pass with fixes | Follower count in each icon's name; ten icons wrap five and five; LinkedIn and Spotify say they give no count |
| RSS and latest posts | 237, 238 | Pass with fixes | Posts behind Show more were reachable by Tab before it was pressed; block title is a real heading |
| FAQ | 239, 240 | Pass with fixes | Search field was 4 px wide; Plain style gets a heading; question link has Copy |
| Save contact | 241, 242 | Pass with fixes, blocker fixed | Phone and email showed on the public page. They now go only into the saved file. QR encodes amped.bio/c/{token}. In app browser state added |
| Media kit | 243, 244 | Pass with fixes | Every figure names its source and period; tiles overflowed 8 px at 320 |
| Events and tour dates | 245, 246 | Pass with fixes, blocker fixed | Every date used 2025 weekdays. Fixed for 2026. Time zones on every row; ticket buttons named by city and seller |
| Booking and coaching calls | 247, 248 | Pass with fixes, blocker fixed | Access was set to Members, which is not live. Now Followers. Cal.com month starts on the right day; focus moves to the scheduler after Load |
| Ask me | 249, 250 | Pass with fixes, blockers fixed | Aligned to AI builder #14. Named 18+ items no longer. Visitors always have Message the creator instead. Answers never give prices or rates |
| Course | 251, 252 | Pass with fixes | Read only access row; Members disabled until Memberships launch; refund copy matches AmpedPay full refunds |
| Shop | 253, 254 | Pass with fixes | All five SH5 stores with their limits; last synced time on every price; Etsy notice and 24 hour data rule |
| Paid requests | 255, 256 | Fail, needs AmpedPay #50 | Declined, short balance and refunded states drawn; refund copy corrected; real weekdays |

Every board passes the gate. axe-core finds zero serious or critical issues in every prototype in Graphite and Sand, with motion on and off, at 1280 and 320 wide. The remaining board hits come from the board harness (title, lang, the kit's Phone and Desktop tabs).

## Needs Rob

- **Paid requests and AmpedPay (#50).** Two conflicts with the approved AmpedPay contract. First, the fan's authorization nonce is the split hash, so the split and its expiry are fixed when the fan sends the request; AmpedPay refuses a split more than 24 hours old (the most `maxSplitValidity` allows), so an accept after a day reverts. Second, the automatic late refund in RQ3 needs the creator's Refund signature, a permit and enough balance at that moment, which an automatic refund does not have. Recommended: add a request path to AmpedPay (#50): the fan's USDC moves into the contract at request and is held per payment ref until accept, decline or expiry, with a timed refund the relayer can run. Why: the fan signs once and refunds need no creator action. Alternative: the fan signs again when the creator accepts, and late delivery refunds are creator signed. This changes the "Amped never holds funds" line, so counsel should see it.
- **Save contact depends on Amped Card D12 (#58),** still open. The QA aligned the block to the recommendation. #58 also needs website and location in the shared record.

## Fix before build, now in the spec

- **Collections.** Today's `Block` has no parent column and `editBlocks` saves rows one by one. The spec adds `parent_id` and a one transaction check for one level of nesting and singletons. Each child's own rule applies, then the collection's.
- **Social icons.** Every glyph is a bundled SVG served by Amped. Unknown favicons are fetched on save through the LK1 guarded fetch. Adult platforms are refused. Social joins `SINGLETON_BLOCK_TYPES`, checked in `editBlocks` too.
- **RSS.** RS4 legacy map for the hidden substack media rows (`content`, then `url`, https only). The frame leaves the page and the editor preview. Feeds use the LK1 guarded fetch.
- **FAQ.** details and summary, a new `sanitizeInlineHtml`, FAQPage data only from blocks in this visitor's HTML, covered by the CI leak test.
- **Save contact.** One record and one vCard builder with the card. The vCard route checks the block's access rule first. While the block is not open to Everyone, the public card leaves out phone, email, website and location.
- **Media kit.** Connected account tokens stored encrypted and deleted on disconnect. A figure drops when it is older than 3 days. The PDF is noindex and stays out of sitemaps and llms.txt.
- **Events.** `tz` is an IANA zone and weekdays are computed, never stored. The .ics carries TZID. Bandsintown and Seated need partner API access before their source chips go live.
- **Booking.** Shared provider registry and `embeds` consent; heights from the registry measured at 390 wide; locked state sends no URL.
- **Ask me.** Claude server side, zero retention, `ASK_DAILY_BUDGET_USD` with a fallback from the creator's own answers, D11 rate limits through `hitRateLimit`, the #14 subprocessor entry and launch gates.
- **Course.** Fee from `platform_fee_bps`. Ships with content PR 10 behind `PAYMENTS_ENABLED`.
- **Shop.** Images copied to Amped. Partner mode needs a connection path, since a creator cannot authorize a store they do not own. Spring waits if it has no official product API.
- **Every block.** URL fields follow D57 (http, https, mailto, tel). Every config extends `blockSettingsSchema` and joins `CONFIG_SCHEMAS`.

## Configurator drift

Fixed in every wave 2 configurator: block motion moved out of the shared Motion value (cl2, so2, rs2, mk2, ev2, ai2), the read only access row on co2, and real weekdays on ev and rq.

## Screen Review images

The fixed boards are on each design page. Rows 233 to 256 still show the earlier images until Rob approves the asset upload.
