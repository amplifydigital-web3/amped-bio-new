# Batch 10d: Send flow (Screen Review 062, 063, 064)

Based on `development`. Restyle in place. No feature flag.

Pay stops being a destination. Send becomes a money flow inside Wallet (D05, D12): Wallet Send opens the value panel at `/wallet?send=1`, and `/pay` redirects there.

| Piece | File | Rule |
|---|---|---|
| Entry | `wallet/WalletBalance.tsx`, `components/Layout.tsx`, `wallet/send/PayRedirect.tsx` | Send sets `?send=1`. The `pay` panel redirects to `/wallet?send=1` (062 I01) |
| Flow | `wallet/send/SendFlow.tsx` | One SidePanel. Header: SEND TO, Choose a recipient, then the person's name, avatar tile and `@handle · 0x6…4`. Step bar Amount, Review, Confirm in wallet (D23). Close resets the flow; it is off while signing |
| To field | `wallet/send/RecipientPicker.tsx` | Label To, combobox well with Scan QR (only when a camera exists) or Clear. Focus on open, 300ms debounce (062 I02) |
| Lists | `RecipientPicker.tsx` | RECENT before typing (up to 5, one per address, last amount and time), PEOPLE while typing, ADDRESS for a pasted address with the matched member. Rows are one tap that selects; nothing opens by itself. Listbox with arrow keys, Escape back to the field, live count (062 I03 to I06, I14) |
| Address rules | `RecipientPicker.tsx` | "Addresses start with 0x and have 42 characters." and "This is your wallet. Choose someone else." Members without a wallet read "No wallet yet" and cannot be chosen; a tap shows "They need a wallet before they can receive tREVO." |
| States | `RecipientPicker.tsx` | Hint when there are no recents; skeleton rows after 400ms; No people match 'x' with Clear search; People did not load and Recent recipients did not load with Retry (062 I10, I11) |
| Recent | `wallet/send/useRecentRecipients.ts` | React Query keyed by address and chain, fired when the panel opens, 60 second stale time. Same explorer window as before (7 days, 10 transactions, outgoing only), matched to members with `getUsersByAddresses` (062 I07) |
| Scan | `wallet/send/ScanQr.tsx` | Camera viewport inside the panel, corner markers in create light, no scan line. Accepts a bare address or an `ethereum:` link. An invalid code keeps the camera on with an inline message. Camera off and camera failed states with Paste address. Escape and Cancel return focus to Scan (063 I01 to I04) |
| Amount | `SendFlow.tsx` | Locked recipient row with View page and Change. Amount well with Available, Balance after, 25%, 50%, 75% and Max (balance minus the fee). One error under the well, named by the fix (064 I05, I06) |
| Review | `SendFlow.tsx` | Calm state: You send well with Edit amount, slab with Asset and network, To (person, address, copy), Network fee, Total, Balance after. Solid testnet card, the approved checkbox (064 D1), then Send <amount> tREVO and the wallet note (064 I08 to I10) |
| Confirm, result, failure | `SendFlow.tsx` | Confirm in your wallet with Waiting for your signature, then Submitting until the receipt. Sent with the person, View transaction and Done. Send did not go through with a plain cause, Retry and Edit send (064 I11 to I13) |
| Reconnect | `wallet/send/ReconnectCard.tsx` | 063 D1: while the live wallet is not connected, search and amount still work and the card replaces Review send. Reconnect wallet retries three times with backoff; when that fails it shows Could not reconnect with Try again and Sign out |
| Search | `apps/server/src/trpc/wallet.ts` | `searchUsers` also matches the display name and skips accounts without a handle. Before this, one account without a handle made the whole search fail |

## Removed

- `panels/pay/PayPanel.tsx`, `panels/pay/dialogs/PayDialog.tsx`, `hooks/usePayDialog.ts`. My QR lives only in Wallet Receive (063 I05, I06).

## Differs from the brief or boards

- The testnet line comes from `TESTNET_NOTICE` (the J0 line). The briefs quote the retired "set by the creator" line.
- 063 D1 asks for retry with backoff and status on `WalletContext`. Here the retry lives in the reconnect card and `WalletContext` is unchanged. The wallet chip Not connected state and the card on stake, claim and faucet are not in this PR.
- RNS (VITE_SHOW_RNS) shows Resolving, the resolved row, No wallet uses <name> and Name lookup failed. Name lookup failed has no Retry, because the resolver hook exposes no refetch. RNS is off (D06).
- While the camera is open the panel close button is off; Cancel and Escape close the camera.
- Pasted addresses are accepted in any letter case.
- `hooks/useDelayed.ts` is the same file #254 and #255 add, so the merges agree.

## Strings not on the boards

- Reconnect card: "Could not reconnect.", "Try again", "Sign out" (D1 names the states, not the words).
- "Address copied" toast on the copy button.
- Result slab label "You sent".

## Checks

- Turbo typecheck, client `tsc -b`, client and server builds, eslint on changed files.
- Harness at 1440 and 390 with no horizontal scroll: recent, people, keyboard listbox, no wallet member, pasted member address, bad and own address, no results, amount errors, review gate, confirm, result, rejected signature, reconnect card and its failed state, scan viewport, camera denied, empty and failed recents.
