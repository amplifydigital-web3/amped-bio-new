# Authbase storefront: buy your identity check in Amped.Bio, pay in USDC

Build Board #66. Drafted by Claude for Rob Frasca, 5 Nov 2026. Spec: `docs/features/authbase-storefront.md`. Partner spec for Authbase: `docs/partners/authbase-integration.md`. Design: "Authbase storefront screens", https://claude.ai/artifact/4dSAoKNiC8S1ozwTnVhukP (19 boards, Prism 2.2). Screen Review rows 379 to 387.

## Why this exists

Every RNS name owner on Amped.Bio can verify their identity with Authbase. Today the Identity tab sends them to Authbase, where they pay by card and then verify. The money leaves Amped.Bio, the order lives in Stripe, and Amped.Bio cannot show what the user bought or where the check stands.

Amped.Bio already sells paid content in USDC on Base: one signature, no gas, the seller paid in the same transaction. An Authbase check is the same purchase with a different seller and a different last step. So the sale moves into Amped.Bio and the check stays with Authbase.

## What it does

**The storefront.** The Identity tab for an RNS name shows Authbase's checks as cards with a price in USDC and a Buy now button.

- **Standard, for fans.** ID document and selfie. "Over 18 check. Opens adult (18+) content on Amped.Bio." Standard is the highlighted card for most accounts.
- **Enhanced, for creators.** Everything in Standard, including Over 18, plus an address check. "Required to sell and get paid on Amped.Bio." Enhanced is highlighted for an account with a store or a plan.

Buy now is disabled at or below the tier the user already holds. While a paid, unused order exists, the button reads Continue to Authbase.

**Checkout.** Buy now opens the Amped.Bio pay sheet. It names the seller: "Sold by Authbase on Amped.bio. Your purchase is from Authbase, not from Amped." with Authbase's store policy. The fee row reads "Includes the Amped.Bio fee (20%)". The user signs once. Amped.Bio pays the network fee. If the wallet is short, Add USDC in Wallet brings them back to the sheet.

**The check.** After payment the flow is the one that runs on staging today. Continue to Authbase opens Authbase's Amped.Bio sign in. Authbase signs the user in with their Amped.Bio account, sees the paid order, skips its own payment step, and runs the check for the tier bought. Authbase writes the ID on chain and sends the user back. The Identity tab reads "Authbase is creating your ID on chain" and shows the Verified badge once the status API confirms it.

**Authbase's Merchant Console.** At partners.amped.bio, Authbase manages its products and prices, its payout wallet, orders and refunds, API keys and webhooks, and its team. A payout wallet change needs proof of control, a second Owner's approval and a 24 hour wait.

**Amped.Bio admin.** Money, Merchants lists every business seller. Admins approve a merchant after a business check: company registration, beneficial owners and a sanctions screen. Approval and the fee use the two person rule. Users, Seller check lets an admin allow a named creator to sell with Standard until a set date.

## How it works

- **One rail.** The payment is an AmpedPay `pay()` on Base, like paid content. Authbase's payout wallet takes 80% and the Amped.Bio treasury 20% in the same transaction. The contract gains a merchant recipient role with its own 20% ceiling. Creator payments keep the 10% ceiling.
- **Proof of payment, three ways.** Authbase gets a signed `order.paid` webhook at the first confirmation. It can look the order up in the Partner API. It can read the `Paid` event on chain by the order reference without trusting Amped.Bio's servers.
- **Refunds** run through AmpedPay. Authbase signs from its payout wallet, the treasury returns the Amped.Bio share, and the user gets back exactly what they paid.
- **Flags.** `authbaseStorefront` (the storefront and merchant offers), `partnerApi` (`/partners/v1` and webhooks) and `sellerRequiresEnhanced` (AB-6) in site settings, off in production until launch. The console host itself has no flag: access needs a `MerchantMember` account, and the storefront and API are off until their flags are on.
- **Network.** Base Sepolia with test USDC on staging. Base mainnet after the AmpedPay audit.

## Competition

| Product | How identity is bought | Payment | Where the user stays |
| --- | --- | --- | --- |
| Amped.Bio with Authbase | Inside the app, from the Identity tab | USDC from the user's own wallet, one signature, no gas | In Amped.Bio until the check, then back |
| OnlyFans, Fansly | Required, run by the platform's vendor, free to the creator | None | In the platform |
| Patreon, Ko-fi | Payout KYC through Stripe Connect | None | Stripe hosted |
| Linktree, Beacons | No identity product | None | None |
| World ID, Civic, Gitcoin Passport | Separate apps and passes | Free or token based | Outside the creator platform |

No link in bio or creator platform sells a reusable, on chain identity check in its own checkout. Platforms that need age or payout checks run them in the background and the user owns nothing afterwards. With Amped.Bio and Authbase, the user pays once and holds an on chain ID bound to their RNS name, which they can use beyond Amped.Bio.

## Key marketing

- **For fans:** "Verify once. Open 18+ content on Amped.Bio." One Standard check, paid in USDC, no card form.
- **For creators:** "Get verified. Get paid." Enhanced is the step that turns on sales and puts the Verified badge on the store and pay sheet.
- **Trust:** the seller is named on every pay sheet. Amped.Bio never sees the ID document or the selfie.
- **Proof point for partners:** Authbase is the first merchant on AmpedPay. The same console and Partner API serve the next business seller.

## What Authbase builds

The paid order lookup on `/verify` that skips its own payment step, a webhook receiver, the return redirect, progress reports, refund signing from its payout wallet, its store policy, and removal of the Stripe path for Amped.Bio traffic. All of it is specified in `docs/partners/authbase-integration.md`.
