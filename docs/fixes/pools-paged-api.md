# PL2: paged pool list API (handoff)

Build Board D7, PR 2 of 4. Spec: `docs/features/pools-list-paging.md` revision 3, section 4 (docs PR #384). Stacked on PL1 (#387).

## What it adds

A new router, `pools.list`, so `pools.fan.getPools` and the 72 KB `fan.ts` stay untouched until PL4. Clients deployed before PL3 keep working.

**`pools.list.listPools`** (public)
- Input: `chainId`, `search` (max 64), `filter`, `sort`, `limit` (1 to 48, default 24), `cursor` (max 256).
- Output: `{ pools: PoolTabRewardPool[], nextCursor, total }`. `total` on the first page only.
- Filters and sorts run in SQL on the PL1 columns, keyset paged with `id` last. A cursor from another sort, or a malformed one, returns `BAD_REQUEST`.
- Listed means: the chain, `hidden = false`, an address, and the creator not suspended.
- Search: a full address matches exactly. Text matches pool name, handle (with or without `@`), creator name and, for terms of 3 or more characters, the description through the FULLTEXT index. Order is tier first (name or handle prefix, then contains, then description), then the chosen sort (Rob's P5). Typed `%` and `_` match themselves.
- Cards: totals from `total_stake_wei`, replaced by the cached live total when present (P3). Fans always from `active_fans`, so the creator never counts (P4).
- APY: from cache only. A miss returns none and schedules one refresh per pool with a Redis `SET NX` lock.
- First page with no search: cached 60 s under a key that includes the chain's list version. Every stats write bumps the version, so a stake shows on the next request.
- Rate limit: 120 a minute per IP, and 30 a minute for searches.

**`pools.list.sitemapPools`** (public): every listed pool as `{ address, updatedAt }`, no chain reads, cached 1 hour. PL3 moves the sitemap onto it.

## Files

- `apps/server/src/services/poolList.ts`: cursor, search parsing and the SQL, kept pure.
- `apps/server/src/trpc/pools/list.ts`: the router.
- `apps/server/src/trpc/pools/index.ts`: mounts `list`.
- `apps/server/src/__tests__/pool-list.test.ts`: 20 tests.

No migration. No change to `fan.ts` or the schema.

## SQL checked against a real database

The SQL was run against MariaDB 10.11 with all 39 migrations applied, including PL1's, and 5,000 seeded pools (suspended creators, hidden pools, unnamed pools, another chain, stakes up to 10^30 wei):

- Every sort and every filter paged to the end: each listed pool exactly once, in order, count equal to `total`.
- First page under 300 ms for every sort and filter. `EXPLAIN` for most staked uses `creator_pools_chainId_hidden_total_stake_wei_idx`.
- Handle search with and without `@`, tiers ascending, a description only word ranked last, `%` matching nothing, exact address.
- Sitemap returns every listed pool.

One limit found, which the spec now states: when a pool's stake changes between two page loads, it can move across the cursor and appear on a later page again. PL3's clients drop a repeat by pool id. Production runs MySQL; the SQL uses only syntax both support.

## Checks

- Server typecheck clean. Lint: no errors.
- Server unit tests: 832 pass (20 new). OAuth suites excluded, as on `development`.

## Merge order

Merge #387 (PL1) and apply its patch, run the backfill on staging, then this PR. Label: `feature`.
