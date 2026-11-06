**Amped.Bio USDC Checkout**

Authbase integration specification

**Draft 3 for Authbase review.** 5 November 2026. Prepared by Amped.Bio
for the Authbase engineering team.

This document tells Authbase what to build so that Amped.Bio users can
buy an Authbase identity check inside Amped.Bio, pay in USDC from their
Amped.Bio wallet, and then complete the check on Authbase as they do
today.

# 1. Summary

Today a user on the Amped.Bio Identity tab goes to Authbase, pays there
by card, and verifies. After this change the user pays first, inside
Amped.Bio, in USDC. Then the existing flow runs: Amped.Bio sends the
user to Authbase's Amped.Bio sign in entry, Authbase signs them in, runs
the check they bought, writes the ID on chain, and sends them back to
Amped.Bio, where the new ID is waiting.

Only the payment moves. Authbase keeps the sign in, the capture, the
review, the on chain ID and the status API. Authbase adds four things:
reading a paid Amped.Bio order on its verify page, receiving signed
webhooks, returning the user to Amped.Bio, and signing refunds from its
payout wallet.

| **Area**                   | **Today on staging**                | **After this change**                                                   |
|----------------------------|-------------------------------------|-------------------------------------------------------------------------|
| Where the user pays        | Authbase, by card (Stripe)          | Amped.Bio, in USDC on Base, one signature, no gas                       |
| Who sets prices            | Authbase                            | Authbase, in the Amped.Bio Merchant Console                             |
| Sign in to Authbase        | Amped.Bio sign in entry, /sso/amped | Unchanged, with the order added to returnTo                             |
| Payment step on Authbase   | Card checkout                       | Skipped for a paid Amped.Bio order                                      |
| Check, review, on chain ID | Authbase                            | Unchanged                                                               |
| Result to Amped.Bio        | Status API                          | Status API (unchanged), plus optional progress reports                  |
| Money to Authbase          | Stripe payout                       | USDC to Authbase's payout wallet in the same transaction the user signs |

# 2. End to end flow

1.  The user opens the Identity tab for their RNS name and taps Buy now
    on Standard or Enhanced.

2.  Amped.Bio shows its pay sheet. The seller line names Authbase and
    links Authbase's store policy. The user signs once. Amped.Bio's
    relayer submits the payment and pays the network fee.

3.  The AmpedPay contract on Base pays Authbase's payout wallet 80% and
    Amped.Bio 20% in that one transaction, and records the order
    reference.

4.  At the first confirmation Amped.Bio marks the order paid and sends
    order.paid to Authbase's webhook.

5.  The user taps Continue to Authbase. Amped.Bio opens
    {AUTHBASE}/sso/amped?returnTo=/verify?order={order_ref} in the same
    tab, with returnTo URL encoded (section 6).

6.  Authbase signs the user in with their Amped.Bio account, as today.

7.  On /verify, Authbase looks up the order, checks it belongs to the
    signed in user, skips its payment step, and runs the steps for the
    product bought.

8.  Authbase writes the ID on chain and redirects the user to the return
    URL set in the Merchant Console.

9.  Amped.Bio reads the Authbase status API and shows the verified badge
    once the ID is on chain.

# 3. Environments

| **Item**          | **Staging**                                                      | **Production**                                       |
|-------------------|------------------------------------------------------------------|------------------------------------------------------|
| Network           | Base Sepolia (chain id 84532)                                    | Base (chain id 8453)                                 |
| USDC              | 0x036CbD53842c5426634e7929541eC2318f3dCF7e (test USDC, no value) | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913           |
| Amped.Bio app     | https://app.staging.amped.bio                                    | https://app.amped.bio                                |
| Partner API       | https://api.staging.amped.bio/partners/v1                        | https://api.amped.bio/partners/v1                    |
| Merchant Console  | https://partners.staging.amped.bio                               | https://partners.amped.bio                           |
| AmpedPay contract | Address and ABI supplied in the Console, Developers              | Supplied at mainnet launch, after the contract audit |
| API keys          | ab_test\_ prefix                                                 | ab_live\_ prefix                                     |

