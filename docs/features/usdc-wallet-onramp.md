# USDC in the wallet (Base) and Buy USDC through Coinbase

Status: build ready, 2026-10-10. Supersedes sections 3.5 (wallet and onramp procedures), 3.6 and 3.11 phases A1 and A2 of the memberships spec (claude/amped-memberships-payments-spec-2026-10-08.md). That spec keeps payments and memberships (phases B to D).
Owner: Rob Frasca. Drafted by Claude, 2026-10-10.
Build Board: #29 USDC in the wallet (Base), #5 Buy USDC through Coinbase. #5 depends on #29.
Screens: Prism 2.2 boards w1 to w7 on the USDC in the wallet design page (https://claude.ai/artifact/91ieQ5NJYCy2eBMW5mP7PG) and o1 to o7 on the Buy USDC through Coinbase design page (https://claude.ai/artifact/7A3CCALBwihA6oZd1hRbDV). Design QA: docs/features/usdc-wallet-onramp-design-qa.md. Overview: docs/features/usdc-wallet-onramp-overview.md (https://claude.ai/artifact/SbCLhKZy8A1Vc7DTeVcLPn). Screen Review rows 137 and 138.
Direction from Rob, 10 Oct: use Coinbase and Circle contracts and controls for holding and moving USDC; use Coinbase to build the on-ramp; Coinbase is the point of purchase.

## 1. Research (verified 10 Oct 2026 against the Coinbase and Circle docs)

### 1.1 What changed since the 8 Oct spec

| Fact | Was in the 8 Oct spec | Verified 10 Oct | Effect |
| --- | --- | --- | --- |
| Hosted guest checkout | Noted as ending 30 June 2026 | Ended. The hosted widget now serves Coinbase account holders only. Non Coinbase users buy through the Headless Onramp (Order API) with Apple Pay or Google Pay, US only | Buy USDC has two paths, not one (3.9) |
| Credit cards | Implied | Coinbase does not support credit cards in the US. Debit and credit cards in 90 plus countries including the EU, UK and Canada. Credit card fee 2.5%, ACH 0.5%, spread in the price | US copy says debit card, Apple Pay, Google Pay or bank; never credit card |
| Relayer | Own hot wallet, keys in AWS KMS | CDP Server Wallets hold the key in a trusted execution environment, with a policy engine that limits which contracts and functions the account may call | The relayer is a Coinbase held account (decision 2) |
| Gas sponsorship | Not considered | CDP Paymaster sponsors gas on Base for ERC-4337 smart accounts only; an EOA needs EIP-7702. Circle Paymaster lets 4337 accounts pay gas in USDC at a 10% surcharge | Phase D upgrade, not day one (decision 2) |
| Screening | Chainalysis or TRM | Circle Compliance Engine screens a blockchain address standalone through the Compliance API; access by request. Circle's USDC contract itself refuses transfers to or from blocklisted addresses | Circle first, oracle as the bridge (decision 3) |
| Settlement signal | Webhook | Webhook events onramp.transaction.created, updated, success, failed (hosted) and order status COMPLETED (headless), plus the Transaction Status API by partnerUserRef | Three signals, chain confirmation wins (3.7) |

### 1.2 The Coinbase and Circle pieces we use, and what each one controls

| Piece | What it does for Amped.Bio | Control we inherit |
| --- | --- | --- |
| Circle USDC on Base, FiatToken v2.2 (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; Base Sepolia 0x036CbD53842c5426634e7929541eC2318f3dCF7e) | The asset. `balanceOf`, `Transfer` events, `transferWithAuthorization` and `receiveWithAuthorization` (EIP-3009), `permit` (EIP-2612) | Circle's blocklist and pause are enforced in the contract. A transfer touching a blocklisted address reverts. Amped.Bio never holds or moves the asset on a user's behalf without the user's signature |
| CDP Server Wallet (EVM account on Base) | Submits the fan's signed authorization to the USDC contract and pays Base gas. One account per environment (staging, production) | Key in Coinbase's trusted execution environment. CDP Policy Engine: allow only the USDC contract and, later, AmpedPay and AmpedMemberships; allow only the functions named in 3.4; ETH value 0; per transaction and daily caps. The Wallet Secret and API key live in the server secret store |
| CDP Onramp, Order API (headless) | Apple Pay or Google Pay purchase inside our page. Coinbase collects phone and email verification and the limits upgrade in its own iframe (embedded order mode) | Coinbase is the merchant for the fiat purchase, runs KYC, fraud, chargebacks and limits. Domain allowlist and Apple Pay domain verification file on our domain |
| CDP Onramp, Session API (hosted) | One click URL for Coinbase account holders: USDC on Base to the fan's address, amount preset, redirect back | Single use URL, five minute token, popup or new tab only (no iframe) |
| CDP Onramp webhooks and Transaction Status API | Tells us an order succeeded or failed and carries the tx hash and partnerUserRef | Signed with the subscription secret. We still confirm on chain |
| Circle Compliance Engine, standalone address screening | Screens the destination of every send and the fan's own address at first use | Rules, blocklist and allowlist in the Circle Console, audit log there |
| Chainalysis sanctions oracle on Base | Free onchain `isSanctioned(address)` until Circle approves Compliance Engine access, and as the second check after | Sanctions list maintained by Chainalysis |
| CDP Onchain Data webhooks (ERC-20 transfer) | Pushes USDC transfers to and from Amped.Bio addresses so balances update without polling | Confirm the event type in the CDP Portal at build time. The viem poller in 3.6 is the reconciler and works alone if the webhook is not available |

### 1.3 Patterns we adopt

1. One address. The fan's Web3Auth EOA is the wallet on Base, the same address that holds tREVO on Libertas. Coinbase delivers USDC to it. Nothing new to back up, no second address to explain.
2. Fans sign, Coinbase submits. Every USDC move the fan makes is an EIP-3009 authorization signed in the Web3Auth wallet. The CDP Server Wallet submits it and pays gas. The fan never holds ETH.
3. Coinbase is the point of purchase. The fan pays Coinbase for USDC. Amped.Bio shows the amount and the quote, hands off, and reports arrival. Amped.Bio never touches fiat, never quotes its own price, never adds a fee.
4. Chain wins. Balances, activity and the on-ramp arrival state come from the USDC contract on Base. Webhooks and status polls make the UI quick; the chain makes it true.
5. Controls live in the vendor consoles. Contract and function allowlists in CDP policies, screening rules in the Circle Console, limits in Coinbase. Amped.Bio keeps only the product limits in 3.5 and the admin flags.

## 2. Overview

### What ships

1. **USDC in the wallet (#29).** Base beside Libertas Testnet in the wallet. Two balance tiles. Tokens, Activity, Receive with network chips and the Base notice, Fund with Deposit USDC, and Send with an asset chip row. USDC sends are gasless. Flag `VITE_USDC_WALLET`.
2. **Buy USDC through Coinbase (#5).** Fund gains Buy USDC. One flow, two ways to pay: Apple Pay or Google Pay (no Coinbase account, US) and Pay with your Coinbase account (everywhere Coinbase operates except Japan). Coinbase quotes, charges, verifies and delivers. The wallet shows arrival. Flag `VITE_USDC_ONRAMP`.

### Decisions (recommended, with alternatives; Rob to confirm on the board cards)

1. **Address model: the Web3Auth EOA is the Base wallet.** Why: one address for tREVO and USDC, no migration, no second address on Receive, Coinbase delivers to any EVM address. Alternatives: a CDP Embedded Wallet smart account per fan (new address, two wallets to explain, Libertas not supported); a 4337 smart account owned by the EOA (a second address again).
2. **Relayer: a CDP Server Wallet account on Base, policy locked.** Why: Coinbase holds the key, the policy engine limits the account to the USDC contract and the two authorization functions, and the same account later submits AmpedPay and AmpedMemberships calls. No KMS, no nonce queue of our own. Alternatives: own hot wallet in AWS KMS (the 8 Oct plan; we hold a key we do not need to hold); CDP Paymaster through EIP-7702 (removes the ETH float, but Web3Auth must sign a 7702 authorization, unconfirmed, so this is the phase D upgrade); Circle Paymaster (fan pays gas in USDC, needs a 4337 account).
3. **Screening: Circle Compliance Engine, Chainalysis oracle as the bridge and second check.** Why: Circle screens the asset it issues, with rules and an audit trail in its console; the oracle is free and onchain and runs today. Alternatives: TRM or Chainalysis KYT API alone (a second vendor contract); no screening (not acceptable with a Coinbase held relayer and a Coinbase ramp agreement).
4. **On-ramp: Coinbase only, two paths in one flow.** Apple Pay or Google Pay through the Headless Onramp for US fans without a Coinbase account; the hosted flow for Coinbase account holders anywhere. Why: Coinbase is the point of purchase in both, no developer fee, native to Base, one vendor agreement. Alternatives: hosted only (US fans without a Coinbase account cannot buy since 30 June); MoonPay second now (held for phase C of the memberships spec; confirm its adult content position in writing first).
5. **Headless order mode: embedded.** Coinbase collects and verifies phone and email, shows the limits upgrade, and returns a `userAuthToken` we store for 60 days so returning fans skip verification. Why: no OTP vendor, no PII in our database beyond the token. Alternative: standard mode (we verify phone and email ourselves with Coinbase's Verification API or Twilio, and re-verify the phone every 60 days).
6. **Quote before handoff.** The Amount step shows Coinbase's quote (you pay, fees, you receive) from the Order API with `isQuote: true` for the Apple Pay path and the Session API quote use case for the Coinbase account path. Why: the fan sees the fee before leaving the page, and the quote is Coinbase's, not ours. Alternative: hand off blind and let Coinbase show the price (one less call, one more surprise).
7. **Limits on gasless sends (answered by Rob on row 137 D1, kept).** 10 sends per day, 2,000 USDC per day per account, verified email required, screening on every address. Enforced in `wallet.sendUsdc.submit` and mirrored as the CDP policy caps.
8. **USDC display (kept from #29).** Shown as USDC, treated as USD, two decimals, up to four in balances with trailing zeros removed. No USD toggle.
9. **Receive notice (answered by Rob on row 137 D2, counsel confirms wording).** Solid notice under the Base address: Send only USDC on Base to this address. Other networks and tokens are lost.
10. **Top bar chip (kept).** USDC on money destinations, tREVO on My Pool and Explore.
11. **Staging.** Base Sepolia with Circle's test USDC for the wallet. The on-ramp sandbox uses the production CDP key with `partnerUserRef` prefixed `sandbox-` and the Apple Pay or Google Pay sandbox flag; sandbox orders always succeed and never charge a card. Why: that is how Coinbase provides it. Note: a sandbox order delivers nothing on chain, so the staging arrival state is driven by the webhook alone and says so in the admin log.

### Out of scope

Off-ramp (#6). Paid items, memberships, AmpedPay, AmpedMemberships (memberships spec phases B and C). MoonPay. Bridge to Revolution (phase D). Native apps (the web flow is the build; the iOS and Android notes in 3.9 are for the Telegram Mini App and any future native shell).

## 3. Detailed spec

### 3.1 Screens

| Board | Surface | What it shows |
| --- | --- | --- |
| w1 | Wallet summary and Tokens tab, desktop 1440 x 890 | Two balance tiles: USDC on Base (the G3 lens with the rim) and tREVO on Libertas Testnet with the testnet line. Send, Receive, Fund on both tiles. Tabs Tokens, Activity (Names returns when RNS is on). Tokens rows: USDC, Base, balance; tREVO, Libertas Testnet, balance, testnet line; Send and Receive on each |
| w2 | Receive, Base chip selected, value panel | Network chips Base and Libertas Testnet above the QR and the address. Copy address, Share. Solid notice: Send only USDC on Base to this address. Other networks and tokens are lost. Line: USDC arrives in about a minute and shows in Activity. The address is the same on Libertas Testnet for tREVO |
| w3 | Send USDC, Amount step | Steps Amount, Review, Confirm in wallet. Asset chips USDC and tREVO. To (address or @handle, resolved with the address beside it). Amount well, Available, Balance after, presets 10, 25, 50, Max. Slab: Network Base, Network fee Paid by Amped.Bio. Review send (indigo next step) |
| w4 | Send USDC, Review step, calm panel | You send well with Edit amount. Slab: To, Network, Network fee Paid by Amped.Bio, Balance after, Arrives in about 30 seconds. Required checkbox: I checked the address. Sends on Base cannot be reversed. Commit button Send 3 USDC, wallet note verbatim. No rim, no halo |
| w5 | Fund panel over Activity | Rows Buy USDC (Coinbase mark; Apple Pay, Google Pay, debit card or bank; Coinbase sells, Amped.Bio charges nothing), Deposit USDC (opens Receive on Base), Testnet faucet, Deposit tREVO with the testnet line. Bridge not rendered. Behind it, Activity merged across both chains, chips All, Transfers, Staking, rows Received from Coinbase, Sent, Staked, Received, Faucet |
| w6 | Send USDC, refused by screening, calm panel | The To field with the address, the solid notice: This address cannot receive USDC from Amped.Bio. Nothing was sent. Slab: Checked by, Reference. One button, Done. No retry |
| w7 | Wallet summary, phone 390 x 844 | Chip in the top bar, tiles stacked (USDC lens, tREVO clear), tabs, Tokens rows, dock with Wallet risen |
| o1 | Buy USDC, Amount step, value panel in Wallet | Byline Sold and delivered by Coinbase. Amount well in USD, Minimum 5 USD, presets 10, 25, 50, 100. Coinbase quote slab: You pay, Coinbase fee, Network fee, You receive about N USDC, Delivered to Your wallet on Base. Line with the Coinbase mark: Coinbase sets the price and fees. Nothing is charged on Amped.Bio. Quote refreshes every 30 seconds. Button: Choose how to pay (indigo next step) |
| o2 | Choose how to pay | Two options. Apple Pay or Google Pay (the G3 lens with the rim when it is the regional default): Debit card in your phone's wallet. No Coinbase account needed. US only. Stays on this page. Pay with your Coinbase account (G1 clear): Debit card or bank in the US. Debit or credit card in most other countries. Opens Coinbase in a new tab. Agreement line naming Coinbase's Guest Checkout Terms, User Agreement and Privacy Policy. Back. An option the Config API rules out renders disabled with its reason |
| o3 | Apple Pay path, calm panel | The quote slab, then the Coinbase payment frame inside the panel (Coinbase secure checkout, its verification step, its Apple Pay button, the line Only you can press this button. Coinbase renders it). Line: Coinbase runs these steps inside its own frame under its privacy policy. Amped.Bio sees only the order result. Cancel. Returning fans see the button at once |
| o4 | Coinbase account path, calm panel | Waiting for Coinbase with the 55 ring: Coinbase opened in a new tab. Pay there with your debit card, bank or balance. Come back here when it says done. The quote slab. Line: The Coinbase link works once and for five minutes. Open Coinbase again makes a new one. Buttons Open Coinbase again, Cancel |
| o5 | Arrived | Check mark, 23.49 USDC is in your wallet, On Base, View on explorer, confirmed on chain. Slab: You paid Coinbase, Method, Order. Line: Your balance updated without a reload. A Coinbase receipt is in your email. Back to the item (indigo, when the fan came from an Add USDC link), Done. The USDC tile and Activity behind the panel already show the new balance |
| o6 | Not completed, calm panel | Solid notice: Coinbase did not complete the purchase. Nothing was charged on Amped.Bio. Slab: Coinbase said (the decline reason relayed plain), Order. The other states drawn as a legend on the board: canceled, limit reached (Coinbase shows the upgrade), region not supported (Try again becomes Deposit USDC). Try again, Done |
| o7 | Buy USDC, Amount step, phone 390 x 844 | The panel as a full screen sheet with the grab handle: amount well, presets, quote slab, the Coinbase line, Choose how to pay |

Loading, error and empty states follow the app structure conventions.

### 3.2 Data model

Additions to `apps/server/prisma/schema.prisma`. Amounts in USDC base units (6 decimals) as `BigInt`. Fiat in cents.

```prisma
model OnrampSession {
  id               Int      @id @default(autoincrement())
  userId           Int      @map("user_id")
  provider         String   @db.VarChar(16)   // coinbase
  mode             String   @db.VarChar(24)   // apple_pay | google_pay | coinbase_account
  sessionRef       String   @map("session_ref") @db.VarChar(128)   // orderId (headless) or partnerOrderRef (hosted)
  partnerUserRef   String   @map("partner_user_ref") @db.VarChar(64)
  status           String   @db.VarChar(24)   // created | pending_verification | pending_payment | processing | success | failed | canceled | expired
  fiatAmount       Int?     @map("fiat_amount")       // cents the fan pays, fee inclusive
  fiatCurrency     String   @default("USD") @map("fiat_currency") @db.VarChar(3)
  usdcAmount       BigInt?  @map("usdc_amount")       // quoted, then actual from the webhook
  quote            Json?                              // Coinbase quote as returned
  txHash           String?  @map("tx_hash") @db.VarChar(66)
  failureCode      String?  @map("failure_code") @db.VarChar(64)
  returnTo         String?  @map("return_to") @db.VarChar(255)   // in app path when opened from an Add USDC link
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([userId, createdAt])
  @@unique([provider, sessionRef])
  @@map("onramp_sessions")
}

model OnrampUserAuth {
  userId        Int      @id @map("user_id")
  provider      String   @db.VarChar(16)
  tokenEnc      Bytes    @map("token_enc")             // Coinbase userAuthToken, AES-GCM with the server data key
  expiresAt     DateTime @map("expires_at")            // 60 days from issue
  updatedAt     DateTime @updatedAt
  @@map("onramp_user_auth")
}

model UsdcSend {
  id            Int      @id @default(autoincrement())
  userId        Int      @map("user_id")
  chainId       Int      @map("chain_id")
  toAddress     String   @map("to_address") @db.VarChar(42)
  toUserId      Int?     @map("to_user_id")
  amount        BigInt
  nonce         String   @db.VarChar(66)                 // EIP-3009 nonce, unique per from address
  status        String   @db.VarChar(16)                 // screened | submitted | confirmed | failed | refused
  screening     Json?                                    // vendor, result, reference
  txHash        String?  @map("tx_hash") @db.VarChar(66)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([userId, createdAt])
  @@unique([chainId, nonce, userId])
  @@map("usdc_sends")
}
```

`PaymentEvent.kind` gains `usdc_in`, `usdc_out` and `onramp` (the model is in the memberships spec and ships with this build). `User` gains `usdc_wallet_seen_at` (first time the fan opened Receive on Base; the first screening of their own address runs then).

### 3.3 Packages and configuration

`packages/web3/src/index.ts`:

```ts
import { base, baseSepolia } from "viem/chains";
export const USDC = {
  [base.id]:        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
} as const;
export const PAYMENT_CHAIN = import.meta.env.VITE_PAYMENT_CHAIN === "base" ? base : baseSepolia;
export const AVAILABLE_CHAINS = [libertasTestnet, revolutionDevnet, PAYMENT_CHAIN];
export const USDC_DECIMALS = 6;
```

Server env: `PAYMENT_CHAIN`, `BASE_RPC_URL` (CDP Node RPC for Base, or the public endpoint on staging), `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `CDP_RELAYER_ACCOUNT` (the server wallet account name per environment), `CDP_ONRAMP_WEBHOOK_SECRET`, `ONRAMP_DOMAIN` (the allowlisted domain), `CIRCLE_API_KEY` (Compliance Engine, when granted), `CHAINALYSIS_ORACLE` (Base address of the sanctions oracle), `USDC_SEND_DAILY_COUNT=10`, `USDC_SEND_DAILY_UNITS=2000000000`, `ONRAMP_DATA_KEY` (for `OnrampUserAuth`).

Client flags: `VITE_USDC_WALLET`, `VITE_USDC_ONRAMP`, `VITE_PAYMENT_CHAIN`.

Web3Auth: `chains` gains the Base entry (chainId 8453, or 84532 on staging). Default chain stays Libertas. The wallet switches chains per action: a USDC send calls `switchChain(PAYMENT_CHAIN)` before `signTypedData` and switches back after. Engineering gate: confirm the current Web3Auth SDK signs EIP-712 typed data on Base and switches chains without a reconnect.

### 3.4 Chain and relayer (server)

`apps/server/src/services/chain/base.ts`

- viem public client on `PAYMENT_CHAIN`. `getUsdcBalance(address)`, `getUsdcTransfers(address, fromBlock)`, `watchUsdcTransfers(addresses)`.
- `buildTransferAuthorization({ from, to, value, validAfter, validBefore, nonce })` returns the EIP-712 typed data for `TransferWithAuthorization` with the Circle domain (`name: "USD Coin", version: "2", chainId, verifyingContract: USDC`). The client signs it. `validBefore` is now plus 10 minutes. `nonce` is 32 random bytes stored on `UsdcSend`.

`apps/server/src/services/chain/relayer.ts` (the CDP Server Wallet)

- `@coinbase/cdp-sdk` client from the API key and Wallet Secret. One EVM account per environment, created once and named in `CDP_RELAYER_ACCOUNT`.
- `submitAuthorization(sig, auth)` calls `USDC.transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)` through `sendTransaction` on `PAYMENT_CHAIN`. CDP manages the nonce. We wait for the receipt.
- Policy (set in the CDP Portal, documented in `docs/ops/cdp-policy.md`): allowed networks `base` and `base-sepolia`; allowed contract addresses the USDC address for each; allowed functions `transferWithAuthorization`, `receiveWithAuthorization`; ETH value 0; per transaction gas cap; daily transaction count cap 5,000. AmpedPay and AmpedMemberships are added to the policy when phase B ships.
- Gas: the account holds ETH on Base funded from the treasury. Alarm at 0.05 ETH; hard stop at 0.01 ETH with the plain failure in 3.10. The Libertas faucet wallets are untouched.
- Audit: every submit writes `UsdcSend` and, on confirmation, `PaymentEvent(kind: usdc_out)`.

`apps/server/src/services/compliance/screen.ts`

- `screenAddress(address, context)`: Circle Compliance Engine standalone screening when `CIRCLE_API_KEY` is set, then the Chainalysis oracle `isSanctioned(address)` on Base. A deny from either refuses the action. Results are cached 24 hours per address, denies are not cached.
- Runs on: every send destination; the fan's own address the first time they open Receive on Base; the treasury and relayer at setup.
- A deny writes an admin flag with the vendor reference and shows the fan the refusal line in 3.10. No transaction is submitted.

`apps/server/src/services/chain/indexer.ts`

- Subscribes to CDP Onchain Data webhooks for ERC-20 transfers on the USDC contract where `to` or `from` is an Amped.Bio address (event type confirmed at build time in the CDP Portal). Every event is checked against the chain before it is written.
- Poller every 30 seconds over the last 200 blocks for `Transfer` to or from Amped.Bio addresses, as the reconciler. Cursor per chain. Reorg safe at 12 confirmations. Writes `PaymentEvent(kind: usdc_in | usdc_out | onramp)`, idempotent on `(chainId, txHash, logIndex)`.
- `usdc_in` from a known Coinbase onramp session is labeled Received from Coinbase in Activity (matched on the webhook `txHash`, otherwise on amount and destination within 2 hours of the session).

### 3.5 tRPC

| Procedure | Auth | Notes |
| --- | --- | --- |
| `wallet.balances` | private | `[{ chainId, symbol, decimals, balance }]` for every configured chain. 30 s cache per address, cleared by the indexer on a write |
| `wallet.activity` | private | Merges chain transfers, stakes and `PaymentEvent`, newest first. Chips All, Transfers, Staking (Sales and Memberships arrive with phases B and C) |
| `wallet.resolveRecipient` | private | `@handle` to address through `UserWallet`; an address is checked for format and chain |
| `wallet.sendUsdc.prepare` | private | `{ to, amount }`. Checks balance, format, daily limits (decision 7), verified email, then `screenAddress(to)`. Returns `{ typedData, nonce, sendId, review }`. A refusal returns `{ refused: true, reason }` and nothing else |
| `wallet.sendUsdc.submit` | private | `{ sendId, signature }`. Re-checks limits, submits through the relayer, returns `{ txHash }`. `UsdcSend.status = submitted` |
| `wallet.sendUsdc.status` | private | Polls `UsdcSend` |
| `onramp.options` | private | Country and payment methods for the fan's region from the Onramp Config and Options APIs, cached one hour. Returns which of the two paths are available and the minimum (about 5 USD for Apple Pay and Google Pay) |
| `onramp.quote` | private | `{ fiatAmount, mode }`. Apple Pay and Google Pay: `POST /v2/onramp/orders` with `isQuote: true`. Coinbase account: the Session API quote use case with `paymentMethod`, `country`, `subdivision`. Returns `{ paymentTotal, paymentSubtotal, fees[], purchaseAmount, exchangeRate }` as Coinbase gives it. Rate limit 30 per hour per user |
| `onramp.createOrder` | private | Apple Pay and Google Pay. Creates `OnrampSession(mode)` and calls `POST /v2/onramp/orders` with `paymentCurrency`, `purchaseCurrency: USDC`, `paymentMethod: GUEST_CHECKOUT_APPLE_PAY | GUEST_CHECKOUT_GOOGLE_PAY`, `destinationAddress` (the fan's wallet), `destinationNetwork: base`, `paymentAmount`, `partnerUserRef`, `partnerOrderRef`, `clientIp`, `domain: ONRAMP_DOMAIN`, `agreementAcceptedAt`, `userAuthToken` when `OnrampUserAuth` holds a live one, no phone or email (embedded mode). Returns `{ sessionId, paymentLink }`. Rate limit 5 per hour per user |
| `onramp.createSession` | private | Coinbase account. Creates `OnrampSession(mode: coinbase_account)` and calls `POST /v2/onramp/sessions` with `destinationAddress`, `purchaseCurrency: USDC`, `destinationNetwork: base`, `paymentAmount`, `paymentCurrency`, `redirectUrl: https://{app}/wallet?fund=usdc&session={id}`, `partnerUserRef`, `clientIp`. Returns `{ sessionId, onrampUrl }`. The URL is single use and expires in five minutes, so it is created on the tap, not on the Amount step. Rate limit 5 per hour per user |
| `onramp.status` | private | `{ sessionId }`. Reads `OnrampSession`; when `processing` for more than 60 seconds, polls the Transaction Status API by `partnerUserRef` once per call. Returns status, usdcAmount, txHash and `chainConfirmed` |
| `onramp.cancel` | private | Marks a `created` or `pending_*` session `canceled`. Nothing is sent to Coinbase; an order that completes after a cancel is still recorded and the USDC still arrives |

Webhook route `POST /webhooks/coinbase-onramp`: verifies the CDP signature with the subscription secret, returns 200 at once, processes on the queue. Maps `onramp.transaction.success` and order `ONRAMP_ORDER_STATUS_COMPLETED` to `success` with `txHash` and amounts; `failed` with the failure code; `created` and `updated` to `processing`. Idempotent on `(provider, sessionRef, status)`. The webhook never credits a balance; the indexer does when the Transfer lands.

`partnerUserRef` is a per user opaque id (`ob_` plus 16 random characters, stored on the user), never the user id or email. On staging it is prefixed `sandbox-`.

### 3.6 Wallet changes (client)

- Summary (D19): two balance tiles. USDC on Base is the G3 lens on money destinations; tREVO on Libertas Testnet keeps the testnet line verbatim. The top bar chip follows decision 10.
- Tokens tab: both assets with the network under each, Send and Receive on each row.
- Activity: merged, newest first, chips All, Transfers, Staking. USDC rows link to the Base explorer; tREVO rows to the Libertas explorer.
- Receive: network chips Base and Libertas Testnet above the address and QR. The address is the same on both; only the notice and the explorer differ. Under Base the solid notice from decision 9. Copy address and Share.
- Fund: rows per w5. Bridge is not rendered (D07).
- Send: step 1 gains the asset chip row. USDC: To accepts an address or an @handle (`wallet.resolveRecipient`), the amount well in USDC, Available, presets 10, 25, 50, Max, the line Network fee: paid by Amped.Bio. Review slab per w4. The commit button reads Send 25 USDC and is followed by the wallet note verbatim. Confirm in wallet: the signature request on Base; the client switches chain before and after. Result: Sent, tx link, Done. tREVO sends are unchanged.
- Refusal (screening deny or limit): the panel shows the 3.10 line in the solid notice style and one button, Done. No retry button on a deny.

### 3.7 Buy USDC flow (client, Wallet only)

Payment flow rule 1 holds: the flow opens from Wallet, Fund (route `/wallet?fund=usdc`) and from an Add USDC link elsewhere, which opens the same place with `returnTo` set.

1. **Amount** (o1). Presets and the well in USD. On change, debounced 400 ms, `onramp.quote` for the default path of the fan's region. The quote slab shows You pay, Coinbase fee, Network fee, You receive about N USDC, Delivered to your wallet on Base. Line: Coinbase sets the price and fees. Nothing is charged on Amped.Bio. Button: Choose how to pay (indigo next step, not a commit).
2. **Choose how to pay** (o2). Two lenses, the regional default first. Apple Pay or Google Pay: Debit card, no Coinbase account, US. Pay with your Coinbase account: Debit card or bank in the US, debit or credit card in most other countries. Below: the agreement line, By continuing you agree to Coinbase's Guest Checkout Terms, User Agreement and Privacy Policy (links), which Coinbase requires before an order. Selecting a lens records `agreementAcceptedAt`.
3. **Apple Pay or Google Pay** (o3). `onramp.createOrder`, then the Coinbase payment frame (`paymentLink.url`) in an iframe inside the panel, 100% wide, min height 420. The frame runs Coinbase's verification (first time: phone and email codes, the limits upgrade when Coinbase asks) and shows the Apple Pay or Google Pay button, which only the fan can press. We listen to the post message events: `load_success` removes the skeleton; `commit_success` moves to Waiting; `commit_error`, `validate_merchant_error` and `session_error` move to Not completed with the code; `cancel` returns to o2. The `userAuthToken` from the order response is stored encrypted for 60 days.
4. **Coinbase account** (o4). `onramp.createSession` on the tap, then `window.open(onrampUrl)` in a new tab (never an iframe; the hosted page forbids it). Waiting state: Finish in Coinbase, the quote, Open Coinbase again (creates a new session, since the URL is single use), Cancel. When the tab returns to the redirect URL the panel reads the session id and polls `onramp.status`.
5. **Waiting**. 21 ring, Waiting for Coinbase. Polls `onramp.status` every 5 seconds for 10 minutes, then every 30 seconds for 2 hours, then stops with the line This is taking longer than usual. Your USDC will show in Activity when it arrives.
6. **Arrived** (o5). Shown only when `chainConfirmed` is true. The USDC tile and Activity update from the invalidated `wallet.balances`. Done, or Back to the item when `returnTo` is set.
7. **Not completed** (o6). The 3.10 line, Try again (back to Amount), Done. Region not supported (from `onramp.options`) shows Deposit USDC instead of Try again.

Mobile and the Telegram Mini App: the Apple Pay frame needs Safari or Chrome, not a WebView without passkeys, so inside the Mini App the Apple Pay lens is not rendered and the Coinbase account lens opens the system browser. Native shells later use SFSafariViewController or Chrome Custom Tabs per Coinbase's guidance.

### 3.8 Admin

Admin, Money (new tab under the existing admin rail): relayer account address and ETH balance with the alarm state; sends today (count, units) against the limits; screening denies with vendor references; on-ramp sessions by status for the last 7 days with failure codes; a Pause USDC sends switch (sets a server flag the relayer honors) and a Pause Buy USDC switch. Read only otherwise. No fan PII beyond handle.

### 3.9 Copy, compliance and privacy

- **Who sells what.** Coinbase sells USDC to the fan. Every Buy USDC surface names Coinbase as the seller, shows Coinbase's quote and fee, and says Nothing is charged on Amped.Bio. Amped.Bio sells nothing in this flow and takes no fee.
- **Custody.** Amped.Bio never holds fan funds or fiat. The relayer account holds ETH for gas only, in a Coinbase held key, and can only call the USDC contract. Counsel confirms this keeps Amped.Bio outside money transmission for the pilot states (memberships spec decision 2 covers the same question).
- **Coinbase agreements.** The fan accepts Coinbase's Guest Checkout Terms, User Agreement and Privacy Policy before an Apple Pay or Google Pay order (the agreement line in o2). The Coinbase account path runs under the fan's own Coinbase agreement. Counsel reads the CDP Onramp terms and the Prohibited Use Policy against the adult content position: the ramp purchase carries no content, and Buy USDC is never conditioned on what the fan buys later (Rob, 8 Oct).
- **Credit cards.** No Amped.Bio copy says credit card for US fans. The Coinbase account lens says debit card or bank in the US, debit or credit card in most other countries.
- **Screening.** Every send destination and every first use address is screened. A refusal is plain and final in the UI; the admin sees the vendor reference. No screening result is shown to the fan beyond the line.
- **Privacy.** The Coinbase order carries the fan's wallet address, IP, the opaque `partnerUserRef`, and, in embedded mode, nothing else from us; Coinbase collects phone, email and identity in its own frame under its privacy policy, which the agreement line names. We store the `userAuthToken` encrypted, nothing else Coinbase collected. The Privacy Policy gains Coinbase (on-ramp), Circle (screening) and Chainalysis (screening) as recipients before `VITE_USDC_ONRAMP` turns on in production. `OnrampSession`, `UsdcSend` and `PaymentEvent` join the account export and deletion flow.
- **Strings** (for counsel with 083 D1):
  - Receive notice: Send only USDC on Base to this address. Other networks and tokens are lost.
  - Send fee line: Network fee: paid by Amped.Bio.
  - Send refusal: This address cannot receive USDC from Amped.Bio. Nothing was sent.
  - Send limit: You have reached today's USDC send limit. Try again tomorrow.
  - Relayer paused or out of gas: USDC sends are paused for a moment. Your balance is safe. Try again shortly.
  - Buy USDC quote line: Coinbase sets the price and fees. Nothing is charged on Amped.Bio.
  - Agreement line: By continuing you agree to Coinbase's Guest Checkout Terms, User Agreement and Privacy Policy.
  - Not completed: Coinbase did not complete the purchase. Nothing was charged on Amped.Bio.
  - Region: Coinbase does not sell USDC in your region yet. You can deposit USDC from an exchange or another wallet.
  - Arrived: 25 USDC is in your wallet.
- **Testnet line.** Never on a USDC surface. Verbatim wherever tREVO shows.
- **Dashes.** No em or en dashes in shipped copy.

### 3.10 Analytics

Product events (ids and amounts, never addresses): `usdc_wallet_opened`, `usdc_receive_opened { network }`, `usdc_send_prepared`, `usdc_send_refused { reason }`, `usdc_sent { amount }`, `usdc_received { source: coinbase | external }`, `onramp_opened { source: wallet | add_usdc_link }`, `onramp_quoted { fiatAmount, mode }`, `onramp_path_chosen { mode }`, `onramp_order_created { mode }`, `onramp_completed { mode, fiatAmount }`, `onramp_failed { mode, code }`, `onramp_abandoned { mode, step }`.

KPIs, 90 days after general availability (proposed): on-ramp completion 55% of orders created; median time from order to arrival under 3 minutes; send success 99% of submitted; relayer gas under 0.5% of USDC volume moved; screening false refusals under 0.1% (reviewed by admin).

### 3.11 Phases and build order

- **A1, USDC in the wallet (#29), today.** `packages/web3` chains and USDC, Web3Auth Base entry and per action switching, `chain/base.ts`, `relayer.ts` with the CDP Server Wallet on Base Sepolia, `compliance/screen.ts` with the oracle (Circle when granted), `indexer.ts` with the poller (webhook when confirmed), `UsdcSend`, `PaymentEvent` kinds, `wallet.*` procedures, w1 to w7, Admin Money read only plus Pause USDC sends. Flag `VITE_USDC_WALLET`. Staging on Base Sepolia with Circle test USDC from the Circle faucet.
- **A2, Buy USDC (#5), after A1 merges.** `OnrampSession`, `OnrampUserAuth`, `onramp.*` procedures, the webhook route and CDP subscription, o1 to o7, Admin Money on-ramp panel and Pause Buy USDC, Privacy Policy recipients. Flag `VITE_USDC_ONRAMP`. Staging through the Coinbase sandbox (`sandbox-` prefix, Apple Pay sandbox flag).
- **D, later.** EIP-7702 plus CDP Paymaster to drop the ETH float, once Web3Auth confirms authorization signing. Base to Revolution route through Circle CCTP V2 or Gateway when USDC is on Revolution. MoonPay as the second provider for countries Coinbase does not serve.

### 3.12 Setup checklist (before the first staging deploy)

1. CDP Portal: project, API key and Wallet Secret for staging; a second set for production. Create the relayer account on Base Sepolia, record the address, fund it with testnet ETH, and attach the policy in 3.4.
2. CDP Onramp: apply for Onramp access through the onboarding link; production access follows approval. Add `app.staging.amped.bio` and `app.amped.bio` to the Onramp domain allowlist and host Coinbase's Apple Pay domain verification file; the domain must not be tied to another Apple Merchant ID. Ask the Coinbase account representative about the zero fee USDC subsidy program and about embedded order mode enablement.
3. CDP webhooks: create the subscription for `onramp.transaction.*` events to `/webhooks/coinbase-onramp` with the CDP CLI; store the subscription secret. Create the ERC-20 transfer subscription for the USDC contract if the event type is offered.
4. Circle: submit the Compliance Engine access request (Wallets with standalone screening). Until granted, `CIRCLE_API_KEY` is unset and the oracle runs alone.
5. Chainalysis oracle: record the Base address in `CHAINALYSIS_ORACLE` and verify `isSanctioned` on a known listed address in the test set.
6. Counsel: strings in 3.9, the Receive notice, the custody line, the Coinbase agreements, Privacy Policy recipients.
7. Treasury: the production relayer address and its first ETH funding; alarm routed to the ops channel.

### 3.13 Acceptance criteria

1. The Wallet shows a USDC balance on Base and a tREVO balance on Libertas, each with its network, and the top bar chip shows the right one per destination.
2. Receive shows the same address under both network chips, the Base notice verbatim, and the QR encodes the address only.
3. A fan with 0 ETH on Base sends USDC to an address and to an @handle with one signature and no gas prompt. The transfer is submitted by the CDP Server Wallet, lands within 30 seconds at p95, and appears in Activity for both parties without a reload.
4. The CDP policy refuses a call from the relayer account to any contract other than USDC and any function other than the two authorizations (tested on Base Sepolia with a deliberate wrong call).
5. A sanctioned test address is refused at prepare with the plain line; no `UsdcSend` reaches `submitted`; an admin flag with the vendor reference exists.
6. The eleventh send in a day, or a send that would pass 2,000 USDC in a day, is refused with the limit line.
7. A deposit from an external wallet appears in Activity within 60 seconds and updates the tile.
8. Buy USDC shows Coinbase's quote with fees before any handoff and never a figure Amped.Bio computed.
9. Apple Pay path (sandbox): an order is created with the fan's address and USDC on Base, the Coinbase frame loads in the panel, a sandbox purchase completes, the webhook marks the session success, and the panel shows Waiting until chain confirmation (on staging the admin log states the sandbox delivers nothing on chain and the arrival state is driven by the webhook alone, behind a staging only switch).
10. Coinbase account path: the session URL opens in a new tab with USDC on Base and the amount preselected, the redirect returns to the panel, and a second tap creates a new single use URL.
11. A canceled, declined or expired order shows the Not completed line and records nothing as a payment. A fan whose region has neither path sees the region line and Deposit USDC.
12. The `userAuthToken` is stored encrypted, expires after 60 days, and a returning fan sees the Apple Pay button without the verification steps (sandbox phone and email).
13. The webhook rejects a bad signature, is idempotent on replay, and never credits a balance by itself.
14. Pause USDC sends and Pause Buy USDC stop the respective flows within one request with the paused lines.
15. Compliance scan: no banned term, no stake, staking, pool or tREVO on USDC surfaces, no credit card in US copy, no dashes.
16. Reduced motion, keyboard reachability and the 44 target rule hold on every new control. Contrast measured per section 16 of Prism 2.2. The Coinbase frame is reachable by keyboard and labeled.
17. Typecheck and build pass for `server`, `client`, `landingpage`, `@repo/web3`, `@repo/constants` and `@repo/ui`. Tests: typed data builder, limits, screening (deny, allow, cache), relayer policy rejection, indexer idempotency and reorg, webhook signature and idempotency, status mapping, session and order request shapes, compliance scan.

### 3.14 Edits this spec makes to other specs

- **Memberships spec (claude/amped-memberships-payments-spec-2026-10-08.md).** 3.4 relayer paragraph: the relayer is the CDP Server Wallet of this spec; AmpedPay and AmpedMemberships are added to its policy in phase B. 3.4 sanctions paragraph: screening per this spec's 3.4. 3.5: `wallet.*` and `onramp.*` rows are replaced by this spec's 3.5. 3.6 and 3.11 A1 and A2: replaced by this spec. 3.12 item 2: counsel reads the CDP Onramp terms and the Headless Onramp agreements. Decision 10: Coinbase, two paths.
- **App structure v2.** D19 Wallet layout and D05 Send per 3.6. 051 D1: Buy USDC renders only when `VITE_USDC_ONRAMP` is on.
- **Privacy notice (#28 parameters, 095).** Recipients gain Coinbase, Circle and Chainalysis.
- **Adult content (#28).** Unchanged: the on-ramp is content neutral and lives in Wallet only.

## Sources

- Coinbase hosted Onramp overview (guest checkout deprecation, session tokens): https://docs.cdp.coinbase.com/onramp/coinbase-hosted-onramp/overview
- Coinbase Onramp FAQ (fees, countries, sandbox, iframe and WebView rules): https://docs.cdp.coinbase.com/onramp/additional-resources/faq
- Coinbase Onramp payment methods (credit cards not supported in the US): https://docs.cdp.coinbase.com/onramp/additional-resources/payment-methods
- Headless Onramp overview (Order API, embedded mode, post message events, limits, sandbox): https://docs.cdp.coinbase.com/onramp/headless-onramp/overview
- Create an onramp order (v2): https://docs.cdp.coinbase.com/api-reference/v2/rest-api/onramp/create-an-onramp-order
- Create an onramp session (v2): https://docs.cdp.coinbase.com/api-reference/v2/rest-api/onramp/create-an-onramp-session
- Onramp webhooks: https://docs.cdp.coinbase.com/webhooks/onramp
- Onramp transaction status API: https://docs.cdp.coinbase.com/onramp/core-features/transaction-status
- Onramp sandbox testing: https://docs.cdp.coinbase.com/onramp/additional-resources/sandbox-testing
- CDP Paymaster (smart accounts only, EIP-7702 for EOAs): https://docs.cdp.coinbase.com/paymaster/introduction/welcome
- CDP smart accounts and spend permissions: https://docs.cdp.coinbase.com/embedded-wallets/smart-accounts and https://docs.cdp.coinbase.com/embedded-wallets/evm-features/spend-permissions
- CDP Server Wallets (key custody in a trusted execution environment): https://docs.cdp.coinbase.com/server-wallets/v2/introduction/welcome
- Circle USDC contract addresses: https://developers.circle.com/stablecoins/usdc-contract-addresses
- Circle Compliance Engine transaction screening: https://developers.circle.com/wallets/compliance-engine/tx-screening
- Circle Paymaster: https://developers.circle.com/paymaster
- Circle CCTP V2 (phase D route): https://developers.circle.com/cctp/migration-from-v1-to-v2

## Revision log

- 2026-10-10: First standalone spec for #29 and #5 on the Coinbase and Circle stack, per Rob's direction of 10 Oct. Replaces the wallet and on-ramp sections of the 8 Oct memberships spec. Boards w1 to w7 and o1 to o7 drawn for approval.
