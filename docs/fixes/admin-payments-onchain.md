# PAY-A2: Admin payments on chain (handoff)

Build Board #50. Spec: `docs/features/ampedpay.md` 3.2, 3.5, 3.6, 3.8 and 6.1 (PR #373). Designs: "AmpedPay admin pages" canvas, boards a1 and a3, Screen Review rows 308 and 310. Branch: `feat/admin-payments-onchain`, stacked on PAY-A1 (#375). Uses the admin surface of the AmpedPay contract from PAY-1 (#374): `packages/web3/src/abis/ampedpay.ts` lists those signatures, each checked against the compiled contract.

## What this PR adds

| Area                                                                                                                                                              | Files                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| AmpedPay ABI, role ids, Safe ABI and EIP-712 types, Safe network names and app links                                                                              | `packages/web3/src/ampedpay.ts`, `packages/web3/src/abis/ampedpay.ts`, exported through `usdc.ts` |
| Catalog: `contract_paused` item, relayers as `add:0x...` or `remove:0x...` changes                                                                                | `packages/constants/src/payments.ts`                                                              |
| Live reads of AmpedPay (values, pause, implementation, ProxyAdmin owner, Safe roles) and the Safe (owners, threshold, nonce), cached 30 seconds                   | `apps/server/src/services/payments/onchain.ts`                                                    |
| Contract ranges, the server values that depend on them, and the call each change becomes                                                                          | `apps/server/src/services/payments/contractChanges.ts`                                            |
| Safe transaction, hash, delegate proposal, status, manual fallback                                                                                                | `apps/server/src/services/payments/safe.ts`                                                       |
| Pause through the pauser account                                                                                                                                  | `apps/server/src/services/payments/pauser.ts`                                                     |
| Coinbase accounts: pauser, Safe proposer, split signer                                                                                                            | `apps/server/src/services/payments/accounts.ts`, `services/usdc/cdp.ts` (`signEvmTypedData`)      |
| Admin event indexer and Superseded check, started at boot                                                                                                         | `apps/server/src/services/payments/indexer.ts`, `bootstrap.ts`                                    |
| Draft, approve and propose for on chain values; pause contract; Safe details; live Settings and Overview                                                          | `services/payments/changes.ts`, `overview.ts`, `settings.ts`, `trpc/admin/payments.ts`            |
| Admin pages: on chain Change, relayer and address inputs, Safe panel (a3), Pause the contract and Resume the contract (a1), live contract, Safe and account cards | `apps/admin/src/pages/payments/`                                                                  |
| Tests (26 new; PAY-A1 tests move to shared fakes)                                                                                                                 | `apps/server/src/__tests__/payments-onchain.test.ts`, `payments-fakes.ts`                         |
| Runbook: pauser and proposer policies, Safe proposer registration                                                                                                 | `docs/ops/cdp-policy.md`                                                                          |

**Migration: none.** The `admin_changes` table from #375 already has `safe_tx_hash`, `tx_hash` and `chain_id`. The Safe nonce is read from the Safe service, not stored.

## How an on chain change works

1. A payments admin drafts it. The server reads the contract live and refuses when it is not deployed or not answering. The draft is checked against the contract range (spec 3.2) and the server values that depend on it: the fee floor cannot pass the platform fee, the creator minimum must leave room for the fee and the promoter maximum, the split limit cannot drop below the quote window, the contract minimum and maximum must contain the price range, and the daily USDC limit stays within 20 times the maximum. Relayers change one address at a time and the last one cannot be removed.
2. A second payments admin approves with two factor. The server reads the contract again; a moved value marks the draft Superseded.
3. The row is claimed, then the Safe transaction is built (target AmpedPay, value 0, operation call) with the next free Safe nonce, hashed with the Safe's EIP-712 domain and, in service mode, signed by the proposer account and posted to the Safe Transaction Service. A failed proposal returns the draft for another try.
4. The change reads In the Safe. The sheet shows the call, target, nonce, Safe hash, data, owner confirmations and a link to the queue.
5. Owners confirm and execute in the Safe app. The indexer reads `ParamChanged`, `Paused`, `Unpaused` and relayer `RoleGranted` and `RoleRevoked` with 3 confirmations and marks the change Applied with the transaction hash.
6. A change made in the Safe directly, with no portal draft, is logged as applied by Safe owners, so the log stays complete.
7. When the Safe's nonce passes a proposal that the Safe service reports as not executed, the change reads Superseded. A payments admin can also close a proposal; owners then reject it in the Safe app.

