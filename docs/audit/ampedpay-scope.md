# AmpedPay audit scope

Status: draft brief for the single audit of AmpedPay and AmpedMemberships, run on the staging deployment once both are built and deployed (Rob, 24 Oct). AmpedMemberships (PAY-3) joins this scope when it is written.

## In scope

| File | Notes |
| --- | --- |
| `packages/contracts/src/AmpedPay.sol` | Payments, refunds, roles, limits, pause. Upgradeable (transparent proxy) |
| `packages/contracts/script/DeployAmpedPay.s.sol` | Deploy and role setup, post deploy checks |

Dependencies, out of scope but pinned: OpenZeppelin Contracts and Contracts Upgradeable 5.1.0. Compiler 0.8.28, EVM Cancun, optimizer 200 runs. Chains: Base (8453) and Base Sepolia (84532). Token: Circle USDC (FiatToken v2.2).

## What the system must guarantee

1. A fan's USDC moves only under the fan's own `ReceiveWithAuthorization` signature, and only into the split the Amped.Bio split signer signed for that authorization. The authorization nonce equals the EIP-712 split hash.
2. Every payment pays all recipients in one transaction and the shares sum exactly to the amount. The creator receives the rounding remainder.
3. The platform share goes only to the treasury and is between the on chain fee floor and 10%. The creator receives at least the creator minimum.
4. A payment reference is used once. A refund happens once, returns the full amount to the payer, and needs the creator's signature.
5. No role can set any value outside its fixed range. The fee ceiling (10%) and the USDC address cannot change.
6. Only the Safe can unpause, change addresses, change roles or upgrade. The Coinbase pauser can only pause. The relayer can only submit payments and refunds.
7. The contract holds no USDC between transactions.

## Trust model

| Actor | Can | Cannot |
| --- | --- | --- |
| Safe (staging: Rob and John, 1 of 2; production: Rob, John and Ciaran, 2 of 3) | Every admin action, upgrades | Move a fan's USDC without the fan's signature |
| Split signer (Coinbase account, EIP-712 signing only) | Decide recipients within the limits | Exceed the limits; take funds without a matching fan authorization |
| Relayer (Coinbase account) | Submit signed payments and refunds | Alter a split, pair an authorization with another split, refund without the creator |
| Pauser (Coinbase account) | Pause | Unpause or change anything else |
| Creator | Sign refunds for their own payments | Refund another creator's payment |

## Known design choices to review

- `refund` calls USDC `permit` inside try and catch so a front run permit cannot block a refund; the allowance is then checked by `transferFrom`.
- The treasury gives AmpedPay a standing USDC allowance for refunds. The Safe sets and can lower it.
- Upgradeability: implementation uses an immutable for the USDC address and disables initializers in the constructor.
- `block.timestamp` comparisons for split and refund windows. Minutes, not seconds, matter here.

## Tests

`packages/contracts/test/AmpedPay.t.sol`: 50 tests including fuzzing of the share math (1,000 runs) and the fee ceiling. Coverage at handoff: 97.95% lines, 95.24% branches of `AmpedPay.sol`.
