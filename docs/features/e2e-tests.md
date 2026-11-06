# Rewrite end-to-end login tests

Status: spec for approval, 27 Oct 2026. Build Board: D9 "Rewrite end-to-end login tests" (Step 1, priority 14).
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at a3ce333.
Design: no UI.

## 1. Problem

The only end-to-end spec, `apps/client/cypress/e2e/auth.spec.ts` (14 tests), opens the editor app at `localhost:5173` and clicks a "Sign In" button that opens an auth modal. Sign in moved to the public site (`apps/landingpage`, `/login` and `/register`) months ago, and the editor now redirects signed out visitors there. Every test fails before its first assertion. The Client Tests workflow that runs it (`.github/workflows/client-tests.yml`) is manual only, and since 14 Oct no GitHub Action runs at all because the organization account is billing locked (`c5d2c00`). So there is no working check of the flow every user depends on: sign up, verify, sign in, reach the editor.

Unit and component tests were split and fixed in PR #304 and run with `vitest` in each app. This item covers the browser level only.

## 2. Scope

Covered, in a real browser, against a local stack:

| # | Flow | Steps |
| --- | --- | --- |
| E1 | Register | `/register`, type a free handle, see Available, email and password, submit, land on the check your email state |
| E2 | Verify | Read the code from MailDev, enter it, land in the editor on Home |
| E3 | Sign out and sign in | Sign out from the editor menu, `/login`, sign in, land on Home |
| E4 | Wrong password | Error line, no redirect |
| E5 | Forgot password | Request, read the link from MailDev, set a new password, sign in with it |
| E6 | Handle states | Taken (seeded handle), too short, invalid characters, reserved (after `docs/features/reserved-handles.md` lands) |
| E7 | Signed out editor | Visit `localhost:5173/` and land on `/login` with a `returnTo` |
| E8 | Fan sign up from Follow | Public page of a seeded creator, Follow, create a fan account, follow is recorded |
| E9 | Publish | New creator publishes; the public page at `/{handle}` renders |

Not covered here: Google sign in (needs a test Google account and bypasses the provider; keep as a manual check), Web3Auth wallet creation (external), payments.

## 3. Tooling (decision T1)

Recommended: **Playwright**, in a new workspace package `apps/e2e`.

- Runs both apps in one test (landing on :3000, editor on :5173), which Cypress handles poorly across origins.
- `webServer` config starts the API, landing and editor; `compose.yaml` already has MariaDB, Redis, MailDev and the S3 mock.
- Remove Cypress from `apps/client` (`cypress` dependency, `cypress.config.ts`, `cypress/`), the root `e2e:test` script points to the new package.

Selectors use the `data-testid` attributes that exist on the landing forms (`register-handle`, `register-email`, `register-password`, `register-submit`, `login-email`, `login-password`, `login-submit`, `forgot-password`, `switch-to-login`, `switch-to-register`, `fan-register-form`, `fan-register-submit`). New ones are added where a step has none (editor menu Sign out, Home heading, verification code input).

## 4. Data

- A seed script `apps/e2e/seed.ts` creates: one published creator (`e2e-creator`), one taken handle, the reserved list (from `@repo/constants` after the reserved handles PR). It runs against a dedicated database `amped_e2e`.
- Each test makes its own user with a unique email (`e2e+{run}-{n}@example.test`), so tests run in parallel and in any order.
- MailDev: a helper reads the newest message for an address through MailDev's REST API (`GET /email`), extracts the code or link, and deletes it.
- Rate limits (`docs/features/rate-limiting.md`): the e2e environment sets `RATE_LIMITS=relaxed`, which multiplies limits by 100. Tests for the limits themselves live in the server unit tests.

## 5. Running it

| Where | How |
| --- | --- |
| Local | `pnpm e2e` (starts compose services if needed, seeds, runs) |
| CI | A workflow `e2e.yml` on pull requests to `development`, once Actions is unblocked. Until then the PR template asks the author to paste the local `pnpm e2e` summary for any change under `apps/landingpage/src/components/auth`, `apps/server/src/utils/auth.ts` or `apps/auth-server` |
| Artifacts | Trace and video on failure only |

## 6. Decisions for Rob (recommended first)

**T1. Playwright or Cypress.** Recommended: Playwright. Why: two origins in one test, faster runs, built in traces. Alternative: keep Cypress and point it at the landing app. Less change, but the editor half of each flow needs workarounds.

**T2. Gate PRs before Actions returns.** Recommended: a PR template checkbox with the pasted summary for auth touching PRs. Why: something checks sign in until CI is back. Alternative: wait for the billing fix.

## 7. Build

One PR, `test/e2e-playwright`, about 1.5 days: package, config, seed, MailDev helper, E1 to E9, Cypress removal, root script, PR template line. The CI workflow is a follow up PR the day Actions is unblocked.

## 8. Acceptance

1. `pnpm e2e` passes E1 to E9 on a clean checkout with the compose services running.
2. Breaking the verification email (for example, a wrong link host) fails E2 or E5 with a readable message.
3. A full run takes under 4 minutes on a laptop.
4. No Cypress dependency remains in the repo.
5. Typecheck and build pass.

## 9. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| When is GitHub billing on the amplifydigital-web3 org fixed? | Rob | CI workflow only |
