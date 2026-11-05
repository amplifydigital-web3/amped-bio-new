# AmpedPay and AmpedMemberships audit scope

Status: draft brief for the single audit of AmpedPay and AmpedMemberships, run on the staging deployment once both are built and deployed (Rob, 24 Oct). AmpedMemberships (PAY-3, `docs/features/ampedmemberships.md`) joined on 3 Nov.

## In scope

| File | Notes |
| --- | --- |
| `packages/contracts/src/AmpedPay.sol` | Payments, refunds, roles, limits, pause. Upgradeable (transparent proxy) |
| `packages/contracts/script/DeployAmpedPay.s.sol` | Deploy and role setup, post deploy checks |
| `packages/contracts/src/AmpedMemberships.sol` | Memberships: join with a signed split, keeper renew inside a grace, cancel, roles, limits, pause. Upgradeable (transparent proxy) |
| `packages/contracts/script/DeployAmpedMemberships.s.sol` | Deploy and role setup, post deploy checks |

Dependencies, out of scope but pinned: OpenZeppelin Contracts and Contracts Upgradeable 5.1.0. Compiler 0.8.28, EVM Cancun, optimizer 200 runs. Chains: Base (8453) and Base Sepolia (84532). Token: Circle USDC (FiatToken v2.2).

## What the system must guarantee

1. A fan's USDC moves only under the fan's own `ReceiveWithAuthorization` signature, and only into the split the Amped.Bio split signer signed for that authorization. The authorization nonce equals the EIP-712 split hash.
2. Every payment pays all recipients in one transaction and the shares sum exactly to the amount. The creator receives the rounding remainder.
3. The platform share goes only to the treasury and is between the on chain fee floor and 10%. The creator receives at least the creator minimum.
4. A payment reference is used once. A refund happens once, returns the full amount to the payer, and needs the creator's signature.
5. No role can set any value outside its fixed range. The fee ceiling (10%) and the USDC address cannot change.
6. Only the Safe can unpause, change addresses, change roles or upgrade. The Coinbase pauser can only pause. The relayer can only submit payments and refunds.
7. The contract holds no USDC between transactions.

AmpedMemberships adds:

8. A member is charged only on terms they signed: the join table's EIP-712 hash carries their signature, as well as the split signer's. The permit alone moves nothing.
9. A renewal pulls exactly one period at the joined price and bps, only between the due date and `renewGrace` after it, and never twice for one period.
10. A canceled or ended membership is never charged again. The member can cancel directly at any time, including while paused.
11. The contract holds no USDC: every share moves from the member to its recipient.

## Trust model

| Actor | Can | Cannot |
| --- | --- | --- |
| Safe (staging: Rob and John, 1 of 2; production: Rob, John and Ciaran, 2 of 3) | Every admin action, upgrades | Move a fan's USDC without the fan's signature |
| Split signer (Coinbase account, EIP-712 signing only) | Decide recipients within the limits | Exceed the limits; take funds without a matching fan authorization |
| Relayer (Coinbase account) | Submit signed payments and refunds | Alter a split, pair an authorization with another split, refund without the creator |
| Pauser (Coinbase account) | Pause | Unpause or change anything else |
| Creator | Sign refunds for their own payments | Refund another creator's payment |
| Member (AmpedMemberships) | Join on signed terms, cancel at any time | Be charged on terms they did not sign, or after cancel |
| Relayer (AmpedMemberships) | Join on signed terms, renew when due, submit a signed cancel, end a membership | Change a membership's price, period or recipients; charge outside the renewal window |

## Known design choices to review

- `refund` calls USDC `permit` inside try and catch so a front run permit cannot block a refund; the allowance is then checked by `transferFrom`.
- The treasury gives AmpedPay a standing USDC allowance for refunds. The Safe sets and can lower it.
- Upgradeability: implementation uses an immutable for the USDC address and disables initializers in the constructor.
- `block.timestamp` comparisons for split and refund windows. Minutes, not seconds, matter here.
- AmpedMemberships `join` calls USDC `permit` inside try and catch, like `refund`. The permit sets one allowance to the contract shared by all of a member's memberships; the member signature on the join table is what binds a charge to a membership.
- AmpedMemberships pays the platform share of a renewal to the current `treasury`, not the one at join.
- AmpedMemberships renewal timing: on time within 1 day keeps the schedule; later inside the grace starts a full period from the renewal.

## Tests

`packages/contracts/test/AmpedPay.t.sol`: 50 tests including fuzzing of the share math (1,000 runs) and the fee ceiling. Coverage at handoff: 97.95% lines, 95.24% branches of `AmpedPay.sol`.

`packages/contracts/test/AmpedMemberships.t.sol`: 42 tests including fuzzing of the share math and the renewal window (1,000 runs each). Coverage at handoff (`forge coverage --ir-minimum`): 95.36% lines, 92.31% branches of `AmpedMemberships.sol`.
