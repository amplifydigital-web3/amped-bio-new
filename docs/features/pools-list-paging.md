# Paginate and index the pools list

Status: spec for approval, 27 Oct 2026. Build Board: D7 "Paginate and index the pools list" (Step 1, priority 10).
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at a3ce333.
Design: no new screens. The two Pools tabs keep their Prism 2.2 layout; the change is how they page (section 5).
Unblocks: #9 Creator Pool Explorer. Pairs with D8 "Chain indexer for creator pools" (`docs/features/pool-chain-indexer.md`).

## 1. Problem

`pools.fan.getPools` (`apps/server/src/trpc/pools/fan.ts` line 215) loads every pool on the chain on every request, with every staker row, then reads the chain for pools missing from cache, computes APY for each, filters and sorts in memory, and returns the whole list. Stake totals are stored as text, so the database cannot sort by them. Search covers the description, address and creator name, not the pool name or the creator handle. Both Pools tabs (editor Explore and amped.bio/i/pools) page on the client over the full list. This holds at a few dozen pools. It fails at a few thousand: response size, RPC fan out on a cold cache and memory per request all grow with the network.

## 2. What the code does today

| Step | Code | Cost per request |
| --- | --- | --- |
| Load | `prisma.creatorPool.findMany` with `stakedPools` included, no `take` | Every pool and every stake row |
| Chain reads | per pool cache `getPoolsCacheKey`, TTL `CACHE_TTL.POOL_DATA` 900 s; misses batched in multicall | Up to 3 reads per missing pool |
| APY | `calculatePoolAPY` per pool, cached `CACHE_TTL.APY` | Chain reads on miss |
| Filter | `no-fans`, `more-than-10-fans`, `more-than-10k-stake` in memory | All pools |
| Sort | `newest`, `name-asc`, `name-desc`, `most-fans`, `most-staked` in memory | All pools |
| Search | `description`, `poolAddress`, `wallet.user.name` | `contains`, no index |
| Callers | `apps/client/.../explore/components/PoolsTab.tsx`, `apps/landingpage/src/components/pools/PoolsTab.tsx` (client side `limit`), `apps/landingpage/src/lib/getPoolsData.ts` (SSR) | Full list each time |

`CreatorPool.revoStaked` and `StakedPool.stakeAmount` are `Text`. `CreatorPool.fans` is an `Int` kept by the stake confirm paths.

## 3. Data model

Add numeric, indexed columns to `CreatorPool`, maintained on write:

```prisma
model CreatorPool {
  // existing fields ...
  totalStakeWei    Decimal  @default(0) @map("total_stake_wei") @db.Decimal(65, 0)
  fanStakeWei      Decimal  @default(0) @map("fan_stake_wei") @db.Decimal(65, 0)
  activeFans       Int      @default(0) @map("active_fans")
  statsUpdatedAt   DateTime? @map("stats_updated_at")
  @@index([chainId, hidden, createdAt])
  @@index([chainId, hidden, totalStakeWei])
  @@index([chainId, hidden, activeFans])
  @@index([chainId, hidden, name])
}
```

`DECIMAL(65,0)` holds any uint256 a pool can reach in practice (10^65 wei). `CreatorPool` has no `createdAt` today (it has `id` order); the migration adds it and backfills from the create `StakeEvent`, falling back to `id` order.

Writers:

- `confirmStake`, `confirmUnstake`, the launch (`recordCreateEvent`) and admin `syncPool` recompute the three columns for the pool in the same transaction as the `StakeEvent` write, from `StakedPool` (`activeFans` counts rows with stake above zero, excluding the creator's wallet).
- D8 (chain indexer) becomes the second writer: it updates the same columns from chain events, so stakes made outside Amped count.
- A one time backfill script computes the columns for every existing pool from `StakedPool`.

The text columns stay for one release, then are dropped in a cleanup PR.

## 4. The procedure

`pools.fan.getPools` becomes cursor paged. Input:

```ts
z.object({
  chainId: z.string(),
  search: z.string().trim().max(64).optional(),
  filter: z.enum(["all", "no-fans", "more-than-10-fans", "more-than-10k-stake"]).default("all"),
  sort: z.enum(["newest", "name-asc", "name-desc", "most-fans", "most-staked"]).default("newest"),
  limit: z.number().int().min(1).max(48).default(24),
  cursor: z.string().optional(),   // opaque: base64 of [sortValue, id]
})
```

Output: `{ pools: PoolTabRewardPool[], nextCursor: string | null, total: number | null }`. `total` is returned on the first page only, from a `count` with the same where clause.

Rules:

- Filters and sorts run in SQL on the new columns. The `id` is the tie break in every sort, so pages never repeat or skip.
- Search: an address matches `poolAddress` exactly. Text matches `name`, `wallet.user.handle` (with or without `@`) and `wallet.user.name`, prefix first then contains. Description search is dropped (decision P2).
- Suspended creators and hidden pools are excluded (`docs/features/suspended-pages.md`).
- Chain reads happen only for the pools on the page, and only on a cache miss. The page renders from database columns; live values replace them when present. A cold cache costs at most `limit` pools of reads.
- APY: read from cache for the page; a miss returns `apy: undefined` and queues a background refresh, so the request never waits on `calculatePoolAPY` for more than the page.
- Response cache: the first page of each `(chainId, filter, sort)` with no search is cached 60 s in Redis.

The old unpaged shape stays available as `getPoolsLegacy` for one release so the two clients can move in their own PRs.

## 5. Clients

| Client | Change |
| --- | --- |
| Editor Explore, Pools tab | `useInfiniteQuery`; Show more button at the end of the list, as the People tab does; count line reads `total` |
| amped.bio/i/pools | Same; the SSR first page uses `getPools` with `limit 24`; Show more loads the next cursor on the client. The page stays crawlable through the sitemap and pool pages |
| Block editor pool search (`searchPoolsForBlockEditor`) | Moves to the same search rules, `limit 10` |

No visual change beyond the Show more button, which already exists in the Prism kit.

## 6. Decisions for Rob (recommended first)

**P1. Page size.** Recommended: 24, Show more. Why: fills two rows on desktop and keeps the phone list short. Alternative: infinite scroll. Harder to reach the footer and to share a position.

**P2. Search fields.** Recommended: pool name, creator handle, creator name, exact address. Why: these are what people type. Alternative: keep description search too. Slower and noisy.

**P3. Numbers shown on cards.** Recommended: database columns first, replaced by live chain values when cached. Why: a page never waits on the RPC. Alternative: always live. Exact, but slow when the RPC is slow.

## 7. Build

| PR | Scope | Size |
| --- | --- | --- |
| PL1 | Migration (columns, indexes, `createdAt`), writers in the stake paths, backfill script | 1 day |
| PL2 | Paged `getPools`, `getPoolsLegacy`, search rules, page cache, tests | 1 day |
| PL3 | Both Pools tabs and the block editor search on the paged API | 0.5 day |
| PL4 | Drop the text columns and `getPoolsLegacy` (one release later) | 0.2 day |

## 8. Acceptance

1. With 5,000 seeded pools, the first page returns in under 300 ms with a warm cache and under 1.5 s with a cold cache, and makes chain reads for at most 24 pools.
2. Paging through every sort returns each pool once, with no repeats, while stakes change between pages.
3. Most staked and most fans order matches the database columns; a stake in the app updates the pool's position on the next request.
4. Searching a creator handle with or without `@` finds their pool.
5. A suspended creator's pool and a hidden pool never appear.
6. Both Pools tabs show the same first page and the same count.
7. Typecheck, build and tests pass. Copy has no em or en dashes.
