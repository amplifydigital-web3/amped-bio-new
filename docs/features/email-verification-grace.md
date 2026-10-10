# Email verification grace and verification email QA

Rob, 10 Oct 2026. One PR, branch `feat/email-verification-grace` from `development`. No migration.

## 1. Why

Two recent features held the person until their email was verified: Creator Pool Broadcast (Build Board #1) refused to send, and Fan Graph (#22) kept a follow "pending" and out of every count. Rob's call: remove the barrier at sign up and ask for verification later, after 30 days or a usage milestone. This keeps the anti-abuse value of verification (throwaway accounts cannot run forever) without stopping a new creator or fan on day one.

## 2. The rule

An unverified account is **trusted** for `EMAIL_VERIFICATION_GRACE_DAYS` (30) after `created_at`. Verification becomes required when either:

- the account is 30 days old (`reason: "expired"`), or
- the feature's own usage milestone is reached (`reason: "milestone"`).

Constants live in `packages/constants/src/email-verification.ts`. The server rule lives in `apps/server/src/utils/verificationGrace.ts` as both a Prisma filter (`trustedEmailWhere`) and an in-memory check (`hasEmailTrust`, `verificationGate`), the same pattern as `utils/indexable.ts`.

| Feature | Before | Now | Milestone |
|---|---|---|---|
| Broadcast send (`broadcast.creator.send`) | FORBIDDEN until verified | Sends while trusted | `EMAIL_VERIFICATION_GRACE_BROADCASTS` = 3 lifetime sends (statuses that count against quota) |
| Broadcasts tab (`broadcast.creator.overview`) | Blocker "Confirm your email to send" whenever unverified | Blocker only when `verification.required`; copy names the reason. While trusted, an info notice shows how many sends are left before verification is asked | same |
| Follow counts and lists (`follow.*`, `countedFollower()`) | Follower must be verified | Follower must be trusted (verified or inside 30 days). Checked at read time, so a follow silently drops out of counts on day 30 and returns once the email is verified | none (counts are read time filters) |
| Follow `pending` flag (capsule dot, toast) | Unverified | Not trusted | none |
| Home notice (`onboarding.status.verifyBy`) | "Your email is not verified yet. Resend the link." | Same line, plus "Verify by {date} to keep your follows and broadcasts." After the date: "Verify it to count your follows and send broadcasts." | n/a |

Unchanged on purpose:

- Sign in never required verification (`requireEmailVerification` is not set). Still true.
- Search indexing (`utils/indexable.ts`) still requires a verified email. That rule is about what goes in the sitemap, not about what the person can use. Rob can lift it the same way if he wants new pages indexed before verification.
- Follow spec decision 8 ("verified email before a follow counts") is now "trusted email before a follow counts". `docs/features/fan-graph.md` keeps the history; the router comment states the new rule.

## 3. Verification email QA

What was checked, from sign up to the verified state, on both Better Auth instances (`apps/auth-server`, which serves `auth.staging.amped.bio` and sends the sign up email, and `apps/server`, which carries the same config).

| # | Finding | Fix |
|---|---|---|
| E1 | **The link in the verification email pointed at the client app** (`APP_URL`, `app.staging.amped.bio`), but the `/auth/verify-email/[token]` page lives on the landing page (`LANDINGPAGE_URL`). The client has no `/auth` routes: `PublicSiteRedirect` sends a signed out visitor to sign in and a signed in one to the landing page root, dropping the token either way. The Resend button already used `VITE_LANDINGPAGE_URL`, so resent links worked and sign up links did not, unless staging had `APP_URL` set to the landing page. The password reset link had the same problem. | `email.ts` on both servers builds auth links from `LANDINGPAGE_URL`. `.env.example` says so. |
| E2 | `sendVerificationEmail` called `sendEmailVerification(...)` without `await`. An SMTP failure became an unhandled rejection with no context, and the log line before it printed the whole user object, the URL and the raw token. | Awaited inside try/catch. The failure is logged with the address and not rethrown, so sign up still completes and Resend works. Logs now carry the email only. Same trim for the reset hook. |
| E3 | Nothing told you at boot whether the SMTP credentials work. The first evidence of a bad SMTP2GO password was a failed sign up email. | `verifySmtpTransport()` runs from `bootstrap.ts` on both servers and logs `SMTP transport ready` or the relay's error with host, port and user. |
| E4 | No way to test the relay end to end without creating an account. | `pnpm run --filter server email:check [address]` and `pnpm run --filter @repo/auth-server email:check [address]`: prints the SMTP settings in use, verifies the login, and with an address sends a real verification email (dummy token) through the configured relay. |
| E5 | SMTP2GO settings were not documented anywhere in the repo. | Both `.env.example` files carry the SMTP2GO block (`mail.smtp2go.com`, 2525 or 587 with `SMTP_SECURE=false`, 465 with `true`, SMTP user not account login, verified sender domain). |

Checked and fine: `authClient.verifyEmail({ query: { token } })` on the landing page calls Better Auth's `/verify-email`, `autoSignInAfterVerification` signs the person in, links expire after one hour and the page explains expired, invalid and incomplete links. The resend flow (`useResendVerification`, Home notice, Account card, landing `/auth/resend-verification`) uses the landing page callback. `confirmEmailChange` still does not touch `email_verified` (known, qa-fixes-1).

### How to verify SMTP2GO on staging

1. On the auth server host, confirm the env: `SMTP_HOST=mail.smtp2go.com`, `SMTP_PORT=2525` (or 587), `SMTP_SECURE=false`, `SMTP_USER` and `SMTP_PASSWORD` from SMTP2GO > Sending > SMTP Users, `SMTP_FROM_EMAIL=noreply@amped.bio`, `LANDINGPAGE_URL=https://staging.amped.bio`.
2. Deploy. The boot log shows `✅ SMTP transport ready: mail.smtp2go.com:2525 (secure=false, user=...)`. A `535` means the SMTP user or password; a timeout means the port is blocked on the host.
3. Run `pnpm run --filter @repo/auth-server email:check you@yourdomain` on that host. The email arrives from `noreply@amped.bio`; its link opens `https://staging.amped.bio/auth/verify-email/...` and shows "This link does not work" (dummy token). SMTP2GO > Reports > Activity shows the message as delivered.
4. Sign up with a fresh address on `app.staging.amped.bio`. The real link verifies and signs you in. Home no longer shows the notice.
5. In SMTP2GO > Sending > Verified Senders, `amped.bio` must be verified with its SPF and DKIM records in DNS, or Gmail and Outlook will put these in spam. Check with any email header view: `spf=pass` and `dkim=pass` for `amped.bio`.

## 4. How to check the grace rules on staging

- New unverified account that owns a pool with members: Broadcasts tab shows the info notice "3 sends left before Amped asks you to confirm your email." and New broadcast works. After 3 sends the blocker reads "Confirm your email to keep sending".
- Unverified account older than 30 days (set `created_at` back in the database): blocker "Confirm your email to send"; the Home notice reads "Verify it to count your follows and send broadcasts."
- New unverified fan follows a creator: the capsule shows Following with no pending dot, no toast, and the creator's count goes up at once. Setting that fan's `created_at` back 31 days takes the follow out of the count; verifying the email puts it back.

## 5. Validation

- Typecheck: `tsc --noEmit` in `apps/server` and `apps/landingpage`, `tsc -b` in `apps/client`: clean. `apps/auth-server` has one pre-existing error on an untouched line (`src/utils/auth.ts:229`, the extended Prisma client type), the same on clean `development`.
- Tests: `broadcast.test.ts` (3 new cases: new unverified sends, 31 day old refused, 3 sends refused), new `verification-grace.test.ts`, `fan-graph.test.ts`, `follow-router.test.ts` all pass. The rest of the server suite fails only on network (staging e2e, MySQL, Redis), unchanged.
- Build: `vite build --mode staging` in `apps/client` passes.
- `email:check` exercised against a local authenticated SMTP server: a wrong password fails at the verify step with `535 Invalid login`; the right one sends, and the captured message links to `https://staging.amped.bio/auth/verify-email/...`.
