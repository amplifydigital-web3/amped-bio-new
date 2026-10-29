# AmpedPay: contract and admin controls spec

Status: approved, 2026-10-28 (Rob approved all seven decisions in section 7). Build Board #50 (AmpedPay contract and payments core).
Owner: Rob Frasca. Drafted by Claude.
Supersedes: the AmpedPay block in the memberships spec 3.4 (8 Oct, fixed 95/5 split) and the contract rules in the content spec 3.9 (12 Oct, split table). Where they disagree, this document wins.
Related: content spec 3.9 (purchase flow, split table, refunds), USDC wallet spec 3.4 and 3.8 (relayer, screening, Admin Money), gating engine v2 (`paid` kind, G4), PR plan (24 Oct): PAY-1 and PAY-2.
Direction (Rob, 28 Oct): every AmpedPay parameter is visible and adjustable in the admin portal.
Baseline: `main` at 1b498c91 (28 Oct 2026), which contains all of `development`.

## 1. Problem

AmpedPay takes a fan's USDC and splits it to the creator, Amped.Bio and any promoter or partners in one transaction. Two specs describe it differently. The 8 Oct memberships spec has a fixed 95/5 split. The 12 Oct content spec has a signed split table with up to six recipients. The PR plan builds the split table. Neither spec binds the fan's USDC authorization to the split, and neither says how the fee, the treasury, the signer, the relayers or the pause are changed after deploy.

Rob wants every one of those values visible and adjustable in the admin portal. Today the portal has one `admin` role, settings live in a key value table with no history, and nothing in the codebase uses a multisig.

## 2. Research

### 2.1 What is in the code now

| Area | State | Source |
| --- | --- | --- |
| Contracts | None. No `packages/contracts`, no Foundry or Hardhat config. Staking pools are deployed elsewhere and read through ABIs. | `packages/`, `packages/web3` |
| USDC | Circle FiatToken v2.2. Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, Base Sepolia `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. Gasless send already uses `transferWithAuthorization` through the relayer. | `services/usdc/authorization.ts`, `services/usdc/relayer.ts`, USDC spec 1.2 |
| Relayer | One CDP Server Wallet account per environment. Policy limits it to the USDC contract and two functions. AmpedPay and AmpedMemberships are added later. | `services/usdc/relayer.ts`, `docs/ops/cdp-policy.md` |
| Admin settings | `SiteSettings` key value rows (`setting_key`, `setting_value`, `value_type`). Writes overwrite with no history, no author and no approval. | `schema.prisma` `SiteSettings`, `trpc/admin/settings.ts` |
| Admin roles | `adminProcedure` accepts role `admin`. `User.role` is a comma separated list, so new roles need no schema change. | `trpc/trpc.ts` `createRoleProtectedProcedure` |
| Two factor | TOTP two factor exists for every account. | `schema.prisma` `TwoFactor` |
| Admin Money page | Relayer address, ETH balance, runway, gas lines, Pause USDC sends, top ups, recent sends. Gas alarm and stop lines are env values (`RELAYER_GAS_ALARM_ETH`, `RELAYER_GAS_STOP_ETH`). | `apps/admin/src/pages/AdminMoney.tsx`, `services/usdc/admin.ts` |
| Admin shell | Rail groups Start, Content, Money, Access. Money holds Pools and USDC. Prism 2.2 slab tables, word badges, notices. | `apps/admin/src/shell/destinations.ts`, `apps/admin/src/kit` |

### 2.2 Facts the design depends on

- EIP-3009 says to call `receiveWithAuthorization`, not `transferWithAuthorization`, when a contract is the payee, because a watcher can front-run the transfer and skip the wrapper. `receiveWithAuthorization` requires the caller to be the payee. The authorization nonce is any 32 bytes the signer picks.
- A Safe delegate can propose transactions to the Safe Transaction Service without being an owner. It cannot confirm or execute. Only owners confirm.
- OpenZeppelin AccessControl gives separate roles per function, and Pausable gives a pause switch. Upgradeable versions exist for proxies.

### 2.3 The gap this spec closes

The fan signs an authorization for an amount to AmpedPay. The API signs the split. If the two are not tied together, whoever submits can pair a valid fan authorization with a different signed split for the same amount. This spec ties them: the authorization nonce must equal the EIP-712 hash of the split table. The contract computes the hash and passes it as the nonce, so any mismatch fails inside USDC.

## 3. Design

### 3.1 Principles

1. The contract enforces the limits. The admin portal sets values inside them and can never go past them.
2. No single person changes money rules. On chain changes need the multisig. Server money settings need a second admin.
3. The portal never holds an owner key. It proposes; owners approve in Safe.
4. Every change is logged with who, what, old value, new value, reason and approver.
5. Changes apply to new quotes only. A split already signed keeps its terms until it expires.
6. Pause is fast. Resume is deliberate.

### 3.2 Contract

Solidity 0.8.x, OpenZeppelin upgradeable contracts, transparent proxy. The ProxyAdmin is owned by the environment's Safe. Lives in `packages/contracts` (Foundry) in this repo (PR plan decision P2).

```
struct Recipient { address to; uint16 bps; uint8 role; }   // role: 0 creator, 1 platform, 2 promoter, 3 partner
struct SplitTable {
  bytes32 paymentRef;      // Purchase id
  address payer;
  uint256 amount;          // USDC units, 6 decimals
  Recipient[] recipients;  // creator, platform, promoter, partners
  uint64 validBefore;      // API sets now + quote window
}

