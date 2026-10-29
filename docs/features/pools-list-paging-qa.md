# Pools list paging Full QA (PL1 to PL4)

Build Board D7, Step 1 priority 10. Date 29 Oct 2026. Baseline `development` at 9ed4a4e.
Spec: `docs/features/pools-list-paging.md`, revision 3 with the QA edits applied.

Scope: the four PRs in spec section 7. None is built yet, so this QA checks the plan against today's code: every path that reads or writes pool totals, stake rows, the hidden flag and the pool list callers. No design boards: the feature adds no screens, and Show more already exists on both tabs.

Checklist: spec completeness, decisions, repo rules (`AGENTS.md`), data integrity and concurrency, performance claims, security and abuse, client and SEO impact, copy and compliance, and edge cases.

## Verdicts

| PR | Verdict before fixes | After fixes |
| --- | --- | --- |
| PL1 data model and writers | Fail, 3 blockers | Pass with fixes |
| PL2 paged procedure | Fail, 1 blocker | Pass with fixes, 1 decision for Rob |
| PL3 clients | Fail, 1 blocker | Pass with fixes |
| PL4 cleanup | Pass with fixes, scope unnamed | Pass with fixes |
| Plan as a whole | Fail, 5 blockers | Pass with fixes, 2 decisions for Rob |

Revision 3 applies every fix below. One reviewer ran this QA against the code; the reports from earlier features used two.

## Blockers found and fixed in the spec

1. **PL1: totals would not match the cards.** Revision 2 summed `StakedPool` for `totalStakeWei`. The card total is `creatorStaked + totalFanStaked` from the chain. The creator's launch stake has no `StakedPool` row (`recordCreateEvent` writes only a `create` event, and `syncPool` rebuilds from Staked and Unstaked logs). Most staked would have ranked pools by fan stake while showing totals with the creator's stake. Fixed: a `creatorStakeWei` column, and `totalStakeWei = creatorStakeWei + fanStakeWei`.
2. **PL1: two writers missing, four read paths ignored.** Revision 2 named `confirmStake`, `confirmUnstake`, the launch and `syncPool`. The code also upserts `StakedPool` in admin `syncTransaction` (two places) and in the public `getPoolDetailsForModal`. Four read paths write `revoStaked`. Any of them would leave the columns stale. Fixed: one `recomputePoolStats` writer called from all nine.
3. **PL1: `hidden` is nullable.** `hidden Boolean?` means every list query uses `hidden = false OR hidden IS NULL`, which no `(chainId, hidden, ...)` index serves. Fixed: the migration sets NULL to false and makes the column not null. Acceptance 5 now checks a pool that was NULL.
4. **PL2: changing `getPools` in place breaks deployed clients.** Revision 2 changed `getPools` to the paged shape in PL2 and moved the clients in PL3. Between the two, the editor and landing builds still expect an array. Fixed: a new `listPools`; `getPools` stays as is until PL4.
5. **PL3: the sitemap would drop to 24 pools.** `apps/landingpage/src/app/sitemap.ts` reads `fetchPoolsPageData`, the same call the page uses. Paging the page would page the sitemap. Fixed: a `sitemapPools` procedure with no chain reads, and acceptance 9.

## Majors fixed in the spec

- **Lost stakes on concurrent confirms.** `confirmStake` and `confirmUnstake` read the row, add in JavaScript and upsert, outside any transaction. Two confirms at once lose one. Now one transaction with an atomic add or a row lock. Acceptance 8.
- **`syncPool` writes totals outside its transaction.** The rebuild is transactional, the totals update at line 801 is not. Now inside.
- **`createdAt` backfill by "id order" is not a date.** `newest` now stays on `id`, which is creation order. `createdAt` is kept for display and D8 only.
- **Search and cursor disagreed.** Revision 2 ranked search by match tier but keyed the cursor on the sort value. Paging a search would repeat or skip pools. The tier is now the first cursor key. Decision P5 confirms the order.
- **The 60 s first page cache broke acceptance 3.** A stake would not move a pool for up to 60 s. Now a version key that `recomputePoolStats` bumps.
- **APY refresh had no mechanism.** The server has no job queue. Now `setImmediate` with a per pool Redis lock, the pattern broadcast and wallet already use.
- **Suspended creators are not excluded today.** Revision 2 implied they were. Now explicit: `wallet.user.block = "no"`.
- **Wrong block editor procedure.** The client calls `pools.blockEditor.search`, which already searches name and handle. `fan.searchPoolsForBlockEditor` is dead code. PL3 now targets the live one and deletes the dead one.
- **PL4 "drop the text columns" was unnamed.** `StakedPool.stakeAmount` is the source the recompute reads and cannot go. PL4 now drops `CreatorPool.revoStaked` and `CreatorPool.fans` only, after moving their readers, including MCP `list_creator_pools` and `trpc/user.ts` line 838.
- **Null names.** A pool with no `name` gets it from the chain on read today. SQL name sorts need it stored. The backfill now fills names.

## Minors fixed in the spec

- Cursor length capped at 256; a bad or mismatched cursor returns `BAD_REQUEST` (acceptance 10).
- Partial address `contains` dropped from text search; exact address match stays.
- FULLTEXT term escaped of boolean operators, with a trailing `*`, minimum 3 characters to match InnoDB's default token size.
- Public rate limit on `listPools`, tighter with `search`.
- `Prisma.Decimal` to `BigInt` conversion named, never through `Number`.
- `@@fulltext` confirmed GA for MySQL in Prisma 6.7.0; no preview flag.
- PL1 size from 1 to 1.5 days.

## Checked and fine

- Filters and sorts map one to one onto the new columns, including the 10,000 tREVO threshold in wei.
- `DECIMAL(65,0)` is MySQL's maximum precision and covers any realistic total.
- The Show more pattern exists on both tabs (`UsersTab.tsx` and the landing `PoolsTab.tsx`), so PL3 adds no new UI.
- No new table, so the UUIDv7 `BINARY(16)` rule does not apply. PL1 needs the `migration` label.
- No personal data is added or exposed. Search covers fields already public on creator pages.
- No compliance copy changes. No rate, yield or APY wording is added.
- D8 depends on PL1, as `pool-chain-indexer.md` states.

## Rob's answers (29 Oct)

- **P4. Does the creator count as a fan?** Answered: recommended, the creator does not count. A pool where the creator also staked shows one fan fewer than today. Alternative: count the creator, as today.
- **P5. Search order.** Answered: recommended, match tier first, then the chosen sort. Alternative: the chosen sort only.

## For Gustavo (outside this feature)

- `getPoolDetailsForModal` is a public read that writes the viewer's `StakedPool` row. It works, but a read path writing state is fragile. PL1 keeps it and adds the recompute. Worth a follow up to move the write behind the stake confirm paths.
- `trpc/user.ts` line 838 reads `CreatorPool.fans`, which only `syncPool` writes. It is stale today. PL1 fixes it through `activeFans`.
