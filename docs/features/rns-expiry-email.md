# RNS name expiry email

Status: built, 2026-10-23. Target branch: `development`.
Owner: Rob Frasca. Built by Claude, 2026-10-23.
Design canvas: RNS expiry email (https://claude.ai/artifact/NXaY8GTJ9VwqSKQ3ykMdaz). Redrawn from the shipped template on 3 Nov (rows 355 and 356, QA RX-Q3 and RX-Q7). Boards that show a change not yet in code are marked To build on the canvas.

Direction from Rob, 23 Oct: notify name expiry by email too, as its own PR. Decision taken: reminders go to verified email addresses only.

## 1. What it does

An hourly server sweep emails the Amped.Bio owner of an RNS name at four points:

| Stage   | When                                        | Subject                                               |
| ------- | ------------------------------------------- | ----------------------------------------------------- |
| `d30`   | 30 days or less before expiry               | Your RNS name `<name>` expires in N days              |
| `d7`    | 7 days or less                              | same                                                  |
| `d1`    | 1 day or less                               | Your RNS name `<name>` expires in 1 day               |
| `grace` | after expiry, inside the 1 day grace period | `<name>` has expired. Renew it by tomorrow to keep it |

- Only the current stage sends. A missed sweep never sends a burst of older reminders. A name found 5 days out gets the 7 day email only.
- One email per user, name, registration expiry and stage. Extending a name changes the expiry, so the schedule starts again for the new date.
- The button opens `/wallet?tab=rns&name=<label>&flow=extend`. The email carries the wallet trust line: "You confirm in your wallet next. Nothing moves until you sign."
- The footer links to the Account Name reminders row (`/account?open=reminders`).
- Sender: `Amped.Bio <noreply@amped.bio>` from env (`apps/server/src/utils/email/transport.ts:45-49`). Legal name in the footer: "Oneiro N.A., Inc., dba Amplify Digital" (`RnsExpiryTemplate.tsx:117`). Boards use the same name (RX-Q2).

## 2. Who gets it

- The name owner (from the RNS subgraph) matches an Amped.Bio `UserWallet` address.
- The user's email is verified.
- The user has not turned Name reminders off. The default is on: this is an account notice, not marketing.

An owner whose email is not verified gets no email and today no warning. Section 8 adds the notice (RX-Q6).

## 3. How it works

| Part                                                                                | File                                                            |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Stage rule, days left, subject                                                      | `apps/server/src/services/rnsExpiry/stage.ts`                   |
| Subgraph read, recipients, dedupe, send, hourly sweeper                             | `apps/server/src/services/rnsExpiry/index.ts`                   |
| Email template (React Email)                                                        | `apps/server/src/utils/email/RnsExpiryTemplate.tsx`             |
| Setting procedures `notifications.rnsReminders` and `notifications.setRnsReminders` | `apps/server/src/trpc/notifications.ts`                         |
| Account row "Name reminders"                                                        | `apps/client/src/components/panels/account/RnsRemindersRow.tsx` |
| Sweeper start                                                                       | `apps/server/src/bootstrap.ts`                                  |
| Env flag `RNS_EXPIRY_EMAILS` (default true)                                         | `apps/server/src/env.ts`                                        |

- **Subgraph.** One windowed query per sweep across all owners: `revoNames` where `expiryDateWithGrace` is after now and at most 30 days plus grace ahead. It pages by 1000, up to 20 pages. The registration expiry is `expiryDateWithGrace` minus the grace period, the same rule the Wallet uses. A failed read (an HTTP error, a GraphQL `errors` answer or an answer with no `revoNames`) is logged with the status and the errors, and the sweep sends nothing.
- **Dedupe.** The notice row is written before the send. Its unique key (`userId`, `label`, `expiry`, `stage`) stops a second server from sending the same reminder. One bad name or one bad row is logged and skipped: the other names of the same sweep still go out.
- **Retries.** A failed send marks the notice failed instead of freeing it. The next sweep takes the notice over again after a backoff (1 hour, then 2) and gives up after 3 attempts, so a broken mail transport cannot send the same reminder every hour for the whole stage.
- **Sending.** It uses the existing SMTP2GO `deliverEmail`. `email.ts` is unchanged.
- **Off switch.** `RNS_EXPIRY_EMAILS=false`, or an empty `SUBGRAPH_URL`, turns the sweep off. With no subgraph URL the sweeper does not even register its timer.

## 4. Database

Migration `20261023160000_rns_expiry_notices` (apply by hand after merge, after `20261022140000_telegram_messages`):

- `notification_preferences.rnsRemindersEnabled BOOLEAN NULL` on the global row (`creatorUserId` 0). `null` means on.
- New table `rns_expiry_notices`. It has a UUID v7 `BINARY(16)` primary key, a foreign key to `users` with cascade delete, a unique key (`userId`, `label`, `expiry`, `stage`) and an index on `sentAt`.

Migration `20261023170000_rns_expiry_notice_attempts` (apply by hand after the one above):

- `rns_expiry_notices.attempts INT NOT NULL DEFAULT 0` and `rns_expiry_notices.failedAt DATETIME(3) NULL`. The notice counts its failed sends and keeps the time of the last one. The unique key does not change, so a reminder still goes out once per name, expiry and stage.

## 5. Checks

- Server `tsc --noEmit`: clean.
- Client `tsc -b`: clean apart from the pre-existing `ProtectedRoute.test.tsx` `afterEach` error, which is unrelated.
- Client `vite build`: passes.
- New `rns-expiry.test.ts` has 18 tests: the stage edges, subjects, the extend link and the subgraph window. It also covers verified only, opt out, never touched means on, unowned names, dedupe, a failed notice row, the retry backoff and the attempt cap.
- Server unit suite: 60 files, 814 tests. The 13 live OAuth tests fail without a reachable staging API, the same as before this fix.
- `eslint`: 0 errors.
- `prisma validate`: clean, and the migration history matches the Prisma datamodel column for column.

## 6. Staging QA

1. Apply the migration on staging.
2. Use a staging user with a verified email and a linked wallet that owns a name expiring within 7 days. Wait for the sweep (1 minute after boot, then hourly). One email arrives. Its button opens the extend flow.
3. Restart the server. No second email arrives for the same stage.
4. Turn Name reminders off in Account. No email arrives for the next stage.
5. Use an unverified email. No email arrives.

## 7. Open items

- No `List-Unsubscribe` header yet. The footer link opens the Account setting. A one-click header needs a signed token route. Tracked with the bulk email work (`docs/features/bulk-email.md`) so every account email gets the same route (RX-Q5).
- Postal address in the footer: Rob owns the value (bulk email open item, `docs/features/bulk-email.md:139`). Section 8 step 1.
- Names are matched to the one wallet each user links. Names held in another wallet of the same person are not covered.
- Privacy: the published notice covers the reminder email. Section 7 lists it as an account email, section 8 names SMTP2GO as the recipient together with the RNS name and its expiry date, section 10 gives the retention of the `rns_expiry_notices` rows and section 11 lists the opt out in Account settings. `CONSENT_POLICY_VERSION` moved to `2026-10f`.

## 8. Follow up build (QA 3 Nov 2026)

Full QA of rows 355 and 356 (project doc claude/amped-screen-full-qa-seller-2026-11-03.md). The canvas now shows the shipped template. These changes are not in code at 0500800:

1. **Postal address (RX-Q1, compliance).** `apps/server/src/utils/email/RnsExpiryTemplate.tsx`, footer section (lines 115-124): add the company postal address under the legal name, from one shared constant used by every account email (`apps/server/src/utils/email/footer.ts`, new, exporting `LEGAL_NAME` and `POSTAL_ADDRESS`). Rob supplies the address. Until then the board shows "[postal address]".
2. **Badge clause (RX-Q4).** The preview and the body promise "your verified badge" to every owner. Add a `verifiedBadge?: boolean` prop. True only when the owner is Authbase verified and the name is the owner's page name (`revo_name`). When false, the preview reads "Extend {name} to keep your name and your page link." and the body drops "and your verified badge". `services/rnsExpiry/index.ts` sets the prop from `rnsTrust` and `user.revo_name`.
3. **Seller line (identity checks 5.4, VS-Q17).** Add a `seller?: boolean` prop. When true the body adds "When it expires, your store stops taking payments." A separate Authbase seller expiry email is specced in identity checks 5.4.
4. **Unverified email notice (RX-Q6).** `apps/client/src/components/panels/account/RnsRemindersRow.tsx` (lines 27-51): when the account email is not verified, show a Notice under the switch: "Reminders go to {email}. Verify it to make sure they arrive." with a Verify email link to the existing email verification flow. The row value reads "Off until verified". Test: an unverified account sees the notice.
5. **d1 board (RX-Q5).** The d1 email uses the same template with `daysLeft = 1`. The canvas draws it.

Acceptance:

1. Every account email footer shows the legal name and the postal address.
2. An owner who is not verified, or whose name is not the page name, gets no badge clause.
3. A seller's RNS expiry email carries the store line.
4. An unverified account sees the notice in the Name reminders row.

