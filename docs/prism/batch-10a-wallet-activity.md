# Batch 10a: Wallet Activity (Screen Review 057, 058)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

| Piece | File | Rule |
|---|---|---|
| Tabs | `client/components/panels/wallet/ProfileTabs/index.tsx` | Prism Tabs: Tokens and Activity, kept in `?tab=`. Activity replaces the Transactions and Transfers tabs (D19); old `?tab=transactions` and `?tab=transfers` land on Activity. NFTs was a disabled tab with no content and is not rendered (D07) |
| Chips | `wallet/activity/ActivityTab.tsx` | All, Transfers and Staking, kept in `?filter=`. All merges transactions and transfers by hash, one row per hash. Staking keeps fetching pages until it holds 10 matches or reaches the end |
| Row | `wallet/activity/ActivityRow.tsx` | 55 G0 row: 34 disc with the direction icon (or a non native token's icon), a person first sentence, relative time and status, and the signed amount (+ received, - sent, no sign when failed or nothing moved). Raw method signatures never show in a row |
| Plain words | `wallet/activity/activityModel.ts` | Decodes call data with the chain ABIs: Staked in, Unstaked from, Claimed from (pool names), Created pool (name from the call). Anything else reads Contract call, with the signature only in the detail slab |
| Detail slab | `ActivityRow.tsx` | Opens in place, one at a time: Transaction (copy, Open in explorer), Date, From, To (name, @handle link, address with copy), Amount (6 decimals) or Starting stake, Token and Type for transfers, Network fee, Status, Method for contract calls |
| States | `ActivityTab.tsx` | Five skeleton rows after 400ms; Activity (or Transfers) did not load with Retry; No activity yet with Get tREVO (focuses the Fund button); No staking activity or No transfers yet with Show all |
| Address and network | `ActivityTab.tsx` | Reads the saved account address from WalletContext, so a failed reconnect never shows a false empty list. Uses the app network, not the wallet's chain |

## Removed

- `ProfileTabs/components/TransactionsTab.tsx`, `TransfersTab.tsx`, `RenderAddressProfile.tsx` and `ProfileTabs/utils.ts`.

## Notes

- Pool names come from `pools.fan.getPoolByAddress`, cached for five minutes. A dedicated batch lookup would be lighter; it can follow.
- At 390 long titles wrap to two lines, so some rows grow past 55. Amounts always show in full and nothing scrolls sideways.
