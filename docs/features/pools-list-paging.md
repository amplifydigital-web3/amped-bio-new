# Paginate and index the pools list

Status: revision 4, 29 Oct 2026: build notes from PL1 to PL4 (PRs #387, #389, #391, #392). Revision 3 (29 Oct) applied the Full QA edits and Rob's answers on P4 and P5 (`docs/features/pools-list-paging-qa.md`). Revision 2 (28 Oct) recorded Rob's answers: P1 and P3 as recommended, P2 alternative (keep description search). Revision 1 was 27 Oct. Build Board: D7 "Paginate and index the pools list" (Step 1, priority 10).
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at 9ed4a4e (revision 1 and 2 read a3ce333; the pool code is unchanged between them).
Design: no new screens. The two Pools tabs keep their Prism 2.2 layout; the change is how they page (section 5).
Unblocks: #9 Creator Pool Explorer. Pairs with D8 "Chain indexer for creator pools" (`docs/features/pool-chain-indexer.md`), which depends on PL1.

## 1. Problem

`pools.fan.getPools` (`apps/server/src/trpc/pools/fan.ts` line 215) loads every pool on the chain on every request, with every staker row, then reads the chain for pools missing from cache, computes APY for each, filters and sorts in memory, and returns the whole list. Stake totals are stored as text, so the database cannot sort by them. Search covers the description, address and creator name, not the pool name or the creator handle. Both Pools tabs (editor Explore and amped.bio/i/pools) page on the client over the full list, and the sitemap reads the same full list. This holds at a few dozen pools. It fails at a few thousand: response size, RPC fan out on a cold cache and memory per request all grow with the network.

## 2. What the code does today

| Step | Code | Cost per request |
| --- | --- | --- |
| Load | `prisma.creatorPool.findMany` with `stakedPools` included, no `take` | Every pool and every stake row |
| Hidden | `OR: [{ hidden: false }, { hidden: null }]`; `hidden` is `Boolean?` | No index can serve it |
| Chain reads | per pool cache `getPoolsCacheKey`, TTL `CACHE_TTL.POOL_DATA` 900 s; misses batched in multicall (`creatorStaked`, `totalFanStaked`) | Up to 3 reads per missing pool |
| Name | a null `name` is read from the chain and written back; the card falls back to `Pool {id}` | One read per unnamed pool |
| APY | `calculatePoolAPY` per pool, cached `CACHE_TTL.APY` | Chain reads on miss |
| Filter | `no-fans`, `more-than-10-fans`, `more-than-10k-stake` (10,000 tREVO in wei) in memory | All pools |
| Sort | `newest` (by `id`), `name-asc`, `name-desc`, `most-fans`, `most-staked` in memory | All pools |
| Search | `description`, `poolAddress` (contains), `wallet.user.name`; exact `poolAddress` for a full address | `contains`, no index |
| Callers | `apps/client/.../explore/components/PoolsTab.tsx`; `apps/landingpage/src/components/pools/PoolsTab.tsx` (client side `limit`, 24 per Show more); `apps/landingpage/src/lib/getPoolsData.ts` (`fetchPoolsPageData`), used by `/i/pools` SSR **and by `apps/landingpage/src/app/sitemap.ts`** | Full list each time |

Card totals: `totalStake` is `creatorStaked + totalFanStaked` from the chain, or `revoStaked` when the chain read fails. `fans` on the card counts `StakedPool` rows with a stake above zero, or the cached chain value.

`CreatorPool.revoStaked`, `StakedPool.stakeAmount` and `StakeEvent.amount` are `Text`. `CreatorPool.fans` is an `Int` written only by admin `syncPool`; `trpc/user.ts` line 838 reads it, so it is stale between syncs.

Writers of `StakedPool` today (every one must keep the new columns current):

| Writer | File | Kind |
| --- | --- | --- |
| `confirmStake` | `trpc/pools/fan.ts` line 1175 | read, add, upsert; not in a transaction with the `StakeEvent` write |
| `confirmUnstake` | `trpc/pools/fan.ts` line 1402 | same |
| `getPoolDetailsForModal` | `trpc/pools/fan.ts` line 1768 | a public read path that upserts the viewer's stake from `fanStakes` |
| admin `syncPool` | `trpc/admin/pools.ts` lines 709 to 738, totals at 801 | delete and rebuild in a transaction; totals written after it, outside it |
| admin `syncTransaction` | `trpc/admin/pools.ts` lines 1115 and 1238 | upsert |

`recordCreateEvent` (`services/poolEvents.ts`) writes a `create` `StakeEvent` only. The creator's launch stake has no `StakedPool` row, and `syncPool` rebuilds `StakedPool` from Staked and Unstaked logs only.

Read paths that also write `revoStaked` or `name`: `getPoolByAddress` (line 147), `getPools` (line 548), `getUserStakedPools` (line 990), `getPoolDetailsForModal` (line 1662).

## 3. Data model (PL1)

Add numeric, indexed columns to `CreatorPool`, maintained on write, and make `hidden` not null:

```prisma
model CreatorPool {
  // existing fields ...
  hidden           Boolean   @default(false)   // was Boolean?; the migration sets NULL to false first
  creatorStakeWei  Decimal   @default(0) @map("creator_stake_wei") @db.Decimal(65, 0)
  fanStakeWei      Decimal   @default(0) @map("fan_stake_wei") @db.Decimal(65, 0)
  totalStakeWei    Decimal   @default(0) @map("total_stake_wei") @db.Decimal(65, 0)
  activeFans       Int       @default(0) @map("active_fans")
  statsUpdatedAt   DateTime? @map("stats_updated_at")
  createdAt        DateTime  @default(now()) @map("created_at")

  @@index([chainId, hidden, totalStakeWei])
  @@index([chainId, hidden, activeFans])
  @@index([chainId, hidden, name])
  @@fulltext([description])
}
```

- `DECIMAL(65,0)` holds any amount a pool can reach in practice (10^65 wei). Prisma reads it as `Prisma.Decimal`; convert with `BigInt(value.toFixed(0))`, never through `Number`.
- `newest` sorts by `id`, which is creation order. InnoDB secondary indexes carry the primary key, so `(chainId, hidden)` plus `id` needs no extra index. `createdAt` is added for display and D8, backfilled from the pool's `create` `StakeEvent` (block time), else its earliest `StakeEvent`, else the migration time. It is not a sort key, so a fallback time never reorders the list.
- `@@fulltext` is GA for MySQL in Prisma 6 (the repo pins 6.7.0); no preview flag.
- `creatorStakeWei` is the creator's own stake. Source: the chain value `creatorStaked` when the cache or a read has it; otherwise the `create` event amount plus the creator wallet's `StakedPool` row. `fanStakeWei` sums `StakedPool` rows for every wallet except the creator's. `totalStakeWei = creatorStakeWei + fanStakeWei`, the same total the card shows today.
- `activeFans` counts `StakedPool` rows with a stake above zero, excluding the creator's wallet (decision P4). It replaces `CreatorPool.fans`.

### 3.1 One writer

`services/poolStats.ts` exports `recomputePoolStats(tx, poolId, { creatorStaked? })`. It reads `StakedPool` for the pool inside `tx`, computes the four values and writes them with `statsUpdatedAt`. Every path in the writer table above calls it:

- `confirmStake` and `confirmUnstake` move the `StakedPool` upsert, the `StakeEvent` upsert and `recomputePoolStats` into one `prisma.$transaction`. The new stake row is computed with an atomic update (`UPDATE ... SET stake_amount = CAST(stake_amount AS DECIMAL(65,0)) + ?` through `$executeRaw`) or a `SELECT ... FOR UPDATE` on the row, so two confirms at once cannot lose a stake. Today's read then upsert can.
- `syncPool` calls it inside the existing rebuild transaction, and drops its separate totals update at line 801.
- `syncTransaction` and `getPoolDetailsForModal` call it after their upsert.
- The four read paths that write `revoStaked` or `name` keep writing `name` and pass `creatorStaked` to `recomputePoolStats` instead of writing `revoStaked`.
- D8 (chain indexer) becomes the second source: it writes `StakedPool` from chain events and calls the same function, so stakes made outside Amped count.

### 3.2 Migration and backfill

Migration `2026103xxxxxxx_pool_stats_columns` (applied by hand, `migration` label):

1. `UPDATE creator_pools SET hidden = 0 WHERE hidden IS NULL;` then `hidden` becomes `NOT NULL DEFAULT 0`.
2. Add the columns and indexes above, and the FULLTEXT index on `description`.

Script `pnpm run --filter server pools:backfill-stats [--chain <id>] [--apply]`:

- For every pool: `createdAt` as above; a null `name` read from the chain (one multicall per 50 pools); `creatorStaked` read from the chain; then `recomputePoolStats`.
- Dry run by default, prints a diff against `revoStaked` and `fans`. Idempotent. Safe to run again after a failed run.
- Run on staging, compare 20 pools by hand with their pool pages, then production.

The text column `CreatorPool.revoStaked` and the `fans` column stay until PL4. `StakedPool.stakeAmount` and `StakeEvent.amount` stay text; they are the source rows, not totals.

## 4. The procedure (PL2)

A new procedure, `pools.list.listPools`, is cursor paged. It lives in its own router (`trpc/pools/list.ts`, SQL in `services/poolList.ts`) so the 72 KB `fan.ts` is not touched. `pools.fan.getPools` keeps its current shape until PL4, so an editor or landing build deployed before PL3 keeps working.

```ts
z.object({
  chainId: z.string(),
  search: z.string().trim().max(64).optional(),
  filter: z.enum(["all", "no-fans", "more-than-10-fans", "more-than-10k-stake"]).default("all"),
  sort: z.enum(["newest", "name-asc", "name-desc", "most-fans", "most-staked"]).default("newest"),
  limit: z.number().int().min(1).max(48).default(24),
  cursor: z.string().max(256).optional(), // opaque: base64url of JSON [sort, tier, sortValue, id]
})
```

Output: `{ pools: PoolTabRewardPool[], nextCursor: string | null, total: number | null }`. `total` is returned on the first page only, from a `count` with the same where clause. A cursor that fails to decode or names another sort returns `BAD_REQUEST`.

Rules:

- Filters and sorts run in SQL on the new columns. `id` is the last key in every sort, so a page never skips a pool. A pool whose sort value changes between two page loads can cross the cursor and come back on a later page; clients drop a repeat by pool id (acceptance 2). `more-than-10k-stake` compares `totalStakeWei > 10000 * 10^18`, as today.
- Where clause: `chainId`, `hidden = false`, `poolAddress` not null, and the creator not suspended (`wallet.user.block = "no"`, per `docs/features/suspended-pages.md`). Today's code does not exclude suspended creators; this is new.
- `name` sorts use the column collation (`utf8mb4` case insensitive). PL1's backfill fills null names, so a null name sorts last in `name-asc` and is shown as `Pool {id}`.
- Search: a full address matches `poolAddress` exactly (lowercased, as today). Text matches `name`, `wallet.user.handle` (a leading `@` is stripped), `wallet.user.name` and `description` (P2). Partial address `contains` is dropped; the explorer (#9) covers address lookups.
- Search order (decision P5): tier 1 is a prefix match on name or handle, tier 2 is contains on name, handle or creator name, tier 3 is a description match. Within a tier the chosen sort applies, then `id`. The cursor carries the tier after the sort name. This runs as `$queryRaw` with a computed tier column; the description term uses `MATCH (description) AGAINST (? IN BOOLEAN MODE)` with the term escaped of boolean operators and a trailing `*`, for terms of 3 or more characters (InnoDB's `innodb_ft_min_token_size` is 3); shorter terms skip the description.
- Chain reads happen only for the pools on the page, and only on a cache miss. The page renders from the database columns; live values replace them when the per pool cache has them (P3). A cold cache costs at most `limit` pools of reads. Since `getPools` was the only writer of that cache, `listPools` refreshes it in the background with the APY refresh (same lock): one multicall of `creatorStaked` and `totalFanStaked`, and a `recomputePoolStats` only when the chain total differs from `totalStakeWei`.
- APY: read from cache for the page. A miss returns `apy: undefined` and schedules one refresh with `setImmediate`, guarded by a Redis `SET NX` lock per pool (60 s), so many requests do not start the same refresh. The request never waits on `calculatePoolAPY`.
- Response cache: the first page of each `(chainId, filter, sort)` with no search is cached 60 s in Redis under a version key `pools:list:v{n}:{chainId}:...`. `recomputePoolStats` increments the chain's version after a write, so acceptance 3 holds inside the 60 s. With Redis down the procedure runs uncached.
- Rate limit: the public read limit from the rate limiting spec (D4) applies to `listPools`, with a tighter bucket for requests that carry `search`.

## 5. Clients (PL3)

| Client | Change |
| --- | --- |
| Editor Explore, Pools tab | `useInfiniteQuery` on `listPools`; Show more at the end of the list, as the People tab (`UsersTab.tsx`) does; count line reads `total`; a failed Show more keeps the last total and the loaded pools, as `UsersTab` does |
| amped.bio/i/pools | Same; the SSR first page calls `listPools` with `limit 24`; Show more loads the next cursor on the client. The existing 24 step Show more stays as it looks today |
| Sitemap (`apps/landingpage/src/app/sitemap.ts`) | Stops using `fetchPoolsPageData`. A new public `pools.list.sitemapPools({ chainId })` returns `{ address, updatedAt }` for every listed pool (same where clause, no chain reads, cached 1 hour). Without this, PL3 would cut the sitemap to 24 pools |
| Block editor pool search | Already on `pools.blockEditor.search` (`trpc/pools/blockEditor.ts`), which searches name, handle and creator name. It moves to the shared where clause and search tiers, `limit 10`. The dead `fan.searchPoolsForBlockEditor` (line 1960; the client stopped calling it) is deleted |

No visual change beyond the Show more button, which already exists in the Prism kit.

## 6. Decisions for Rob (recommended first)

**P1. Page size.** Chosen 28 Oct: recommended. Recommended: 24, Show more. Why: fills two rows on desktop and keeps the phone list short. Alternative: infinite scroll. Harder to reach the footer and to share a position.

**P2. Search fields.** **Chosen 28 Oct: the alternative, keep description search too.** Recommended was pool name, creator handle, creator name and exact address. Description matches rank last and use a FULLTEXT index so the cost stays bounded.

**P3. Numbers shown on cards.** Chosen 28 Oct: recommended. Recommended: database columns first, replaced by live chain values when cached. Why: a page never waits on the RPC. Alternative: always live. Exact, but slow when the RPC is slow.

**P4. Does the creator count as a fan?** Chosen 29 Oct: recommended, the creator does not count. Recommended: no. `activeFans` excludes the creator's wallet. Why: the card says Fans, and the Fan Graph and pool block count other people. Effect: a pool where the creator also staked through the stake flow shows one fan fewer than today. Alternative: count the creator, as today's row count does.

**P5. Search order.** Chosen 29 Oct: recommended. Recommended: match tier first (name or handle prefix, then contains, then description), then the chosen sort within each tier. Why: the pool a person typed sits at the top whatever sort is picked. Alternative: the chosen sort only, with tiers ignored. Simpler cursor, but a description match can sit above the exact pool name.

## 7. Build

| PR | Branch | Scope | Depends on | Size |
| --- | --- | --- | --- | --- |
| PL1 | `feat/pools-stats-columns` | Migration (hidden not null, stake and fan columns, indexes, FULLTEXT, `createdAt`), `recomputePoolStats` in all five `StakedPool` writers and the four read paths, the stake confirm transaction and atomic stake update, backfill script, tests | none | 1.5 days |
| PL2 | `feat/pools-paged-api` | `listPools`, search tiers, cursor, page cache with version key, APY refresh lock, rate limit, `sitemapPools`, tests | PL1, backfill run on staging | 1 day |
| PL3 | `feat/pools-paged-ui` | Both Pools tabs, sitemap, block editor search on the shared rules, delete `fan.searchPoolsForBlockEditor` | PL2 | 0.5 day |
| PL4 | `chore/pools-drop-legacy` | Drop the unpaged `getPools` (it plays the role revision 2 gave `getPoolsLegacy`); drop `CreatorPool.revoStaked` and `CreatorPool.fans` after moving their readers (`trpc/pools/creator.ts`, `trpc/admin/pools.ts`, `trpc/pools/fan.ts`, `routes/mcp.ts` `list_creator_pools`, `trpc/user.ts` line 838) to `totalStakeWei` and `activeFans` | PL3 live one release | 0.3 day |

PL1 grows from 1 to 1.5 days: five writers and four read paths instead of three, plus the transaction and the race fix.

Build status (29 Oct): PL1 #387, PL2 #389, PL3 #391 open against `development`, stacked in that order. PL4 #392 is a draft until PL3 has been live one release. Changes to `fan.ts`, `schema.prisma` and other files too large for the GitHub connector ship as patches under `docs/fixes/`, applied in order before merge.

SQL check: the PL2 and PL3 SQL ran against MariaDB 10.11 with all migrations, including PL4's, and 5,000 seeded pools. Every sort and filter pages to the end with each listed pool once and a count equal to `total`; the first page returns in under 300 ms and uses the `(chainId, hidden, totalStakeWei)` index; handle search with and without `@`, search tiers, description only matches, typed wildcards, exact address and the sitemap behave as above.

## 8. Acceptance

1. With 5,000 seeded pools, the first page returns in under 300 ms with a warm cache and under 1.5 s with a cold cache, and makes chain reads for at most 24 pools.
2. Paging through every sort returns each pool, and the client shows each pool once. A pool whose stake changes between pages may move, so the server can send it again on a later page; the client drops the repeat by pool id.
3. Most staked and most fans order matches the database columns; a stake in the app updates the pool's position on the next request, including the cached first page.
4. Searching a creator handle with or without `@` finds their pool. A word that appears only in a pool's description finds it, ranked after name and handle matches.
5. A suspended creator's pool and a hidden pool never appear. A pool whose `hidden` was NULL before the migration appears.
6. Both Pools tabs show the same first page and the same count.
7. After the backfill, every pool's `totalStakeWei` equals the total its card shows today, and `activeFans` equals today's count less the creator's row (P4).
8. Two stake confirms for one wallet and pool at the same moment both count.
9. After PL3 the sitemap lists every listed pool, not 24.
10. A cursor from one sort sent with another sort returns `BAD_REQUEST`.
11. Typecheck, build and tests pass. Copy has no em or en dashes.

## Revision log

- 29 Oct, revision 4 (build). Procedures named `pools.list.listPools` and `pools.list.sitemapPools`; cursor carries the sort; acceptance 2 amended for a pool that moves between pages (found in the SQL check); live total cache refreshed by `listPools`; build status and SQL check recorded.
- 29 Oct, revision 3 (Full QA). Hidden made not null; creator stake column so totals match today's cards; one `recomputePoolStats` writer across five writers and four read paths; stake confirm transaction and race fix; `newest` stays on `id`; new `listPools` so `getPools` stays stable until PL4; search tiers in the cursor; first page cache version key; APY refresh lock; rate limit; suspended creators excluded; sitemap moved to `sitemapPools`; block editor search pointed at the live `pools.blockEditor.search`; PL4 scope named; decisions P4 and P5 added and answered by Rob on 29 Oct (both as recommended); acceptance 7 to 10 added.
- 28 Oct, revision 2. Rob's answers on P1 to P3.
- 27 Oct, revision 1.