Production opens after the AmpedPay contract audit. All integration work
and testing happens on staging first.

# 4. What Authbase builds

| **\#** | **Item**              | **What it does**                                                                                                                | **Section** |
|--------|-----------------------|---------------------------------------------------------------------------------------------------------------------------------|-------------|
| 1      | Merchant setup        | Account, team, payout wallet, products and prices, store policy, return URL, webhook endpoint, API keys in the Merchant Console | 5           |
| 2      | Paid order on /verify | Read order from returnTo, validate it, skip the card payment step, run the check for the product bought                         | 6           |
| 3      | Return to Amped.Bio   | Redirect the user to the return URL after the check, on success, failure or exit                                                | 7           |
| 4      | Webhook receiver      | Verify signatures, store paid orders, handle refunds and expiry, respond 2xx fast, dedupe                                       | 8           |
| 5      | Partner API client    | Look up orders and entitlements; report progress (optional but recommended)                                                     | 9           |
| 6      | Chain check           | Optional independent proof of payment from the Paid event                                                                       | 10          |
| 7      | Refund signing        | Sign the refund and permit from the payout wallet when a refund is due                                                          | 11          |
| 8      | Status API            | Keep the existing status API current, including age_over_18 from both tiers                                                     | 12          |
| 9      | Remove card checkout  | No Stripe step for users arriving with a paid Amped.Bio order                                                                   | 6           |

# 5. Merchant setup

Authbase signs in to the Merchant Console with Amped.Bio accounts that
Amped.Bio adds as members of the Authbase merchant. Owners and Finance
members must turn on two factor.

| **Setting**      | **What to enter**                                                                                                                                                     |
|------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Payout wallet    | A Base address that receives USDC. Prove control by signing a message from it. A second Owner approves. It takes effect 24 hours later. A Safe is supported (see 11). |
| Products         | One per check. Title, short description, up to four feature lines, amount in USDC, status. Product code must match the check type on Authbase: STANDARD or ENHANCED.  |
| Store policy     | Authbase's terms, privacy and refund policy, shown to the user on the pay sheet.                                                                                      |
| Return URL       | Where Authbase sends the user after the check. Use https://app.staging.amped.bio/wallet?tab=rns&name={name}&view=identity&order={order_ref} on staging.               |
| Webhook endpoint | HTTPS URL that receives events. The Console shows the signing secret once and lets you rotate it.                                                                     |
| API keys         | Bearer keys for the Partner API. Shown once. Test keys work only on staging.                                                                                          |

Amped.Bio approves the Authbase merchant after a business check: company
registration, beneficial owners and a sanctions screen of the company,
its owners and the payout wallet. Until then the storefront shows no Buy
now.

# 6. The paid order on /verify

Amped.Bio builds the verify link from the existing sign in entry. The
value of returnTo is URL encoded.

> https://{AUTHBASE}/sso/amped?returnTo=%2Fverify%3Forder%3D{order_ref}

When /verify loads with an order, Authbase must:

1.  Look up the order. Use the copy stored from order.paid, or call GET
    /orders/{order_ref}.

2.  Validate it against every rule in the table below. If any rule
    fails, show the reason and offer the return link. Do not show a card
    payment.

3.  Mark the order as used for this user, so a second visit resumes the
    same check and never starts a second paid check.

4.  Run the steps for the product code: STANDARD (ID document and
    selfie) or ENHANCED (ID document, selfie and address check).

5.  Report progress with POST /orders/{order_ref}/fulfillment (section
    9).

