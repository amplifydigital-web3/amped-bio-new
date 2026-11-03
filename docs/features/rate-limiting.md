# Server rate limiting

Status: spec for approval, 27 Oct 2026. QA fixes 3 Nov 2026 (Screen Review rows 344, 345; findings AC-Q1 to AC-Q10). Build Board: D11 "Server rate limiting" (Step 1, priority 7).
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at a3ce333.
Design: Rate limit states, https://claude.ai/artifact/9KUtV9batrJPXpTJjqAZ4c

## 1. Problem

The card was written on 2 Oct, when the API had no limiter. Since then a shared limiter landed and seven features use it. The gap now is coverage and identity: most public procedures, both auth servers, uploads, MCP and the click counter have no limit, and the key for anonymous callers is not settled. SEO and the content system will bring traffic that the current setup does not protect against.

## 2. What the code has

`apps/server/src/utils/rateLimit.ts`: fixed window counter in Redis (`ratelimit:{key}:{window}`), per process fallback when Redis is down, `enforceRateLimits(rules, message)` throws `TOO_MANY_REQUESTS`. The tRPC error formatter (`trpc/trpc.ts`) already passes `cause.retryAfter` to the client, and `EmailRow.tsx` shows a countdown from it (Screen Review 019 I06).

Used today by:

| Caller | Keys |
| --- | --- |
| `trpc/follow.ts` follow | per user, minute and day |
| `services/pagePublish.ts` | per user |
| `trpc/onramp.ts`, `services/onramp/sessions.ts` | per user |
| `trpc/usdc.ts` | per user |
| `trpc/messaging/fan.ts`, `messaging/creator.ts` | per user |
| `trpc/telegram/index.ts` | per user |

Not limited:

