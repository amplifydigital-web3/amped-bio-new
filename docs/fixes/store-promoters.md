# C12: Store promoter codes

Branch `feat/store-promoters`. Content PR C12, PR plan wave 5, Build Board #20. Spec: `docs/features/content-system.md` 3.9 (Promoters, The split, Refunds), decisions 20 and 25, and the C12 row in `docs/features/store-policy.md` 5.2. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-04.

**Merge order.** This branch is stacked on MB-2 (#477), which sits on MB-1 (#475), C10 (#472), C9 (#452) and PAY-2 (#449). Merge those first. The diff then shrinks to the files below.

**One migration**, label `migration`, applied by hand. One new table, one nullable column, one enum value and two indexes. No existing data changes.

## 1. Migration

`packages/database/prisma/migrations/20261104220000_store_promoters/migration.sql`:

- `promoter_codes`: the code, creator, promoter, share in bps, scope (`"all"` or Offer and MembershipPlan ids as hex), status (`active`, `paused`, `ended`), paused reason (`creator` or `refunds`), end date. Foreign keys to `users` cascade on delete.
- `memberships.promoter_code_id` with an index: the code attributed at join.
- `purchases_promoter_code_id_idx`: `purchases.promoter_code_id` already exists from PAY-2.
- `notifications.kind` gains `PROMOTER_CODE`.

```bash
pnpm --filter @repo/database exec prisma migrate deploy --schema=./prisma/schema.prisma
```

Rollback:

```sql
DROP TABLE `promoter_codes`;
ALTER TABLE `memberships` DROP INDEX `memberships_promoter_code_id_idx`, DROP COLUMN `promoter_code_id`;
ALTER TABLE `purchases` DROP INDEX `purchases_promoter_code_id_idx`;
DELETE FROM `notifications` WHERE `kind` = 'PROMOTER_CODE';
ALTER TABLE `notifications` MODIFY `kind` ENUM('MESSAGE', 'REQUEST', 'BROADCAST', 'MEMBERSHIP_RENEWAL') NOT NULL;
DELETE FROM _prisma_migrations WHERE migration_name = '20261104220000_store_promoters';
```

## 2. What ships

| Area                | Where                                                                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codes               | `services/store/promoters.ts`, `store.promoters.list`, `bounds`, `upsert`, `setStatus` | A creator picks an Amped.Bio account by handle, a share inside the `promoter_share` payment setting (1% to 30% by default), all products and the plan or chosen ones, an optional end date, and an optional custom code. Codes are uppercase letters and digits, 4 to 16, unique on the platform; generated codes skip 0, O, 1 and I. A share that leaves the creator under the contract minimum with the current fee is refused. Editing changes new sales only. End is final; a code is never deleted, because Purchase and Membership keep its id |
| Promoter notice     | `notifications` kind `PROMOTER_CODE`, bell text and link to Content, Store             | One bell row when a code is made                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Promoter's view     | `store.promoter.mine`, "Codes you promote" under Sales                                 | Each code with the creator, share, status, sales and what the promoter earned, Copy link, and the FTC line                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Links               | Landing `usePromoterVia` in `StoreViews.tsx`                                           | `?via=` rides from the storefront to product pages, Buy (`checkout.start` already copies it onto the intent, CK-1) and Join (`/join/@handle?via=`)                                                                                                                                                                                                                                                                                                                                                                                                   |
| Attribution         | `resolvePromoter`, called by `preparePurchase`, `prepareJoin` and the quote            | Adds one promoter row when the code is active, not expired, in scope, belongs to this creator, is not the buyer's (by account and by wallet), the promoter has a wallet that passes screening, and the share fits the current settings and the creator minimum. Otherwise the sale goes ahead with no promoter row. Single content items (no product) carry no promoter                                                                                                                                                                              |
| Split               | `buildSplit` and `joinRecipients`                                                      | Creator gets 10,000 less the fee and the promoter. `Purchase.promoterCodeId` and `Membership.promoterCodeId` are stored. A membership keeps its promoter row for the life of the subscription (content spec 3.9 Memberships): renewals pay the stored table                                                                                                                                                                                                                                                                                          |
| Pay and Join sheets | `Pay.tsx`, `Join.tsx`                                                                  | "Referred by @handle" before Pay, and on the join sheet once prepared                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Refund pause        | `checkRefundPause` from `markRefunded`                                                 | A code whose refunds in 30 days pass `promoter_refund_pause_rate` of its sales in the same window pauses with reason `refunds`; the creator turns it back on. Promoter shares are never pulled back (decision 25)                                                                                                                                                                                                                                                                                                                                    |
| Sales               | `SalesView`                                                                            | The Promoter column already reads the split's promoter row (C10), so it fills in now                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Copy                | `PROMOTER_COPY` in `packages/constants/src/promoters.ts`                               | Joined to `pnpm check:copy`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## 3. Not in this PR

- **Partner rows** (admin set, with consent dates). The performer release (store policy 4.4, `shareOfCreatorBps`) and the agency system (#38) define partner rows differently and are still in spec. Building a third model now would be thrown away. The split already accepts role 3 rows.
- **The `via` cookie.** Holding the code in a 30 day first party cookie is attribution tracking. Content spec 3.9 sends it to counsel's classification under `docs/legal/privacy-parameters.md` first. Until then the code rides in the URL only. A fan who leaves and comes back without the link buys with no promoter.
- **Analytics events** `promoter_code_created` and `promoter_sale` (content spec analytics table).
- **Promoters on single content items.** Scope is products and the plan.

## 4. Before production

- Privacy notice: `promoter_codes` (creator, promoter, share, dates) and the promoter's earnings view. Retention proposal: until either account closes, then cascade. The intent's `via` is already listed.
- Account export (#13): add `PromoterCode` rows where the user is creator or promoter.

## 5. Tests

- `store-promoters.test.ts`, 11 tests: creating, bounds and the creator floor, scope ownership, end dates, edit, pause, resume and end, case insensitive codes, every no attribution case, self purchase by account and wallet, screening, the refund pause at and above the rate, the promoter's earnings with refunds kept and membership renewals counted.
- `payments-core.test.ts`: the promoter row in the signed split, the stored code id, "Referred by" in the review, and no row for a bad code.
- `memberships-core.test.ts`: the promoter row in the join table and the stored code id.
- Landing `store.test.tsx`: `?via=` reaches Buy and the storefront's product links.
