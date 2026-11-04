# MB-3 (FL-7): Library money

Branch `feat/library-money` into `development`. Fan Library plan FL-7, mobile checkout plan MB-3 (Build Board #26 and #25). Spec: `docs/features/fan-library.md` 2.1, 2.2 items 1, 5 and 6, decisions 2, 12 and 13, and the FL-7 note in section 4; `docs/features/store-policy.md` 5.2 (MB-3 row). Screen Review rows 125 and 182, boards r1, mb-q1, mb-q1d, mb-q2-d2, m4 status sheet. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-04.

**Merge order.** This branch merges two stacks: FL-6 (#484, on FL-1 #451, FL-2 #453, FL-3 #469, FL-4 #470) and MB-2 (#477, on MB-1 #475, C10 #472, C9 #452, PAY-3 #450, PAY-2 #449). Merge those first. The merge commit resolves `notifications.kind` (CONTENT and MEMBERSHIP_RENEWAL both kept), the bell (`bell.ts`, `BellCenter.tsx`) and two `User` relation lines. **No migration.** Behind `fanLibrary`; Join and Buy also need `checkout`.

## What ships

| Area            | Where                                                                                                                                          | Notes                                                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memberships     | `services/library/money.ts` `libraryMemberships`, `library.memberships`; client `panels/library/MembershipsPage.tsx` at `/library/memberships` | Cards most urgent first; coverage from one balance and one allowance read per wallet, matched by due date; a failed read shows "Renews {date}" and claims nothing. One filled button per screen |
| Manage sheet    | `library.membership({ id })`, `?m={id}`                                                                                                        | Next charge, coverage, renewals the approval covers, receipts with View on Base, store policy at join, Cancel (MB-1 cancel, one signature)                                                      |
| Memberships row | `LibraryHome.tsx`                                                                                                                              | Count, or "One needs USDC"                                                                                                                                                                      |
| Status sheet    | `library.creatorMoney({ handle })`, `CreatorSection.tsx` `StatusMoney`                                                                         | Membership with Manage, Add USDC or Rejoin; purchases with amount, date, Pending, Final or Refunded, receipt and the store policy version shown at purchase                                     |
| Header          | `library.creator` `status.membership`, `status.purchases`, `status.plan`                                                                       | Members and buyers are connected; Your creators fills Member, purchases and Payment past due                                                                                                    |
| Labels          | `moneyLabels` in `toLibraryItems`                                                                                                              | Purchased, then the plan name, over pool, follower and public (decision 12). Labels only: opening stays with the engine                                                                         |
| Shop            | `CreatorSection.tsx`, `access.ts` `shopHint`                                                                                                   | Join and Rejoin open `/join/@handle`; Buy starts a checkout (`source: "library"`) and opens the pay sheet; From {creator} row with Join when the plan takes members                             |

## Choices made in the build

1. **Labels, not access.** Purchased and member items open only through the engine's `paid` (G4) and `member` (G5) kinds. Until they land, a label upgrades items the fan can already open (public or follower) and the Shop shows Buy and Join only when the engine says so. Nothing listed refuses to play.
2. **Coverage is shared.** One wallet pays every membership. Charges are matched to the balance and approval in due order, so the second card shows the real shortfall.
3. **A spent approval** (USDC there, approval short) has no re-approve call yet, and Join is refused while a membership is in force. The card explains it and points to Manage (Cancel, then Rejoin once the period ends); the Memberships page and the status sheet never offer Join or Rejoin to a member. A re-approve path belongs to MB-2.
4. **Ended memberships** stay listed for 90 days with Rejoin.
5. **Wallet change (decision 2) not built:** Wallet never got a Memberships tab, so there is nothing to retire. A Wallet Activity row for membership charges is left for the Wallet owner.

## Checks

- Typecheck: server, client, landing, admin, constants. Build affected: 10 of 10.
- Tests: server 1,473 outside the OAuth suites (new `library-money.test.ts`, 9); client 330 (new `memberships.test.tsx`, 3; `creator-section.test.tsx` Join, Buy and the From row). `pnpm check:copy` passes.

## Staging check

1. Merge the stacks, turn on `fanLibrary` and `checkout`, configure AmpedMemberships (`AMPEDMEMBERSHIPS_ADDRESS`).
2. Join a creator's plan from `/join/@handle`. Library shows the Memberships row; the card reads Covered through a date with a funded wallet.
3. Move USDC out: the card reads Not covered yet with Add $N USDC; it returns to Memberships after Buy USDC.
4. Manage: receipts after the first charge, the store policy link, Cancel with one signature; the card reads Ends {date}.
5. Buy a product: the creator's status sheet lists it with Final after the refund window and its policy version.
