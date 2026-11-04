# G4: The `paid` kind goes live in the gating engine

Branch `feat/access-paid` into `development`. Gating spec PR plan G4 (`docs/features/access-gating-engine.md` sections 3.3, 3.4, 3.7, 3.8 and decision 5). Build Board #21 (Access gating engine) and #18 (Paid content). Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-04.

**Merge order.** Stacked on C10 (#472), which carries C9 (#452) and PAY-2 (#449). Merge #449, #452 and #472 first. It does not need CK-5 (#482) and does not touch the files CK-5 changes, apart from `purchases.ts`, where the two edits sit in different functions.

**No migration.** `Purchase.accessUntil` already exists (PAY-2). No new env values and no new flags. Gating stays behind the `accessGating` site flag, which stays off in production until GQ2-2.

## 1. What ships

| Area                | Change                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract            | `LIVE_ACCESS_RULE_KINDS` gains `paid`. `accessRuleInputSchema` accepts `{ kind: "paid", params: { offerId } }`.                                                                                                                                                                                                                                                                    |
| Verifier            | `services/access/verifiers/usdc.ts` `usdcPaymentVerifier`: `offer(id)` reads the product's owner, status and price; `verifyPurchase(userId, offerId)` reads this fan's Purchase rows for the product and answers purchased, confirming, pending or none. Read only.                                                                                                                |
| Registration        | `registerPaymentVerifier` in the engine (spec 3.7). `services/access/index.ts` registers the USDC verifier. Without a verifier, `paid` refuses with `kind_unavailable` (default deny).                                                                                                                                                                                             |
| Decisions           | Final purchase: allowed, `ok`. First confirmation: allowed, `purchase_pending` ("Confirming payment", access open, decision 5). Sent, not on chain: refused, `purchase_pending`, hint `none`, so the fan is never asked to pay twice. Not bought: refused, `not_purchased`, hint `buy` with the product id and its price ("5.00 USDC").                                            |
| Closing access      | Reorg, failure, refund and an ended access period close access on the next check. The verifier reads the rows on every check, and paid decisions are never cached, the same as stake decisions. No `bumpViewer` call is needed.                                                                                                                                                    |
| Seller precondition | A new sale needs an active product and a seller who passes the seller check (spec 3.4). A lapsed seller check refuses new buyers with `kind_unavailable` and hint `unavailable`. A paused or archived product refuses new buyers with `not_purchased` and hint `unavailable`. Buyers keep access in both cases. `open` runs the seller check fresh; render may use the cached row. |
| Ownership           | Only the rule owner's own product counts, like the owner's own pool. Creating a paid rule refuses another creator's product, a missing product and an archived one ("Pick one of your own products."). A draft product is allowed so a creator can set up before going live.                                                                                                       |
| Access period       | `settlePurchase` sets `Purchase.accessUntil` at the first confirmation for a product with `accessPeriodDays` (ST-Q44 "Access for N days"). Final keeps it. A reorg clears it, so the period restarts when the payment lands again. Lifetime products and per item content purchases leave it empty.                                                                                |
| Combinators         | Any of these and All of these accept a paid leaf. Followers or Paid passes on the purchase.                                                                                                                                                                                                                                                                                        |

## 2. Not in this PR

1. **The rule picker.** `AccessPicker.tsx` still shows Paid as Later. The editor needs a product picker. That is content PR 10 with G3 deltas.
2. **Auto gating a product's items.** Activating a product does not yet write a paid rule onto its items. Content PR 10 decides whether a product owns its items' rule.
3. **Library reads.** FL-2 lists purchases on its own. It should read `accessUntil` the same way once both merge.
4. **`eligibleUserIds` for paid.** Broadcast audiences of buyers come with Broadcast phase 2.
5. **`member`.** G5, with memberships phase C.

## 3. Checks run

- `pnpm run typecheck:affected` and `pnpm run build:affected`: all pass, run with turbo concurrency 1.
- `pnpm run test:affected`: all client, landing, constants, ui, media and auth tests pass. Server `test:unit`: 1,409 passed. Two unhandled errors come from `oauth-trpc` and `oauth-scopes`, which need a local MySQL. They are not related to this branch.
- New tests:
  - `access-engine.test.ts`: 14 paid tests (default deny, sign in, ownership, Buy hint and price, final, soft unlock, pending, reorg close, paused product, seller precondition, fresh seller check on open, blocked buyer, Any of these, reveal only on a pass).
  - `access-paid-verifier.test.ts`: 8 verifier tests.
  - `access-rules.test.ts`: 3 paid rule tests.
  - `payments-core.test.ts`: 3 access period tests.

## 4. Staging check for Gustavo

1. Merge order as above. Configure PAY-2 so `paymentsReady()` is true. Turn on `accessGating` and `checkout` on staging.
2. As a verified seller, make a product with a 7 day access period and activate it. Create a saved Paid rule for it with `access.rules.create`, then attach it to a text block with `blocks.setAccessRule`.
3. As a fan, open the bio. The block is locked with `not_purchased` and the Buy hint at the product's price.
4. Buy the product. On the first confirmation, `access.check` returns allowed with `purchase_pending`. At 12 confirmations it returns `ok`. The purchase row's `access_until` is 7 days after `soft_confirmed_at`.
5. As the creator, refund the sale. When the Refunded log lands, the fan's next check refuses with `not_purchased`.
6. Pause the product. A second fan sees `not_purchased` with no action. The first buyer, if not refunded, keeps access.
