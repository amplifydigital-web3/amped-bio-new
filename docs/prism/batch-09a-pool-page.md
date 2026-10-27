# Batch 9a: Public pool page (Screen Review 071)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

Stacked on #248 (public header, footer and room). Merge #248 first, then retarget this PR to `development`.

| Piece | File | Rule |
|---|---|---|
| Server page | `landingpage/src/app/i/pools/[address]/page.tsx` | Fetches the pool on the server. An invalid or unknown address answers HTTP 404. Metadata: "<pool name> \| Amped.Bio", the first 155 characters of the description, the pool image, canonical `/i/pools/<address>` |
| Not found | `app/i/pools/[address]/not-found.tsx` | Pool not found, "This address has no pool on Amped.Bio.", Browse pools |
| Frame | `components/pools/PoolPageFrame.tsx` | Room, public header, All pools breadcrumb (nav, Breadcrumb), public footer |
| Featured card | `components/pools/PoolDetailContent.tsx` | G3 lens with rim: art 202, creator @handle (same tab), Share (44 icon button: native share, else copy with a spoken Link copied), the pool name as the page h1, "by <creator name>" |
| About card | same | G1 clear: description with links (new tab, `rel="noopener nofollow ugc"`), clamped at 8 lines with Read more. Not rendered without a description |
| Value panel | same | Stake in header, About this pool slab: Pool total, Backed by, Creator share ("5% of pool rewards", or Not set), Network Reward Rate with its helper (or the 100% creator line), Unstaking. Solid Testnet only card, Stake in this pool, View contract on explorer |
| Stake | same, `lib/panel.ts` | Signed in: the editor `/explore?pool=<address>` (D27, opens the pool panel). Signed out: `/login?returnTo=<that URL>` |
| Layout | same | xl: card 495, About, panel 508. lg: card and About left, panel right. Below lg: one column with a sticky Stake bar |
| States | same | Layout matched skeleton after 400ms; Pool did not load with Retry and All pools; Pool not found |

## Removed

- The APY card, its percentage, "Annual Percentage Yield" and the View APY details link (071 I01). The page source has no APR, APY or debug-apy string.
- The "How are Staking Rewards and Pool APY Calculated?" link (071 I02). The How pool rewards work slot stays empty until counsel approves the article (`POOL_REWARDS_ARTICLE` is null).
- How it is calculated, for now. The only rate article has `apy` in its slug, and 071 I01 bans the string on this page. `RATE_ARTICLE` renders the link once the article moves to a new slug.
- The wagmi `creatorCut` read. The creator share now comes from `getPoolByAddress` (`creatorFee`), so signed out visitors see it.

## Kept

- `/i/pools/[address]/debug` and `/debug-apy` stay public and unlisted (071 D1, 096 D1). Nothing links to them from this page.
