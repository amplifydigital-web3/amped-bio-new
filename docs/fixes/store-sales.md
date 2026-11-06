# C10: Store Sales, refunds and Report store

Branch `feat/store-sales` into `development`. Content PR C10 (`feat/store-sales`, PR plan 24 Oct, wave 4), Build Board #20 and #18. Screen Review row 161, boards st5, k2a and k2b. Spec: `docs/features/content-system.md` 3.8 (Sales) and 3.9 (Refunds), `docs/features/store-policy.md` 3.4 and the C10 row in 5.2. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-04.

**Merge order.** This branch is stacked on C9 (#452, store catalog) and PAY-2 (#449, payments core). It contains both, plus the merge between them. Merge #449 and #452 first. The diff then shrinks to the C10 files below and the two integration fixes in section 4.

**One migration**, label `migration`, applied by hand. Four nullable columns and one index. No existing data changes.

## 1. Migration

`packages/database/prisma/migrations/20261104180000_store_sales/migration.sql` (what `prisma migrate diff` generates from the schema change):

- `purchases.refund_requested_at`: the creator approved a refund and the relayer sent it. The row is claimed on this column, so a refund is sent once.
- `purchases.refund_tx_hash` with an index: the refund transaction.
- `purchases.store_policy_version_id`: the creator's live store policy when the sale was prepared (store policy 3.6). The store policy spec put this column in PAY-2, but #449 does not add it, so C10 does.
- `content_reports.store_user_id`: a report against a whole store (Report store).

```bash
pnpm --filter @repo/database exec prisma migrate deploy --schema=./prisma/schema.prisma
```

Rollback, if ever needed:

```sql
ALTER TABLE `purchases` DROP INDEX `purchases_refund_tx_hash_idx`,
  DROP COLUMN `refund_requested_at`, DROP COLUMN `refund_tx_hash`, DROP COLUMN `store_policy_version_id`;
ALTER TABLE `content_reports` DROP COLUMN `store_user_id`;
DELETE FROM _prisma_migrations WHERE migration_name = '20261104180000_store_sales';
```

## 2. What ships

| Area           | Files                                                                                                                                                                                                                                                                                                                                                        | Board      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Sales list     | `services/store/sales.ts` `listSales`, `store.sales.list`. Sales are the caller's own paid Purchases, newest first, 50 a page. Rows show buyer name and handle, product, amount, fee, promoter, net, date, Pending or Final or Refunding or Refunded, and the transaction. This month after fees and the month's count. No email or wallet leaves the server | st5, k2a   |
| CSV            | `salesCsv`, `store.sales.csv({ month })`. One month, with the store policy version for each sale (ST-Q32). Fields that start with `=`, `+`, `-` or `@` are prefixed so a spreadsheet does not run them                                                                                                                                                       | st5        |
| Refund         | `prepareRefund` and `submitRefund`, `store.sales.refund.prepare` and `submit`. The sheet shows the store policy summary (`REFUND_SUMMARY`, ST-Q29), what comes from the creator's wallet, what Amped.Bio returns, what the buyer gets, the balance after, and the promoter share that is not pulled back                                                     | k2b        |
| Refund settles | `markRefunded` in the payments worker: a Refunded log marks the sale refunded and access ends (refunded is not in `PURCHASE_ACCESS_STATUSES`). A final product sale leaves `Offer.salesCount`                                                                                                                                                                |            |
| Sales count    | `countFinalSale` when a product sale becomes final (content spec 3.9 step 4)                                                                                                                                                                                                                                                                                 |            |
| Report store   | `store.report`, `ReportStoreButton` in the storefront and policy page footers, reasons Store policy breaks the rules, Scam, Other (SP-Q22, SP-Q48). One `ContentReport` row naming the store                                                                                                                                                                 | sp5 footer |
| Client         | `content/store/SalesView.tsx` replaces the Sales placeholder in the Store tab                                                                                                                                                                                                                                                                                | st5, k2    |
| Signing        | `usePaymentChainSigner` in `wallet/send/useUsdcSigner.ts`: the USDC send signer's chain switch and account checks, for any typed data. The USDC send flow is unchanged                                                                                                                                                                                       |            |
| Constants      | `packages/constants/src/storeSales.ts`: schemas, `SaleRow`, `RefundQuote`, `STORE_SALES_COPY`, `STORE_REPORT_LABELS`, CSV helpers. `packages/web3`: `REFUND_TYPES`, `USDC_PERMIT_TYPES`, `USDC_NONCES_ABI`                                                                                                                                                   |            |

## 3. How a refund works

1. The creator opens Refund on a sale inside the refund window (Admin, Payments, `refund_window_days`, 30 by default).
2. `prepare` checks the sale is theirs, paid, not refunded or already sent, inside the window, payments are not paused, and that the creator's wallet is still the one the sale paid. Only that wallet can approve a refund on chain. It checks the wallet holds everything but Amped.Bio's share. It returns:
   - the AmpedPay `Refund(paymentRef, deadline)` typed data;
   - a USDC permit for that amount to AmpedPay, with the creator's current nonce;
   - a 10 minute deadline on both.
3. The creator signs both in their wallet. `usePaymentChainSigner` switches to Base for the signatures and back.
4. `submit` recovers both signatures and refuses anything not from the creator's wallet, before any gas is spent. It claims the row on `refund_requested_at`, then sends `AmpedPay.refund` through the relayer with the idempotency key `refund:{purchaseId}`. A relayer failure releases the claim, and nothing has left the wallet.
5. The contract pulls the creator's part with the permit, the treasury allowance returns Amped.Bio's part, and the buyer gets the full amount (content decision 25). The payments worker sees the Refunded log and marks the sale refunded.

## 4. Integration fixes between C9 and PAY-2

Both are in the merge commit, since neither PR can see the other:

1. `pay.prepare` resolved every intent as a content item at the checkout mock amount. A product intent (C9) now resolves through `targetOf`, prepares at the product's `amountUnits`, and stores `offerId` on the Purchase.
2. Conflicts in `trpc/index.ts`, the User relations and the quote imports kept both sides.

## 5. Choices made in the build

1. **Pending sales can be refunded.** k2b draws a refund on a Pending row. The payment is on chain at soft confirmation, and the contract refunds by `paymentRef`.
2. **Members and membership charges** join Sales with MB-1. C10 lists one time sales only.
3. **Promoter column** is filled from the split's promoter row, so it lights up when C12 adds codes. Empty today.
4. **CSV amounts** are plain decimals with six places (`18.000000`) so spreadsheets sum them exactly.
5. **Report store** is on the storefront and the public policy page only, as SP-Q22 lists. The product page keeps Report item.
6. **The refund sheet** is a bottom sheet with a G2 slab for the figures and the commit button. The k2b frame draws a calm value panel. The sheet component has no value panel variant yet; Prism review can lift one.

## 6. Checks run

- Typecheck and build: server, client and landing pass. `build:packages` passes.
- Tests:
  - Server: 1,331 passed outside the OAuth suites, including 13 new in `store-sales.test.ts`. The new tests use real EIP-712 signatures from two keys. The OAuth end to end suites need live Redis and network, and fail in this sandbox.
  - Client: 269 passed, including 7 new in `SalesView.test.tsx`.
  - `@repo/constants`: 217 passed, including 4 new.
  - Landing store tests: 6 passed, including Report store.
- `pnpm check:copy`: 133 store strings pass, sales and report copy included.
- `oxlint` on the new files: no errors.

## 7. Staging check for Gustavo

1. Merge #449 and #452, then this PR. Run the three migrations. Turn on `checkout` and `storeSales`.
2. As a verified seller with a published store policy, sell a product to a test fan on Base Sepolia.
3. Store tab, Sales:
   - The sale shows Pending, then Final after 12 confirmations.
   - This month after fees is the amount less 5%.
   - The product's sales count goes up by one when the sale is final.
4. Export CSV for this month. The last column is the store policy version.
5. Refund the sale:
   - The sheet shows your store policy line.
   - Sign twice in the wallet.
   - The row reads Refunding, then Refunded.
   - The fan gets the full amount, and the product no longer opens for them.
   - The sales count goes down by one.
6. Try Refund again. The menu no longer offers it.
7. On the public storefront, Report store and choose Store policy breaks the rules. A `content_reports` row appears with `store_user_id`.