pay(SplitTable split, bytes splitSig, uint256 authValidAfter, uint256 authValidBefore, bytes authSig)
  only relayer, not paused
  block.timestamp <= split.validBefore
  split.validBefore - block.timestamp <= maxSplitValidity
  splitHash = EIP712 hash of split; signer(splitHash, splitSig) == splitSigner
  payments[paymentRef] is empty
  minPayment <= amount <= maxPayment
  recipients: count <= maxRecipients; bps sum == 10000; no zero or duplicate address;
    exactly one creator, creator bps >= minCreatorBps;
    exactly one platform, to == treasury, feeFloorBps <= bps <= MAX_FEE_BPS;
    at most one promoter
  USDC.receiveWithAuthorization(payer, this, amount, authValidAfter, authValidBefore, nonce = splitHash, authSig)
  each share = amount * bps / 10000; rounding remainder to the creator
  payments[paymentRef] = { splitHash, payer, creator, amount, refunded: false }
  emit Paid(paymentRef, payer, creator, amount, splitHash); emit Share(paymentRef, to, role, shareAmount) per recipient

refund(bytes32 paymentRef, uint64 deadline, bytes creatorSig, Permit creatorPermit)
  only relayer, not paused
  payment exists, not refunded, block.timestamp <= deadline
  creator signed EIP-712 Refund(paymentRef, deadline)
  creator permit to this contract (EIP-2612) for the non platform shares
  USDC.transferFrom(creator, payer, total of creator, promoter and partner shares)
  USDC.transferFrom(treasury, payer, platform share)   // standing treasury allowance set by the Safe
  refunded = true; emit Refunded(paymentRef, payer, creator, amount)
