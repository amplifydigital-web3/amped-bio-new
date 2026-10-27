# Reserved handle list

Status: spec for approval, 27 Oct 2026. Build Board: D2 "Reserved handle list" (Step 1, priority 5).
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at a3ce333.
Design: Reserved handle states, https://claude.ai/artifact/3QFc9et5PW4KUKPbVnqSqU
Unblocks: #9 Creator Pool Explorer (amped.bio/pools), #7 Brand portal, #8 Brand ad unit.

## 1. Problem

Every public page on amped.bio sits next to `/[handle]`. Next.js matches a static route before the dynamic one, so a creator who holds `pools`, `brands` or `explore` loses their page the day that route ships. Nothing stops anyone from claiming those words today. Nothing stops anyone from claiming `amped`, `support` or `admin` and posing as the company either.

## 2. What the code does today

Every place a handle is set or checked:

| Path | Where | Checks today |
| --- | --- | --- |
| Availability (register, Public URL) | `apps/server/src/trpc/handle.ts` `checkAvailability` (line 74) | Regex, length, unique |
| Change handle | `handle.redeem` (line 104) through `services/pageHandle.ts` `assertHandleAvailable` | Regex, length, unique |
| Publish sheet | `services/pagePublish.ts` (line 61) | Same service |
| Email sign up | Better Auth `additionalFields.handle`, `utils/auth.ts` `databaseHooks.user.create.before` (line 353) | **Nothing.** Only the database unique index. A direct API call can set any string, including `Admin` or `a b` |
| Google sign up | `readSocialSignUpState` (line 30) | Regex, length, unique |
| Generated from email | `utils/onelink-generator.ts` `processEmailToUniqueHandle` | Unique only. `support@gmail.com` becomes `support` |
| Fan handle | `generateFanHandle` | Unique only |
| Session backfill | `customSession` (line 134) | Unique only |

Rules live in `packages/constants/src/handle.ts`: `HANDLE_MIN_LENGTH = 2`, `HANDLE_REGEX = /^[a-z0-9_-]+$/`. The regex already rules out dots, so `robots.txt`, `llms.txt` and `.well-known` cannot collide.

Top level routes in `apps/landingpage/src/app` today: `auth`, `docs`, `i`, `login`, `oauth`, `og`, `privacy`, `register`, `sign`.

## 3. The list

`packages/constants/src/reservedHandles.ts`, exported from `@repo/constants`:

```ts
/** Words no account may hold as a handle. Lowercase. Matched after normalizing. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // routes that exist
  "auth", "docs", "i", "login", "oauth", "og", "privacy", "register", "sign",
  // routes on the board
  "pools", "pool", "brands", "brand", "explore", "creators", "agency", "agencies",
  "store", "shop", "pay", "checkout", "age-check", "library", "live", "messages",
  // app and infrastructure
  "admin", "api", "app", "assets", "cdn", "dashboard", "editor", "graphql", "health",
  "mcp", "media", "settings", "static", "status", "trpc", "webhooks", "www",
  // company, trust and support
  "amped", "ampedbio", "amped-bio", "amplify", "amplifydigital", "revo", "revolution",
  "official", "support", "help", "security", "safety", "moderator", "mod", "staff", "team",
  "legal", "terms", "abuse", "billing", "contact", "about", "blog", "press", "careers",
  "null", "undefined", "me", "you", "new",
]);

/** Also reserved: any handle that starts with these prefixes. */
export const RESERVED_PREFIXES = ["amped-", "amped_", "admin-", "support-", "_"];

export function isReservedHandle(handle: string): boolean {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  return RESERVED_HANDLES.has(h) || RESERVED_PREFIXES.some(p => h.startsWith(p));
}
```

Reserving is case insensitive because every handle is stored lowercase.

## 4. Enforcement

