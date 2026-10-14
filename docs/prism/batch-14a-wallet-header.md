# Batch 14a: Wallet header and older parts (Screen Review 049 to 056)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

## Rows

| Row | Screen | Result |
|---|---|---|
| 049 | Wallet profile summary and stats | Built |
| 050 | Wallet balance and actions | Built |
| 051 | Fund panel | Partly built: the shared faucet status, row meta and faucet focus are in. The panel rebuild waits on #225 (see Waits) |
| 052 | Receive dialog | Built |
| 053 | Testnet faucet card | Built. The request control in the Fund dialog is removed with 051 after #225 |
| 054 | Profile options dialog | Built: deleted (D1) |
| 055 | Tokens tab | Built |
| 056 | NFTs tab and NFT modal | Built for flag off: tab, modal and type deleted (D07). The live grid and modal (I02 to I09) are not built: no NFT data exists |

## What changed

| Piece | File | Rule |
|---|---|---|
| Stats | `server/trpc/wallet.ts`, `wallet/hooks/useWalletStats.ts` | Staked adds the creator's own pool stake; Pools joined counts other creators' pools with a stake above 0 (049 I14, I15) |
| Summary header | `wallet/summary/WalletSummary.tsx`, `NetworkChip.tsx`, `SummaryFigures.tsx` | One G1 clear header r21: eyebrow Balance with the network chip, the address line below `lg`, balance, Staked and Pools joined, actions, testnet line. No avatar, handle or six tiles. Skeleton after 400ms; Wallet did not connect after 10 s with no address; figures show Could not load with Retry (049) |
| Balance and actions | `summary/BalanceFigure.tsx`, `WalletActions.tsx` | Bebas balance with the chain unit, cross fade on change. Send primary 55; Receive and Fund secondary. At 0 tREVO Fund takes the primary slot and Send is disabled with "Add tREVO to send." No fiat (050) |
| Receive | `wallet/dialogs/ReceiveDialog.tsx` | Shared Dialog (bottom sheet below 640). Title Receive tREVO, On <network>. Identity row, 233 QR level M in ink on a white tile, full address in two lines (selectable, aria-label Wallet address), Copy address primary (Copied for 2 s, Address copied toast), Share only when `navigator.share` exists, solid Testnet only notice. Address from WalletContext; skeleton after 400ms; Wallet did not connect with Retry after 10 s (052) |
| Faucet status | `wallet/faucet/useFaucet.ts` | Fetched on Wallet mount with React Query under `["wallet","faucet",chainId]`, shared by the card and the Fund row. States: loading, error, setup, ready, sending, sent (6 h after a request), cooldown, paused, empty. Request errors are inline, not toasts (053 I02, I10) |
| Faucet card | `wallet/faucet/FaucetCard.tsx` | `id="faucet"`. Testnet faucet, Watch how video, amount line, inline checklist (Profile photo, Background, Bio, 5 or more blocks) with a 3px progress bar and n of 4 done; all done collapses to Page steps done. Finish setup goes to the next missing step; Get <amount> tREVO; Sending request; Request sent notice with Requested; You can get more in HH:MM:SS; paused and empty notices; Testnet faucet did not load with Retry; skeleton after 400ms; conversion and testnet notes (053) |
| Step deep links | `page/header/ProfileHeaderCard.tsx`, `design/StyleMotionTabs.tsx` | New `?open=bio` focuses the Bio editor; `/design?tab=style&open=background` opens the Background row. Photo and blocks reuse `?open=photo` and `?open=add-block` (053 I06) |
| Video player | `home/VideoPlayerDialog.tsx`, `home/VideoGuides.tsx` | The 016 player Dialog is now one shared component; Video guides and Watch how both use it |
| Get tREVO section | `wallet/MyWalletPanel.tsx` | Referee card full width, then Faucet and Invite in two equal columns from `lg`, stacked faucet first below (053 I01) |
| Tokens | `ProfileTabs/index.tsx`, `ProfileTabs/components/TokensTab.tsx` | Tabs and views sit on the room (no white card). One G0 row 55 on a G1 clear card: token disc, tREVO, Revolution Chain native token, balance up to 4 decimals with the unit, chevron. The row opens `?tab=activity&token=tREVO`. Skeleton row after 400ms; No tREVO yet with Get tREVO (focuses the faucet card); Balance did not load with Retry. No fiat (055) |
| Fund row | `wallet/faucet/fundRow.ts` | `faucetRowMeta` (Ready, Next in HH:MM, n of 4 steps, Paused, Empty, Status unavailable, null while loading) and `focusFaucetHeading` for the 051 panel |

