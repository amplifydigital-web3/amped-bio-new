# PAY-A1: Admin payments settings (handoff)

Build Board #50. Spec: `docs/features/ampedpay.md` 3.3 to 3.9 (PR #373, approved by Rob on 28 Oct). Designs: "AmpedPay admin pages" canvas, boards a1, a2, a3 and a4, Screen Review rows 308 to 311. Branch: `feat/admin-payments-settings`. Needs no contract: on chain values are shown read only and change through the Safe in PAY-A2.

## What this PR adds

| Area                                                                                                    | Files                                                                               |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Catalog of every AmpedPay value: key, group, default, range words, where it lives, formatting           | `packages/constants/src/payments.ts`                                                |
| `AdminChange` model and migration                                                                       | `packages/database/prisma/schema.prisma`, `migrations/20261028200000_admin_changes` |
| `paymentSettings()`: typed values, defaults, 30 second cache, range rules, fee dates, scheduled changes | `apps/server/src/services/payments/settings.ts`                                     |
| Two person flow: draft, approve, reject, pause, expiry, change log, Settings view                       | `apps/server/src/services/payments/changes.ts`                                      |
| Two factor at the moment of change                                                                      | `apps/server/src/services/payments/twoFactor.ts`                                    |
| Overview data (a1)                                                                                      | `apps/server/src/services/payments/overview.ts`                                     |
| tRPC `admin.payments.*`                                                                                 | `apps/server/src/trpc/admin/payments.ts`                                            |
| Admin pages: Overview, Settings, Change log, change sheet                                               | `apps/admin/src/pages/payments/`                                                    |
| Tests (29)                                                                                              | `apps/server/src/__tests__/payments-admin.test.ts`                                  |

**Migration: yes.** New table `admin_changes`, UUIDv7 `BINARY(16)` key. Apply it by hand on staging and production after merge, like the earlier money migrations. Please add the `migration` label.

## Rules it enforces

- Every admin reads every page (acceptance 8). Only an account whose role list has `payments_admin` changes a value. A `payments_admin` also needs `admin` to reach the admin app.
- Every draft, approval, rejection and pause asks for a fresh authenticator code. better-auth checks the code (`auth.api.verifyTOTP` with the session), so the stored secret never leaves the auth library. 5 wrong codes in 15 minutes lock payments changes for that account for 15 minutes.
- **Two person rule (decision 1, acceptance 4).** A draft applies only after a different `payments_admin` approves it. The drafter's own approval is refused. The settings write and the status change run in one transaction, and the status update is conditional, so two admins cannot apply one change twice.
- One open change per value. A second draft for the same value is refused while one waits.
- If the value changed after the draft, approval marks the draft Superseded and asks for a new draft.
- **Pause** applies at once by one `payments_admin` with a reason, and is logged with "Not needed for pause". **Resume** is drafted and approved like any change (spec 3.5).
- **Platform fee dates (decision 4).** An increase needs a date at least 30 days out. A decrease applies on approval or on a chosen date. An approved change with a future date reads Scheduled and applies on that date the next time settings are read.
- Drafts expire after 7 days.
- Rows are never deleted or edited after they apply (acceptance 7). The log shows old value, new value, reason, drafter, approver and status, with CSV export.

## Settings and ranges (spec 3.3)

| Item                                            | Stored as  | Default     | Range checked on the server                                                                 |
| ----------------------------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------------- |
| `payments_paused`                               | bool       | false       | Pause at once, Resume by approval                                                           |
| `platform_fee_bps`                              | bps        | 500         | Contract fee floor to 1,000, and fee plus promoter maximum keeps the creator at the minimum |
| `one_time_price_min`, `_max`                    | micro USDC | 0.50, 1,000 | Inside the contract minimum and maximum                                                     |
| `promoter_share_min`, `_max`                    | bps        | 100, 3,000  | 0 to 5,000, creator stays at the minimum                                                    |
| `quote_window_seconds`                          | int        | 600         | 60 to the split limit                                                                       |
| `soft_unlock_confirmations`                     | int        | 1           | 1 to 12, not above final                                                                    |
| `final_confirmations`                           | int        | 12          | Unlock after to 64                                                                          |
| `purchases_per_day_per_account`                 | int        | 20          | 1 to 500                                                                                    |
| `purchase_usdc_per_day_per_account`             | micro USDC | 2,000       | 1 USDC to 20 times the contract maximum                                                     |
| `promoter_refund_pause_rate`                    | bps        | 1,000       | 100 to 5,000                                                                                |
| `refund_window_days`                            | int        | 30          | 0 to 365                                                                                    |
| `relayer_gas_alarm_eth`, `relayer_gas_stop_eth` | ETH        | env values  | Stop below alarm                                                                            |
| `payments_pilot_only`                           | bool       | true        | On or off                                                                                   |
| `payments_pilot_creators`                       | handles    | none        | Existing handles only                                                                       |

Contract bounds use the deploy defaults from spec 3.2 until PAY-A2 reads them from Base.

## Decisions made in the build

- **Gas lines moved to settings now** (spec P1 1). The USDC relayer and Admin Money read the approved lines, with `RELAYER_GAS_ALARM_ETH` and `RELAYER_GAS_STOP_ETH` as the fallback. If the settings read fails, the env lines apply and a warning is logged, so a database hiccup never stops a USDC send by itself.
- **`decision_note` column** beside the spec fields, for the rejection reason (shown on board a4) and the pause note.
- **Old and new values are `VARCHAR(1024)`**, not 256, so the pilot list fits in one change.
- **The drafter can withdraw** a waiting draft (recorded as Rejected with their note). Approval stays with the second admin.
- **Today on Overview** shows "No payments yet" until PAY-2 records purchases.
- **On chain rows** show the deploy defaults, with "Through the Safe" in place of Change. PAY-A2 adds the Safe delegate proposal.

## Before staging QA

1. Apply the migration.
2. Give John and Rob the roles: `UPDATE users SET role = 'admin,payments_admin' WHERE id IN (<john>, <rob>);`. The admin Users page has no role editor. Each signs out and in again so the session carries the new role.
3. Both turn on two factor in Account.
4. Optional: set `AMPEDPAY_SAFE` (staging Safe) so Overview and Settings show the treasury. `AMPEDPAY_ADDRESS` stays empty until the Base Sepolia deploy.

## Check it locally

```bash
pnpm run --filter @repo/server test -- src/__tests__/payments-admin.test.ts src/__tests__/usdc
pnpm turbo typecheck --filter=@repo/server --filter=@repo/admin --filter=@repo/client
pnpm turbo build --filter=@repo/server --filter=@repo/admin --filter=@repo/client
```

Result in the build sandbox: 29 new tests and the 118 USDC tests pass (147). Typecheck and build pass for constants, database, server, admin and client. The two OAuth integration suites (`oauth-e2e`, `oauth-endpoints`) need a live API and fail the same way on `development`. The pages were rendered from the production build with mocked API responses at 1440 and 390; no console errors, no sideways page scroll.

## Seen while building, not changed here

- `ProtectedRoute` lets an account into the admin app when its role string contains "admin", so `payments_admin` alone would pass the client gate. The server refuses every admin call without the exact `admin` role, so no data is exposed, but the gate should split the role list.
- The Users page role filter matches the whole role string, so an `admin,payments_admin` account does not show under Admins.

## Not in this PR

- Safe delegate proposals, `ParamChanged` indexer, on chain change states, contract pause through the pauser account (PAY-A2).
- Reading every value through `paymentSettings()` at checkout (PAY-2).
- Creator notice for a scheduled fee increase and alerts on applied changes (spec P1 2 and 3).
