# PAY-1: AmpedPay contract (handoff)

Build Board #50. Spec: `docs/features/ampedpay.md` (PR #373, approved by Rob on 28 Oct). Branch: `feat/contracts-ampedpay`.

## What this PR adds

- `packages/contracts/`: a Foundry project. No `package.json`, so pnpm, turbo and `pnpm-lock.yaml` are untouched.
- `src/AmpedPay.sol`: the contract in spec 3.2.
- `test/AmpedPay.t.sol` and `test/mocks/MockUSDC.sol`: 50 tests, two of them fuzz tests at 1,000 runs.
- `script/DeployAmpedPay.s.sol`: deploy behind a transparent proxy owned by the Safe, with post deploy checks.
- `docs/audit/ampedpay-scope.md`: the brief for the single audit at the end.

No server, client or database change. No migration.

## How it works

1. The API builds a split table: payment ref, payer, amount, recipients (creator, platform, promoter, partners), valid before.
2. The split signer signs its EIP-712 hash.
3. The fan signs USDC `ReceiveWithAuthorization` to AmpedPay for the amount, with **nonce = the split hash**.
4. The relayer calls `pay`. The contract checks the split, then calls USDC with the split hash as the nonce. An authorization signed for any other split fails inside USDC.
5. Every non creator share is paid at `amount * bps / 10000`. The creator gets the remainder.

## Rules the contract enforces

- Only the relayer submits. Nothing runs while paused.
- The split is not expired and not valid for longer than `maxSplitValidity`.
- The payment ref is new and not zero. The amount is within `minPayment` and `maxPayment`.
- 2 to `maxRecipients` rows. No zero address, zero bps, unknown role or duplicate address.
- Exactly one creator at or above `minCreatorBps`. Exactly one platform row, paid to the treasury, between `feeFloorBps` and 10%. At most one promoter. The bps sum to 10,000.
- Refund: full amount, once, signed by the creator before the deadline. The creator funds every share except the platform share, which the treasury funds.

## Adjustable values and who changes them

| Value | Default | Range | Role |
| --- | --- | --- | --- |
| `feeFloorBps` | 500 | 0 to 1,000, and floor plus creator minimum at most 10,000 | PARAMS (Safe) |
| `minCreatorBps` | 5,000 | 5,000 to 10,000, same sum rule | PARAMS (Safe) |
| `maxRecipients` | 6 | 2 to 8 | PARAMS (Safe) |
| `maxSplitValidity` | 3,600 s | 60 to 86,400 s | PARAMS (Safe) |
| `minPayment` | 0.50 USDC | 0.01 USDC to `maxPayment` | PARAMS (Safe) |
| `maxPayment` | 1,000 USDC | `minPayment` to 100,000 USDC | PARAMS (Safe) |
| `treasury`, `splitSigner` | set at deploy | non zero | DEFAULT_ADMIN (Safe) |
| Relayers | set at deploy | grant or revoke `RELAYER_ROLE` | DEFAULT_ADMIN (Safe) |
| Pause | open | pause: PAUSER (Safe, Coinbase pauser); unpause: DEFAULT_ADMIN (Safe) | |

Every change emits `ParamChanged(name, old, new)`. Relayer changes emit the standard role events. The 10% fee ceiling and the USDC address are fixed.

## Decision made in the build

- **Relayer allowlist as a role.** The spec says "relayer allowlist". It is `RELAYER_ROLE`, granted and revoked by the Safe. That reuses OpenZeppelin's audited role code and its events. The admin portal reads `RoleGranted` and `RoleRevoked` for that role.
- **One extra range rule.** `feeFloorBps + minCreatorBps` cannot exceed 10,000. Without it the Safe could set limits under which no payment can pass.

## Check it locally

```bash
cd packages/contracts
forge soldeer install
forge build
forge test
forge coverage --report summary
```

Result in the build sandbox: 50 passed, 0 failed. Coverage of `AmpedPay.sol`: 97.95% lines, 95.24% branches. Foundry's lint shows only `block-timestamp` notes, which the time windows need by design.

Please commit the `soldeer.lock` that `forge soldeer install` creates. The sandbox could not reach the Soldeer registry, so it is not in this PR.

## Staging deploy (after merge)

Needs, from Build Board #53: the staging Safe on Base Sepolia (owners Rob and John, 1 of 2), and the Coinbase split signer, relayer and pauser accounts on `base-sepolia`. Then follow `packages/contracts/README.md`. After deploy, the Safe approves AmpedPay to spend treasury USDC for refunds.

## Not in this PR

- Payments core on the server (PAY-2), the admin pages (PAY-A1, PAY-A2), the Base Sepolia deploy itself, and AmpedMemberships (PAY-3).
