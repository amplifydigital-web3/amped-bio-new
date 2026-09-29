# Staging audit — Web3Auth, security headers and session cookies

Working notes from an investigation into the staging environment
(`auth.staging.amped.bio`, `api.staging.amped.bio`, `app.staging.amped.bio`).
Three commits are already pushed to `development`. This document records what was
found, what was verified, what is still unproven, and the open questions worth a
second pair of eyes.

**Status:** partial. Items 1 and 2 are merged and validated. Item 3 is diagnosed
but the fix is unverified. Item 4 is a question, not a change.

---

## 1. Web3Auth verifier values

The Web3Auth dashboard needs a JWKS endpoint plus the expected `aud` and `iss`.
These came out wrong in the existing docs, so the values below are backed by a
token captured from the live staging deployment.

### Values to configure (staging)

| Field         | Value                                                  |
| ------------- | ------------------------------------------------------ |
| JWKS Endpoint | `https://auth.staging.amped.bio/.well-known/jwks.json` |
| `aud`         | `https://auth.staging.amped.bio`                       |
| `iss`         | `https://auth.staging.amped.bio`                       |

### How this was verified

A test account was created through the normal sign-up flow, then the
`walletToken` that the client hands to Web3Auth was decoded:

```json
{
  "iss": "https://auth.staging.amped.bio",
  "aud": "https://auth.staging.amped.bio"
}
```

The client sends that token at `apps/client/src/hooks/useWallet.ts:90`
(`idToken: walletToken.token` inside `connectTo(WALLET_CONNECTORS.AUTH, ...)`), so
these are the claims the verifier actually sees.

### The bug this found

`JWT_AUDIENCE` was documented and defaulted as a bare domain:

- `apps/server/.env.example` → `JWT_AUDIENCE=amped.bio`
- `apps/auth-server/.env.example` → `JWT_AUDIENCE=amped.bio`
- the staging block in both files → `staging.amped.bio`
- the zod default in both `env.ts` files → `"amped.bio"`

The Web3Auth verifier compares this value literally against the `aud` claim, so a
bare domain is rejected even when the token is otherwise valid. The `iss` comes
from `BETTER_AUTH_URL` (`apps/server/src/utils/auth.ts:31-33`) and is always a
full URL, which is why the two disagreed.

**Fixed in `5e8a75e9`** — defaults and examples now use the full auth origin
(`https://auth.amped.bio` / `https://auth.staging.amped.bio`), with comments
explaining that `aud` must equal `BETTER_AUTH_URL`.

### Not yet verified

- **Production.** `auth.amped.bio` does not resolve DNS yet, so
  `https://auth.amped.bio` follows the staging pattern by inference only. It
  should be re-checked against a real token once production is up.
- **Web3Auth strictness.** Unknown whether the verifier requires an exact `aud`
  match or merely requires the field to be present. This matters for item 4.

### Which key signs the token

Worth recording because it is easy to get wrong. The token handed to Web3Auth is
signed by `apps/server` (via `auth.api.signJWT` in
`apps/server/src/trpc/auth.ts:50`), but the verifier fetches the JWKS from
`auth.staging.amped.bio`. Both were compared and the SPKI is byte-identical —
same `kid` (`999f2a46105979ab`), same modulus and exponent. The two services
share `JWT_PRIVATE_KEY` in staging. If they ever diverge, every Web3Auth token is
rejected while normal login keeps working.

---

## 2. Security headers were never applied

### What was wrong

`helmet()` was registered _after_ the routes it was supposed to protect. Express
only reaches later middleware when an earlier one calls `next()`, and every route
in front of it ended the response itself, so helmet was effectively dead code.

In `apps/auth-server` the call sat below the Better Auth catch-all (which answers
any request that reaches it). Measured before the fix, **0 of 4** security header
families on every route:

| Route                               | Headers present (of 4) |
| ----------------------------------- | ---------------------- |
| `/jwks`                             | 0                      |
| `/.well-known/jwks.json`            | 0                      |
| `/.well-known/openid-configuration` | 0                      |
| `/health`                           | 0                      |
| `/`                                 | 0                      |
| `/oauth2/authorize`                 | 0                      |

In `apps/server` the same ordering bug was narrower: `/mcp` and the
`oauth-protected-resource` redirect were mounted above helmet and answered
unprotected (0), while `/health` and `/trpc` were covered (4).

The four families measured were `strict-transport-security`,
`x-content-type-options`, `x-frame-options` and `referrer-policy`.

### The fix

`app.use(helmet(...))` moved to the top of the stack in both apps, with explicit
configuration rather than defaults:

- **CSP** locked to `default-src 'none'` with `frame-ancestors 'none'`. These
  origins only return JSON or redirect, so nothing needs to load.
- **`crossOriginResourcePolicy: 'cross-origin'`.** This one matters: the helmet
  default is `same-origin`, which **would have blocked** the Web3Auth verifier,
  MCP clients and third-party OAuth clients from reading the JWKS and discovery
  documents. The fix would have introduced the exact outage it was meant to
  prevent.
