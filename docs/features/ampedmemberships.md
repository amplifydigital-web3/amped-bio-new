# AmpedMemberships: contract spec

Status: draft for Rob, 2026-11-03. The contract is built in PAY-3 (`feat/contracts-ampedmemberships`). Decisions M1 to M5 in section 5 wait for Rob.
Build Board #51 (AmpedMemberships contract and renewals). Owner: Rob Frasca. Drafted by Claude.
Supersedes: the AmpedMemberships block in the memberships spec 3.4 (8 Oct). Amendment 1 to that spec (2 Nov) still governs renewals off chain: the readiness check 3 days before a charge and the 7 day grace with access kept.
Related: `docs/features/ampedpay.md` (roles, limits, pause, split rules), content spec 3.9 (the membership split is signed once at join and stored with the subscription), PR plan (24 Oct): PAY-3, then MB-1.

## 1. What changed from the 8 Oct block

| 8 Oct block | This spec | Why |
| --- | --- | --- |
| `subscribe(planRef, creator, price, period, periods, permit)` with a fixed 95/5 split | `join(JoinTable, splitSig, memberSig, permit)` with a split table signed by the split signer | Same split rules as AmpedPay: creator, platform, promoter, partners, signed once at join (content spec 3.9) |
| The permit is the only fan signature | The member also signs the join table | A permit is an allowance to the contract, not to one membership. The member's signature binds the price, the period and the recipients (decision M1) |
| `renew` any time after the due date | `renew` only inside the grace after the due date | A lapsed membership can't be charged months later without a new join (decision M2) |
| Next due always `nextDue + period` | On time keeps the schedule; late inside the grace starts a full period from the renewal | Amendment 1: no charge for grace days |
| `cancel(subId, fanSig)` | `cancel` by the member, `cancelWithSignature` by the relayer, `endByPlatform` by the relayer | The fan needs no ETH; the platform can stop charges (seller lapse, plan removed, account deletion) |

## 2. The contract

`packages/contracts/src/AmpedMemberships.sol`. Solidity 0.8.28, OpenZeppelin 5.1.0 upgradeable, transparent proxy whose ProxyAdmin the environment's Safe owns. Same Safe, treasury, split signer, relayer and pauser as AmpedPay.

```
struct Recipient { address to; uint16 bps; uint8 role; }   // 0 creator, 1 platform, 2 promoter, 3 partner
struct JoinTable {
  bytes32 subscriptionRef;   // Membership id
  bytes32 planRef;           // plan version (a price change makes a new one)
  address member;
  uint256 price;             // per period, USDC units
  uint32 periodSeconds;      // 30 days or 365 days today; 1 to 366 days allowed
  Recipient[] recipients;
  uint64 validBefore;        // API sets now + quote window
}

join(JoinTable t, bytes splitSig, bytes memberSig, uint256 permitValue, uint256 permitDeadline, bytes permitSig)
  only relayer, not paused
  validBefore not passed, not further than maxJoinValidity
  subscriptionRef new and non zero; member non zero
  minPrice <= price <= maxPrice; 1 day <= periodSeconds <= 366 days
  joinHash = EIP-712 hash of t (domain AmpedMemberships, version 1)
  splitSigner signed joinHash; member signed joinHash
  recipients: AmpedPay's rules (count, bps sum, one creator at or above minCreatorBps,
    one platform at the treasury between feeFloorBps and 10%, at most one promoter, no zero or
    duplicate address) and the member is never a recipient
  store the subscription and its recipients; nextDue = now + periodSeconds
  USDC.permit(member, this, permitValue, permitDeadline, permitSig) in try/catch when given
  pull period 1: transferFrom(member, recipient, share) per row, creator gets the remainder
  emit Joined, Share per recipient, Charged(charge 1)

renew(bytes32 subscriptionRef)
  only relayer, not paused; active; nextDue <= now <= nextDue + renewGrace
  nextDue = now < nextDue + 1 day ? nextDue + period : now + period
  pull one period to the stored recipients (platform share to the current treasury)
  emit Share per recipient, Charged(charge n)
  a short allowance or balance reverts: the server records past due

cancel(subscriptionRef)                                  the member, any time, even paused
cancelWithSignature(subscriptionRef, deadline, sig)      relayer submits EIP-712 Cancel(subscriptionRef, deadline)
endByPlatform(subscriptionRef)                           relayer; only stops charges
```

Views: `hashJoin`, `hashCancel`, `getSubscription`, `getRecipients`, `isRenewable`, `domainSeparator`.

Non custodial: every share moves straight from the member to the recipient. The contract never holds USDC.

## 3. Adjustable values

