# PL1: pool list stats columns (handoff)

Build Board D7, Paginate and index the pools list. Spec: `docs/features/pools-list-paging.md` revision 3, section 3 (PR #384). Full QA: `docs/features/pools-list-paging-qa.md`.

## What changes

**Database** (migration `20261029180000_pool_stats_columns`, applied by hand)
- `creator_pools.hidden` becomes `NOT NULL DEFAULT false`. NULL rows become false first; NULL already meant visible.
- New columns: `creator_stake_wei`, `fan_stake_wei`, `total_stake_wei` (`DECIMAL(65,0)`), `active_fans`, `stats_updated_at`, `created_at`.
- Indexes on `(chainId, hidden, total_stake_wei)`, `(chainId, hidden, active_fans)`, `(chainId, hidden, name)` and a FULLTEXT index on `description`.

**One writer:** `apps/server/src/services/poolStats.ts`
- `recomputePoolStats(tx, poolId, { creatorStaked? })` writes the stats from `StakedPool`. The creator's wallet never counts as a fan (decision P4). The creator stake is the chain value when known; on the first write it is the launch stake plus the creator wallet's own row.
- `applyStakeDelta` runs one confirmed stake or unstake in one transaction: the `StakeEvent` once per hash, wallet and pool; the wallet's `StakedPool` row locked with `SELECT ... FOR UPDATE`; the new amount; the stats.
- `bumpPoolsListVersion(chainId)` marks the pool list cache stale (used by PL2).

**Callers**
| Path | Change |
| --- | --- |
| `confirmStake`, `confirmUnstake` | `applyStakeDelta`. A replayed hash now adds nothing. Two confirms at once both count. |
| admin `syncTransaction` | `applyStakeDelta`; an already processed hash still returns `BAD_REQUEST`. |
| admin `syncPool` | `recomputePoolStats` inside each rebuild or cleanup transaction. |
| `getPools`, `getPoolDetailsForModal` | refresh the stats with the creator stake they read from the chain. The modal also refreshes after it rewrites the viewer's row. |
| `recordCreateEvent` | refreshes after the launch event. |
| `user.ts` profile card | reads `activeFans` instead of the stale `fans`. |
| Every `hidden: false OR hidden: null` filter | `hidden: false`. |

`revoStaked` and `fans` keep being written until PL4 drops them.

## Behavior changes to know

- A confirm sent twice for the same transaction used to add the stake twice to `StakedPool`. It now adds it once.
- The profile card Fans number excludes the creator and is current, not as of the last admin sync.

## Before merge: apply the patch

Two files are too large for the GitHub connector to push: `apps/server/src/trpc/pools/fan.ts` (72 KB) and `packages/database/prisma/schema.prisma` (62 KB). Their changes are in `docs/fixes/pools-stats-columns.patch`. On this branch:

```bash
git apply docs/fixes/pools-stats-columns.patch
git rm docs/fixes/pools-stats-columns.patch
git commit -am "feat(pools): PL1 fan router and schema changes"
pnpm run --filter server run prisma:generate
```

Until the patch is applied the server typecheck fails on the new columns. The patch was checked with `git apply --check` against `development` at 9ed4a4e.

## Steps after merge

1. Apply the migration by hand on staging.
2. `pnpm run --filter server run prisma:generate`.
3. Dry run: `pnpm run --filter server pools:backfill-stats`. It prints each pool whose total or fan count differs from `revoStaked` and `fans`. A fan count one lower usually means the creator staked through the stake flow.
4. Compare about 20 pools with their pool pages, then `--apply`.
5. Repeat on production.

## Checks

- Server typecheck clean.
- Server unit tests: 812 pass (15 new in `pool-stats.test.ts`). OAuth endpoint suites need a live database and are excluded, as on `development`.
- Labels: `migration`, `feature`. The connector cannot set labels.
