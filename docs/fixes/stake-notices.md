# GQ2-2: Stake notices before any tap or refusal

Branch `fix/stake-notices` into `development`. Gating Full QA 2 (3 Nov), finding GQ2-2 (S1, compliance), decision D2. Gating spec 3.11. Build Board #21. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-05.

**Why.** A fan could see an item locked behind a stake rule with no `TESTNET_NOTICE` and no `ACCESS_STAKE_DISCLOSURE`. The two lines showed only inside the unlock sheet, after a tap and a refusal. Spec 3.11 requires them on every stake surface. This was the last item keeping `accessGating` off in production.

**Decision D2, approved by Rob and counsel on 5 Nov.** One compact notice block per page section that shows a locked stake item, not one under every card.

**No migration, no server change, no new flag or env value.** Landing app only. Everything stays behind `accessGating`.

## What ships

| Surface                             | Where the notice shows                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Bio blocks                          | Once on the page, directly under the first gated block behind a stake rule (`stakeNoticeBlockId`). In the theme's text color               |
| Content block on the bio            | Once per block, under the cards, when any card in it is behind a stake rule                                                                |
| Creator feed `/{handle}/content`    | Once, above the cards, when any loaded card is behind a stake rule                                                                         |
| Locked item page `/{handle}/c/{id}` | Under the title, in the server HTML. When the unlock card opens on a refusal, the card carries the notice instead, so it never shows twice |
| Unlock sheet and unlock card        | Unchanged: every stake step already showed both lines                                                                                      |

The order is always `TESTNET_NOTICE`, then `ACCESS_STAKE_DISCLOSURE`. A rule with no stake (Followers, Paid, Members) shows no notice. An Any of these rule with a stake leaf counts as a stake rule, because its gate carries `stake: true`.

The Library Shop in the app already showed both lines under stake cards (FL-6), and the store lists no stake gated cards, so neither changes.

## Checks run

- Landing typecheck: clean. Landing tests: 9 files, 68 pass. `next build`: pass.
- New tests:
  - `gating.test.tsx`: 5 tests. One notice per content block in order, none without a stake card, the notice in the item page server HTML, one notice while checking and after a refusal, one notice above the feed.
  - `GatedBlock.test.tsx`: 1 test for `stakeNoticeBlockId`.

## Staging check for Gustavo

1. Turn on `accessGating` on staging. Put a test creator on the stake allowlist.
2. On that creator's bio, gate two blocks on Pool fans and one on Followers. Signed out, the page shows the testnet line and the disclosure once, under the first Pool fans block, before any tap.
3. Gate two content items on Fans with a minimum stake inside one Content block. The block shows the two lines once, under its cards.
4. Open one locked item page with JavaScript off, or view the source. Both lines are in the HTML.
5. Tap the locked item as a fan with no stake. The unlock card shows the lines, and the page shows them only once.
6. A Followers only page shows neither line.

## After merge

`accessGating` can turn on in production for allowlisted creators. Followers, Paid and Members rules carry no stake notice.
