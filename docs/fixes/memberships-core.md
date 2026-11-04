# MB-1: Memberships core (plans, join, cancel, renewals, reminders)

Branch `feat/memberships-core` into `development`. PR plan MB-1 (24 Oct, wave 5), Build Board #25 (Memberships) and #51 (AmpedMemberships). Specs:

- `docs/features/ampedmemberships.md` sections 2 and 4 (on #450);
- memberships spec (8 Oct, project doc `claude/amped-memberships-payments-spec-2026-10-08.md`);
- amendment 1 (2 Nov, `claude/amped-memberships-payments-amendment-2026-11-02.md`);
- `docs/features/mobile-checkout.md` section 11;
- the MB-1 row of `docs/features/store-policy.md` 5.2.

Screen Review row 369 (People, Members, board mb1). Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-04.

**Merge order.** This branch is stacked on C10 (#472, which carries C9 #452 and PAY-2 #449) and on PAY-3 (#450, the AmpedMemberships contract). Merge #449, #452, #472 and #450 first.

**Decisions this build follows.** The PAY-3 contract builds AmpedMemberships decisions M1 to M5 as recommended. They are still open for Rob on #51. MB-1 follows the same answers:

- the member signs the join table as well as the permit;
- renew works only inside the grace;
- a late renewal starts a new period;
- the fee goes to the current treasury;
- the platform can end a membership.

**One migration**, label `migration`.

## 1. Migration

`packages/database/prisma/migrations/20261104200000_memberships_core/migration.sql`. This is what `prisma migrate diff` generates.

- `membership_plans`: UUID v7 id. One plan per creator.
  - Columns: name, description, benefits, `amount_every_30_days`, optional `amount_yearly`, status (draft, active or paused), version, show member count.
- `memberships`: UUID v7 id. One row per join, so a rejoin is a new row. The on chain `subscriptionRef` is this id, left padded.
  - Terms frozen at join: plan version, interval, price per period, fee, the stored join table and its hash, the permit allowance.
  - Period and renewal state: period dates, readiness, past due, the last reminder day, renewal paused.
  - End: canceled and ended times, end reason.
  - `store_policy_version_id`, as the store policy MB-1 row asks.
- `notifications.kind` gains `MEMBERSHIP_RENEWAL` (CK-D3).
- Foreign keys:
  - A plan cascades with its creator.
  - Memberships cascade with their plan.
  - Fan and creator links set null, so a deleted fan does not erase the creator's records.

```bash
pnpm --filter @repo/database exec prisma migrate deploy --schema=./prisma/schema.prisma
```

Rollback: `DROP TABLE memberships; DROP TABLE membership_plans;`, then return the `notifications.kind` enum to its three values, and delete the `_prisma_migrations` row.

New server env value `AMPEDMEMBERSHIPS_ADDRESS` (the PAY-3 deploy output), beside `AMPEDPAY_ADDRESS` and added to `.env.example`. It is a contract address, not a switch. Empty means joins refuse with paused and the renewal job does not start. The feature switch is the existing `checkout` site flag.

## 2. What ships

| Area            | Files                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plans           | `services/memberships/plans.ts`: get, upsert, set status. Amounts are checked against decision 7: $1 to $500 USDC every 30 days, $10 to $5,000 USDC a year. A changed amount bumps the version, so "New amounts apply to new members only". Active needs a published store policy and the fresh seller check. The plan editor UI is MB-2 (st4)                                                    |
| Join            | `services/memberships/core.ts` `prepareJoin`, `submitJoin`, `settleJoin`. Creator and platform rows, the fee from Admin, Payments, the treasury read from the contract. The split signer (CDP, same account as PAY-2) signs the table. The fan signs the same table and a USDC permit. The relayer calls `join` with the idempotency key `join:{id}`, and the first period is pulled in that call |
| Permit size     | `allowanceFor`: 12 periods every 30 days, 2 yearly, summed over every membership the fan still has, because one permit covers the contract for all of them (ampedmemberships.md 4)                                                                                                                                                                                                                |
| Cancel          | `prepareCancel`, `submitCancel`: one signature on `Cancel(subscriptionRef, deadline)`, sent with `cancelWithSignature`. Charges stop; access runs to the period end. Works while payments are paused                                                                                                                                                                                              |
| End             | `endByPlatform`: past due beyond the grace, seller lapsed. Stops charges only                                                                                                                                                                                                                                                                                                                     |
| Renewals        | `services/memberships/renewals.ts`, hourly from `bootstrap.ts` (section 3)                                                                                                                                                                                                                                                                                                                        |
| Reminders       | Bell row of kind `MEMBERSHIP_RENEWAL`, collapsed per membership, plus a push and an email. The email names the seller and links the store policy version. No Telegram, no Messages thread                                                                                                                                                                                                         |
| Indexing        | `decodeMembershipLogs`, `recordMembershipLogs`: Charged, Share and Canceled as `PaymentEvent` rows with `refType` membership. The payments worker settles joins whose submit response was lost                                                                                                                                                                                                    |
| Access          | `isMember` and `accessUntil` in `plans.ts`. Active members pass; past due members pass through the 7 day grace; canceled members pass to the period end. G5 wires these into the engine's `member` kind                                                                                                                                                                                           |
| Lists           | `services/memberships/lists.ts`: the fan's memberships (Library, Memberships reads them in FL-7) and the creator's members with the mb1 filters                                                                                                                                                                                                                                                   |
| API             | `trpc/memberships.ts`: `plan.get`, `plan.upsert`, `plan.setStatus`, `public`, `join.prepare`, `join.submit`, `join.status`, `cancel.prepare`, `cancel.submit`, `mine`, `members`. Join waits on the `checkout` flag                                                                                                                                                                               |
| People, Members | `panels/people/MembersView.tsx` and tabs in `PeoplePanel.tsx`. The tabs show once the creator has a plan: the plan line, You receive $N USDC per renewal, the filters All, Every 30 days, Yearly, In grace and Ended, and a state in words on each member. Without a plan, People is the Followers view as shipped                                                                                |
| Bell            | `notifications/bell.ts` and `BellCenter.tsx`: renewal rows open Wallet, Buy USDC prefilled with the charge                                                                                                                                                                                                                                                                                        |
| Buy USDC        | `BuyUsdcFlow.tsx` reads `need` for a renewal (`returnTo=/library/memberships`), not only with a checkout intent (CK-Q74). It accepts `returnTo` as well as `return`                                                                                                                                                                                                                               |
| web3            | `AMPEDMEMBERSHIPS_ABI`, `JOIN_TABLE_TYPES`, `MEMBERSHIP_CANCEL_TYPES`, `ampedMembershipsDomain`, `membershipRef`, `planRef`, `USDC_ALLOWANCE_ABI`                                                                                                                                                                                                                                                 |
| Constants       | `packages/constants/src/memberships.ts`: intervals, bounds, limits, schemas, output types and `MEMBERSHIP_COPY`                                                                                                                                                                                                                                                                                   |

## 3. The renewal job, every hour

1. **Close.** Canceled memberships whose period ended become ended.
2. **Seller.** For memberships due within 3 days, a creator who fails the seller check has renewals paused ("Renewal paused"). A creator who passes again has them resumed. With the seller still lapsed at the period end, the platform ends the membership (identity checks 5.4, decision S3).
3. **Readiness.** 3 days before a charge, the job reads the member's allowance to AmpedMemberships and their USDC balance. If either is short, the member gets one reminder for that period.
4. **Charge.** For each due membership, the job reads `getSubscription` first. If a charge already landed, it is applied and nothing is sent. Otherwise the job calls `renew` with the idempotency key `renew:{id}:{charge}:{hour}`.
   - A Charged log starts the new period. The contract keeps the schedule when the charge is on time and starts a full period when it is late (M3).
   - A revert makes the membership past due from the missed date.
5. **Grace.** Reminders go out on day 1, 3 and 6, once each. On day 7 the platform ends the membership and access closes.

## 4. Choices made in the build

1. **Join and cancel are server and API only.** Two pieces of UI are not here:
   - The join sheet (c2) needs the live pay sheet, which CK-5 builds for purchases. MB-2 puts Join on the product page and the membership card.
   - Library, Memberships (Manage, Cancel) is FL-7 (MB-3).
2. **One plan per creator** (decision 6). A rejoin after an end is a new row with the plan's current terms.
3. **A past due cancel ends access at once.** The period was not paid.
4. **Sales and membership charges.** C10 lists one time sales. Membership charges are `PaymentEvent` rows, ready for the Sales list and the Members tile when MB-2 draws them.
5. **Follow on join** (memberships decision 14, `Follow.source = payment`) is not written yet. It belongs with the join sheet in MB-2, where the first follow disclosure can show.
6. **The member count** shows only from 10 members (board mb10), and only when the creator keeps Show member count on.

## 5. Checks run

- Typecheck and build: server and client pass. Landing typecheck passes. `build:packages` passes.
- Tests:
  - Server: 1,352 passed outside the OAuth suites, including 21 new in `memberships-core.test.ts`. They sign join tables, permits and cancels with real keys.
  - Client: 273 passed, including 4 new in `MembersView.test.tsx`.
  - `@repo/constants`: 221 passed, including 4 new.
- `pnpm check:copy`: 166 store and membership strings pass.
- `oxlint` on the new files: no errors.

## 6. Staging check for Gustavo

1. Deploy AmpedMemberships on Base Sepolia (#450) and set `AMPEDMEMBERSHIPS_ADDRESS`. Add `join`, `renew`, `cancelWithSignature` and `endByPlatform` to the relayer policy, and the AmpedMemberships domain to the split signer policy.
2. Run the migration. Turn on `checkout`.
3. As a verified seller with a published store policy:
   - Call `memberships.plan.upsert` with $5 USDC every 30 days, then `plan.setStatus` active.
   - People shows Followers and Members.
4. As a fan with test USDC:
   - Call `memberships.join.prepare` and sign both typed data, then `join.submit`.
   - The membership is active, the creator got 95% and the treasury 5%, and People, Members lists the fan as Active.
5. Lower the fan's balance under $5, then set `current_period_end` 2 days ahead and run the job. The fan gets the bell row, a push and an email naming the seller. The bell row opens Buy USDC prefilled with $5.
6. Set `current_period_end` in the past and run the job. The renew reverts, and the member reads In grace, day 1 of 7. Top up and run again: the membership is active, on a new period.
7. Cancel with `cancel.prepare` and `cancel.submit`. Charges stop and access holds to the period end.