| **Rule**                             | **Check**                                                                             |
|--------------------------------------|---------------------------------------------------------------------------------------|
| Order exists and belongs to Authbase | merchant_id equals Authbase's merchant id                                             |
| Order is paid                        | status is paid or finalized. Not refunded or expired                                  |
| Same person                          | amped_user_id equals the Amped.Bio account Authbase just signed in through /sso/amped |
| Same wallet                          | payer equals the wallet linked to that account on Authbase                            |
| Product                              | product_code is a check Authbase sells                                                |
| Attempts                             | The order has attempts left (3 per order) and is within 30 days of payment            |

A forwarded verify link is safe under these rules: the check runs only
for the signed in account whose wallet paid.

# 7. Return to Amped.Bio

After the check, Authbase redirects the user to the return URL with the
order reference. Do this on success, on a failed check, and when the
user exits. Amped.Bio reads the status API on return and polls until the
ID is on chain, so the redirect can happen before the on chain write
completes.

# 8. Webhooks

## 8.1 Events

| **Event**             | **When**                                                                          |
|-----------------------|-----------------------------------------------------------------------------------|
| order.paid            | The payment reached its first confirmation on Base. The user can start the check. |
| order.finalized       | The payment reached 12 confirmations.                                             |
| order.refunded        | A refund confirmed on chain. Stop or void the check.                              |
| order.expired         | A quote ended unpaid. Informational.                                              |
| payout_wallet.changed | A new payout wallet took effect.                                                  |

## 8.2 Request

Each delivery is an HTTPS POST with a JSON body and the header
Amped-Signature: t={unix seconds},v1={hex}.

> {
>
> "event_id": "evt_01J...",
>
> "type": "order.paid",
>
> "created_at": "2026-11-05T19:02:11Z",
>
> "data": { "order": { ...order object, section 9.3... } }
>
> }

## 8.3 Verify the signature

1.  Read the raw request body as bytes, before any JSON parsing.

2.  Split the header into t and v1.

3.  Compute HMAC SHA-256 with the signing secret over the string t +
    "." + raw body. Hex encode it.

4.  Compare with v1 in constant time. Reject on mismatch.

5.  Reject if t is more than 5 minutes from your clock.

6.  Dedupe on event_id. Store it before acting.

## 8.4 Delivery

Respond 2xx within 10 seconds, then do the work. Amped.Bio retries any
other response at 1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours,
then every 12 hours up to 72 hours. Events can arrive out of order and
more than once. The Console shows every delivery and lets you replay
one.

# 9. Partner API

Base URL from section 3. Send Authorization: Bearer {api key}. Every
write takes an Idempotency-Key header. Keys are scoped to the Authbase
merchant and rate limited.

## 9.1 Endpoints

| **Method and path**                                                                   | **Returns or does**                                            |
|---------------------------------------------------------------------------------------|----------------------------------------------------------------|
| GET /orders/{order_ref}                                                               | One order (9.3)                                                |
| GET /orders?status=&wallet=&rns_name=&product_code=&created_from=&created_to=&cursor= | A page of orders, for reconciliation                           |
| GET /entitlements?wallet=0x...                                                        | Paid orders for that wallet with no completed check            |
| POST /orders/{order_ref}/fulfillment                                                  | Reports progress (9.4)                                         |
| POST /orders/{order_ref}/refund                                                       | Returns the data to sign for a refund (11)                     |
| POST /orders/{order_ref}/refund/submit                                                | Sends the signed refund for Amped.Bio's relayer to submit (11) |
| GET /products, PUT /products/{code}                                                   | Same catalog as the Console                                    |

## 9.2 Errors

Errors return JSON with code and message. 401 bad key, 403 wrong
merchant, 404 unknown order, 409 state conflict (for example a refund on
a refunded order), 422 invalid body, 429 rate limit with Retry-After.

## 9.3 Order object

