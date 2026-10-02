# Batch 7: Creator pool block search (Screen Review 038)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

## What changed

| Piece | File | Rule |
|---|---|---|
| Pool picker | `client/components/panels/blocks/PoolSearchInput.tsx` | ARIA 1.2 combobox: `role="combobox"` with `aria-expanded`, `aria-controls` and `aria-activedescendant`; a listbox of 55 options. Down and Up move the active option, Enter selects, Escape closes and keeps the text, Tab and outside click close. The listbox sits in the block row's flow under the well, never over it, max height 377 |
| Before typing | same | Your pool (the creator's own pool) as one option, then "Type to find another creator's pool." With no pool: "You have no pool yet." and a Create a pool link to My Pool. No popular pools list (D1) |
| Options | same | 34 art (initial on a line fill), name, then @handle and fans for the creator's own pool, or "Pool by @handle, not yours" for others (D1 wording). Short address at the right. Check on the selected pool |
| States | same | Under 2 characters, skeleton rows after 400ms, "Pools did not load" with Retry, "No pools match. Try the creator name or the pool address." with Clear search |
| Selected pool | same | One row: art, name, owner line, short address, copy (toast Address copied), Change. Another creator's pool adds "This block shows a pool run by @handle. Visitors see @handle as the pool owner." A saved address with no pool reads Pool not found |
| Network | `client/utils/appChain.ts` | Search uses the app network (`VITE_DEFAULT_NETWORK_ID_HEX`), not the wallet's chain, so it works with no wallet or a wallet on another network |
| Server search | `server/trpc/pools/blockEditor.ts` `search` | Matches pool name, creator @handle, display name, description and address. Ranks name prefix, then name, then handle, then the rest. Limit 8. A full 0x address returns that exact pool. Results carry the pool art URL |
| Your pool | `server/trpc/pools/blockEditor.ts` `myPool` | The signed in creator's pool on the chain, or null |

## Not in this batch

- `fan.searchPoolsForBlockEditor` is no longer called. Delete it once this merges.
- The public Creator pool block wording (owner line, stats order, Network Reward Rate helper) ships with rows 039 to 041.
- A saved address that no longer matches a pool shows Pool not found in the editor. The public page still decides on its own whether to render it; that check ships with 040.
