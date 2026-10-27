# Chain indexer for creator pools

Status: spec for approval, 27 Oct 2026. Build Board: D8 "Chain indexer for creator pools" (Step 1, priority 13).
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at a3ce333.
Design: no new screens. Numbers on existing pool cards, the pool page and My Pool become complete.
Needed by: #9 Creator Pool Explorer (network wide data), #7 Brand portal (staker counts), #1 Broadcast (audiences that staked outside the app). Pairs with D7 (`docs/features/pools-list-paging.md`).

## 1. Problem

Stake history only knows what the Amped app did. `StakeEvent` rows are written by `confirmStake` and `confirmUnstake` (`trpc/pools/fan.ts` lines 1041 and 1243) after an in app transaction, by the launch (`services/poolEvents.ts` `recordCreateEvent`), and by the admin `syncPool` subscription, which an admin runs by hand per pool. A fan who stakes from another wallet app, a script or an explorer is invisible: the pool's fan count, stake total, broadcast audience and the creator's My Pool are wrong. Pools created outside Amped do not exist for Amped at all.

## 2. What the chain emits

From the ABIs in `packages/web3/src/index.ts`:

| Contract | Address | Event | Fields |
| --- | --- | --- | --- |
| Creator pool factory | `CREATOR_POOL_FACTORY` per chain (Libertas testnet `0x38df...6f0f`) | `CreatorPoolCreated` | creator, pool, node (indexed), creatorCut |
| L2 base token (system contract) | `0x...800A` on both chains | `Stake`, `Unstake` | staker, pool, amount |
| Each pool | the pool address | `RewardReceived`, `RewardClaimed`, `FanStaked`, `StakeRegisteredToNode` | amount, fan |

Stake and unstake come from one system contract with the pool as a field. One log query per block range covers every pool on the chain. This is how admin `syncPool` already reads them (`trpc/admin/pools.ts` line 442, filtered to one pool).

Rewards are already indexed per pool on demand by `services/poolEvents.ts` (`indexPoolRewards`, cursor in `CreatorPool.rewardsIndexedBlock`), called when My Pool opens.

## 3. Design

### 3.1 Same pattern as the USDC indexer

`apps/server/src/services/pools/indexer.ts`, modelled on `services/usdc/indexer.ts`:

- A tick every 30 s with a Redis lock so one instance runs it.
- Reads only confirmed blocks: head minus `POOL_CONFIRMATIONS` (default 12; set per chain).
- Cursor per chain in `site_settings` (`pool_indexer_cursor_{chainId}`).
- At most 2,000 blocks per tick, inside RPC log range limits; the first run starts at the factory deployment block (env `POOL_INDEXER_START_BLOCK_{chainId}`).
- Per range: `getLogs` on the factory for `CreatorPoolCreated`, on `0x...800A` for `Stake` and `Unstake`, and on known pool addresses for `RewardReceived` and `RewardClaimed` (chunks of 100 addresses).

### 3.2 Tables

```prisma
model PoolChainEvent {
  id           Bytes    @id @db.Binary(16)        // UUIDv7
  chainId      Int      @map("chain_id")
  poolAddress  String   @map("pool_address") @db.VarChar(42)
  kind         String   @db.VarChar(16)           // created | stake | unstake | reward_received | reward_claimed
  actor        String?  @db.VarChar(42)           // staker, fan or creator
  amountWei    Decimal  @map("amount_wei") @db.Decimal(65, 0)
  txHash       String   @map("tx_hash") @db.VarChar(66)
  logIndex     Int      @map("log_index")
  blockNumber  BigInt   @map("block_number")
  blockTime    DateTime @map("block_time")
  @@unique([chainId, txHash, logIndex])
  @@index([chainId, poolAddress, blockNumber])
  @@index([chainId, actor])
  @@map("pool_chain_events")
}

model PoolStaker {
  chainId      Int      @map("chain_id")
  poolAddress  String   @map("pool_address") @db.VarChar(42)
  address      String   @db.VarChar(42)
  stakeWei     Decimal  @map("stake_wei") @db.Decimal(65, 0)
  firstStakeAt DateTime @map("first_stake_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  @@id([chainId, poolAddress, address])
  @@index([chainId, poolAddress, stakeWei])
  @@map("pool_stakers")
}
```

