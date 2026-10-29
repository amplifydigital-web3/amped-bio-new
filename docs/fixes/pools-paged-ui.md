# PL3: both Pools tabs on the paged list (handoff)

Build Board D7, PR 3 of 4. Spec: `docs/features/pools-list-paging.md` revision 3, section 5 (docs PR #384). Stacked on PL2 (#389), which is stacked on PL1 (#387).

## Before merge: apply the patch

`apps/server/src/trpc/pools/fan.ts` is 72 KB, too large for the GitHub connector. Its change ships as `docs/fixes/pools-paged-ui.patch`. Apply it after PL1's patch:

```sh
git apply docs/fixes/pools-stats-columns.patch   # PL1, if not already applied
git apply docs/fixes/pools-paged-ui.patch
git rm docs/fixes/pools-paged-ui.patch
```

The patch deletes `fan.searchPoolsForBlockEditor` (no caller since Screen Review 038) and its now unused `PoolSearchResult` import. It was checked to apply cleanly on this branch after PL1's patch, with the result byte for byte equal to the tested build.

## What changes

| Client | Change |
| --- | --- |
| Editor Explore, Pools tab | `useInfiniteQuery` on `pools.list.listPools`, 24 per page. Show more at the end, as the People tab does. The count beside Sort and the "Showing N of M pools" line read `total`. A failed first load shows an error card with Retry. A failed Show more keeps the loaded pools and offers Retry. |
| amped.bio/i/pools | Same query. The SSR first page calls `listPools` with limit 24 and seeds the default query. Show more fetches the next cursor and moves focus to the first new card, as before. |
| Sitemap | `pools.list.sitemapPools`: every listed pool with `lastModified`, not the first 24. |
| Block editor pool search | `pools.blockEditor.search` runs on the shared rules: listed pools only (not hidden, creator not suspended), search tiers, then most fans. `limit` max 10; the editor still asks for 8. Fans in search and in Your pool come from `active_fans`, so the creator never counts (P4). |
| `fan.searchPoolsForBlockEditor` | Deleted (patch above). |

Both tabs drop a pool that comes back on a later page, by pool id. This is the repeat on move limit found in PL2: a pool whose stake changes between two page loads can cross the cursor.

No visual change beyond the Show more row and the count line, both from the Prism kit.

Behavior notes for review:
- Search no longer matches part of a pool address. A full `0x` address still matches exactly, which is how a saved block resolves its pool.
- A suspended creator's pool no longer appears in block search, as on the list. A saved block pointing at one shows the existing "pool not found" state.

## Files

- `apps/client/src/components/panels/explore/components/PoolsTab.tsx`
- `apps/landingpage/src/components/pools/PoolsTab.tsx`
- `apps/landingpage/src/lib/getPoolsData.ts`
- `apps/landingpage/src/app/sitemap.ts`
- `apps/server/src/services/poolList.ts` (adds `blockSearchQuery`)
- `apps/server/src/trpc/pools/blockEditor.ts`
- `apps/server/src/__tests__/pool-list.test.ts` (2 new tests)
- `docs/fixes/pools-paged-ui.patch` (`fan.ts`)

No migration.

## Checks

- Typecheck clean for server, client and landing (the repo's pre-commit typecheck).
- Lint: no errors in changed files.
- Server tests: 834 pass (2 new). The 5 unhandled errors are the same as on PL2 and `development`. OAuth suites excluded, as on `development`.
- Client `vite build` passes. Landing `next build` passes; with no API reachable the SSR page and sitemap fall back as before.
- The block search SQL ran against MariaDB 10.11 with all migrations and 5,000 pools: handle search with `@`, tiers ascending, listed pools only, exact address, a description only word in tier 3.

## Merge order

Merge #387 with its patch, run the backfill on staging, merge #389, then this PR with its patch. PL4 waits one release after this ships. Label: `feature`.
