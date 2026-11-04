# CK-5: The pay sheet goes live on AmpedPay

Branch `feat/checkout-live` into `development`. PR plan CK-5 (wave 4), Build Board #49 (Mobile checkout) and #18 (Paid content). Spec: `docs/features/mobile-checkout.md` sections 5, 9 and 10 (revision 3.2 in this branch), the CK-5 row of section 16, and `docs/features/store-policy.md` 3.4 and 3.6. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-04.

**Merge order.** This branch is stacked on C10 (#472, which carries C9 #452 and PAY-2 #449). It also carries the two open checkout review follow-ups, #423 (for #414) and #424 (for #416), merged in as they stand. Merge #449, #452 and #472 first. Then close #423 and #424 as included here, or merge them first; either way the result is the same.

**One migration**, label `migration`.

## 1. Migration

`packages/database/prisma/migrations/20261104220000_checkout_policy_version/migration.sql`. This is what `prisma migrate diff` generates:

```sql
ALTER TABLE `checkout_intents` ADD COLUMN `store_policy_version_id` BINARY(16) NULL;
```

```bash
pnpm --filter @repo/database exec prisma migrate deploy --schema=./prisma/schema.prisma
```

Rollback: `ALTER TABLE checkout_intents DROP COLUMN store_policy_version_id;` and delete the `_prisma_migrations` row.

No new env values and no new flags. The sheet stays behind the existing `checkout` site flag. AmpedPay is used when `paymentsReady()` is true: the PAY-2 contract address, relayer and split signer are set.

## 2. What ships

| Area                 | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider rail        | `services/checkout/provider.ts` (from #423): `checkoutProvider()` returns `ampedpay` when PAY-2 is configured. Otherwise it returns `mock` only outside production and on a test chain, and refuses with "Checkout is not available yet." everywhere else.                                                                                                                                                                                                     |
| Quote                | `checkout.quote` returns `policy: { version, sellerName, changed }` and `item.accessPeriodDays`. The first quote that sees a live store policy stores its version on the intent. A newer live version reads `changed: true`.                                                                                                                                                                                                                                   |
| Prepare              | `payments.pay.prepare` takes an optional `policyVersion`. A live version newer than the intent's refuses with `policy_changed` and the live version, unless the fan sends that version. Then the intent moves to it. The Purchase carries the intent's version (store policy 3.6), not whatever is live at prepare.                                                                                                                                            |
| Checking             | New `payments.forIntent({ intentId })`: the newest sent purchase behind an intent, as `payments.status` reads it, or null when nothing was sent.                                                                                                                                                                                                                                                                                                               |
| AmpedPay provider    | `components/checkout/provider.ts` `createAmpedPayProvider`. Prepare with the amount the sheet showed and the live wallet. The fan signs one USDC `ReceiveWithAuthorization` with the account the server names (`usePaymentChainSigner`). Submit, then poll `payments.status` for 30 seconds. Results: paid, failed, rejected (wallet cancel), pending, or refused with the reason. `owned` reads as paid. `in_progress` polls the purchase already on its way. |
| Pay sheet            | `pages/Pay.tsx` picks AmpedPay when the quote names it, unless QA asked for a `?mock=` outcome on a non production build. The test checkout line shows only on the mock.                                                                                                                                                                                                                                                                                       |
| Refusals             | paused, limit, seller and removed show their one message (spec 10). insufficient_balance turns Pay into Add USDC with the server's gap. price and policy_changed re-quote, so Price changed or Store policy changed shows before Pay. no_wallet, wallet_mismatch and screening show one line. A wallet cancel reads "You cancelled in your wallet. Nothing was taken from your wallet."                                                                        |
| Store policy         | The seller line names the store policy's seller and ends with a Store policy link that opens the live version in a sheet (`store.publicPolicy`). Counsel's two sentences are unchanged.                                                                                                                                                                                                                                                                        |
| Store policy changed | "{seller} updated their store policy." with Read the store policy, Pay and Not now. Pay sends the version the fan saw.                                                                                                                                                                                                                                                                                                                                         |
| Return to a payment  | A `signing` or `submitted` intent shows Checking and polls `payments.forIntent` every 3 seconds until it lands (CK-Q43). Nothing sent opens the sheet as usual. A payment not landed after the wait reads "Your payment is still on its way. You can close this page. The item opens in your Library when it lands."                                                                                                                                           |
| Sheet details        | Verified chip beside the creator name when the quote passed the seller rule. Network fee row "Paid by Amped.Bio" (CK-Q7). The access line (`STORE_COPY.accessLine`: "In your Library" or "Access for N days") replaces "Yours to keep" (ST-Q44).                                                                                                                                                                                                               |
| From #424            | `checkout/funds.ts` writes awaiting funds only while the intent is still open and unexpired, so a move to signing, submitted or paid is never overwritten. `BuyUsdcFlow.tsx` calls `awaitFunds` only when the `checkout` flag is on.                                                                                                                                                                                                                           |

## 3. Not in this PR

1. **Cover beside the title** (CK-Q7). The quote carries no cover yet. It needs the product cover from C9 on the target.
2. **Promoter line from the intent.** Promoters are C12.
3. **Step up above 100 USDC and on a new device** (spec 5). Web3Auth's embedded wallet signs without a separate step today. This needs its own change in the wallet layer.
4. **Unlock in the gating engine.** A purchase opens access at `confirmed_soft` (PAY-2). The engine's `paid` kind is G4.

## 4. Checks run

- `pnpm run typecheck:affected` and `pnpm run build:affected`: all pass. Run with `--concurrency=1`, because the sandbox runs out of memory in parallel.
- `pnpm run test:affected`:
  - Client: 284 passed, including 7 new in `Pay.test.tsx` and 5 new in `checkout.test.ts`.
  - Landing 68, constants 217, ui 87: all pass.
  - Server `test:unit`: 1,393 passed, including 4 new quote tests (store policy and the AmpedPay provider) and 4 new purchase tests (policy version and `forIntent`).
  - Two unhandled errors come from `oauth-trpc` and `oauth-scopes`, which reach for a local MySQL the sandbox does not have. They are not related to this branch.
- `pnpm check:copy` passes. `oxlint` on the changed files: no errors.

## 5. Staging check for Gustavo

1. Merge order as above. Run the migration. Configure PAY-2 (contract, relayer, CDP split signer) so `paymentsReady()` is true. Turn on `checkout`.
2. As a verified seller with a published store policy and a product, open the product as a fan with test USDC and press Buy.
   - The sheet shows the Verified chip and "Sold by {seller} on Amped.bio. Your purchase is from {seller}, not from Amped." with Store policy.
   - It shows the network fee row and the access line. There is no "Test checkout" line.
3. Press Store policy. The live policy opens in a sheet.
4. Press Pay. Sign once. The sheet shows Checking, then "You paid @handle $N USDC." with Open.
   - The purchase row carries the intent's `store_policy_version_id`.
   - The creator's Sales lists it as Pending, then Final.
5. Start a new purchase and leave the sheet open. As the creator, publish the store policy again. Back in the sheet, refresh or return to the tab.
   - It reads "{seller} updated their store policy."
   - Pay goes through, and the purchase carries the new version.
6. Reload `/pay/{intent}` while a payment is in flight. The sheet shows Checking and lands on paid without a second Pay.
7. Lower the fan's balance below the amount and press Pay. The sheet reads "You need $N USDC more." with Add USDC in Wallet.
8. Cancel the signature in the wallet. The sheet says nothing was taken and keeps Pay.