| **Field**                         | **Type**       | **Meaning**                                                                     |
|-----------------------------------|----------------|---------------------------------------------------------------------------------|
| order_ref                         | string         | Amped.Bio order reference. Use it in every call and on the verify link          |
| payment_ref                       | string         | The order reference exactly as it appears in the Paid event on chain (10)       |
| merchant_id                       | string         | Authbase's merchant id                                                          |
| status                            | string         | paid, finalized, refunded, expired                                              |
| product_code                      | string         | STANDARD or ENHANCED                                                            |
| amount_units                      | string         | Gross amount paid in USDC base units (6 decimals)                               |
| shares                            | array          | Each recipient: role (merchant, platform), to (address), amount_units           |
| payer                             | string         | The wallet that paid                                                            |
| amped_user_id                     | string         | The Amped.Bio account id, the same subject Authbase receives through /sso/amped |
| rns_name                          | string         | The RNS name the check is for                                                   |
| chain_id, token                   | number, string | Network and USDC address                                                        |
| tx_hash, block_number             | string, number | The payment transaction                                                         |
| fulfillment_state                 | string         | paid, started, in_review, verified, not_passed                                  |
| created_at, paid_at, finalized_at | ISO 8601       | Timestamps                                                                      |

## 9.4 Progress report

> POST /orders/{order_ref}/fulfillment
>
> {
>
> "state": "verified", // started \| in_review \| verified \| not_passed
>
> "tier": "ENHANCED", // with verified
>
> "valid_until": "2027-11-05", // with verified
>
> "reason": "text for the user", // with not_passed
>
> "attempts_used": 1
>
> }

Reports update the order record, the Console and the status line on the
Identity tab. They never set the verified badge. The badge comes only
from the Authbase status API (12).

# 10. Verifying payment on chain

Authbase can confirm any order without trusting Amped.Bio's servers. The
AmpedPay contract emits one Paid event per payment and one Share event
per recipient. Read them from Authbase's own Base RPC.

1.  Find the Paid event whose paymentRef equals the order's payment_ref.

2.  Check the payer equals the order's payer.

3.  Check a Share event pays Authbase's effective payout wallet the
    expected amount.

4.  Treat one confirmation as paid and 12 as final, matching order.paid
    and order.finalized.

Watching the payout wallet alone is not enough. A transfer does not name
the order, two buyers can pay the same amount, and the payout wallet
receives its share, not the price.

**Contract note.** Merchant sales carry a merchant recipient role in the
split, with Amped.Bio's 20% as the platform row. Amped.Bio confirms the
final ABI and event fields with the staging deploy, in the Console under
Developers.

# 11. Refunds

A refund returns the full amount to the user in one transaction:
Authbase's share from its payout wallet and Amped.Bio's share from
Amped.Bio's treasury.

1.  Authbase starts a refund in the Console (Orders) or with POST
    /orders/{order_ref}/refund.

2.  Amped.Bio returns two typed messages: an EIP-712 Refund for the
    order and an EIP-2612 permit for Authbase's share.

3.  The payout wallet signs both. Circle USDC v2.2 accepts ERC-1271
    signatures, so a Safe can sign. This is tested on staging before
    production.

4.  Authbase sends both signatures with POST
    /orders/{order_ref}/refund/submit. Amped.Bio's relayer submits and
    pays gas.

5.  Amped.Bio sends order.refunded. Authbase voids any check not yet
    complete for that order.

Refunds follow Authbase's published refund policy, shown on the pay
sheet. Proposed policy: a full refund if the check is not started within
30 days, a full refund if Authbase cannot complete the check due to a
fault on its side, and no refund once a pass or fail decision is issued.
Amped.Bio's refund window is 30 days from payment.

# 12. Identity status and attributes

- Keep the status endpoint /api/v1/public/wallets/{address}/status as it
  is today: NOT_LINKED, NOT_VERIFIED, VERIFIED, VERIFIED_WITH_BADGE,
  with verification type, verified_at and valid_until.

- Return VERIFIED once the ID is on chain. Amped.Bio polls this after
  the user returns.

- Both STANDARD and ENHANCED must issue the age_over_18 attribute.
  Amped.Bio sells Standard with the line "Over 18 check. Opens adult
  (18+) content on Amped.Bio". The user still chooses to share it with
  Amped.Bio in Authbase's consent manager.