```

Full amount refunds only (content spec decision 25). Promoter and partner shares are funded by the creator on refund, as the content spec states.

**Constants (never adjustable, part of the audit):** USDC address per chain, `MAX_FEE_BPS = 1000` (10%), the EIP-712 domain name `AmpedPay` and version `1`.

**Adjustable on chain (storage, each emits `ParamChanged(name, oldValue, newValue)`):**

| Parameter | Default | Allowed range in contract | Role that changes it |
| --- | --- | --- | --- |
| `feeFloorBps` | 500 | 0 to `MAX_FEE_BPS` | `PARAMS_ROLE` (Safe) |
| `minCreatorBps` | 5000 | 5000 to 10000 | `PARAMS_ROLE` (Safe) |
| `maxRecipients` | 6 | 2 to 8 | `PARAMS_ROLE` (Safe) |
| `maxSplitValidity` | 3600 s | 60 to 86400 s | `PARAMS_ROLE` (Safe) |
| `minPayment` | 0.50 USDC | 0.01 to `maxPayment` | `PARAMS_ROLE` (Safe) |
| `maxPayment` | 1,000 USDC | `minPayment` to 100,000 | `PARAMS_ROLE` (Safe) |
| `treasury` | env Safe | non zero | `DEFAULT_ADMIN_ROLE` (Safe) |
| `splitSigner` | CDP signer account | non zero | `DEFAULT_ADMIN_ROLE` (Safe) |
| relayer allowlist | CDP relayer account | add, remove | `DEFAULT_ADMIN_ROLE` (Safe) |
| `paused` | false | pause, unpause | pause: `PAUSER_ROLE`; unpause: `DEFAULT_ADMIN_ROLE` |

`PAUSER_ROLE` is held by the Safe and by one CDP Server Wallet account, the pauser, whose CDP policy allows only `pause()` on AmpedPay. The admin portal's Pause button calls it. Unpause always goes through the Safe.

### 3.3 Server settings (adjustable directly in the admin portal)

New `SITE_SETTINGS` keys, read through a typed `paymentSettings()` helper with a 30 second cache and the defaults below when a row is missing.

| Setting | Default | Range the server accepts | Bound by |
| --- | --- | --- | --- |
| `payments_paused` | false | on, off | Stops new quotes and submits; separate from the on chain pause |
| `platform_fee_bps` | 500 | `feeFloorBps` to `MAX_FEE_BPS` | Contract refuses below the floor |
| `one_time_price_min`, `one_time_price_max` | 0.50, 1,000 USDC | inside `minPayment` and `maxPayment` | Contract refuses outside |
| `promoter_share_min`, `promoter_share_max` | 1%, 30% | 0% to 50%, and creator stays at or above `minCreatorBps` | Contract checks creator floor |
| `quote_window_seconds` | 600 | 60 to `maxSplitValidity` | Contract refuses a longer split |
| `soft_unlock_confirmations` | 1 | 1 to 12 | Gating spec decision 5 |
| `final_confirmations` | 12 | `soft_unlock_confirmations` to 64 | Receipts at final |
| `purchases_per_day_per_account` | 20 | 1 to 500 | Rate limiter |
| `purchase_usdc_per_day_per_account` | 2,000 USDC | 1 to `maxPayment` x 20 | Rate limiter |
| `promoter_refund_pause_rate` | 10% in 30 days | 1% to 50% | Content spec 3.9 |
| `refund_window_days` | 30 | 0 to 365 | Refund button in Sales |
| `relayer_gas_alarm_eth`, `relayer_gas_stop_eth` | env values today | stop below alarm | Replaces the env lines; env stays the fallback |
| `payments_pilot_only` and the pilot creator list | on, list | on, off; add, remove | `PAYMENTS_ENABLED` flag still gates the whole feature |

A fee change can carry an effective date. Quotes use the old value until that date (decision 4).

### 3.4 Shown in the portal, changed elsewhere

| Item | Where it changes | What the portal shows |
| --- | --- | --- |
| Safe owners and threshold | Safe{Wallet} app | Read on chain: owners, threshold, pending proposals, link to the Safe |
| CDP policies (relayer, signer, pauser) | CDP Portal | Account addresses, ETH balance, policy name, link; runbook `docs/ops/cdp-policy.md` |
| Contract address, implementation version, ProxyAdmin | Deploy script and Safe upgrade | Read only, with the explorer link |
| Secrets, API keys, RPC URLs | Server secret store | Never shown. "Configured" or "Missing" only |

### 3.5 Who can change what

- New role `payments_admin`, added to `User.role` beside `admin`. Plain `admin` sees every payments page read only.
- At launch (Rob, 28 Oct): John is the primary `payments_admin` and Rob the secondary. In practice John drafts and Rob approves, and either can pause.
- Every change needs two factor at the moment of change, even inside a signed in session.
- **Two person rule.** A `payments_admin` drafts a change with a reason. A different `payments_admin` approves it. Only then does it apply (server setting) or get proposed to the Safe (on chain value). The drafter cannot approve their own change.
- **Exceptions.** Pause payments (server) and Pause contract (on chain) apply at once by one `payments_admin`, with a reason. Resume follows the two person rule, and the contract resume also needs the Safe.
- Drafts expire after 7 days unapproved.

### 3.6 On chain change flow

1. Admin A drafts: parameter, new value, reason. The server checks the contract range and the server bounds that depend on it (for example, a floor above the current platform fee is refused until the fee is raised first).
2. Admin B approves with two factor.
3. The server builds the Safe transaction (target AmpedPay or the proxy, calldata, value 0) and proposes it through the Safe Transaction Service as a delegate. The delegate key is a CDP account with no other rights.
4. Safe owners confirm in the Safe app. The portal shows confirmations, for example 1 of 2.
5. An owner executes. The indexer reads `ParamChanged` and marks the change applied, with the transaction hash.
6. If owners reject or the Safe nonce moves past it, the change reads Superseded.

The portal never asks for an owner signature and never holds an owner key.

### 3.7 Data model

```prisma
model AdminChange {
  id            Bytes     @id @db.Binary(16)          // UUIDv7
  area          String    @db.VarChar(24)             // payments
  target        String    @db.VarChar(16)             // server | contract
  key           String    @db.VarChar(64)             // platform_fee_bps, feeFloorBps, treasury ...
  oldValue      String    @map("old_value") @db.VarChar(256)
  newValue      String    @map("new_value") @db.VarChar(256)
  effectiveAt   DateTime? @map("effective_at")
  reason        String    @db.VarChar(500)
  status        String    @db.VarChar(16)             // draft | approved | proposed | applied | rejected | expired | superseded
  draftedById   Int       @map("drafted_by_id")
  approvedById  Int?      @map("approved_by_id")
  safeTxHash    String?   @map("safe_tx_hash") @db.VarChar(66)
  txHash        String?   @map("tx_hash") @db.VarChar(66)
  chainId       Int?      @map("chain_id")
  createdAt     DateTime  @default(now()) @map("created_at")
  decidedAt     DateTime? @map("decided_at")
  appliedAt     DateTime? @map("applied_at")
  @@index([area, createdAt])
  @@index([status])
  @@map("admin_changes")
}
```

Rows are never deleted or edited after `applied`. The settings write and the `AdminChange` update run in one database transaction.

### 3.8 Admin pages

A new Payments destination in the Money group, after USDC. Four pages, one per job. Designs: "AmpedPay admin pages" canvas (https://claude.ai/artifact/GBWvZKDMMhMg6mMiS4hcbY), Prism 2.2, boards a1 to a4 plus the a1 phone board. Linked from Build Board #50.

| Board | Page | What it does |
| --- | --- | --- |
| a1 | Payments, Overview | Status line (taking payments, paused on the server, paused on chain), contract and network, Safe threshold and pending proposals, relayer, signer and pauser health, today's volume and platform fees, changes waiting on approval |
| a2 | Payments, Settings | Every parameter grouped as Fees and split, Limits, Checkout, Promoters and refunds, Relayer and gas, Pilot. Each row: current value, range, a word badge On chain or Server, last change. Edit opens the change sheet |
| a3 | Change sheet and review | Old to new, what it affects, effective date for fees, required reason, two factor. Second admin sees Approve or Reject. On chain changes then show Safe confirmations and the executed transaction |
| a4 | Change log | Every `AdminChange`: when, area, parameter, old, new, who drafted, who approved, status, transaction link. Filters by status and target, CSV export |

Pause and Resume sit on a1 as their own confirm dialogs, on the existing Admin Money pattern.

### 3.9 API

`apps/server/src/trpc/admin/payments.ts`, registered beside `admin/settings.ts`.

| Procedure | Role | Purpose |
| --- | --- | --- |
| `payments.overview` | admin | a1 data, reads chain and Safe with a 30 second cache |
| `payments.settings` | admin | Every parameter with value, range, target, last change |
| `payments.changes.draft` | payments_admin, two factor | Validates and creates a draft |
| `payments.changes.approve`, `reject` | payments_admin (not the drafter), two factor | Applies a server change, or proposes an on chain change to the Safe |
| `payments.changes.list`, `export` | admin | a4 |
| `payments.pause`, `payments.pauseContract` | payments_admin, two factor | Immediate, logged |
| `payments.resume`, `payments.resumeContract` | through draft and approve | Resume follows the two person rule |

## 4. Requirements

### P0 (PAY-1)

1. `packages/contracts` with Foundry, OpenZeppelin upgradeable, the contract in 3.2, roles, constants and ranges.
2. Nonce binding: the authorization nonce is the split hash. A test pairs a valid fan authorization with a different valid split and expects a revert.
3. Unit and fuzz tests for every recipient rule, rounding, refunds, pause, role checks and every parameter range.
4. Deploy script for Base Sepolia behind a Safe, and an audit scope document.

### P0 (PAY-2 and the admin PR)

1. `AdminChange`, `payments_admin`, the settings in 3.3 with defaults, `paymentSettings()`.
2. Draft, approve, apply and propose flows in 3.5 and 3.6, with the Safe delegate.
3. Admin pages a1 to a4 behind `PAYMENTS_ENABLED`.
4. Indexer for `ParamChanged`, `Paid`, `Share`, `Refunded`.

### P1

1. Relayer gas lines move from env to settings.
2. Scheduled fee changes with creator notice.
3. Alerts when a change is applied, sent to every `payments_admin`.

## 5. Acceptance criteria

1. A split signed for one payer and amount, paired with a different authorization nonce, reverts. A valid pair pays every recipient in one transaction and emits `Paid` and one `Share` per recipient.
2. The contract refuses: bps not summing to 10,000; a platform row not at the treasury; platform bps below `feeFloorBps` or above 10%; creator below `minCreatorBps`; two promoters; more than `maxRecipients`; an expired or over long split; a reused `paymentRef`; a caller not on the relayer list.
3. No parameter can be set outside its range in 3.2, by any role.
4. A server setting change applies only after a second `payments_admin` approves with two factor. The drafter's own approval is refused.
5. An on chain change creates a Safe proposal and changes nothing until owners execute. The portal then shows the transaction hash.
6. Pause from the portal stops new payments within one block on chain and at once on the server. Resume needs the second admin, and the Safe for the contract.
7. Every change appears in the change log with old value, new value, reason, drafter and approver, and cannot be edited.
8. A plain `admin` sees every value and cannot change any.
9. A refund returns the full amount to the payer from the creator and the treasury, once per payment.

## 6. Build plan

| PR | Branch | Scope | Needs | Days |
| --- | --- | --- | --- | --- |
| PAY-0 | `docs/ampedpay-spec` | This spec | none | 0.5 |
| PAY-1 | `feat/contracts-ampedpay` | 3.2 contract, tests, fuzz, deploy script, audit scope | PAY-0 | 5 |
| PAY-A1 | `feat/admin-payments-settings` | `AdminChange`, `payments_admin`, settings and defaults, two person flow for server settings, pages a1, a2, a4 | PAY-0 | 3 |
| PAY-2 | `feat/payments-core` | As the PR plan, plus reading every value through `paymentSettings()` | PAY-1 on Sepolia, CK-1 | 4 |
| PAY-A2 | `feat/admin-payments-onchain` | Safe delegate proposals, `ParamChanged` indexer, a3 on chain states, pause through the pauser account | PAY-1 on Sepolia, PAY-A1 | 2.5 |

PAY-A1 can start now. It needs no contract.

### 6.1 Testing on Base Sepolia

Staging (`development`, `app.staging.amped.bio`, `api.staging.amped.bio` and the staging admin) runs the whole flow on Base Sepolia before anything touches Base mainnet. Mainnet waits for the single audit (Rob, 24 Oct).

**Setup (Build Board #53, B3, plus the items below):**

| Item | Staging value |
| --- | --- |
| Chain | `PAYMENT_CHAIN=base-sepolia`, USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Safe | One Safe on Base Sepolia, owners Rob and John, 1 of 2 (decision 3). It owns the proxy, holds `DEFAULT_ADMIN_ROLE`, `PARAMS_ROLE` and `PAUSER_ROLE`, and is the treasury |
| Coinbase accounts on `base-sepolia` | Relayer (exists in the plan), split signer (EIP-712 signing only), pauser (only `pause()` on AmpedPay), Safe proposer (a Safe delegate with no other rights) |
| Gas | Base Sepolia ETH for the deploy key, the relayer and the pauser |
| Test USDC | Circle's faucet sends 20 USDC on Base Sepolia per request, one request per address every 2 hours. Fund each test fan wallet from it |
| Deploy | `forge script` from `packages/contracts` to Base Sepolia, verified on Base Sepolia BaseScan. Addresses go in `apps/*/.env.staging` and `docs/ops/ampedpay-staging.md` |
| Admin portal | The environment pill reads Staging, Base Sepolia. Every staging page states that test USDC has no value |

**Safe proposals on staging.** Safe's supported-network list did not confirm the Transaction Service on Base Sepolia when this spec was written. PAY-A2 checks it first. If it is supported, staging uses the same delegate flow as production. If not, staging alone uses the fallback: the portal shows the Safe transaction (target, calldata, value 0) for an owner to submit in the Safe app or with the Safe CLI, and the indexer still marks the change applied from `ParamChanged`.

**Staging test run (Full QA before Staging is approved):**

1. Pay with creator and platform only. The creator gets 95% and the treasury 5% in one transaction.
2. Pay with a promoter and a partner. Every `Share` event matches the signed table.
3. Each refusal in acceptance 2, sent from a test script against the staging contract.
4. Nonce binding: a valid fan authorization paired with a different signed split reverts.
5. Refund the full amount from the creator and the treasury. A second refund of the same payment reverts.
6. Pause from the portal. New payments revert. Resume through a second admin and the Safe.
7. Lower the fee floor through the Safe, then the platform fee with an effective date. Quotes change only on that date.
8. A plain `admin` sees every page and can change nothing. A drafter cannot approve their own change.
9. Limits: above the per payment maximum, above the daily limit, an expired quote.

The run is recorded as a staging QA document and linked from card #50 before the Staging stage is approved.

## 7. Decisions (approved by Rob, 28 Oct, as recommended)

1. **Two person rule on money settings.** Recommended: yes, a second `payments_admin` approves every change except Pause. Why: one compromised or mistaken admin account cannot change where money goes. Alternative: one admin with two factor and a log.
2. **Who can pause the contract.** Recommended: any `payments_admin` from the portal through the pauser account; resume through the Safe. Why: stopping payments in an incident should take seconds, not a signing round. Alternative: Safe only for both.
3. **The multisig.** Recommended: a Safe on Base, 2 of 3 owners named by Rob, one per environment; staging may be 1 of 2. The treasury is a Safe too. Why: no single key controls upgrades, fees or the treasury. Alternative: 3 of 5 for production. Owners (Rob, 28 Oct): staging Rob and John, 1 of 2; production Rob, John and Ciaran, 2 of 3. Each Safe is also that environment's treasury.
4. **Fee changes and notice.** Recommended: a platform fee change carries an effective date at least 30 days out for an increase, any date for a decrease, and creators get a notice. Counsel confirms the notice period against seller terms. Why: creators agreed to 5%; an increase without notice breaks that. Alternative: on chain timelock of 48 hours on every parameter.
5. **Portal proposes, owners sign.** Recommended: the server proposes through the Safe Transaction Service as a delegate. Why: owners approve in an app they already trust and the portal never holds an owner key. Alternative: the portal shows calldata for an owner to paste.
6. **Contract ranges.** Recommended: the ranges in 3.2, including the 10% fee ceiling as a constant. Why: the audit can prove what admins can and cannot do. Alternative: wider ranges set by the Safe.
7. **Nonce binding.** Recommended: authorization nonce equals the split hash. Why: closes the pairing gap in 2.3 without a second fan signature. Alternative: the fan signs the split as well (two signatures, worse on phones).

## 8. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| Wallet addresses of the Safe owners (Rob and John for staging; Rob, John and Ciaran for production) | Rob, John, Ciaran | Creating the Safes |
| Notice period for fee increases under seller terms | Counsel | Fee changes in production |
| Whether the Safe Transaction Service supports Base Sepolia (fallback in 6.1 if not) | Engineering | PAY-A2 on staging |
| CDP pauser account and split signer account (B3) | Rob, Gustavo | PAY-A2, PAY-2 |

## Sources

- EIP-3009, Transfer With Authorization: https://eips.ethereum.org/EIPS/eip-3009
- Safe delegate management (Transaction Service): https://help.multisig.ledger.com/guides/api-guides/4.-delegate-management
- Safe API Kit reference: https://docs.safe.global/sdk/api-kit/reference/reference
- OpenZeppelin upgradeable access control: https://tessl.io/registry/tessl/npm-openzeppelin--contracts-upgradeable/5.4.0/files/docs/access-control.md
- Safe API supported networks: https://docs.safe.global/api-supported-networks
- Circle testnet faucet: https://faucet.circle.com/

## Revision log

- 2026-10-28 (signers): Rob named the Safe owners (staging Rob and John, 1 of 2; production Rob, John and Ciaran, 2 of 3) and the payments admins (John primary, Rob secondary). Each Safe is its environment's treasury. Open questions narrowed to the owners' wallet addresses.
- 2026-10-28 (later): Rob approved decisions 1 to 7 as recommended. Added 6.1, testing on Base Sepolia: staging setup, test USDC from Circle's faucet, the staging Safe proposal fallback, and the staging test run.
- 2026-10-28: v1. One AmpedPay interface on the split table. Nonce binding. Every parameter classified as constant, on chain or server, with ranges and change paths. Admin roles, two person rule, Safe proposals, `AdminChange` log, admin pages a1 to a4. PR plan adds PAY-0, PAY-A1, PAY-A2.