| Surface | Where | Risk |
| --- | --- | --- |
| Better Auth sign in, sign up, reset, verify (two servers) | `apps/server/src/utils/auth.ts`, `apps/auth-server/src/utils/auth.ts`, no `rateLimit` option | Defaults apply: in memory, per instance. Credential stuffing scales with instances |
| `handle.checkAvailability` | `trpc/handle.ts` line 74 | Handle enumeration, DB load |
| `handle.getHandle` | line 135 | Scraping every page; each call reads chain and Authbase |
| `blocks.registerClick` | `trpc/blocks.ts` line 255 | Click inflation sold to brands later (#7, #8) |
| Upload presign and confirm | `trpc/upload.ts` | Storage cost |
| `pools.fan.getPools` and pool reads | `trpc/pools/fan.ts` | RPC calls per request (see D7) |
| `ndauConversion.debugVerifySignature` | `trpc/ndauConversion.ts` line 428 | Public, CPU bound, no business use |
| MCP | `routes/mcp.ts`, mounted at `/mcp` | Agent loops |
| Analytics collector | `services/analytics/collector.ts` | Own limiter, per process only |
| Referral reads, RNS lookups, theme gallery | various public procedures | Low |

Identity: `getVisitorIp(req)` (`services/analytics/visitorIp.ts`) walks `X-Forwarded-For` past private and Cloudflare hops and reads `CF-Connecting-IP` behind Cloudflare. Express `trust proxy` is set from `env.TRUST_PROXY`.

Server side rendering: the landing app calls the API from its Node server (`apps/landingpage/src/lib/trpc.ts`, `getProfileData.ts`). Every SSR call reaches the API from the landing server's address, so a per IP limit would throttle all visitors together.

## 3. Design

### 3.1 One middleware, one table

`apps/server/src/trpc/rateLimit.ts` adds a tRPC middleware applied to `publicProcedure` and `privateProcedure`. It reads a rule table keyed by procedure path:

```ts
type Bucket = "ip" | "user" | "ip+input";
type Rule = { bucket: Bucket; limit: number; windowSeconds: number };

export const RATE_RULES: Record<string, Rule[]> = {
  "*public":                    [{ bucket: "ip",   limit: 300, windowSeconds: 60 }],
  "*private":                   [{ bucket: "user", limit: 600, windowSeconds: 60 }],
  "handle.checkAvailability":   [{ bucket: "ip",   limit: 30,  windowSeconds: 60 }],
  "handle.getHandle":           [{ bucket: "ip",   limit: 120, windowSeconds: 60 }],
  "blocks.registerClick":       [{ bucket: "ip+input", limit: 10, windowSeconds: 3600 }],
  "upload.requestAvatarPresignedUrl":  [{ bucket: "user", limit: 20, windowSeconds: 3600 }],
  "upload.requestThemeBackgroundUrl":  [{ bucket: "user", limit: 20, windowSeconds: 3600 }],
  "pools.fan.getPools":         [{ bucket: "ip",   limit: 60,  windowSeconds: 60 }],
  "referral.getReferrerInfo":   [{ bucket: "ip",   limit: 30,  windowSeconds: 60 }],
};
```

Every procedure gets the default for its kind. Named rules add to it. Feature limits already written with `enforceRateLimits` stay where they are, because they carry product meaning (a follow cap is a product rule, not abuse control).

Content uploads (AC-Q6, decided 3 Nov): `content.createUpload` keeps its own feature limit in `apps/server/src/trpc/content.ts` (30 starts a minute, `CREATE_UPLOADS_PER_MINUTE`, copy "Too many uploads at once. Try again in a minute."). It is not added to this table and gets no waiting phase. On a 429 the upload task moves to failed with that line, as `apps/client/src/components/panels/content/lib/uploadTask.ts` does today. Board L5 is drawn on the avatar and theme background upload, the two upload rules this table names. If Rob wants content uploads to wait and retry instead, that is a separate change: add `content.createUpload` here with `retryAfter` in the cause and a waiting phase in `UploadTask` that sleeps until `retryAfter`.

Numbers are starting values. Each one is a constant with a comment, and the admin dashboard shows the count of 429s per rule for the last hour so they can be tuned.

### 3.2 Keys

- `user`: `rl:u:{userId}:{path}`.
- `ip`: `rl:ip:{ip}:{path}`, with `ip` from `getVisitorIp(req)`. IPv6 is keyed by its /64 prefix so one host cannot rotate addresses.
- `ip+input`: `rl:ip:{ip}:{path}:{hash(input.id)}`. For clicks, one visitor counts once per block per hour above the limit.
- An empty IP (only proxies seen) uses the `ip` bucket `unknown`, with the same limit. This fails closed.

### 3.3 Landing SSR

The landing server sends two headers on server side calls: `X-Amped-SSR: <LANDING_SSR_SECRET>` and `X-Amped-Visitor-IP: <the visitor IP the landing server saw>`. The API trusts the visitor IP header only when the secret matches (constant time compare). With a valid secret the key is the visitor's IP, so each visitor has their own bucket. Without it, the call is an ordinary request from the landing server's address. The secret lives in both apps' env and never ships to a browser.

### 3.4 Better Auth

Both auth configurations set:

```ts
rateLimit: {
  enabled: true,
  storage: "secondary-storage",   // Redis, shared by every instance
  window: 60,
  max: 100,
  customRules: {
    "/sign-in/email":        { window: 60, max: 5 },
    "/sign-up/email":        { window: 3600, max: 10 },
    "/forget-password":      { window: 3600, max: 5 },
    "/send-verification-email": { window: 3600, max: 5 },
    "/two-factor/*":         { window: 60, max: 5 },
  },
},
secondaryStorage: redisSecondaryStorage(getRedisClient()),
advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] } },
```

Sign in also gets a per email counter (10 failures in 15 minutes locks that email for 15 minutes) in a Better Auth `hooks.before` on `/sign-in/email`, so a spread out attack on one account is caught even across IPs. The lock message does not say whether the email exists. The lock answers HTTP 429 with the `X-Retry-After` header (seconds), the same status, header and text as a Better Auth rate limit, so the client cannot tell a lock from an IP limit (AC-Q1).

### 3.5 Express routes

`/mcp` gets an Express limiter keyed by the OAuth client and user from the bearer token: 120 requests a minute. `/api/analytics` moves the collector onto `hitRateLimit` so the limit holds across instances. Webhook routes (`/webhooks/*`, `/internal/*`) are signature checked and stay unlimited.

### 3.6 Retry information

`enforceRateLimits` and the middleware put `retryAfter` (ISO time of the window end) in the error cause. The existing formatter already sends it. The response also sets the `Retry-After` header for non tRPC routes.

### 3.7 Remove the debug endpoint

`ndauConversion.debugVerifySignature` is removed. If the ndau conversion team still needs it, it moves behind `adminProcedure`. Decision D3.

## 4. Client behavior

### 4.1 Two retry sources (AC-Q1)

| Source | Where it comes from | Read by |
| --- | --- | --- |
| tRPC | `data.code === "TOO_MANY_REQUESTS"` and `data.retryAfter` (ISO time) from the error formatter | One shared helper in `packages/ui` |
| Better Auth REST (`authClient.signIn.email`, sign up, forgot password, send verification email, two factor) | HTTP 429 with the `X-Retry-After` header in seconds. There is no `data.retryAfter` | `classifyAuthError` in `packages/ui/src/prism/auth.tsx` gains a `rateLimited` kind for `status === 429` that returns the seconds from `X-Retry-After`. Today a 429 falls to `unknown` and `SignInForm.tsx` shows the network card; that is the bug this fixes |

Both feed one countdown hook. The countdown is shown in the status line only. A polite live region announces it once a minute, as the faucet cooldown does (053 I09), not every second.

### 4.2 Surfaces

| Surface | Behavior |
| --- | --- |
| Sign in (`SignInForm.tsx`) | The shipped auth card, unchanged: Forgot password on the password label row, Continue with Google, Create account. Status line under the password well, danger icon and danger text: "Too many tries. Try again in {m:ss}." The password well stays neutral (no danger ring: a lock is not a wrong password). The button keeps its label "Sign in" and is disabled until the time runs out. Same text for an unknown email and a locked one (D4) |
| Register submit | Same pattern: "Too many sign ups from here. Try again in {m:ss}." Button "Create my page" disabled |
| Forgot password | "Too many reset emails. Try again in {m:ss}." Button "Send reset link" disabled |
| Resend verification link | "Too many emails sent. Try again in {m:ss}." Button "Resend link" disabled |
| Two factor code | "Too many codes tried. Try again in {m:ss}." under the code well; Verify disabled |
| Register handle check (AC-Q3) | A new `Paused` value of `URLStatus`, set on `TOO_MANY_REQUESTS`, in both hooks: `apps/landingpage/src/hooks/useHandleAvailability.ts` and `apps/client/src/hooks/useHandleAvailability.ts` (Public URL change). The hook rechecks on its own at `retryAfter`. `HandleStatusLine.tsx` renders it in ink 2 with the 21 px Clock icon: "Checking paused. Try again in a moment." No danger colour, no Retry button, polite live region kept. The submit stays disabled until a check passes |
| Any button action | The existing toast (`apps/client/src/components/ui/toast.tsx`) with its dismiss control: "Slow down for a moment. Try again in {seconds} s." Error toasts stay until dismissed |
| Follow (AC-Q10) | Keeps its own feature copy. `follow.ts` splits the message by the rule that refused: minute rule "You're following too fast. Try again in a minute."; day rule (500 a day) "You reached today's follow limit. Try again tomorrow." `useFollow.ts` shows the server line as today |
| Public page (SSR) (AC-Q8) | A 429 from `getHandle` throws in `resolveProfile`, so `apps/landingpage/src/app/error.tsx` renders the shipped `DestinationErrorCard` inside `PublicPage` (header and footer kept): 34 px danger icon, title "This page did not load", cause "Something went wrong on our side. Try again.", primary "Try again". After two failed tries the cause becomes "This keeps failing. Try again later." No 429 specific line is added. Never the 404 |
| Share image (AC-Q9) | `apps/landingpage/src/app/[handle]/opengraph-image.tsx` throws when `result.status === "error"` instead of rendering the generic card, so a 429 during generation is never cached for the 3600 s revalidate window. The generic card stays for not found only |
| Avatar and theme background uploads (AC-Q6) | The upload row keeps the file and shows one line in ink 2 with a warn pill "Limit reached": "Upload limit reached for now. Try again in {minutes} min." Upload is disabled until the time runs out. No danger text |
| Content uploads | Unchanged: failed state with "Too many uploads at once. Try again in a minute." (section 3.1) |
| Offline (AC-Q37) | Before any of these calls, a request that fails with no network shows the offline line in the same slot: "You are offline. Try again when you are back online." It never shows a countdown |

Copy is in the design boards (Rate limit states, L1 to L5).

## 5. Decisions for Rob (recommended first)

**D1. Where limits live.** Recommended: one middleware with a default per procedure kind and a short named table, plus the feature limits that exist. Why: every new procedure is covered by default. Alternative: call `enforceRateLimits` in each procedure. Easy to forget.

**D2. Landing SSR identity.** Recommended: a shared secret header that lets the landing server pass the visitor IP. Why: per visitor limits on public pages without throttling every visitor together. Alternative: exempt the landing server entirely. Simpler, but scraping through amped.bio pages is then unlimited.

**D3. The ndau debug endpoint.** Recommended: remove it. Why: public, CPU bound, no product use since the admin conversion tools were removed (#40). Alternative: move it behind admin.

**D4. Account lock on failed sign ins.** Recommended: lock the email for 15 minutes after 10 failures in 15 minutes, with a neutral message. Why: stops slow attacks on one account. Alternative: IP limits only. No lockout risk for a real user, but weaker.

**D5. Redis down.** Recommended: keep the per process fallback (current behavior). Why: limits still hold per instance and sign in keeps working. Alternative: fail closed and refuse requests. Safer, but an outage of Redis becomes an outage of the site.

## 6. Build

| PR | Branch | Scope | Size |
| --- | --- | --- | --- |
| R1 | `feat/rate-limit-middleware` | Middleware, rule table, keys, IPv6 /64, retryAfter in cause, admin 429 counts, tests | 1 day |
| R2 | `feat/auth-rate-limits` | Better Auth on both servers with Redis secondary storage, per email lock, IP headers | 0.5 day |
| R3 | `feat/ssr-visitor-ip` | Landing headers, API trust check, env on both apps | 0.5 day |
| R4 | `chore/remove-ndau-debug` | Remove the debug procedure | 0.1 day |
| R5 | with R1 | Client helper, `classifyAuthError` `rateLimited` kind, `Paused` URL status in both hooks, follow cap split, share image throw, and the surfaces in section 4 | 0.5 day |

Order (AC-Q7): R3 ships before R1 or in the same deploy. The landing server sends no visitor IP headers today (`apps/landingpage/src/lib/trpc.ts`), so R1 alone would put every SSR page view in one bucket keyed by the landing server's address, and the 121st `getHandle` a minute across all visitors would get the error state. If R1 must deploy first, the API skips the `ip` buckets for requests from the landing server addresses listed in env `LANDING_SERVER_IPS` until R3 is live, and R3 removes that env.

## 7. Acceptance

1. 31 availability checks from one IP in a minute: the 31st returns 429 with `retryAfter`; a second IP is unaffected.
2. 6 wrong passwords in a minute from one IP: the 6th is refused on every API instance, not only the one that saw the first five.
3. 10 wrong passwords for one email from 10 IPs locks that email for 15 minutes; the message is the same as for an unknown email.
4. With the SSR secret, two visitors loading pages through the landing server are counted separately. Without the secret, the visitor IP header is ignored.
5. Clicking one block 50 times from one IP in an hour adds at most 10 to its count.
6. A signed in creator's normal session (editor autosave, previews, uploads) never hits a limit in a 30 minute scripted session.
7. A 429 on a public page shows the error state, never the 404, and never caches.
8. `debugVerifySignature` no longer exists on the public router.
9. With R1 and R3 deployed, 200 SSR page loads a minute from many visitors through the landing server return no 429 (AC-Q7). A test in R1 fails if R1 is deployed with the `ip` rule on `getHandle` and neither the SSR headers nor `LANDING_SERVER_IPS` are set.
10. A Better Auth 429 on sign in shows "Too many tries. Try again in {m:ss}." with the time from `X-Retry-After`, never the network card. The per email lock returns the same status, header and text (AC-Q1).
11. A 429 on the handle check shows the paused line in ink 2 and the check resumes after `retryAfter` with no click (AC-Q3).
12. The share image for a handle whose lookup returns 429 is not cached; the next request renders the real card (AC-Q9).
13. A follow refused by the day rule shows the day line, not "Try again in a minute" (AC-Q10).
14. Typecheck, build and tests pass. Copy has no em or en dashes.

## 8. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| Is Cloudflare in front of the API on staging and production? If yes, add a Cloudflare rate rule on `/auth/*` as an outer layer | Gustavo | No |
| Expected peak traffic after the SEO launch, to set the public defaults | Rob | No |
