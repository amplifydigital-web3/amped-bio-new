# Partner API

For merchants that sell on Amped.Bio through AmpedPay. Authbase is the first.

- Integration spec: `authbase-integration.md` (lands with AB-0).
- Base URL: `https://api.staging.amped.bio/partners/v1` on staging, `https://api.amped.bio/partners/v1` in production.
- Auth: `Authorization: Bearer ab_test_...` (staging) or `ab_live_...` (production). Keys come from the Merchant Console, Developers.
- Every write needs an `Idempotency-Key` header. A repeat gets the first answer.
- 120 requests a minute per key. Errors are `{ "code", "message" }`.

| Method and path | Does |
| --- | --- |
| `GET /orders/{order_ref}` | One order |
| `GET /orders?status=&wallet=&rns_name=&product_code=&created_from=&created_to=&cursor=&limit=` | A page of orders, newest first. `next_cursor` continues |
| `GET /entitlements?wallet=0x...` | Paid orders for that wallet with no completed check |
| `POST /orders/{order_ref}/fulfillment` | Progress: `state` started, in_review, verified (with `tier`), not_passed (with `reason`), `attempts_used` 0 to 3 |
| `POST /orders/{order_ref}/refund` | The EIP-712 Refund and EIP-2612 permit for the payout wallet to sign (24 hour deadline) |
| `POST /orders/{order_ref}/refund/submit` | `deadline`, `refund_signature`, `permit_deadline`, `permit_signature`. EOA and ERC-1271 (Safe) signatures. The relayer pays gas |
| `GET /products`, `PUT /products/{code}` | The catalog: `title`, `description`, `features` (up to 4), `tag`, `amount_units`, `rank`, `status` |

Webhooks: `order.paid`, `order.finalized`, `order.refunded`, `order.expired`, `payout_wallet.changed`. Header `Amped-Signature: t=...,v1=...`. See `reference-receiver.ts`.

Proof from the chain without trusting Amped.Bio: `check-payment.ts`.
