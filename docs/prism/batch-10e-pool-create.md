# Batch 10e: Create pool flow (Screen Review 065, 066)

Stacked on `ui/prism-wallet-send` (#262) for the shared reconnect card and `hooks/useDelayed.ts`. Merge #262 first. Restyle in place. No feature flag.

My Pool for a creator without a pool becomes the D12 money flow. The context field shows the live pool card and How pools work. The value panel runs Amount, Review and Confirm in wallet. The summary modal and the transaction modal are gone.

| Piece | File | Rule |
|---|---|---|
| Entry | `createrewardpool/CreatorPoolPanel.tsx` | No longer gated on `isConnected` (065 I13). The pool is read with the saved wallet address. Skeleton only after 400ms. A stale record shows a notice in the flow instead of a toast (065 I14) |
| Page | `create/CreatePoolPage.tsx` | Desktop: Pool preview eyebrow, the featured card and How pools work. The panel opens by itself. Mobile: Set up your pool empty state and How pools work; the flow is a full screen sheet |
| Preview | `create/PoolPreviewCard.tsx` | Featured card on desktop, Medium card in the mobile sheet. Updates as the creator types. Drops its rim in the commit state (066 I01) |
| Amount step | `create/CreatePoolFlow.tsx` | Intro with Watch how, image, name, description, creator share, Initial stake with Available and Balance after, testnet line, Review pool. Validation on blur (065 I02, I05, I07, I08) |
| Creator share | `create/CreatorShareField.tsx` | Chips 0, 3, 5 (default), 10 and Custom in a radiogroup with arrow keys. Custom takes a whole number from 0 to 100. Split line and the 100% line from the approved wording (065 I04) |
| Image | `create/PoolImageField.tsx` | Upload, Replace and Remove. Type and size checked before the presigned URL. 3px progress bar. Inline errors with Retry (065 I09) |
| Low balance | `CreatePoolFlow.tsx` | Error row with Get tREVO under Balance after; Review pool disabled (065 I06, I17) |
| Review | `CreatePoolFlow.tsx` | Calm panel. Launch terms slab with Edit pool: name, type, description, creator share, initial stake, network fee, total from wallet, balance after. Launch terms line, compliance card, required checkbox, Launch pool with 0.0015 tREVO and the wallet note (066 I02 to I05) |
| Fee | `create/useLaunchPool.ts` | `estimateContractGas` for `createPool` with the stake value, times the gas price. Not available with Retry when it fails |
| Launch | `create/useLaunchPool.ts` | Tracked rows: Signed in wallet, Pool created on chain, Pool saved to Amped.Bio. Each row moves only when its call resolves. Closing the panel leaves Your pool is being created. on My Pool (066 I06) |
| Outcomes | `useLaunchPool.ts`, `CreatePoolFlow.tsx` | A successful receipt always ends in Your pool is live. A failed sync shows Finishing setup with Retry. A failed image adds a warning row (066 I08). Declined, not enough funds, reverted and other errors each have one plain cause, a Details disclosure and Back to review (066 I09) |
| Result | `CreatePoolFlow.tsx` | Slab with name, share, stake and transaction. Open My Pool reads the new pool and shows the dashboard. Copy pool link (066 I10) |
| Explorer | `CreatePoolFlow.tsx` | Links come from the chain config, never etherscan. Hidden when the chain has none (066 I07) |
| Reconnect | `wallet/send/ReconnectCard.tsx` (from #262) | 063 D1: replaces Review pool and the launch button while the live wallet is not connected; fields keep their values |
| Hook | `hooks/useCreatorPool.ts` | Returns `refetch` so Open My Pool reads the new address |
| Schema | `createrewardpool/types.ts` | Name and description trimmed, description max 500, share a whole number 0 to 100. `stakingTiers` kept |

## Removed

- `PoolSummaryModal.tsx`, `TransactionModal.tsx`, `PerksSection.tsx`, `CreatorPoolPanelSkeleton.tsx`.
- Every toast in the launch handler (066 I11). Copy actions still confirm with a toast.
- Staking tiers UI (065 I10, 066 I12, D07). The schema stays.

## For Rob

- The creator share split line ("You keep 5% of pool rewards. Fans share 95%.") ships as drawn on the approved boards and in the approved D2 wording. 065 D1 said the line waits for counsel. If counsel has not signed off, change `shareHelper` in `create/copy.ts` to the permanence line only.
- Rob's call of 30 Sep is applied: Creator share, not creator cut, in every string.

## Differs from the brief or boards

- The testnet line comes from `TESTNET_NOTICE` (J0). The briefs quote the retired "set by the creator" line.
- The image tile is 55 as on the boards, not 144.
- Allowed image types follow the server (`ALLOWED_POOL_IMAGE`: PNG and JPG). The brief also lists WebP and GIF, which the server rejects.
- The 100% notice from 065 I04 is the approved 100% helper line, as on the custom cut board.
- The reverted cause uses approved wording 3 ("The transaction failed. Your pool was not created. The network fee may still be charged.").
- When the receipt cannot be read, the chain row stays current with Still waiting and Check again. The flow never reports a failure for a pool that may exist.
- The Watch how player copies the 016 Dialog pattern into `create/VideoDialog.tsx`. Merge both into one shared piece once #251 lands.
- On mobile, How pools work sits on the page under Set up your pool. The mobile board has no How pools work block.
- The panel step bar scrolls with the body on the mobile sheet; the header stays fixed.

## Strings not on the boards

- "Confirm in your wallet" and "Approve the pool launch in your wallet to continue." while signing.
- "Still waiting" and "Check again" when the receipt cannot be read.
- "Use a PNG or JPG image." for a wrong file type.
- "Use 500 characters or fewer."
- "Transaction copied" toast.

## Checks

- Turbo typecheck, client `tsc -b`, client build, eslint on changed files (the dashboard warnings are older).
- Harness at 1440 and 390 with no horizontal scroll: empty, filled, upload progress and failure, oversized file, chips by keyboard, custom 100%, empty custom, insufficient balance, reconnect card, review, fee not available, signing, progress, closed while pending, result, declined, reverted, not enough funds, finishing setup, Watch how dialog.
