# PAY-3: AmpedMemberships contract (handoff)

Build Board #51. Spec: `docs/features/ampedmemberships.md` (decisions M1 to M5 wait for Rob). Branch: `feat/contracts-ampedmemberships`.

## What this PR adds

- `packages/contracts/src/AmpedMemberships.sol`: join with a signed split and the member's signature, keeper renew inside a grace, cancel three ways, pause, limits with fixed ranges. Upgradeable behind the same Safe as AmpedPay.
- `packages/contracts/test/AmpedMemberships.t.sol`: 42 tests, two fuzz tests at 1,000 runs.
- `packages/contracts/script/DeployAmpedMemberships.s.sol`: deploy behind a transparent proxy owned by the Safe, with post deploy checks. Same env variables as AmpedPay.
- `docs/audit/ampedpay-scope.md`: AmpedMemberships joins the single audit.

No server, client or database change. No migration. MB-1 adds the ABI to `@repo/web3`, the models, the renewal job and the indexer.

## Check it locally

```bash
cd packages/contracts
forge soldeer install
forge build
forge test                                   # 92 tests: 50 AmpedPay, 42 AmpedMemberships
forge coverage --report summary --ir-minimum
```

## Before staging

1. Deploy to Base Sepolia after AmpedPay (`forge script script/DeployAmpedMemberships.s.sol ...`). Record the proxy address.
2. Relayer CDP policy: allow AmpedMemberships `join`, `renew`, `cancelWithSignature` and `endByPlatform`.
3. Split signer CDP policy: allow EIP-712 signing for the AmpedMemberships domain.
