# FL-6: Fan Library gated items, Shop, new content alerts and the daily email

Branch `feat/library-gated` into `development`. Fan Library plan FL-6 (Build Board #26), spec `docs/features/fan-library.md` sections 3.3, 3.4 and 3.6. Screen Review rows 130 and 182. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-04.

**Merge order.** Stacked on FL-4 (`feat/library-creator-section`, #470), which is stacked on FL-3 (#469), FL-1 (#451) and FL-2 (#453). Merge those first. Merge MB-1 (#475) before this PR too: both migrations set the `notifications.kind` enum, and this one keeps MB-1's `MEMBERSHIP_RENEWAL`.

**Migration** `20261104230000_library_new_content` (label `migration`): adds `CONTENT` to `notifications.kind` and the nullable `notification_preferences.newContentEnabled`. No backfill. Apply by hand after deploy, as usual.

**Flags.** Everything sits behind `fanLibrary`. Gated items need `accessGating` as well. The daily email has its own server flag, `libraryDigest` (default off), and also needs `BULK_FOOTER_ADDRESS`. No new env switch.

## 1. What ships

| Area                      | Files                                                                                                                                                                                                                                                                                                                                                                              | Spec     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Access through the engine | `apps/server/src/services/library/access.ts`: `libraryDecisions` runs one `checkBatch` (intent render, `record: false`) for the gated rows of a page. A pass lists the item with its source (pool or follower; `any` and `all` read the leaves the fan holds). A refusal with a next step goes to the Shop; any other refusal is left out. Public items never reach the engine.    | 3.4      |
| Lists                     | `services/library/library.ts`: every list pages over `LISTED_ITEM_WHERE` while `accessGating` is on. Newest and search include creators whose pool the fan stakes in. Newest filters by source. Save and Mark as watched ask the engine for gated items.                                                                                                                           | 3.4, 3.6 |
| Shop                      | `library.creatorItems` with `seg: "shop"`: locked cards (blur cover and rule summary, never a cover or media) with `unlockHint` `pool`, `follow` or `confirm_email`. `publicView.lockedCardsForItems` builds them. Section counts come from the same decisions.                                                                                                                    | 3.4, m5  |
| Connected                 | A pool fan who does not follow can open the creator's section.                                                                                                                                                                                                                                                                                                                     | 3.4      |
| Access ended              | `@repo/ui` player: a resolver may throw `AccessEndedError`. A refused refresh pauses and shows Access ended with no retry; a refused first load shows the same. The Library resolver throws it when `getReadUrl` returns a refusal.                                                                                                                                                | 3.4      |
| Bell                      | `services/library/newContent.ts`: on the first publish of a gated item, the rule's audience (`eligibleUserIds`; `any` is the union, `all` the intersection) gets one `CONTENT` row each in chunks of 1,000, folded per creator. Fans who turned alerts off, globally or for the creator, and fans who blocked the creator in Messages get none. Public and 18+ items alert no one. | 3.4      |
| Daily email               | Same file: one `digest` job per follower with Email me updates, at the next 14:00 UTC slot, deduped per creator while pending. It lists up to 6 titles of the creator's items from the last day that the fan can open. The footer has the per creator off link (`/email/updates-off`, a signed GET page and a POST, like messages-off), Privacy and the postal address.            | 3.4      |
| Settings                  | `notifications.newContent` and `notifications.setNewContent` (every creator, or one by handle). Account, Messages has "New items from creators". The Library status sheet has "Alerts for new items" per creator.                                                                                                                                                                  | fl-q5    |
| Copy                      | Bell row text, Shop strings, player Access ended, the privacy notice.                                                                                                                                                                                                                                                                                                              |          |

## 2. Choices made in the build

1. **The Shop shows only refusals the fan can act on from the Library.** Stake refusals (`not_pool_member`, `stake_below_min`, `no_wallet`) go to the pool. `not_follower` asks to follow, and only a pool fan who does not follow can see it. `follow_pending` asks to confirm the email. Unavailable kinds (paid and member until G4 and G5), the 18+ check, blocks and missing items are left out.
2. **Follow opens the creator's page.** The first follow disclosure sheet lives there, so the Shop never follows from the Library.
3. **Join and Buy show "Coming soon".** The hint union already carries them; checkout from the Library is FL-7.
4. **Every stake card shows `TESTNET_NOTICE` and `ACCESS_STAKE_DISCLOSURE` under it**, before any step (GQ2-2 for the Library). The disclosure text is still the counsel draft.
5. **Library reads are not locked views.** `record: false` keeps creator stats about page visits.
6. **Pages can be short.** A page reads 24 listable rows and drops what the engine refuses; the cursor still moves on. Section counts read the newest 200 listable items.
7. **The bell row says "@maya posted {title}"** for one item, a count for several. The title is dropped once the item is no longer listed, and never shown for an 18+ item. One item opens it in the Library; several open the creator's section.
8. **No push for new items.** The spec asks for the bell only.
9. **The daily email sends nothing without `BULK_FOOTER_ADDRESS`** (CAN-SPAM postal address, AC-Q11 still held) or with `libraryDigest` off. Scheduling also stops while the flag is off. Jobs use channel `digest`, so message reminder limits do not count them.
10. **Publishing triggers both in the background** and only on the first publish (`publishedAt` was empty). A failure is logged and never fails the publish.

## 3. Open items

- **Counsel:** the daily email as commercial email under `Follow.email_updates` (spec 7, item 1), and the final `ACCESS_STAKE_DISCLOSURE` text.
- **Rob:** the company postal address for `BULK_FOOTER_ADDRESS` (AC-Q11).
- **`CONSENT_POLICY_VERSION`:** the privacy notice gains the new items line, table row and opt out line. Bump the version at merge; #475 and others may bump it too, so keep the highest letter.
- **FL-7:** Join, Buy, Rejoin, the member and purchased sources, and plan names.

## 4. Checks run

- Typecheck: server and client pass.
- Tests:
  - Server: `library-gated.test.ts` (18) and `library-new-content.test.ts` (16) are new; `library.test.ts`, `notifications.test.ts` and `content-gating.test.ts` still pass.
  - Client: `creator-section.test.tsx` gains Shop and alerts tests; `player.test.tsx` gains two Access ended tests.
  - Constants: `library.test.ts` gains the new schema and bell copy.

## 5. Staging check for Gustavo

1. Apply the migration. Turn on `fanLibrary` and `accessGating`. Put a test creator on the stake allowlist.
2. As the creator, publish a video gated to Followers and an audio item gated to Pool fans.
3. As a fan who follows but does not stake: the bell shows "@creator posted {title}" for the follower item. The Library lists it with no label; Shop lists the pool item with Go to the pool, the testnet line and the disclosure.
4. Stake in the pool. Reload: the pool item moves to Yours with the Pool fans label.
5. Turn "Alerts for new items" off in the creator's status sheet, publish another gated item: no bell row. Turn it back on.
6. Start the pool item playing, then unstake. Within the refresh window the player stops with Access ended and no Try again.
7. Daily email: set `BULK_FOOTER_ADDRESS`, turn on `libraryDigest`, turn on Email me updates for the creator, publish. A `digest` job waits for 14:00 UTC; run it early by setting `runAfter` to now. The email lists the item, and the footer link turns Email me updates off.