- **`crossOriginOpenerPolicy: 'same-origin-allow-popups'`.** The default
  `same-origin` would break OAuth popups and `postMessage` handshakes.

**Committed in `525bf534`.**

### Validation

Typecheck and build clean on both packages. The auth server was booted locally
and the JWKS route re-measured: **6 of 6** headers present (HSTS
`max-age=31536000; includeSubDomains`, `nosniff`, `X-Frame-Options`, CSP, CORP,
COOP) versus 0 before. The temporary verification script was removed.

### Not verified

- Only the JWKS routes were exercised end-to-end locally. The Better Auth backed
  routes (`openid-configuration`, `/oauth2/*`) need a live database to reach, so
  they were not tested in-process.
- No CSP violation reports from a real browser session.

---

## 3. Session cookies did not cross subdomains (diagnosed, fix unverified)

### Symptom

tRPC on `api.staging.amped.bio` logged `hasCookies: true` but no session was
found. The log line came from debug logging added in `abc3ba45`, which is
separate work and not part of this fix.

### Root cause

The session cookie was host-only on `auth.staging.amped.bio`. From the browser
cookie store:

```
host_key : auth.staging.amped.bio
name     : __Secure-better-auth.session_token
path     : /
secure   : 1
```

A cookie without a `Domain` attribute is only sent to the exact host that issued
it, so it never reached `api.staging`. Other cookies (`_ga`, `ajs_anonymous_id`,
`web3auth_ajs_user_id`) were on `.amped.bio` and did arrive — which is exactly
why the log showed `hasCookies: true` while the session was missing.

The code was already correct. Both apps have:

```ts
advanced: {
  crossSubDomainCookies: env.COOKIE_DOMAIN ? { enabled: true, domain: env.COOKIE_DOMAIN } : undefined,
}
```

With `COOKIE_DOMAIN` empty, `crossSubDomainCookies` is `undefined` and Better
Auth issues a host-only cookie. Confirmed in the library source:

```js
// better-auth/dist/cookies/index.mjs:24-38
const crossSubdomainEnabled = !!options.advanced?.crossSubDomainCookies?.enabled;
const domain = crossSubdomainEnabled ? options.advanced?.crossSubDomainCookies?.domain || ... : void 0;
...
...crossSubdomainEnabled ? { domain } : {},
```

### Applied change

`COOKIE_DOMAIN=.staging.amped.bio` on **both** services (leading dot, identical
string on both).

Both services are needed, not just the auth server. The auth server issues the
cookie at login, but `getSession` in `apps/server` **re-emits** it on refresh:

```js
// better-auth/dist/api/routes/session.mjs:210
await setSessionCookie(ctx, { session: updatedSession, user: session.user }, false, { maxAge });
```

The default `updateAge` is 1440 minutes (24h), so roughly daily the server writes
a fresh `Set-Cookie` using its own config. If `apps/server` had it empty, it
would mint a host-only cookie on `api.staging` and the session would break again
— intermittently, which is far harder to diagnose than the original symptom.

### Verified after the change

Cookie store now shows the corrected domain:

```
.staging.amped.bio | __Secure-better-auth.session_token | secure=1 | exp 2026-10-06
auth.staging.amped.bio | __Secure-better-auth.session_token | secure=1 | exp 2026-10-06
```

A fresh sign-up through the UI, then `GET https://api.staging.amped.bio/trpc/auth.getWalletToken`
returned **200 with a signed token**. `GET https://auth.staging.amped.bio/get-session`
returned 200 with `user` and `session` populated. Both frontends rendered the
signed-in user.

Note: the path is `/get-session`, not `/api/auth/get-session` — `basePath` is empty
because Better Auth runs at the auth subdomain root.

### Open concerns

- **Two session cookies coexist** in the browser under the same name: the new
  `.staging.amped.bio` one and the older host-only `auth.staging.amped.bio` one
  (expires 2026-10-06). The stale one may mask the new session in a browser that
  has not been cleaned. Users should log out and back in, or clear `amped.bio`
  cookies once.
- **`BETTER_AUTH_SECRET` must match** on both services, otherwise `getSession`
  cannot decrypt and the session silently reads as absent — same symptom, a
  different cause. Worth an explicit check.
