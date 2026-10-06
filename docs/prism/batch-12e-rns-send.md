# Batch 12e: Send to an RNS name (Screen Review 110)

Stacked on 12c (`ui/prism-rns-name-page`) and carries the Send flow from 10d (#262, `ui/prism-wallet-send`), because Send to a name needs both. Merge #262 and the RNS stack (#266, #268, #269) first; this PR then shows only the 12e changes. Behind the existing `VITE_SHOW_RNS` flag.

## What changes

| Piece | File | Rule |
|---|---|---|
| Trust read | `apps/server/src/services/rnsTrust.ts`, `trpc/rns.ts` | New public `rns.getRecipientTrust({query})`, limited to 60 a minute per client and cached 30 seconds. Takes a bare label, label plus a suffix or a 0x address. Returns the resolved wallet, the owner, the expiry, whether the name points to its owner, the forward checked primary name, the Authbase status of the resolved wallet as verified, not verified, unavailable or off, and the Amped.Bio account on that wallet (handle, display name, avatar). It never returns Authbase attributes (110 I04) |
| Verified owner | `rnsTrust.ts` | All three: the name is not expired (expiry, not the grace end), it points to its owner, and Authbase reports the wallet verified (110 I03). A plain address uses the same rule without the name |
| To field | `wallet/send/RecipientPicker.tsx` | A typed suffix looks up the name only. A bare label also searches people and lists the name first when it resolves. Errors under the well: No RNS name matches, expired (It no longer belongs to anyone. Send to a wallet address instead.), does not point to a wallet yet, This is your wallet, This is the zero address (110 I02, I08). The suffix comes from chain config; `DOMAIN_SUFFIX` and `useResolveRevoName` are gone |
| Trust card | `wallet/send/TrustCard.tsx`, `useRecipientTrust.ts` | Under the chosen recipient: Verified owner. Owner's ID checked by Authbase. This name points to 0x6…4. Otherwise the caution: Not verified. Check the address with the owner before you send. Names can look alike. A name that points away from its owner gets its own caution. Authbase down reads We could not check the owner right now with Retry. Review stays enabled in every caution case. The card is an aria-live region (110 I03, I08, I11, I14) |
| Every step | `wallet/send/SendFlow.tsx`, `model.ts` | The RNS name stays with the address in the header, the locked row, Review (with the Verified or Not verified chip) and the result: Sent 25 tREVO to Maya Lin (mayalin.revo) (110 I06). `/wallet?send=1&to=<name or address>` opens Send with the To field filled (110 I01) |
| Tests | `apps/server/src/__tests__/rns-trust.test.ts` | Bare and full name match; a verified owner whose name points elsewhere is not Verified; expired, not found, invalid, no address; Authbase down; a plain address with its primary name; the zero address; no attributes in the response |

## Decisions applied

- 110 D1: senders always see Verified owner or the caution. No owner setting changes Send.
- 110 D2: the card shows the Amped.Bio display name and @handle of the account on the wallet, then "Owner's ID checked by Authbase." Matching that name against the checked ID is a later phase.

## Not in this PR

- Storing the RNS name with a sent transfer for Activity (110 I06, row 058). Activity reads the explorer; a stored name needs a server table.
- Send tREVO to Maya on the public identity sheet (109) arrives with 12d.
- The Transfer recipient step in #269 still reads `rns.addressSummary`; it can move to `getRecipientTrust` in a follow up.

## For counsel

- Senders see a verification status the owner cannot hide (110 D1). Privacy Policy line 119 speaks of "the verification status you choose to show". The line should also cover Send before release.

## Checks

- Turbo typecheck, client `tsc -b`, client and server builds, eslint, server tests (`rns-trust`, `rns-binding`: 34 pass).
- Harness at 1440 and 390, no horizontal scroll: full name row, bare label with people, Verified owner card, Review chip and name line, result line, prefilled `to`, look alike caution, name pointing elsewhere, expired, not found, own wallet, zero address, Authbase down with Retry, plain address caution.