**Manual mode.** Without `SAFE_API_KEY` or `CDP_SAFE_PROPOSER_ACCOUNT`, step 3 records the change as In the Safe and the sheet shows the target and data for an owner to enter in the Safe app Transaction Builder (spec 6.1 fallback). No Safe hash is kept, because the owner's transaction gets its own nonce and hash. Superseded is not set automatically in this mode; the event still marks the change Applied.

**Pause the contract.** One payments admin, a reason and two factor. The pauser account sends `pause()` after a gas estimate; the change is logged with its transaction hash and "Not needed for pause". **Resume the contract** is drafted and approved, then proposed to the Safe as `unpause()`.

## Facts checked while building

- **Safe Transaction Service on Base Sepolia: supported.** The Safe API Kit 5.0.4 maps chain 84532 to `basesep` at `https://api.safe.global/tx-service/basesep/api`; Base is `base`. Calls need an API key from developer.safe.global (Bearer header). This closes spec section 8's open question: staging can use the same delegate flow as production.
- The Safe transaction hash is checked in the tests against the `SAFE_TX_TYPEHASH` and domain typehash hard coded in Safe.sol v1.3 and later.
- Every call the server builds (`setFeeFloorBps`, `setMinCreatorBps`, `setMaxRecipients`, `setMaxSplitValidity`, `setMinPayment`, `setMaxPayment`, `setTreasury`, `setSplitSigner`, relayer `grantRole` and `revokeRole`, `pause`, `unpause`) was run against the real AmpedPay contract from #374 in a local Foundry test as the Safe, and each `ParamChanged` name matched the server's `bytes32` name. That scratch test is not committed.

## New environment variables

| Variable                    | Purpose                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `CDP_PAUSER_ACCOUNT`        | CDP account name that holds `PAUSER_ROLE`                                     |
| `CDP_SAFE_PROPOSER_ACCOUNT` | CDP account name registered as a Safe proposer                                |
| `CDP_SPLIT_SIGNER_ACCOUNT`  | CDP account name of the split signer (shown on Overview; PAY-2 signs with it) |
| `SAFE_API_KEY`              | Safe Transaction Service key                                                  |
| `SAFE_TX_SERVICE_URL`       | Optional override for a self hosted service, ending in `/api`                 |

All default to empty. With them empty the pages work in read only and manual modes.

## Before staging QA

1. Merge #374 and deploy AmpedPay to Base Sepolia behind the staging Safe (owners Rob and John, 1 of 2). Set `AMPEDPAY_ADDRESS` and `AMPEDPAY_SAFE`.
2. Merge #375 and apply its migration, then merge this PR. This PR adds no migration.
3. Create the pauser and Safe proposer accounts with the policies in `docs/ops/cdp-policy.md`, fund the pauser, register the proposer in the Safe app, and set `SAFE_API_KEY`.
4. Run spec 6.1 steps 6 to 8 from the admin portal: pause the contract, resume through a second admin and the Safe, lower the fee floor through the Safe, and confirm a drafter cannot approve their own change.

## Check it locally

```bash
pnpm run --filter @repo/server test -- src/__tests__/payments-admin.test.ts src/__tests__/payments-onchain.test.ts src/__tests__/usdc
pnpm turbo typecheck --filter=@repo/server --filter=@repo/admin --filter=@repo/client
pnpm turbo build --filter=@repo/web3 --filter=@repo/server --filter=@repo/admin --filter=@repo/client
```

Result in the build sandbox: 26 new tests, the 29 PAY-A1 tests and the 118 USDC tests pass (173). Typecheck and build pass for constants, web3, database, server, admin and client. The two OAuth integration suites need a live API and fail the same way on `development`. The pages were rendered from the production build with mocked API responses from the real server code at 1440 and 390: no console errors, no sideways page scroll.

## Not in this PR

- Paid, Share and Refunded indexing and every checkout value read at quote time (PAY-2).
- Alerts to every payments admin when a change applies (spec P1 3).
- Contract upgrades from the portal. Upgrades stay in the Safe app after the audit.
