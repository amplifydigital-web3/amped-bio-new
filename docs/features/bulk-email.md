# Fix multi-recipient email and add a bulk sender

Status: spec for approval, 27 Oct 2026. QA fixes 3 Nov 2026 (Screen Review rows 349 to 351; findings AC-Q11 to AC-Q19). AC-Q11 and AC-Q17 are held for Rob (section 8). Build Board: D4 "Fix multi-recipient email and add a bulk sender" (Step 1, priority 9).
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at a3ce333 (SMTP2GO transport from #32, PR #300 and #320).
Design: Email preferences and unsubscribe, https://claude.ai/artifact/KiJExkMLMmz5DhX9pDsR6y
Unblocks: #1 Broadcast phase 2 (email), the seller expiry emails in the identity checks spec, the deletion emails in D13.

## 1. Problem

`sendEmail` in `apps/server/src/utils/email/email.ts` passes the recipient array straight to the transport (line 75, `to: recipients`). With more than one address, every recipient sees every other address. It also logs the full recipient list (line 70) and the verification address (line 97). Only single recipient transactional mail uses it today, so no leak has happened. Broadcast phase 2 needs to send the same message to thousands of fans, with unsubscribe, bounce and complaint handling. None of that exists.

## 2. What the code has

| Piece | Where |
| --- | --- |
| Transport | `utils/email/transport.ts`: SMTP2GO API or SMTP relay, `deliverEmail({ to: string[], subject, html })`, boot check. Copy kept identical in `apps/auth-server` |
| Templates | `VerifyEmailTemplate`, `ResetPasswordTemplate`, `EmailChangeTemplate`, `EmailChangeNoticeTemplate`, `WelcomeEmailTemplate` |
| Sender | `SMTP_FROM_EMAIL` on amped.bio, one verified SMTP2GO sender |
| Preferences | `NotificationPreference` (`emailEnabled` per creator and global, default false). Also `Follow.email_updates` and `email_updates_at`, set at follow from "Email me {name}'s updates" (`trpc/follow.ts`, `FollowControls.tsx`). Which one holds fan consent is held for Rob (AC-Q17, section 8) |
| Broadcast | `BroadcastDelivery.emailStatus` and `emailSkipReason`; phase 1 writes `NOT_ELIGIBLE` with reason `phase1_inbox_only` |

## 3. Fix 1: one message per recipient, no addresses in logs

- `sendEmail` takes `to: string` only. The array form is removed from the type, so a multi address call fails to compile. Callers that need several recipients loop, or use the bulk sender.
- `transport.ts` `OutgoingEmail.to` becomes one address. The SMTP2GO API call sends one `to` entry.
- Logs carry a masked address (`m***@gmail.com`) and the SMTP2GO `email_id`. No full address, token or link is logged. Same change in `apps/auth-server`.
- A unit test asserts the transport is never called with more than one recipient and that no log line contains an `@` followed by a full domain.

This ships first, on its own, in half a day.

## 4. Fix 2: the bulk sender

### 4.1 Streams

| Stream | From | Use | Rules |
| --- | --- | --- | --- |
| Transactional | `noreply@amped.bio` (today) | Verification, reset, email change, security, receipts, deletion, expiry | Always sent; not subject to unsubscribe |
| Bulk | `updates@send.amped.bio` (new) | Broadcast email, product news | Opt in only; unsubscribe on every message; suppression list applies |

The bulk stream uses its own subdomain so its reputation cannot hurt sign in mail. DNS for `send.amped.bio`: SPF include for SMTP2GO, DKIM from SMTP2GO, DMARC `p=quarantine` with reporting, a return path CNAME for bounces. Rob or Gustavo adds the records (they own DNS).

### 4.2 Outbox

New model:

```prisma
model EmailOutbox {
  id          Bytes    @id @db.Binary(16)   // UUIDv7
  stream      String   @db.VarChar(16)      // bulk
  kind        String   @db.VarChar(32)      // broadcast | product
  userId      Int      @map("user_id")
  sourceId    String?  @map("source_id") @db.VarChar(64)  // broadcast id
  status      String   @db.VarChar(16)      // queued | sent | skipped | failed
  skipReason  String?  @map("skip_reason") @db.VarChar(32)
  providerId  String?  @map("provider_id") @db.VarChar(64)
  attempts    Int      @default(0)
  createdAt   DateTime @default(now()) @map("created_at")
  sentAt      DateTime? @map("sent_at")
  @@unique([kind, sourceId, userId])
  @@index([status, createdAt])
  @@map("email_outbox")
}
```

The row stores the user id, never the address. The worker reads the address at send time, so a changed or deleted address is honoured.

### 4.3 Worker

`services/email/bulkWorker.ts`, a `setInterval` sweeper with a Redis lock, the same pattern as `services/broadcast/index.ts`:

1. Take up to 100 queued rows.
2. For each, skip with a reason when: the email is unverified (`unverified`), the address is suppressed (`suppressed`), the user turned email off for this creator or globally (`opted_out`), or the account is suspended or scheduled for deletion (`inactive`).
3. Render the template with the user's own unsubscribe token.
4. Send one message from `updates@send.amped.bio` with headers `List-Unsubscribe: <https://amped.bio/u/{token}>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058, required by Gmail and Yahoo for bulk senders). No `mailto:` entry: there is no inbound mail handling, so a mailto unsubscribe could not be honoured (AC-Q13).
5. Throttle to the SMTP2GO plan rate (env `BULK_EMAIL_PER_MINUTE`, default 300). Retry a failed send 3 times with backoff, then `failed`.

Broadcast writes one outbox row per eligible delivery and mirrors the outcome into `BroadcastDelivery.emailStatus`.

Transport change (AC-Q12). Today `OutgoingEmail` in `apps/server/src/utils/email/transport.ts` carries `to`, `subject` and `html` only, and both the SMTP2GO API call and the SMTP path use one fixed sender (`SMTP_FROM_EMAIL`). M2 adds optional `from` and `headers: Record<string, string>` to `OutgoingEmail`. The SMTP2GO API path sends them as `sender` and `custom_headers` (`[{ header, value }]`); the SMTP path passes `from` and `headers` to nodemailer. Transactional callers pass neither and keep the default sender. Same change in `apps/auth-server`. Test: a bulk send carries `List-Unsubscribe` and `List-Unsubscribe-Post` and the `send.amped.bio` sender; a transactional send carries neither header.

### 4.4 Suppression

```prisma
model EmailSuppression {
  emailHash  Bytes    @id @db.Binary(32)  // SHA-256 of the lowercased address with a pepper
  reason     String   @db.VarChar(16)     // hard_bounce | complaint | unsubscribe_all | manual
  createdAt  DateTime @default(now()) @map("created_at")
  @@map("email_suppressions")
}
```

Hashing lets the list outlive an account deletion without keeping the address. A hard bounce or a spam complaint suppresses bulk mail at once. Transactional mail still goes to a suppressed address unless the reason is `hard_bounce`.

### 4.5 Webhooks

`POST /webhooks/smtp2go`: SMTP2GO events for bounce, spam and unsubscribe. Verified with the webhook secret (basic auth or signed header, as SMTP2GO configures). Hard bounces and spam complaints write suppressions. Soft bounces increment a counter; three in 30 days suppress bulk.

### 4.6 Unsubscribe

- One click POST (AC-Q13): the landing app route handler `apps/landingpage/src/app/u/[token]/route.ts` accepts `POST` with body `List-Unsubscribe=One-Click`. It needs no cookie, no session and no CSRF token (it is exempt from any CSRF middleware; the signed token is the authority). It turns off that creator for that fan, is idempotent (a second POST changes nothing and still answers 200), and answers `200` with an empty body, never a redirect. A tampered or unknown token answers `400`. Tests: Gmail style POST with no cookies; repeat POST; bad token.
- `GET /u/{token}` on the landing app shows the preferences page (design board E2). One page pattern serves this page and the Messages reminder off page (Messages M4, `/email/messages-off`): a short title, the choices as full width radio rows where the whole row is the 44 px label, and one POST button. Opening the link never changes anything, so mail scanners cannot switch people off (AC-Q16).
- E2 choices: "Stop email from {creator}" (selected by default) and "Stop email from every creator". Button "Unsubscribe". "Keep getting {creator}'s email" is a plain link back to the creator page.
- Done (E3): this creator "You will not get email from {creator}."; every creator "You will not get email from creators." Undo is a POST to `/u/{token}/undo` with the same token; it restores the setting the token's POST changed and works signed out. After Undo: "Email from {creator} is back on."
- States (AC-Q15): bad or tampered token "This link is not valid. Manage email in Account, Notifications." with Sign in; already off "You already get no email from {creator}." with Undo hidden; Save failed "That did not save. Try again." under the button; offline "You are offline. Try again when you are back online."; product news link (no creator) shows one choice "Stop Amped.Bio news".
- The token is a signed value (user id, creator id or `news`, issued at) with the server secret. It does not expire, so old emails keep working.
- Every bulk email footer (AC-Q14): why you got it, then Unsubscribe, Manage email and Privacy (`new URL("/privacy", env.LANDINGPAGE_URL)`, per `docs/legal/privacy-parameters.md`), then the company postal address (CAN-SPAM).
  - Creator broadcast: "You get this because you follow {creator} on Amped.Bio and turned on email from them."
  - Product news: "You get this because you turned on Amped.Bio news."
  - Postal address: HELD (AC-Q11). The footer line is "Oneiro N.A., Inc., dba Amplify Digital, [POSTAL ADDRESS REQUIRED BEFORE SEND]". M2 must not send a bulk message while the placeholder is in the template: the worker refuses to start when `BULK_FOOTER_ADDRESS` is empty, and a test asserts the rendered footer holds no `[` bracket.

### 4.7 Account settings

(AC-Q18) Account has two tabs today, Settings and Developers (`AccountPanel.tsx`), and Settings is one 610 wide card of disclosure rows (`AccountSettings.tsx`: Public URL, Page visibility, Email, Password, Two factor, Connected apps, Name reminders). There is no Notifications place, and Telegram settings are removed by Messages r4 (M8). So:

- One new disclosure row "Notifications" in the Settings card, before Delete account. Its value line reads the on count, for example "Email from creators on, message reminders on".
- Open, it holds three switches, each a Prism `Switch` labelled by its row name (`aria-labelledby`): "Email from creators" (global; off turns off every creator), "Message reminders" (`messageEmailEnabled`, on by default, Messages r4), "Name reminders" (moved here from `RnsRemindersRow`, which is removed from the card).
- Below: "Creators you follow", one row per followed creator with its own labelled switch. 20 rows a page with "Show more". A search well "Search creators you follow" appears when the person follows more than 20.
- States (AC-Q19): loading (row skeletons), did not load ("Notifications did not load." with Retry), no follows ("You do not follow anyone yet."), save failed (the switch returns to its old state and the row shows "That did not save. Try again."), offline ("You are offline. Changes save when you are back online." and switches disabled).
- Footer line: "Account, security and payment email always arrives."
- Default for a creator is off (E2). Which record each switch writes is held for Rob (AC-Q17); the board shows the surface only.

## 5. Decisions for Rob (recommended first)

**E1. Provider for bulk.** Recommended: stay on SMTP2GO with a separate `send.amped.bio` sender. Why: already wired, one vendor, webhooks and per message API exist. Alternative: Postmark broadcast stream or Amazon SES. Postmark is stricter on content and very reliable; SES is cheapest at volume but needs more work for bounces and reputation. The board's lead item "Email provider setup: SES or Postmark" is updated to SMTP2GO if this is accepted.

**E2. Opt in model.** Recommended: email from a creator only after the fan turns it on (current default false). Why: consent is clear and complaint rates stay low. Alternative: on by default for fans who follow, with unsubscribe. More reach, more complaints, and weaker consent in the EU.

**E3. Suppression outlives deletion.** Recommended: keep the hashed suppression after account deletion. Why: a person who complained should not get mail if they sign up again with an old list import. Alternative: delete it with the account.

## 6. Build

| PR | Scope | Size |
| --- | --- | --- |
| M1 | Single recipient type, masked logs, both servers, tests | 0.5 day |
| M2 | Outbox, worker, suppression, webhook, transport `from` and `headers` (AC-Q12), one click POST handler (AC-Q13), unsubscribe page and its states, footer with Privacy and the news variant, Notifications row | 3 days |
| M3 | DNS for `send.amped.bio` (Rob or Gustavo), SMTP2GO sender and webhook setup | ops, 1 hour plus propagation |
| M4 | Broadcast phase 2 wiring (on #1) | with #1 |

## 7. Acceptance

1. `sendEmail` cannot be called with two addresses (type error), and the transport never receives two.
2. No log line contains a full email address, token or verification link.
3. A broadcast to 1,000 opted in fans sends 1,000 messages, each with only its own address and its own unsubscribe link.
4. One click unsubscribe from Gmail turns off that creator for that fan without opening a page.
5. A hard bounce or complaint webhook suppresses bulk mail to that address within one minute.
6. A fan who never turned on email gets no broadcast email.
7. Mail from `send.amped.bio` passes SPF, DKIM and DMARC alignment (checked with a seed inbox).
8. A bulk send carries `List-Unsubscribe` and `List-Unsubscribe-Post` and the `send.amped.bio` sender; a transactional send carries neither (AC-Q12).
9. A POST to `/u/{token}` with no cookies answers 200 with no redirect, twice in a row, and a bad token answers 400 (AC-Q13).
10. Every bulk footer has Unsubscribe, Manage email, Privacy and a real postal address; the worker refuses to send while the address is the placeholder (AC-Q11, AC-Q14).
11. Typecheck, build and tests pass. Copy has no em or en dashes.

## 8. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| HELD (AC-Q11). The company postal address for the footer: a street address, or a registered PO box or mailbox service. The board shows a marked placeholder | Rob | M2 |
| HELD (AC-Q17). Which record holds fan email consent. Today fans opt in at follow (`Follow.email_updates`, `email_updates_at`), Messages r4 bc-email reads that field, while this spec's worker and E4 use `NotificationPreference.emailEnabled` (default false, with a global row). QA recommends one store: per creator consent in `Follow.email_updates` with its timestamp, and the global switch a nullable column where null means on; the worker, E2, E4 and `FollowControls` read and write the same fields, and the unsubscribe time is kept as consent evidence | Rob | M2 |
| SMTP2GO plan send rate and monthly volume | Rob | Broadcast phase 2 |

## 9. For counsel (AC-Q38)

`docs/legal/privacy-parameters.md` has no entry for this stream. Draft lines for counsel to review with AD4; they are not final and do not go on a board:

- Bulk email (Build Board #4): creator broadcasts and Amped.Bio news go from `updates@send.amped.bio` through SMTP2GO, which receives the address and the message. `email_outbox` stores the user id, never the address, and its rows go with the account.
- Suppression: `email_suppressions` keeps a peppered SHA-256 hash of an address that bounced, complained or unsubscribed from all email, after the account closes, so that address is never mailed again (decision E3).
- Retention for `email_outbox` rows: [PERIOD FOR COUNSEL].
