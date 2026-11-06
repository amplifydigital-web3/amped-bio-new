# PL4: drop the unpaged pool list and the legacy columns (handoff)

Build Board D7, PR 4 of 4. Spec: `docs/features/pools-list-paging.md` revision 3, section 7 (docs PR #384). Stacked on PL3 (#391), PL2 (#389) and PL1 (#387).

**Hold the merge one release after PL3 is live**, so no deployed editor or landing build still calls `pools.fan.getPools`.

## Before merge: apply the patch

`fan.ts` (72 KB), `schema.prisma`, `creator.ts` and `admin/pools.ts` are too large for the GitHub connector, so every code change in this PR ships as one patch, `docs/fixes/pools-drop-legacy.patch`. The branch itself carries only the migration, this note and the patch. Review the patch as the diff. Apply it after the PL1 and PL3 patches:

```sh
git apply docs/fixes/pools-stats-columns.patch   # PL1, if not already applied
git apply docs/fixes/pools-paged-ui.patch        # PL3, if not already applied
git apply docs/fixes/pools-drop-legacy.patch
git rm docs/fixes/pools-drop-legacy.patch
```

It was checked to apply cleanly on this branch after both earlier patches, with the result byte for byte equal to the tested build.

## Migration (by hand, `migration` label)

`packages/database/prisma/migrations/20261029200000_pool_drop_legacy_columns/migration.sql` drops `creator_pools.fans` and `creator_pools.revoStaked`. Apply it when this PR deploys, not before: the code before this PR still writes both columns.

## What changes

| Where | Change |
| --- | --- |
| `pools.fan.getPools` | Deleted. `pools.list.listPools` is the only pool list. |
| `pools.fan.getPoolByAddress`, `getPoolDetailsForModal` | Start from `total_stake_wei` instead of `revoStaked`. The modal's chain read refreshes the stats columns, as in PL1, and no longer writes `revoStaked`. |
| `pools.creator` pool card | Total from `total_stake_wei`. Pool creation no longer sets `revoStaked`. |
| Admin `syncPool` | The rebuild transaction already writes the stats columns, so the separate `revoStaked` and `fans` update is gone. The list version is still bumped. |
| MCP `list_creator_pools` | Returns `totalStakeWei` (wei as text, creator plus fans) in place of `revoStaked`. |
| Backfill script | The dry run compares against the stored stats columns instead of the dropped ones. |
| Schema | `fans` and `revoStaked` removed from `CreatorPool`. |

No client change. Every client already reads `pools.list` since PL3.

## Files (all in the patch, except the migration)

- `apps/server/src/trpc/pools/fan.ts`
- `packages/database/prisma/schema.prisma`
- `apps/server/src/trpc/pools/creator.ts`
- `apps/server/src/trpc/admin/pools.ts`
- `apps/server/src/routes/mcp.ts`
- `apps/server/src/trpc/pools/list.ts` (comments only)
- `apps/server/src/services/poolStatsBackfill.ts`
- `apps/server/src/__tests__/helpers/fakePoolsDb.ts`, `apps/server/src/__tests__/pool-stats.test.ts`
- `packages/database/prisma/migrations/20261029200000_pool_drop_legacy_columns/migration.sql`

## Checks

- Typecheck clean for server, client and landing with the patched schema.
- Server tests: 835 pass. The 5 unhandled errors are the same as on `development`. OAuth suites excluded, as on `development`.
- The migration ran on MariaDB 10.11 after all earlier migrations. The PL2 and PL3 SQL harness passes on the dropped table with 5,000 pools.
- No code reads or writes `revoStaked` or `CreatorPool.fans` after this PR (repo search).

## Noted, not changed

`pools.creator` still counts fans as every `StakedPool` row, including zero balances and the creator's own row. The list and the block search use `active_fans`. Aligning that card with decision P4 is a one line change if wanted.

## Merge order

#387 with its patch and the backfill, #389, #391 with its patch, one release, then this PR with its patch and the migration. Label: `chore`.
