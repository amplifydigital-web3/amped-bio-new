# Batch 12c: RNS name page, Extend, Transfer and Publish (Screen Review 102, 080, 111)

Stacked on 12b (`ui/prism-rns-wallet`). Restyle in place behind the existing `VITE_SHOW_RNS` flag. Client only: no server, schema or Layout change.

## Route model (102 I01, 111 I01)

| URL | View |
|---|---|
| `/wallet?tab=rns&name=<label>` | RNS name page, Profile tab |
| `&view=identity` | Identity tab (only with `VITE_RNS_IDENTITY` on and Authbase configured) |
| `&flow=extend` | Extend in the value panel (080) |
| `&flow=transfer` | Transfer in the value panel (080) |
| `&flow=publish` | Publish changes in the value panel (111) |

A label that fails the name rule shows "Not a valid RNS name" and makes no chain read. A name nobody holds opens the register flow (102 I19). The page reads without a wallet; each flow asks for one (102 I22).

## What changes

| Piece | File | Rule |
|---|---|---|
| Data | `wallet/rns/name/useRnsName.ts` | One read model on the RNS chain: available, nameExpires (registration expiry, not the grace end), ownerOf while active else the subgraph owner, the resolver addr record and the text records. Registration date and transaction from the subgraph. Primary, the bound person and Verified from `rns.addressSummary`, never Authbase attributes |
| Header | `name/NameHeader.tsx` | 55 tile, name with the chain suffix, 44 copy with a Copied toast. The display name is the bound Amped.Bio page's name (102 I03). Verified is a 44 button that opens Identity, shown only when the name is bound and the wallet is verified. Linked line for the owner. Active until, Expires in N days or Expired on, plus Primary (102 I25). Renew by in the grace window (102 I05) |
| Profile tab | `name/ProfileTab.tsx` | Read only record card: banner, photo, bio, page link and up to three links (102 I11). Change banner for the owner. Edit profile opens Page (102 I12). Sync line: In sync, or the change count with Publish changes (102 I06, 111 I15). On your Amped.Bio page card (102 P10). Expiry row with Extend and Transfer for the owner (102 I13). Name details disclosure with owner, resolver, token ID, dates, parent from chain config and Refresh (102 I14). View on explorer (102 I15). A viewer who is not the owner sees the records and details only (102 I20) |
| Banner | `name/BannerDialog.tsx`, `name/banner.ts` | Change banner in the shared Dialog: 44 controls, arrow keys move the focus, Done last. The change waits as a pending row for Publish (102 I11) |
| Publish | `name/PublishFlow.tsx`, `name/usePublishDiff.ts` | 102 D1 mapping: photo to avatar, bio as plain text to description, the page link to url, the first three visible link blocks to links, the banner only when changed. One row per changed record. Fee estimated for the exact call (setText or multicallWithNodeCheck); a failed estimate blocks the commit with Retry. Only the owner's wallet on Libertas Testnet reaches the commit. Declined, failed and confirmed states (111 I08 to I15) |
| Extend | `name/ExtendFlow.tsx`, `hooks/rns/useRenewal.ts` | Duration, Review, Confirm in wallet. Renewal price from rentPrice, fee for the exact renew call, total, balance after; the shared precision rule. Review holds no editable control, the J0 notice and the required checkbox. Any connected wallet may pay; Review says Paid from when it is not the owner. Result shows Paid from the receipt. The panel never closes on its own (080 I01 to I06) |
| Transfer | `name/TransferFlow.tsx`, `name/useRecipient.ts`, `name/transferDraft.ts` | Recipient takes a bare label, the full name or an address, resolves 400 ms after typing and names each error: not found, expired, zero address, already yours. Trust card: Verified owner or the caution (110 D2). Review lists only the effects that apply (page name, primary). Confirm in wallet: approve this name only (skipped when in place), then transfer, each request with its own state and Retry. Closing mid transfer keeps the requests; reopening shows them (080 I07 to I13) |
| Shared | `wallet/rns/flowParts.tsx`, `DurationPicker.tsx`, `shared.tsx` | Row, TxLink, ChainStatus, TestnetNotice and YouPay move out of RegisterFlow so every RNS flow uses one copy. YouPay steps its size down so the amount always shows in full. DurationPicker takes a hint (Shortest is). RowBadge adds a success tone |

## Decisions and gaps

- Display settings. The switches on the On your Amped.Bio page card (102 I07, I08) write `user.rns_display`, which arrives with the Page profile section in 12d (108 I04) together with `user.setRnsName`. Until then the card states what the page shows and links to Page settings. No setting is written from the name page.
- Links key. Links publish to a new `links` text record, comma joined (102 D1). The RNS team still has to confirm the key. A legacy comma joined `url` still reads.
- Transfer fee. The transfer request cannot be estimated before the approval lands, so Review reads "Network fee: shown in your wallet for each request". The approve and transfer requests each show their fee in the wallet.
- Linked line. The binding shown on the page is computed in the client from the same rule as the 12a server check (owner equals resolver addr, unexpired). The server still enforces it on write and on the public page.
- Identity tab. It renders the existing verification view until the identity batch rebuilds rows 103 and 104. The Attributes and Facets Soon tabs (105 D1) ship in that batch too.
- Release gate (080 D2). Run one transfer on Libertas Testnet with only the single name approval before release.

## Removed

`pages/rns/ProfilePage.tsx`, `components/rns/profile/*` (ProfileCard, ProfileNav, ProfileOwnership, BannerEditorModal), `components/rns/modal/ExtendRegistrationModal.tsx`, `TransferNameModal.tsx`, `TransferSteps/*`, `components/rns/ui/*`, `hooks/rns/useNameDetails.ts`, `useProfileRecords.ts`, `useNameAvailability.ts`, `usePriceFeed.ts`, `useInteractionObserver.tsx`, `utils/rns/timeUtils.ts`. With them go the one click on chain Save, the hard coded 0.0003 tREVO fee and Gwei line, the toFixed(2) figures that showed 0.00, and the backdrop close during a transfer.

## Checks

- Turbo typecheck, client `tsc -b`, client build, eslint on changed files.
- Harness at 1440 and 390, no horizontal scroll: Profile owner verified, out of sync with one change, in sync, Name details expanded, Change banner, Publish review, signing, confirmed, declined, not the owner wallet, fee not available, Extend Duration and Review, confirmed, reverted, paid by another wallet, Transfer recipient (name, full name, address), expired, zero address, already yours, not found, Review effects, Confirm in wallet, result with the page line, declined with the approval already in place, visitor view, expiring, grace, not linked, another name on the page, no records, invalid name, available name redirect, failed read, Identity tab, not connected.
