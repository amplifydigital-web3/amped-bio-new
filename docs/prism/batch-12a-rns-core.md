# Batch 12a: RNS core (Screen Review 100, with 078 D2 and 080 D2)

The first of five Revolution Name Service (RNS) PRs. It fixes the live defects under every RNS screen before the screens are rebuilt. Based on `development`. No screen redesign in this PR; the Wallet RNS tab, register flow and address view follow in 12b.

## Live defects fixed

| Defect | Rule | Files |
|---|---|---|
| Any signed in user could store any RNS name | `user.edit` stores a new name only when it is bound to the account wallet: registration not expired, BaseRegistrar owner is the wallet, resolver addr is the wallet. No wallet fails closed. A failed chain read refuses the save. An unchanged name is not re-checked, so a lapsed name never blocks other edits. An empty value clears it (100 I02) | `apps/server/src/services/rns.ts`, `trpc/user.ts` |
| The public page skipped the owner check with no wallet, and ignored where the name resolves | `getHandle` shows the stored name only under the same rule. No wallet or a failed read shows no name. Results are cached for 60 seconds (100 I03) | `trpc/handle.ts` |
| Expiry used the grace end | Every active or expired decision uses the registration expiry. The grace period is its own state. Applies to the public page, the MCP tools, the Page profile select and the active names query, which the address view uses. My names is rebuilt on these helpers in 12b (100 I04) | `packages/web3/src/rns.ts`, `routes/mcp.ts`, `services/subgraph/queries.ts`, `RevoNameField.tsx` |
| Four spellings of one name (.revotest.eth in the client, .revo in MCP) | One suffix in chain config (`rnsSuffix`) drives display, typing and the namehash. `.revotest.eth` until the RNS team confirms `.revo` (101 D1). `parseRnsInput` accepts the chain suffix, `.revo`, `.revotest.eth` and `.eth` (100 I01) | `packages/web3/src/index.ts`, `rns.ts`, `utils/rns`, `useResolveRevoName`, `useProfileRecords`, `useRegistration`, `mcp.ts` |
| Register always set the reverse record | A wallet that already has a live primary keeps it (`reverseRecord: false`). A first name sets it. If the check fails, the primary is left alone (078 D2) | `hooks/rns/useRegistration.ts` |
| Transfer approved every name in the wallet and froze on a declined request | The approval covers this one name (`approve(controller, tokenId)`) and is skipped when already in place. A declined or failed request marks its own step failed with fresh state (080 D2) | `hooks/rns/useTransferOwnership.ts` |

Defect 5 (Authbase attributes on a public query) is fixed in #265, which this PR does not touch.

## Shared pieces for 12b to 12e

- `@repo/web3`: `RNS_CHAIN`, `getRnsSuffix`, `formatRnsName`, `rnsNode`, `parseRnsInput`, `checkRnsLabel`, `RNS_LABEL_FIX`, `rnsTokenId`, `rnsExpiryFromGraceEnd`, `rnsExpiryState`, `isRnsNameActive`, `RNS_BINDING_MESSAGES`.
- `apps/client/src/config/rns/copy.ts`: the RNS vocabulary (100 I09).
- `apps/client/src/config/rns/flags.ts`: `VITE_SHOW_RNS` plus phase flags `VITE_RNS_IDENTITY`, `VITE_RNS_ATTRIBUTES`, `VITE_RNS_FACETS` and `VITE_RNS_CARD_CHECKOUT` (100 I06). Development and staging set `VITE_RNS_IDENTITY=true`, so today's Identity tab keeps showing there.
- `DOMAIN_SUFFIX` stays as a deprecated export that reads chain config, until the Send recipient picker in #262 moves to `parseRnsInput` (row 110).

## Page profile (108 preview)

- The field reads RNS name, and the link reads Manage in Wallet (100 I12).
- A refused name rolls back to the stored one and shows the server's words under the select. The rest of the save goes through.

## For Gustavo

- The server reads Libertas Testnet directly (multicall of `nameExpires`, `ownerOf`, `addr`). `SUBGRAPH_URL` is no longer used by `getHandle`.
- `user.edit` now stores `null` instead of `""` when the name is cleared.
- Production client env has no `VITE_SHOW_RNS` or `VITE_AUTHBASE_URL`. Set both before RNS ships in the app.
- Run one testnet transfer with the single token approval before release (080 D2). If `transferRNSName` needs `setApprovalForAll`, the named fallback is `setApprovalForAll(controller, false)` right after the transfer.

## Checks

- `vitest` on `rns-binding.test.ts`: 25 tests (no wallet, other owner, addr elsewhere, addr unset, never registered, expired, in grace, failed read, suffix parsing, name rule, expiry states).
- Turbo typecheck, client `tsc -b`, client and server builds, eslint on changed files.
- Harness at 1440 and 390: Page profile RNS name select with a name in grace marked Expired, the refused name message, the expired and lost notices. No horizontal scroll.