- **Not reproducible on a clean browser**, so the original report ("`app.staging`
  redirects me to the landingpage") was never captured. The most likely
  explanation is the stale cookie above, but that is inference. `ProtectedRoute`
  (`apps/client/src/components/ProtectedRoute.tsx:31-33`) redirects to
  `${VITE_LANDINGPAGE_URL}/login` whenever `authUser === null`, which is exactly
  the observed behaviour, but the "no user in context" logs could equally come
  from a tRPC read that failed for another reason.

---

## 4. Open question: should `JWT_AUDIENCE` be a bare domain?

This section replaces an earlier claim that was wrong. Flagging it explicitly so
it is not taken as settled.

### The proposal

Match the bare-domain form used in Web3Auth's own documentation
(`staging.amped.bio` / `amped.bio`) instead of the full origin.

### What was checked

`JWT_KEYS.aud` has exactly one consumer — the sign override, in both apps:

```ts
// apps/server/src/utils/auth.ts:165 and apps/auth-server/src/utils/auth.ts:156
if (!jwtPayload.aud) builder.setAudience(JWT_KEYS.aud);
```

**MCP is not affected by this variable.** It validates audience against the
resource, not the env var:

```ts
// apps/server/src/routes/mcp.ts:324
resource: env.MCP_RESOURCE_URL,
```

```js
// @better-auth/mcp/dist/index.mjs:236
audience: resource,
```

OAuth access tokens already carry their own `aud` (RFC 8707 resource binding), so
the fallback branch is never reached on that path. Changing `JWT_AUDIENCE` does
not break MCP.

### The correction

An earlier statement in this investigation claimed Web3Auth was the _only_
consumer. That was wrong. In the library, `aud` is applied to every token passing
through `jwt.sign`, which includes **OAuth ID tokens**:

```js
// better-auth/dist/plugins/jwt/sign.mjs:88
const defaultAud = options?.jwt?.audience ?? baseURLOrigin;
```

So a bare domain would change the `aud` on ID tokens too. Any third party
validating an ID token against the issuer expects the full origin, which is the
library default. The blast radius is wider than "just Web3Auth".

One path was confirmed **not** to sign a token here: the `getJwtToken` call on
`/get-session` is disabled by `disableSettingJwtHeader: true`, and the
`set-auth-jwt` header was confirmed absent from the live response.

### The actual tradeoff

| Option              | `aud`                            | Web3Auth                             | OAuth ID token consumers     |
| ------------------- | -------------------------------- | ------------------------------------ | ---------------------------- |
| Current (committed) | `https://auth.staging.amped.bio` | must be configured with the full URL | conventional, matches issuer |
| Bare domain         | `staging.amped.bio`              | matches the documented example       | non-standard audience        |

Neither is wrong by protocol. It is a compatibility choice.

**Recommendation:** keep the committed value. The full origin is the OIDC
convention and the library default, and the Web3Auth field is configurable in
one place. Only switch if the verifier is shown to reject the full URL, since
that would indicate it is matching against a fixed expectation rather than
anything the token needs to satisfy.

**Blocking unknown:** the Web3Auth verifier's strictness has not been tested.
That is the one input needed to settle this, and it requires dashboard access.

---

## 5. Pre-existing test failures (not caused by these changes)

`apps/server/src/__tests__/oauth-endpoints.test.ts` — 3 of 19 fail against
staging:

```
expected 'https://auth.staging.amped.bio' not to contain '/auth'
```

The assertion intends to check the issuer has no `/auth` path suffix, but
`https://auth.staging.amped.bio` contains the literal substring `/auth` (in
`https://auth`). The test is wrong for any auth subdomain and can never pass.

Confirmed pre-existing by re-running with the changes stashed — identical
3 failures, 16 passes.

**Suggested fix:** assert on the path component rather than the whole string,
e.g. parse the URL and check `pathname === "/"`. Not changed here to keep the
three commits focused; worth a separate change.

---

## 6. Commits on `development`

| Commit     | Scope                                                                 |
| ---------- | --------------------------------------------------------------------- |
| `5e8a75e9` | `fix(auth): set JWT_AUDIENCE to the full auth origin`                 |
| `525bf534` | `fix(security): mount helmet before routes so security headers apply` |
| `abc3ba45` | `chore(server): log 401s with context instead of dropping them`       |

`abc3ba45` is unrelated debug logging that was already in the working tree; it
was committed separately to keep the helmet change reviewable on its own.

---

## 7. Test account created during this investigation

Created through the public sign-up flow on staging:

- handle: `w3aprobe1790700545`
- email: `w3aprobe1790700545@test.invalid`
- password: `Str0ngProbe!2026`

The handle is reserved and publicly listed. Should be deleted or rotated if
staging is used by anyone else.

---

## Summary for review

| #   | Item                      | State                                                    |
| --- | ------------------------- | -------------------------------------------------------- |
| 1   | Web3Auth `aud`/`iss`/JWKS | Verified from a live token; docs and defaults corrected  |
| 2   | Security headers          | Fixed, 0 → 6 headers, typecheck and build clean          |
| 3   | Session cookies           | Diagnosed and changed; stale-cookie cleanup still needed |
| 4   | `JWT_AUDIENCE` shape      | Open question; recommend keeping the committed value     |
| 5   | Broken tests              | Pre-existing assertion bug, not fixed here               |
| 6   | Production values         | Unverified — `auth.amped.bio` does not resolve yet       |

The two things most worth a second opinion: the CORP override in item 2 (a
deliberate weakening of the helmet default, justified by cross-origin JWKS reads),
and the `JWT_AUDIENCE` decision in item 4, which is blocked on testing the
Web3Auth verifier directly.