`PoolChainEvent` is the raw, idempotent log (the unique key makes a re read harmless). `PoolStaker` is the current balance per address, updated in the same transaction. Both use the address, so stakers without an Amped account count.

### 3.3 Joining to Amped

- `StakeEvent` and `StakedPool` stay for Amped wallets (they drive My Stakes and the Wallet). When the indexer sees a stake from an address that is an Amped `UserWallet`, it upserts the matching `StakeEvent` (`transactionHash`, `userWalletId`, `poolId` unique) so in app and out of app history agree. The confirm paths keep writing too; whichever runs first wins, the other is a no op.
- After each range the indexer recomputes `CreatorPool.totalStakeWei`, `fanStakeWei` and `activeFans` (D7 columns) for every pool it touched, from `PoolStaker`.
- `CreatorPool.rewardsReceived` and `rewardsIndexedBlock` move to the indexer; `indexPoolRewards` stays as the on demand catch up for My Pool and reads from the same cursor.

### 3.4 Pools created outside Amped (decision X1)

A `CreatorPoolCreated` log whose pool address is not in `creator_pools` is stored as a `created` event and an `ExternalPool { chainId, poolAddress, creator, node, creatorCut, createdAt }` row. Recommended: these appear in the network explorer (#9) as "Not on Amped.Bio" with address and totals, no page, no stake button. They never appear on Explore or the pools list in the app.

### 3.5 Reorgs

Only blocks past the confirmation depth are read, as the USDC indexer does. A manual `admin.pools.reindex({ chainId, fromBlock })` deletes `PoolChainEvent` rows at or above `fromBlock`, rebuilds `PoolStaker` for touched pools and resets the cursor.

### 3.6 Admin

- The admin Pools page shows cursor block, head, lag in blocks and seconds, events in the last hour, and errors, per chain.
- `syncPool` stays as a per pool repair and writes through the same functions.

## 4. Decisions for Rob (recommended first)

**X1. Pools created outside Amped.** Recommended: index them and show them only in the network explorer, labelled "Not on Amped.Bio". Why: the explorer is meant to show the whole network; Amped surfaces stay curated. Alternative: ignore them.

**X2. Poller or subgraph.** Recommended: a server poller like the USDC indexer. Why: no new service to run; the pattern and tests exist. Alternative: a pools subgraph next to the RNS subgraph (`SUBGRAPH_URL`). Better for heavy queries later, but another deployment and its hosting cost.

**X3. Broadcast audiences.** Recommended: a fan with an Amped account who staked outside the app counts as a pool member for broadcasts. Why: they are members on chain. Alternative: count only in app stakes.

## 5. Build

| PR | Scope | Size |
| --- | --- | --- |
| CI1 | Tables, indexer loop, cursor, stake and unstake, `PoolStaker`, D7 column updates, tests on recorded logs | 2 days |
| CI2 | Factory events, `ExternalPool`, rewards move into the loop | 1 day |
| CI3 | Admin status card, `reindex`, `syncPool` on the shared writers | 0.5 day |

Depends on D7 PL1 (the numeric columns).

## 6. Acceptance

1. A stake sent directly to the system contract from a wallet with no Amped account appears in `PoolStaker` and in the pool's fan count within 60 s of reaching confirmation depth.
2. A stake made in the app produces one `StakeEvent` row, whether the confirm path or the indexer writes first.
3. Running the indexer twice over the same range changes nothing.
4. Reindex from a block rebuilds the same totals as a fresh run.
5. A pool created outside Amped appears as an `ExternalPool` and nowhere in the app's pool list.
6. Indexer lag stays under 2 minutes on Libertas testnet over a 24 hour test.
7. Typecheck, build and tests pass.

## 7. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| Confirm that every stake and unstake on a creator pool goes through the system contract and emits `Stake` and `Unstake` with the pool address, including `unstakeAsNode` | Revolution team | CI1 |
| Factory deployment block per chain | Revolution team | CI1 |
| Log range limit of the public RPC (`rpc.revolutionnetwork.dev`) | Revolution team | No |
| PR #210 (server proxy for chain reads, open) overlaps on RPC clients. Merge it first or close it | Gustavo | No |
