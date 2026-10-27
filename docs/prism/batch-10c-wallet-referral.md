# Batch 10c: Wallet referral program (Screen Review 060)

Stacked on #255 (branch `ui/prism-wallet-stakes`), because both change `MyWalletPanel.tsx`. Merge #255 first, then this PR.

Restyle in place. No feature flag.

| Piece | File | Rule |
|---|---|---|
| Section | `wallet/MyWalletPanel.tsx` | Get tREVO section after the tabs and before the pool promo. It holds the referee card and the Invite card. Nothing referral related sits above the balance any more (I01). The Testnet faucet card joins this section with row 053 |
| Invite card | `wallet/referral/InviteCard.tsx` | Static header, Reward and Claim wording kept (D1). Invite link always visible in a read only well, Copy link 55 (secondary, so the faucet keeps the section's one primary). Copied for 2 seconds, toast Link copied, inline error if copy fails. Count and Referral ID as meta (I02 to I04) |
| Referrals list | `InviteCard.tsx` | One disclosure row Your referrals (n), closed by default. 55 rows with avatar, name, @handle link and joined date. Status in words: Claim reward, Claiming, Processing, Claimed with the transaction, Unavailable right now, or the approved J5 line when a wallet is missing. Show more appends the next 10 (I05 to I07). At 390 the status sits under the name |
| States | `InviteCard.tsx` | Three row skeletons after 400ms; No referrals yet with Copy link; Referrals did not load with Retry. A failed load shows no count, so it never reads as zero referrals (I10) |
| Referee card | `wallet/referral/RefereeCard.tsx` | Full width, only for creators who joined through a link. Ready, Processing, Unavailable, J5 and Claimed (one 55 row with View transaction). No gradients, gift icons or exclamation marks (I08, I09) |
| Claim review | `wallet/referral/ClaimReviewPanel.tsx` | D24: Claim reward opens Review in the calm value panel. You claim amount, slab, solid testnet card, the approved checkbox, then Claim <n> tREVO. Success toast Reward claimed with View |
| Testnet line | Both cards | The current J0 line from `TESTNET_NOTICE`. The brief quotes the retired "set by the creator" line; the boards use J0 |

## Server (`apps/server/src/trpc/referral.ts`)

- `myReferrals` and `myReferrer` no longer return email addresses. Before this, a referrer could read each referee's email, and a referee could read the referrer's email.
- `myReferrals` adds `imageUrl`, `joinedAt`, `walletsLinked` (both wallets linked, which the claim needs) and `referrerReward`.
- `myReferrer` adds `walletsLinked`. Reward amounts come from one shared helper and the existing cache.
- The claim mutations are unchanged.

## Differs from the board

- The Claim review board shows three steps (Reward, Review, Confirm in wallet), a Network fee row and the wallet note. The claim is sent by the Amped.Bio affiliate wallet: the creator signs nothing and pays no fee. The panel shows Reward and Review only and leaves out the fee row and the wallet note. Rob to confirm.
- Balance after is left out. The reward is sent on the affiliates network, which may differ from the network the wallet chip shows.
- Until row 053 lands, the Invite card spans the section width alone.

## Strings not on the boards

- "1 creator joined" (singular of the approved count line).
- Referee review panel: For row reads "Joining through @handle".
- Claim error in the panel: "The claim did not go through" with "Try again in a few minutes."

## Checks

- Turbo typecheck, client `tsc -b`, client and server builds, eslint on changed files.
- Harness at 1440 and 390 with no horizontal scroll: open list, Show more to the end, copy, claim review with the checkbox gate, success toast, referee states, empty, error and loading.