## Removed

- `ProfileSection.tsx`, `StatsSection.tsx`, `types.ts` (StatBoxProps), `WalletBalance.tsx` (049, 050).
- `ProfileTabs/TabSkeletons.tsx` (055).
- `dialogs/ProfileOptionsDialog.tsx` (054 D1).
- `ProfileTabs/components/NFTsTab.tsx`, `NFTModal.tsx` and the `NFT` type (056 D07).

## Instruction coverage

| Row | Ids | Where |
|---|---|---|
| 049 | I01 to I15 (I08 not rendered by D07) | `summary/*`, `useWalletStats.ts`, `server/trpc/wallet.ts` |
| 050 | I01 to I11 | `summary/BalanceFigure.tsx`, `summary/WalletActions.tsx` |
| 051 | I03 meta, I09 meta states | `faucet/fundRow.ts`, `faucet/useFaucet.ts`. I01, I02, I04 to I08, I10, I11 wait on #225 |
| 052 | I01 to I08 | `dialogs/ReceiveDialog.tsx` |
| 053 | I01 to I11 | `faucet/*`, `MyWalletPanel.tsx`, deep links |
| 054 | I01 to I03 (I04 applies only if kept) | Deleted |
| 055 | I01 to I07 | `ProfileTabs/*` |
| 056 | I01 | Deleted; I02 to I09 describe the live tab |

## Parity

- [x] Balance, staked, pools joined, network, address and copy
- [x] Send, Receive, Fund from the header
- [x] Receive: address, QR, copy; Share added
- [x] Faucet request, cooldown, requirements and their links, now on the Wallet
- [x] Token balance; Activity from the token row
- [x] Profile options items: avatar menu, Page and the Wallet chips (054 D1)
- [ ] Fund dialog still holds its own faucet request and checklist until #225 merges

## Notes

- Wording: the approved 053 wording pass (D1, Rob 30 Sep) is used where it differs from the instructions: Get <amount> tREVO, Sending request, Request sent, Requested, You can get more in, Try again later, Finish setup.
- The testnet line is the house verbatim `TESTNET_NOTICE` (Pool rewards come from the network). Row 051, 052 and 053 instructions carry an older line; the boards and the house rule use this one.
- The faucet amount comes from the server (`FAUCET_AMOUNT`); boards draw 10.
- Cooldown shows HH:MM:SS each second; screen readers hear it once a minute.
- The block count for 5 or more blocks comes from the editor's blocks; the server gate counts links.
- `?token=` is written by the token row; Activity shows every tREVO movement, which is the only token today.
- Names stays RNS as the tab label (RNS rows 100 to 111).

## Waits on #225

After #225 merges, in `apps/client/src/components/panels/wallet/dialogs/FundWalletDialog.tsx`:

1. Rebuild it as the Fund view of the value panel (051 I01, I11) with one G2 slab of rows: Get testnet tREVO (description Request from the faucet, meta `faucetRowMeta(...)` from `useFaucet()`, a 13 x 55 skeleton while it is null; select closes the panel and calls `focusFaucetHeading()`), then Deposit from an exchange or wallet (Send tREVO on <network> to your address; closes and opens Receive with focus on Copy address).
2. Under them a dimmed Coming later slab: Bridge from another chain, Coinbase, MoonPay, Onramp, each disabled with a Soon chip (051 D1).
3. Remove the faucet request, `FaucetRequirementsChecklist`, Daily Reward Available, free tokens, Claimed! and every toast; close with the testnet note.
4. Delete `dialogs/FaucetRequirementsChecklist.tsx` and the faucet parts of `hooks/useFundWalletDialog.ts`.

No other file in #210, #225 or #277 is touched.

## How to test on staging

1. Open https://app.staging.amped.bio/wallet. One summary header: Balance, network chip, balance, Staked and Pools joined, Send, Receive, Fund, testnet line.
2. Receive: QR, full address in two lines, Copy address reads Copied and shows the toast; Share shows on phones. At 390 it is a bottom sheet.
3. Scroll to Get tREVO: Testnet faucet beside Invite creators. With a step missing: the checklist, n of 4 done and Finish setup. Each step button opens the exact control (photo, Bio focused, Add block dialog, Background row open).
4. With all steps done: Get <amount> tREVO, then Request sent and Requested; after 6 h the cooldown line.
5. Tokens tab: one tREVO row on the room; it opens Activity. With 0 tREVO: No tREVO yet and Get tREVO focuses the faucet card.
6. Watch how opens the shared video player; Escape returns focus.

Screenshots are not included.
