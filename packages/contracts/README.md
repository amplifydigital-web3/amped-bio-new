# Amped.Bio contracts

Solidity contracts for Amped.Bio payments. Built with Foundry. Spec: `docs/features/ampedpay.md` (Build Board #50).

This folder is not a pnpm workspace package. It has no `package.json`, so `pnpm install`, `turbo` and the lockfile ignore it.

## Contracts

| Contract | What it does |
| --- | --- |
| `src/AmpedPay.sol` | One time payments in USDC on Base. The fan signs one `receiveWithAuthorization` whose nonce is the split hash. The contract pays every recipient of a split table signed by the Amped.Bio API, in one transaction. Full refunds, pause, and admin limits with fixed ranges. Upgradeable behind a transparent proxy owned by the Safe. |

## Setup

Install Foundry (https://getfoundry.sh), then from this folder:

```bash
forge soldeer install   # fetches OpenZeppelin 5.1.0 and forge-std 1.9.4 into dependencies/ and writes soldeer.lock
forge build
forge test
forge coverage --report summary
```

Commit `soldeer.lock` the first time it is created. `dependencies/`, `out/` and `cache/` are ignored.

## Deploy to Base Sepolia (staging)

Spec 6.1. The Safe must exist first (owners Rob and John, 1 of 2).

```bash
export BASE_SEPOLIA_RPC_URL=...
export BASESCAN_API_KEY=...
export AMPEDPAY_SAFE=0x...          # staging Safe
export AMPEDPAY_TREASURY=0x...      # the same staging Safe
export AMPEDPAY_SPLIT_SIGNER=0x...  # Coinbase split signer account
export AMPEDPAY_RELAYER=0x...       # Coinbase relayer account
export AMPEDPAY_PAUSER=0x...        # Coinbase pauser account

forge script script/DeployAmpedPay.s.sol --rpc-url base_sepolia --account <deployer> --broadcast --verify
```

The script refuses to finish unless the ProxyAdmin is owned by the Safe, the Safe holds the admin and params roles, the relayer holds the relayer role, and the deployer holds no role. Record the printed addresses in `apps/*/.env.staging` and `docs/ops/ampedpay-staging.md`.

After deploy, the Safe approves AmpedPay to spend treasury USDC so refunds can return the platform share.

Mainnet waits for the audit (Rob, 24 Oct).
