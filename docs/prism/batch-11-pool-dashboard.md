# Batch 11: My Pool dashboard (Screen Review 067, 068, 069)

Stacked on `ui/prism-pool-create` (#263), which is stacked on #262. It reuses `create/PoolImageField.tsx`, `create/copy.ts` and `hooks/useDelayed.ts`. Merge #262 and #263 first. Restyle in place. No feature flag.

Includes Rob's calls of 30 Sep: rewards are shown with real data, not removed. Rewards to fans in Pool stats, a rewards figure on every fan row, and claimed rewards rows in Recent activity.

| Piece | File | Rule |
|---|---|---|
| Page | `createrewardpool/PoolDashboardPage.tsx` | Row 1: pool card, then About, Pool stats, Share pool, View on explorer and the testnet line. Row 2: Top fans and Recent activity side by side; stacked on mobile. No h1 or subtitle (067 I01, I13) |
| Pool card | `dashboard/PoolHeader.tsx` | Art with an always visible Change pool image button, @handle, name, byline, Fans, Total staked and View page to the public pool page (067 I07, I08). The View Pool Details modal is gone |
| Total staked | `PoolDashboardPage.tsx` | `creatorStaked` plus `totalFanStaked` from the pool contract, 4 decimals with tREVO. If the chain read fails, the recorded total shows with Updating and the chain is read again after 3 seconds (067 I02, I18) |
| Change image | `dashboard/PoolHeader.tsx` | Shared Dialog with the row 065 upload rules. A failed save shows inline with Retry (067 I07) |
| About | `dashboard/PoolHeader.tsx` | Inline editor with counter, Save, Cancel, Saved for 3 seconds, and "Description did not save. Your text is still here." with Retry. No `window.alert` (067 I09) |
| Pool stats | `dashboard/PoolStats.tsx` | Your stake, Rewards to fans, New fans this week, Stake change this month (arrow and word match the sign; a pool new this month reads New, Up this month), Creator share. A `dl` with labels. Own error card with Retry (067 I03, I05, I06, I12, I17) |
| Share | `PoolDashboardPage.tsx` | Share pool uses the native share sheet on phones, otherwise copies the public pool link. View on explorer opens the pool contract (067 I11) |
| Top fans | `dashboard/TopFans.tsx` | Own query and states. Sort menu (Most staked default, Least staked, Newest, Oldest) in `?fans=`, page in `?fansPage=`. Rank only for stake sorts (`ol`). Whole row links to the fan's page. Staked and rewards per fan. No handle: short address with Copy address and no link. Pagination with 44 controls; Page n of m on mobile. No tier badge (068) |
| Recent activity | `dashboard/RecentActivity.tsx` | Own states. Person first rows with staked, unstaked, claimed rewards and You created the pool, relative time with the full date in the title, amount, explorer button. No colored fills, no hash text (069) |
| Formatting | `dashboard/format.ts` | Up to 4 decimals with trailing zeros removed; nonzero amounts under 0.0001 read "< 0.0001". Unit from the chain config |

## Server

| Change | File | Rule |
|---|---|---|
| Launch event | `services/poolEvents.ts`, `trpc/pools/creator.ts` | `syncPoolCreation` writes one `create` StakeEvent with the creation transaction value. The dashboard backfills it for pools that have a `creationTxid` (069 I14) |
| Totals | `services/poolEvents.ts` | One reducer: `stake` and `create` add, `unstake` subtracts, `claim` is ignored. Used for Total stake and the monthly change (067 I03) |
| Reward index | `services/poolEvents.ts` | Reads `RewardReceived` and `RewardClaimed` from the pool contract, from the creation block on, in 5,000 block chunks. Saves a cursor (`rewards_indexed_block`) and the running sum (`rewards_received`). Claims by known wallets become `claim` StakeEvents. An optimistic lock on the cursor stops double counting across server instances |
| Dashboard | `trpc/pools/creator.ts` `getPoolDashboard` | Waits up to 2.5 seconds for the index, then returns `rewardsToFans` (rewards received less the creator cut) and `rewardsIndexing`. The client refetches every 5 seconds while indexing. Activity rows return `address`, `isCreator` and `handle: null` when there is no handle. Removed the unused 30 day chart data. Fixed the week start, which moved `now` by 7 days before the 30 day window was computed |
| Fans | `trpc/pools/creator.ts` `getFans` | Each fan gets `rewards`: indexed claims plus `pendingReward` on the contract (`null` when the read fails). Returns `address` and `handle: null` when there is no handle |
| Admin resync | `trpc/admin/pools.ts` | `syncPool` deletes and rebuilds only `stake` and `unstake` rows, so `create` and `claim` rows survive |
| Migration | `20261005120000_add_pool_reward_index` | Adds `creator_pools.rewards_received` (default 0) and `creator_pools.rewards_indexed_block` |

## Removed

- `PoolDashboardSkeleton.tsx`, the commented out chart code, the Telegram card (it is in the Help menu), the Total Rewards (Soon) tile, the tier badges, the rank medals and the View Pool Details modal mount.

## For Rob and Gustavo

- Rewards to fans follows Rob's definition: rewards received by the pool less the creator cut. A reward that arrived while the pool had no fan stake is still counted at the fan share.
- Pools without a `creationTxid` have no start block for the index, so Rewards to fans reads Updating until an admin sets the transaction. The admin tool can already find it.
- The first index of an older pool scans its whole history in chunks; later loads only scan new blocks. The chain RPC was not reachable from the build environment, so the chunk size follows the admin sync (5,000 blocks).

## Differs from the brief or boards

- The testnet line comes from `TESTNET_NOTICE` (J0).
- New fans this week reads "Joined in the last 7 days". The board says "Joined since Monday", but the server counts the last 7 days.
- The stat cells use five columns from 1280 wide and a 2 by 2 grid below that.
- The launch pending notice stays on the create page (#263): the flow holds My Pool until the person leaves the result, so the dashboard never shows a pending launch.
- Share pool uses the send icon, as on the boards.

## Checks

- Turbo typecheck, client `tsc -b`, client and server builds, eslint on changed files.
- Harness at 1440 and 390 with no horizontal scroll: full dashboard, sort menu, newest sort with no ranks, page 2 in the URL, fan without a handle, description saved and failed, stats and activity errors with fans still shown, fans error, just launched, rewards indexing, chain read failure, loading, pool error, Change image dialog.
