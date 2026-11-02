# Fix multi-recipient email and add a bulk sender

Status: spec for approval, 27 Oct 2026. Build Board: D4 "Fix multi-recipient email and add a bulk sender" (Step 1, priority 9).
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
| Preferences | `NotificationPreference` (`emailEnabled` per creator and global, default false) |
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
4. Send one message with headers `List-Unsubscribe: <https://amped.bio/u/{token}>, <mailto:unsubscribe@send.amped.bio?subject={token}>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058, required by Gmail and Yahoo for bulk senders).
5. Throttle to the SMTP2GO plan rate (env `BULK_EMAIL_PER_MINUTE`, default 300). Retry a failed send 3 times with backoff, then `failed`.

Broadcast writes one outbox row per eligible delivery and mirrors the outcome into `BroadcastDelivery.emailStatus`.

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

- `GET /u/{token}` on the landing app shows the preferences page (design boards E2): this creator off, all creator email off, or keep. One click from the email header (POST) turns off that creator at once with no page.
- The token is a signed value (user id, creator id, issued at) with the server secret. It does not expire, so old emails keep working.
- Every bulk email footer: why you got it ("You follow {creator} on Amped.Bio and turned on email"), Unsubscribe, Manage email, and the company postal address (CAN-SPAM).

### 4.7 Account settings

Account > Notifications gets one Email section: "Email from creators" global switch, and per creator rows in the existing Following list. Default off, as in `NotificationPreference` today.

## 5. Decisions for Rob (recommended first)

**E1. Provider for bulk.** Recommended: stay on SMTP2GO with a separate `send.amped.bio` sender. Why: already wired, one vendor, webhooks and per message API exist. Alternative: Postmark broadcast stream or Amazon SES. Postmark is stricter on content and very reliable; SES is cheapest at volume but needs more work for bounces and reputation. The board's lead item "Email provider setup: SES or Postmark" is updated to SMTP2GO if this is accepted.

**E2. Opt in model.** Recommended: email from a creator only after the fan turns it on (current default false). Why: consent is clear and complaint rates stay low. Alternative: on by default for fans who follow, with unsubscribe. More reach, more complaints, and weaker consent in the EU.

**E3. Suppression outlives deletion.** Recommended: keep the hashed suppression after account deletion. Why: a person who complained should not get mail if they sign up again with an old list import. Alternative: delete it with the account.

## 6. Build

| PR | Scope | Size |
| --- | --- | --- |
| M1 | Single recipient type, masked logs, both servers, tests | 0.5 day |
| M2 | Outbox, worker, suppression, webhook, unsubscribe route and page, footer | 2.5 days |
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
8. Typecheck, build and tests pass. Copy has no em or en dashes.

## 8. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| The company postal address for the footer | Rob | M2 |
| SMTP2GO plan send rate and monthly volume | Rob | Broadcast phase 2 |