1. **One validator.** `services/pageHandle.ts` gains `assertHandleAllowed(handle)`: regex, length and reserved. It throws `BAD_REQUEST` with `HANDLE_RESERVED_MESSAGE = "This handle is reserved"`. `assertHandleAvailable` calls it first.
2. **Availability.** `checkAvailability` returns `{ available: false, handle, reason: "reserved" }` for a reserved word, and `reason: "taken"` when another account holds it. The client maps `reserved` to a new `HandleStatus` value `Reserved`.
3. **Email sign up.** `databaseHooks.user.create.before` validates a supplied handle with the same rules. A bad or reserved handle throws `APIError("BAD_REQUEST", { code: "INVALID_HANDLE" })`, which the register form already handles (`RegisterForm.test.tsx` line 175). This also closes the gap where a direct API call skips the regex.
4. **Google sign up.** `readSocialSignUpState` drops a reserved handle, so the account falls back to a generated one.
5. **Generated handles.** `generateUniqueHandle` and `generateFanHandle` treat a reserved base as taken and add the numeric suffix (`support` becomes `support4821`).
6. **Admin.** Admins can assign a reserved handle through a new `admin.users.setHandle` with `allowReserved: true`, for company pages such as `amped`. Audited.

## 5. Accounts that already hold a word

Before the PR merges, run `pnpm --filter server handles:reserved-audit`. It lists every account whose handle `isReservedHandle` matches, with page status, follower count and last sign in. It changes nothing.

Then, per decision R1:

- Accounts with no published page (fan accounts, abandoned sign ups): rename to the generated form (`pools` becomes `pools7319`) with no notice.
- Accounts with a published page: email 14 days ahead with a one click "Choose a new handle" link to Public URL. On day 14 the handle is renamed to the generated form if they have not chosen. The old URL redirects to the new one for 90 days through a `HandleRedirect` row, unless the old word is a live route.

## 6. UI

Design boards cover the three surfaces where a person types a handle. One new status line, shared:

| State | Copy |
| --- | --- |
| Reserved | amped.bio/{handle} is reserved. Pick another. |

Shown on the register card (`HandleStatusLine.tsx`), Account > Public URL, and the publish sheet. Submit stays disabled, as it is for Taken. No suggestion list in this PR.

## 7. Decisions for Rob (recommended first)

**R1. Existing holders with a live page.** Recommended: 14 day notice, then rename with a 90 day redirect. Why: fair notice, and the route can ship on a known date. Alternative: let them keep the handle and give up the route word. Blocks `/pools` if any creator holds it.

**R2. Brand and trust words.** Recommended: reserve the company, trust and support words in section 3. Why: an account named `support` or `amped` can impersonate the company in DMs and Telegram. Alternative: reserve route words only; handle impersonation through moderation.

**R3. Prefix reservation.** Recommended: reserve `amped-` and `amped_` prefixes. Why: `amped-support` reads as official. Alternative: exact words only.

**R4. Show "reserved" or "taken".** Recommended: say "reserved". Why: a person who sees "taken" for `admin` may contact support thinking someone holds it. Alternative: show "taken" for both and reveal nothing about the list.

## 8. Build

One PR, `fix/reserved-handles`, about 0.5 day plus the audit run. No schema change unless R1 needs `HandleRedirect` (then a small migration, labeled `migration`). The rename job ships in a second PR after the notice period starts.

## 9. Acceptance

1. `checkAvailability` returns reserved for every word and prefix in the list, in any case.
2. Register, Public URL and the publish sheet show the Reserved line and keep submit disabled.
3. A direct Better Auth sign up call with `handle: "admin"` or `handle: "A B"` is refused with INVALID_HANDLE.
4. Google sign up with a reserved handle in the state creates the account with a generated handle.
5. `processEmailToUniqueHandle("support@example.com")` never returns `support`.
6. The audit script lists collisions and changes nothing.
7. A unit test fails if a new top level folder appears in `apps/landingpage/src/app` without a matching reserved entry.
8. Typecheck, build and tests pass. Copy has no em or en dashes.
