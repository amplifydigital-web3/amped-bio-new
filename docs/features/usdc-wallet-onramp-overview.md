# USDC in the wallet and Buy USDC through Coinbase: overview

Build Board #29 (USDC in the wallet, Base) and #5 (Buy USDC through Coinbase). Drafted by Claude for Rob Frasca, 2026-10-10. Spec: docs/features/usdc-wallet-onramp.md (https://claude.ai/artifact/LPSF5isQeJyqSQ68MqtPc3). Boards: w1 to w7 (https://claude.ai/artifact/91ieQ5NJYCy2eBMW5mP7PG) and o1 to o7 (https://claude.ai/artifact/7A3CCALBwihA6oZd1hRbDV).

## What it does

The Amped.Bio wallet holds dollars. Beside tREVO on Libertas, every fan and creator now has USDC on Base at the same address. They can receive it from any exchange or wallet, send it to an address or an @handle with one signature and no gas, and see every move in Activity.

Fans without USDC buy it in the wallet. Buy USDC opens inside Wallet, Fund, shows Coinbase's price and fee, and then hands the purchase to Coinbase. A US fan with no Coinbase account pays with a debit card in Apple Pay or Google Pay without leaving the page. A fan with a Coinbase account, in any country Coinbase serves except Japan, finishes in Coinbase with a debit card, a bank account, a Coinbase balance, or a credit card outside the US. Coinbase delivers the USDC to the fan's own wallet on Base. Amped.Bio never touches the money and charges nothing.

Everything paid on Amped.Bio later (paid links, paid content, memberships, tickets, tips) spends from this wallet.

## How it works

- **One address.** The fan's existing embedded wallet is the Base wallet. Coinbase sends USDC to it. No new wallet, no second address.
- **Circle's contract.** USDC on Base is Circle's token. Amped.Bio reads balances and transfers from it directly and uses its built in signed transfer (EIP-3009): the fan signs a message, anyone can submit it. Circle's blocklist and pause live in the contract, so Amped.Bio inherits them.
- **Coinbase submits.** The submitter is a Coinbase CDP Server Wallet: the key sits in Coinbase's secure environment, and a Coinbase policy restricts the account to the USDC contract and the two transfer functions. It pays the sub cent Base gas. Amped.Bio holds no signing key of its own.
- **Screening.** Every destination is screened through Circle's Compliance Engine (on request) and the Chainalysis sanctions oracle on Base. A listed address gets a plain refusal and nothing is sent.
- **Coinbase is the point of purchase.** Buy USDC quotes with Coinbase's API, then either loads Coinbase's Apple Pay frame inside the wallet panel (Coinbase runs the phone and email checks and the limits) or opens Coinbase in a new tab for account holders. Coinbase's webhook and status API report the order; the wallet shows USDC arrived only when the transfer is on chain.
- **Limits and pauses.** 10 sends and 2,000 USDC per day per account, verified email required. Admin can pause sends or purchases in one switch.

## Competition

| Product | What they do | Where Amped.Bio sits |
| --- | --- | --- |
| Patreon, Ko-fi, Substack | Cards only, platform holds funds and pays out on a schedule, 5% to 10% plus processing | Fan holds the dollars, creator is paid at once, no payout day |
| Linktree | No wallet, no payments beyond links to Stripe or PayPal | A wallet in the bio product itself |
| Coinbase Wallet, MetaMask | Hold USDC, need ETH for gas, no creator context | No gas, no seed phrase, inside the creator relationship |
| Farcaster and Zora | USDC on Base with Coinbase Onramp, smart wallets | Same rails, applied to a bio and memberships product with an existing user base |
| Shopify USDC on Base (Coinbase Payments) | Merchant checkout in USDC with CDP wallets | Same stack choice, consumer side |

What is different on purpose: the on-ramp does one thing and lives in one place; fans pay creators from their own wallet; Coinbase and Circle controls replace custom infrastructure.

## Key marketing

- **Headline.** Dollars in your Amped.Bio wallet. Load it with Apple Pay. Send it with one tap.
- **Proof points.** USDC on Base, the same dollars Coinbase and Shopify settle in. No gas, ever. Buy with Apple Pay in the US, with a card or bank in 90 plus countries through Coinbase. Your wallet, your address, your money.
- **For creators.** Every fan can hold dollars next to their stake. When memberships and paid items ship, the money is already there.
- **Compliance in the copy.** Coinbase is named as the seller on every Buy USDC screen with its own price and fee. No earn, yield, return or income language. No credit card in US copy. The Receive notice is solid and verbatim. Counsel reads every string before it ships.
- **Not yet.** No off-ramp, no bridge to Revolution, no MoonPay, no native app. Say Later with no date.

## Open items for Rob (full list on the board cards)

Address model (the EOA stays), the Coinbase held relayer, screening vendor order, two Coinbase paths in one flow, embedded order mode, quote before handoff, staging through the Coinbase sandbox. Answered 8 Oct and kept: send limits, Receive notice (counsel wording), USDC display, chip rule.