| Parameter | Default | Allowed range | Role |
| --- | --- | --- | --- |
| `feeFloorBps` | 500 | 0 to 1,000, and floor plus creator minimum at most 10,000 | PARAMS (Safe) |
| `minCreatorBps` | 5,000 | 5,000 to 10,000, same sum rule | PARAMS (Safe) |
| `maxRecipients` | 6 | 2 to 8 | PARAMS (Safe) |
| `maxJoinValidity` | 3,600 s | 60 to 86,400 s | PARAMS (Safe) |
| `renewGrace` | 7 days | 1 to 30 days | PARAMS (Safe) |
| `minPrice` | 1 USDC | 0.01 USDC to `maxPrice` | PARAMS (Safe) |
| `maxPrice` | 5,000 USDC | `minPrice` to 10,000 USDC | PARAMS (Safe) |
| `treasury`, `splitSigner` | set at deploy | non zero | DEFAULT_ADMIN (Safe) |
| Relayers | set at deploy | grant or revoke `RELAYER_ROLE` | DEFAULT_ADMIN (Safe) |
| Pause | open | pause: PAUSER (Safe, Coinbase pauser); unpause: DEFAULT_ADMIN (Safe) | |

Every change emits `ParamChanged(name, old, new)`. Fixed: the USDC address, the 10% fee ceiling, the period bounds, the 1 day on time window, the EIP-712 domain. Limit changes never touch existing subscriptions: each keeps the price, period and bps it joined with. The platform share follows `treasury`.

The price bounds cover the memberships spec decision 7 (every 30 days 1 to 500 USD, yearly 10 to 5,000 USD); the server keeps the per interval bounds.

## 4. What the server does with it (MB-1)

- Join: the server builds the table, the split signer signs it, the fan signs the table and a permit for 12 periods (every 30 days) or 2 (yearly), the relayer calls `join`.
- The permit sets the allowance to this contract for all of the fan's memberships together, so the server asks for the sum of what every active membership needs.
- Readiness check 3 days before a charge reads allowance and balance (amendment 1). Renewals run hourly from the due date. A reverted renew marks past due; reminders on day 1, 3 and 6; on day 7 the server calls `endByPlatform` and access ends.
- Cancel in Wallet, Memberships: one signature, `cancelWithSignature`. Access runs to the period end, off chain.
- Seller pass lapsed: renewals pause off chain; the server ends memberships whose period ended (`endByPlatform`).
- The indexer reads `Joined`, `Charged`, `Share`, `Canceled` into `PaymentEvent`, like AmpedPay's.
- CDP policy: add AmpedMemberships `join`, `renew`, `cancelWithSignature` and `endByPlatform` to the relayer; the split signer's EIP-712 policy adds the AmpedMemberships domain.

## 5. Decisions for Rob

| # | Question | Recommendation | Why | Alternatives |
| --- | --- | --- | --- | --- |
| M1 | How does the fan consent on chain? | The member signs the join table as well as the permit | The permit is an allowance to the contract, shared by every membership. Without a member signature, a split signer and relayer acting together could open a membership the fan never agreed to. With it, the fan's wallet holds proof of the price, the period and the payees (ROSCA consent). The join sheet asks for both behind its one Confirm step | Permit only, trusting the split signer (one signature fewer, weaker audit answer); a per membership spender contract (heavy) |
| M2 | Can a lapsed membership be charged later? | No. `renew` works only up to `renewGrace` (7 days) after the due date; then a new join | Matches the 7 day grace; a fan who walked away is never charged by surprise | No on chain limit, rely on the server |
| M3 | When does a late renewal's next period start? | On time (within 1 day) keeps the schedule; later starts a full period from the renewal | Amendment 1: no charge for grace days; creators keep a steady date for keeper delays | Always from the old due date (charges for grace days); always from now (dates drift by the keeper's lag) |
| M4 | Where does the platform share of a renewal go after a treasury change? | The current treasury | A rotated Safe should receive every later fee | The treasury at join |
| M5 | Who can end a membership without the fan? | The relayer, with `endByPlatform`; ending only stops later charges | Needed for the 7 day expiry, seller lapse, plan removal and account deletion; it can't move money | Fan only (charges continue after deletion until the grace runs out) |

## 6. Acceptance criteria

1. Join pulls one period, pays every recipient in one transaction, and the shares sum to the price with the creator taking the remainder.
2. Join refuses: an expired or over long table, a used or zero ref, a price or period out of range, a table not signed by the split signer, a table the member did not sign, and every AmpedPay recipient rule; plus a member listed as a recipient.
3. Renew charges only between the due date and the end of the grace, at the joined price and bps, and moves the due date per M3.
4. A short allowance or balance makes renew revert with nothing charged; a top up inside the grace lets the next renew succeed.
5. Cancel by the member, by the member's signature through the relayer, or by the platform stops every later charge. Cancels work while paused.
6. No role can set a value outside section 3. Only the Safe unpauses, changes addresses, roles or upgrades.
7. The contract holds no USDC after any call.

## 7. Build

| PR | Branch | Scope | Needs | Days |
| --- | --- | --- | --- | --- |
| PAY-3 | `feat/contracts-ampedmemberships` | This spec, the contract, tests and fuzz, deploy script, audit scope | PAY-1 | 5 |
| MB-1 | `feat/memberships-core` | Plans, join, cancel, renewals with the readiness check and the grace, reminders, indexer, ABI in `@repo/web3` | PAY-3, PAY-2 | 4 |
