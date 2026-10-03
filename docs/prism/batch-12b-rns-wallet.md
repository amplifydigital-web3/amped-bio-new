# Batch 12b: Wallet RNS tab, register and address view (Screen Review 100, 101, 078, 111)

Stacked on 12a (`ui/prism-rns-core`). Restyle in place behind the existing `VITE_SHOW_RNS` flag.

## Route model (100 I07)

| URL | View |
|---|---|
| `/wallet?tab=rns` | Find an RNS name, My RNS names, About Revolution Name Service |
| `/wallet?tab=rns&flow=register&name=<label>` | Register flow in the value panel over the RNS tab |
| `/wallet?tab=rns&address=<0x>` | Address view (replaces the Wallet summary, back lens RNS) |
| `/wallet?tab=rns&name=<label>` | RNS name page. Until 12c this is the existing page inside Wallet |

Old `/rns?t=` links redirect to the matching view (`RNSPanel` only redirects). Leaving the RNS tab drops its view params.

## What changes

| Piece | File | Rule |
|---|---|---|
| Tab | `wallet/ProfileTabs/index.tsx` | RNS is the third tab, only with `VITE_SHOW_RNS` on (101 I01). The RNS tab drops the white card |
| Find | `wallet/rns/FindRnsName.tsx` | Suffix in the well from chain config, pasted full names accepted, 500 ms debounce. Four outcomes: Available with the price at the registrar minimum term and Register, Registered with the owner and View, Could not check with Retry, Invalid with the fix in words. A pasted address shows the owner row with Open. Wrong network replaces the result with Switch network. Connect wallet replaces Register when no wallet is connected (101 I02 to I09, I16) |
| My RNS names | `wallet/rns/MyRnsNames.tsx` | G0 rows, soonest expiry first, Expiry and Name chips. Primary (forward checked reverse record), Verified (the page's name of a verified wallet), Expires in N days within 30 days, In grace period until a date. Names past grace are not listed. No wallet, empty, loading and failed states (101 I10 to I13) |
| About | `wallet/rns/AboutRns.tsx` | Four disclosures, one open, answers verbatim (101 I14) |
| Register | `wallet/rns/RegisterFlow.tsx`, `DurationPicker.tsx`, `hooks/rns/useRegistration.ts` | Name, Review, Confirm in wallet in the value panel. Duration chips from the contract minimum and a stepper with the expiry date. Price, fee estimate for the exact call, total, available and balance after from chain reads. Not enough tREVO blocks Review and offers Get tREVO. Review lists every figure and the primary rule, the testnet notice with the expiry, and the required checkbox. Declined, reverted, on chain and taken mid flow states. The result shows Paid from the receipt and What next: Set as primary (its own review with the fee), Show on my page, and Verified owner or Get verified (078) |
| Address view | `wallet/rns/AddressView.tsx` | Address header with Copy, owner line only for a bound page, Verified chip with the disclaimer, or Not verified as a caution. Active names by registration expiry, Primary first. Search at 6 or more names (111 D1). Loading, failed, empty and invalid address states (111 I01 to I07) |
| Server | `services/rnsSummary.ts`, `trpc/rns.ts` | `rns.addressSummary`: active name count, forward checked primary, Authbase verified boolean, and the bound page only when its RNS name passes the 12a binding rule. Never attributes. Cached 60 seconds (100 I08) |

## Not in this PR

- USD by card (078 D1): the toggle stays off until Authbase checkout exists (`VITE_RNS_CARD_CHECKOUT`, `rns.createCardCheckout`). No USD figure renders.
- The RNS name page, extend, transfer and publish (12c).
- The `rns` case in `Layout.tsx` stays because #252 rewrites that file. `RNSPanel` redirects and `RNSHeader` renders nothing; delete both with that case after #252.

## Removed

`pages/rns/HomePage`, `MyNamesPage`, `AddressPage`, `RegisterPage`, `SuccessPage`, `components/rns/name-search/*`, `components/rns/home/*`, `components/rns/registration/success.tsx`, `components/rns/modal/ConfirmRegisterationModal.tsx`, the hard coded 2.79 Gwei and 0.0003 tREVO fee, the $0.00 USD lines and the localStorage handoff.

## Checks

- Turbo typecheck, client `tsc -b`, client and server builds, eslint on changed files.
- Harness at 1440 and 390, no horizontal scroll: tab, available, registered, invalid, could not check, wrong network, pasted address, Name step, 13 months reads 1 year 1 month, Review, signing, declined, reverted, result, Set as primary, low balance, fee not available, not connected, taken on open, address view verified, not verified, 6 or more names with no match, invalid address, names failed, empty, no wallet, loading.