- Amped.Bio requires ENHANCED for creators who sell on Amped.Bio. An
  Amped.Bio admin can allow a named creator to sell with Standard. No
  change is needed on Authbase for this.

# 13. Security requirements

- Verify every webhook signature and timestamp, and dedupe on event_id.

- Never trust order data from the URL alone. Look the order up by
  order_ref from the webhook copy, the API or the chain.

- Run a check only for the signed in Amped.Bio account and wallet that
  paid.

- Store API keys and the webhook secret in a secret manager. Rotate them
  in the Console if exposed.

- Change the payout wallet only through the Console flow. Amped.Bio
  never accepts a payout address by email or API.

- Amped.Bio never receives the ID document or selfie. Do not send them
  to Amped.Bio.

# 14. Testing on staging

Use test USDC on Base Sepolia from Circle's faucet. The Console's Send a
test order button creates an order and webhook without a payment.

| **Test** | **Steps and expected result**                                                                                                                                 | **Owner**           |
|----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------|
| T1       | Webhook: Send a test order. Signature verifies, event stored once, replay ignored by event_id                                                                 | Authbase            |
| T2       | Buy Standard on app.staging.amped.bio. One signature, no gas. Paid shows Authbase's payout wallet as the merchant row and Amped.Bio's 20% as the platform row | Amped.Bio, Authbase |
| T3       | Continue to Authbase, sign in with Amped.Bio, no card step, complete the check, return, badge appears                                                         | Amped.Bio, Authbase |
| T4       | Open the verify link as a different account. Check refused                                                                                                    | Authbase            |
| T5       | Miss a webhook on purpose. Recover the order with GET /orders and with the chain check                                                                        | Authbase            |
| T6       | Full refund from the Console. The user gets the exact amount back. A second refund is refused                                                                 | Amped.Bio, Authbase |
| T7       | Buy Enhanced. Status shows ENHANCED and age_over_18 after sharing                                                                                             | Authbase            |

# 15. Sequence

Amped.Bio builds in this order: merchant core and the contract update,
then the storefront and the Partner API, then the hand off and the
Merchant Console. Authbase can start sections 6 to 9 as soon as the
Partner API and webhooks are on staging. Amped.Bio will confirm that
date and send API keys and the staging contract address then.

# 16. Proposed positions for Authbase to confirm

Amped.Bio proposes a position on each open question. Authbase confirms
each one or states what it needs instead.

| **\#** | **Question**                                             | **Amped.Bio proposes**                                                                                                                                                                  | **Needed for**           |
|--------|----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------|
| 1      | Check attempts per paid order                            | 3 attempts per order, valid for 30 days, no retake charge. After 3 failed attempts the user buys a new check.                                                                           | Section 6, user copy     |
| 2      | /verify reads the order, skips payment, returns the user | Required. /verify reads order from returnTo, skips the card step, and redirects to the return URL set in the Console.                                                                   | Sections 6, 7            |
| 3      | Payout wallet type                                       | A Safe on Base with 2 of 3 signers. Refund signing through ERC-1271 is tested on Base Sepolia before production.                                                                        | Section 11, test T6      |
| 4      | Refund policy                                            | Full refund if the check is not started within 30 days. Full refund if Authbase cannot complete the check due to a fault on its side. No refund once a pass or fail decision is issued. | Store policy, section 11 |
| 5      | age_over_18 on STANDARD                                  | STANDARD issues age_over_18 from the date of birth on the ID, valid while the ID is valid. No scheduled re-check.                                                                       | Section 12               |
| 6      | What ENHANCED adds                                       | Authbase lists it. Expected: proof of address, a sanctions and PEP screen, stronger liveness. The sanctions screen is required for sellers.                                             | Seller rules, user copy  |
| 7      | Status webhooks to Amped.Bio                             | Signed webhooks when an ID is issued, renewed or expires, same signing scheme as section 8. Phase 2, not needed for launch.                                                             | Later, replaces polling  |
