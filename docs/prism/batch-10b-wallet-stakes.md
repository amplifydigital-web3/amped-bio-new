# Batch 10b: Wallet Stakes and pool promo (Screen Review 059, 061)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

| Piece | File | Rule |
|---|---|---|
| Order | `client/components/panels/wallet/MyWalletPanel.tsx` | Stakes sits right under the summary and above the tabs (D19). It is not rendered with `VITE_SHOW_CREATOR_POOL` off (059 I01) |
| Stakes card | `wallet/stakes/StakesCard.tsx` | G1 clear card r21. Eyebrow Stakes, meta "<total> tREVO in <n> pools". First five rows, then Show all <n> stakes and Show fewer. Browse reward pools in the footer opens Explore, Pools |
| Stake row | `wallet/stakes/StakeRow.tsx` | 55 G0 row: 34 art r8, pool name (two lines at most), creator @handle, Staked and Pending with the unit, up to 4 decimals, no k abbreviation. Manage (secondary 44, min 89) and the row both open the pool panel (D25). On mobile the figures sit under the name |
| States | `StakesCard.tsx` | Three row skeletons after 400ms; Stakes did not load with Retry; No stakes yet with Browse pools. A failed chain read for one figure reads Unavailable |
| Data | `StakesCard.tsx` | `pools.fan.getUserStakedPools` on the app network. The server reads the saved account wallet, so a failed reconnect never shows a false empty list (059 I12). The @handle comes from `getPoolDetailsForModal`, the same query and key the pool panel uses |
| Pool promo | `wallet/LaunchPoolAd.tsx` | Last on Wallet. Shown only with the pools flag on, a wallet address, and `pools.creator.getPool` returning no pool. Nothing renders while it loads or when it fails. Approved copy (061 D1) and the verbatim testnet line. Create pool opens My Pool; How pools work opens the Help articles portal |
| Wei amounts | `explore/pool-panel/format.ts` (`toWei`), `PoolPanel.tsx` | tRPC has no transformer, so bigints arrive as wei strings. The pool panel now normalizes `stakedAmount`, `stakedByYou` and `pendingRewards` to bigint once, which fixes Pool total showing wei as whole tREVO |

## Left in place

- `wallet/StakedPoolsSection.tsx`, `StakedPoolRow.tsx` and `hooks/useStakedPools.ts` are no longer rendered. #210 edits them, so they are not deleted here. Delete them once #210 lands or closes.
