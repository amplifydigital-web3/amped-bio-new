# Server rate limiting

Status: spec for approval, 27 Oct 2026. Build Board: D11 "Server rate limiting" (Step 1, priority 7).
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

Sign in also gets a per email counter (10 failures in 15 minutes locks that email for 15 minutes) in a Better Auth `hooks.before` on `/sign-in/email`, so a spread out attack on one account is caught even across IPs. The lock message does not say whether the email exists.

### 3.5 Express routes

`/mcp` gets an Express limiter keyed by the OAuth client and user from the bearer token: 120 requests a minute. `/api/analytics` moves the collector onto `hitRateLimit` so the limit holds across instances. Webhook routes (`/webhooks/*`, `/internal/*`) are signature checked and stay unlimited.

### 3.6 Retry information

`enforceRateLimits` and the middleware put `retryAfter` (ISO time of the window end) in the error cause. The existing formatter already sends it. The response also sets the `Retry-After` header for non tRPC routes.

### 3.7 Remove the debug endpoint

`ndauConversion.debugVerifySignature` is removed. If the ndau conversion team still needs it, it moves behind `adminProcedure`. Decision D3.

## 4. Client behavior

One shared helper in `packages/ui` reads `data.code === "TOO_MANY_REQUESTS"` and `data.retryAfter`. Surfaces:

| Surface | Behavior |
| --- | --- |
| Sign in | "Too many tries. Try again in {m:ss}." under the button; button disabled with the countdown |
| Register handle check | Status line "Checking paused. Try again in a moment." No error colour; resumes on its own |
| Any button action | The existing toast pattern: "Slow down for a moment. Try again in {seconds} s." |
| Public page (SSR) | A 429 from `getHandle` renders the page error state ("This page did not load. Try again.") with a Retry button, never the 404 |
| Uploads | The upload row shows "Upload limit reached for now. Try again in {minutes} min." |

Copy is in the design boards.

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
| R5 | with R1 | Client helper and the surfaces in section 4 | 0.5 day |

## 7. Acceptance

1. 31 availability checks from one IP in a minute: the 31st returns 429 with `retryAfter`; a second IP is unaffected.
2. 6 wrong passwords in a minute from one IP: the 6th is refused on every API instance, not only the one that saw the first five.
3. 10 wrong passwords for one email from 10 IPs locks that email for 15 minutes; the message is the same as for an unknown email.
4. With the SSR secret, two visitors loading pages through the landing server are counted separately. Without the secret, the visitor IP header is ignored.
5. Clicking one block 50 times from one IP in an hour adds at most 10 to its count.
6. A signed in creator's normal session (editor autosave, previews, uploads) never hits a limit in a 30 minute scripted session.
7. A 429 on a public page shows the error state, never the 404, and never caches.
8. `debugVerifySignature` no longer exists on the public router.
9. Typecheck, build and tests pass. Copy has no em or en dashes.

## 8. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| Is Cloudflare in front of the API on staging and production? If yes, add a Cloudflare rate rule on `/auth/*` as an outer layer | Gustavo | No |
| Expected peak traffic after the SEO launch, to set the public defaults | Rob | No |
