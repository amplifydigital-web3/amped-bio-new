# Reserved handle list

Status: revision 2, 28 Oct 2026, for approval. Revision 1 (27 Oct) had R1 to R4, all answered as recommended on 28 Oct. Revision 2 adds the admin interface (section 7): the list moves to two tiers, a locked system tier in code and an admin managed tier in the database, with screens to reserve, assign and release words, run the holder notices from R1, and see redirects and the audit log. Changed sections: 3, 4, 5, 7 (new), 8, 9, 10, 11.
Build Board: D2 "Reserved handle list" (Step 1, priority 5).
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at a3ce333.
Design: Reserved handle states (user side), https://claude.ai/artifact/3QFc9et5PW4KUKPbVnqSqU. Admin screens: Reserved handles admin, https://claude.ai/artifact/MvT99NKcyF3aeC4XopgjRZ
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

Admin today: the admin app (`apps/admin`) has no handle tools. The Users slab edit dialog (`components/users/UsersSlab.tsx`) changes name and email only. `admin.users.updateUser` does not take a handle. There is no audit table; the suspended pages spec proposes `AdminAuditLog`, and this spec uses the same model.

## 3. The list: two tiers

Revision 1 kept every word in code. That means a deploy to reserve a brand name, no way to give `amped` to the company page through a screen, and every partner hold shipped in the client bundle where anyone can read it. Revision 2 splits the list (decision A1).

### 3.1 System tier (code, locked)

Words that collide with a route or with infrastructure. No account may ever hold them, admins included, because the route wins in Next.js. `packages/constants/src/reservedHandles.ts`:

```ts
/** Routes and infrastructure. No account may hold these, ever. Lowercase. */
export const SYSTEM_RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // routes that exist
  "auth", "docs", "i", "login", "oauth", "og", "privacy", "register", "sign",
  // routes on the board
  "pools", "pool", "brands", "brand", "explore", "creators", "agency", "agencies",
  "store", "shop", "pay", "checkout", "age-check", "library", "live", "messages",
  // app and infrastructure
  "admin", "api", "app", "assets", "cdn", "dashboard", "editor", "graphql", "health",
  "mcp", "media", "settings", "static", "status", "trpc", "webhooks", "www", "u",
  // values that break code or read as system
  "null", "undefined", "me", "you", "new",
]);

export const SYSTEM_RESERVED_PREFIXES = ["_"];

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

/** Client safe check. Covers the system tier only; the server adds the admin tier. */
export function isSystemReservedHandle(handle: string): boolean {
  const h = normalizeHandle(handle);
  return SYSTEM_RESERVED_HANDLES.has(h) || SYSTEM_RESERVED_PREFIXES.some(p => h.startsWith(p));
}
```

`u` is added for the unsubscribe route in the bulk email spec (`/u/{token}`). The route guard test (acceptance 7) keeps this tier in step with `apps/landingpage/src/app`.

### 3.2 Admin tier (database, managed in the admin app)

Company, trust, brand and partner words, plus temporary holds. Seeded by the migration with the words revision 1 had in its company and trust group:

| Category | Seed rows |
| --- | --- |
| Company | `amped`, `ampedbio`, `amped-bio`, `amplify`, `amplifydigital`, `revo`, `revolution`, `oneiro`, `cosimo` |
| Trust | `official`, `support`, `help`, `security`, `safety`, `moderator`, `mod`, `staff`, `team`, `legal`, `terms`, `abuse`, `billing`, `contact`, `about`, `blog`, `press`, `careers` |
| Trust prefixes | `amped-`, `amped_`, `admin-`, `support-` (R3) |
| Brand | none seeded; added by admins |
| Partner | none seeded; added by admins |
| Hold | none seeded; temporary, with an end date (decision A4) |

`oneiro` and `cosimo` are new in revision 2: Oneiro N.A., Inc. issues Amped.Bio press releases and is a COSIMO Digital company.

An admin tier word can be **assigned** to one account (the company page holds `amped`, a verified brand holds its name). The assigned account passes every check for that word; everyone else gets Reserved.

The admin tier is never sent to a browser (decision A5). The client checks the system tier for instant feedback and relies on `checkAvailability` for the rest.

## 4. Enforcement

1. **One matcher.** `apps/server/src/services/reservedHandles.ts`:

   ```ts
   type ReservedMatch =
     | { reserved: false }
     | { reserved: true; tier: "system" }
     | { reserved: true; tier: "admin"; id: string; assignedUserId: number | null };

   export async function matchReserved(handle: string): Promise<ReservedMatch>;
   ```

   It checks the system tier first, then the admin tier. Admin rows are held in a process cache keyed by a version counter in Redis (`reserved_handles:version`). Every admin write bumps the version; each instance reloads within 5 s. If Redis is down the cache reloads from the database every 60 s. A hold past its `expiresAt` does not match.
2. **One validator.** `services/pageHandle.ts` `assertHandleAllowed(handle, userId?)`: regex, length, then `matchReserved`. A system match always throws. An admin match throws unless `assignedUserId === userId`. Message: `HANDLE_RESERVED_MESSAGE = "This handle is reserved"`. `assertHandleAvailable` calls it first.
3. **Availability.** `checkAvailability` returns `{ available: false, handle, reason: "reserved" }` for a reserved word, and `reason: "taken"` when another account holds it. The client maps `reserved` to a new `HandleStatus` value `Reserved`. The response never says which tier or category matched.
4. **Email sign up.** `databaseHooks.user.create.before` validates a supplied handle with the same rules. A bad or reserved handle throws `APIError("BAD_REQUEST", { code: "INVALID_HANDLE" })`, which the register form already handles (`RegisterForm.test.tsx` line 175). This also closes the gap where a direct API call skips the regex.
5. **Google sign up.** `readSocialSignUpState` drops a reserved handle, so the account falls back to a generated one.
6. **Generated handles.** `generateUniqueHandle` and `generateFanHandle` treat a reserved base as taken and add the numeric suffix (`support` becomes `support4821`).
7. **Admin.** Assigning, reserving and releasing run through `admin.handles` (section 7.10). Every write is audited.

## 5. Accounts that already hold a word

Revision 1 ran a one time script. Revision 2 runs the same check inside the admin app, because a newly reserved word can collide at any time, not only at launch.

- **Collision check.** `admin.handles.checkCollisions({ word, kind })` lists every account whose handle matches, with page status, followers, pool and last sign in. The Add word sheet runs it before saving (section 7.3, screen RA3). The launch audit is the same call run over the whole list: `pnpm --filter server handles:reserved-audit` prints it and changes nothing.
- **Notice flow (R1).** For each colliding account, the admin chooses one action:
  - **Keep and exempt.** The account keeps the handle. For an admin tier word this is an assignment. A system tier word cannot be exempted, because the route would hide the page.
  - **Start notice.** Accounts with no published page are renamed at once to the generated form (`pools` becomes `pools7319`) with no email. Accounts with a published page get the 14 day email with a one click "Choose a new link" button to Public URL. On day 14 the handle is renamed to the generated form if they have not chosen. The old URL redirects to the new one for 90 days through a `HandleRedirect` row, unless the old word is a live route.
- **Default.** System tier collisions default to Start notice. Admin tier collisions default to Keep and exempt (decision A2).
- **The job.** A sweeper (`setInterval` every 15 minutes with a Redis lock, the same pattern as `services/broadcast/index.ts`) sends due notices, runs due renames, removes expired holds and expired redirects, and writes an audit row for each.

## 6. UI (people choosing a handle)

Design boards cover the three surfaces where a person types a handle. One new status line, shared:

| State | Copy |
| --- | --- |
| Reserved | amped.bio/{handle} is reserved. Pick another. |

Shown on the register card (`HandleStatusLine.tsx`), Account > Public URL, and the publish sheet. Submit stays disabled, as it is for Taken. No suggestion list in this PR.

## 7. Admin interface

### 7.1 Where it lives

A new admin destination **Handles** at `/handles`, in the Access group beside OAuth clients (`shell/destinations.ts`), shortcut Cmd or Ctrl plus Alt plus H, not in the mobile dock. Icon: `AtSign`. Four tabs:

| Tab | What it shows |
| --- | --- |
| Reserved | Every reserved word and prefix, both tiers, with status |
| Holders | Accounts in the notice flow, with the day count |
| Redirects | Live `HandleRedirect` rows |
| Log | Audit rows for handle actions |

The Users slab gains two small changes: a `Reserved` WordBadge next to a handle that holds an assigned admin tier word, and a **Change handle** action in the row menu that opens the Assign sheet (RA5) for that user.

Built with the admin kit: `SlabTable`, `SearchWell`, `FilterChips`, `WordBadge`, `ConfirmDialog`, `undoToast`, phone width first (390) as the rest of the admin app.

### 7.2 Reserved tab

Search well (word or holder handle). Filter chips: All, System, Company, Trust, Brand, Partner, Hold, Assigned.

| Column | Content |
| --- | --- |
| Word | `amped` or `amped-` with a Prefix tag |
| Tier and category | `System` (lock icon) or the category |
| Status | Reserved, Assigned to @handle, Ends {date} for holds |
| Added | Admin handle and date; `Code` for the system tier |

System rows open a read only sheet: "Route and infrastructure word. Change it in code (`packages/constants/src/reservedHandles.ts`)." Admin rows open the word sheet (RA4) with Edit, Assign, Release.

A primary **Reserve a word** button sits in the top bar.

### 7.3 Reserve a word (RA2, RA3)

Fields:

| Field | Rule |
| --- | --- |
| Word | Normalized as typed. Must pass `HANDLE_REGEX` and `HANDLE_MIN_LENGTH`. Refused if already reserved in either tier |
| Match | Exact word, or Starts with (prefix). A prefix must be at least 3 characters and end in `-` or `_` |
| Category | Company, Trust, Brand, Partner, Hold |
| Reason | Required, 1 to 500 characters. Internal only |
| Ends on | Required for Hold, optional for Brand and Partner, not shown for Company and Trust |

On Continue the sheet runs `checkCollisions`. With no matches it saves. With matches it lists the accounts (first 20 and a count) and asks for the action per R1 and A2: Keep and exempt (assigns the word for an exact match; for a prefix, the account is marked exempt and keeps its handle) or Start 14 day notice. Save writes the row, the per account actions and one audit row each, in one transaction.

### 7.4 Word sheet (RA4)

Shows category, match, reason, who added it and when, the holder if assigned, and the last 5 log rows for the word. Actions:

- **Assign** (exact words only): opens RA5.
- **Edit**: category, reason, end date. The word and match cannot change; release and reserve again.
- **Unassign**: the account keeps its handle until it changes it, or the admin starts a notice. Choice in the confirm dialog.
- **Release**: removes the reservation. Confirm dialog states the result: "Anyone can claim amped.bio/{word} again." Undo toast for 10 s. A released assigned word stays with its holder as an ordinary handle.

### 7.5 Assign a reserved word (RA5)

Search for an account by handle, name or email. The sheet shows the account's current handle, the new one, and two options:

- Redirect the old handle to the new one for 90 days (default on).
- Notify the account by email (default on): "Your Amped.Bio link is now amped.bio/{word}."

Reason required. Assign runs `admin.handles.assign`, which sets the handle through the same service as `handle.redeem` (page cache, sitemap, OG cache refresh), bypassing only the reserved check for this word and this user.

An account can hold only one handle, so assigning moves it. A word can be assigned to only one account.

### 7.6 Holders tab (RA6)

One row per account in the notice flow: handle, word matched, page status, followers, state, deadline.

| State | Meaning | Actions |
| --- | --- | --- |
| Notice sent | Email sent, waiting | Resend email, Extend 7 days, Exempt, Rename now |
| Chose new | Account changed its handle | None; leaves the tab after 30 days |
| Renamed | Job renamed it on the deadline | Open redirect |
| Exempt | Admin kept the handle | Start notice |
| Failed | Email bounced or rename failed | Retry |

Exempt is offered only for admin tier words. Extend can be used twice per account.

### 7.7 Redirects tab (RA7)

Old handle, new handle, created, ends, hits in the last 30 days (counted in `HandleRedirect.hits`, incremented by the landing middleware). Action: End now. A redirect ends early if someone legitimately claims the old handle after it is released, so a released word never points at the previous holder.

### 7.8 Log tab (RA8)

`AdminAuditLog` rows where `action` starts with `handle.`: time, admin, action, word, target account, reason. Filter by action and admin. Export CSV for the visible range. Rows cannot be edited or deleted from the app.

### 7.9 Data model

```prisma
model ReservedHandle {
  id             Bytes     @id @db.Binary(16)              // UUIDv7
  word           String    @unique @db.VarChar(64)          // normalized
  kind           String    @db.VarChar(8)                   // exact | prefix
  category       String    @db.VarChar(16)                  // company | trust | brand | partner | hold
  reason         String    @db.VarChar(500)
  expiresAt      DateTime? @map("expires_at")
  assignedUserId Int?      @unique @map("assigned_user_id")
  createdById    Int       @map("created_by_id")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  assignedUser   User?     @relation("ReservedHandleAssignee", fields: [assignedUserId], references: [id], onDelete: SetNull)
  @@index([category])
  @@map("reserved_handles")
}

model HandleNotice {
  id               Bytes     @id @db.Binary(16)
  userId           Int       @map("user_id")
  reservedWord     String    @map("reserved_word") @db.VarChar(64)
  tier             String    @db.VarChar(8)                 // system | admin
  state            String    @db.VarChar(16)                // notice_sent | chose_new | renamed | exempt | failed
  oldHandle        String    @map("old_handle") @db.VarChar(64)
  deadline         DateTime?
  extensions       Int       @default(0)
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, reservedWord])
  @@index([state, deadline])
  @@map("handle_notices")
}

model HandleRedirect {
  oldHandle  String   @id @map("old_handle") @db.VarChar(64)
  userId     Int      @map("user_id")
  endsAt     DateTime @map("ends_at")
  hits       Int      @default(0)
  createdAt  DateTime @default(now()) @map("created_at")
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([endsAt])
  @@map("handle_redirects")
}

model AdminAuditLog {
  id           Bytes    @id @db.Binary(16)
  actorId      Int      @map("actor_id")
  action       String   @db.VarChar(48)                     // handle.reserve | handle.assign | handle.release | user.block ...
  targetUserId Int?     @map("target_user_id")
  subject      String?  @db.VarChar(64)                     // the word for handle actions
  reason       String?  @db.VarChar(500)
  before       Json?
  after        Json?
  createdAt    DateTime @default(now()) @map("created_at")
  @@index([action, createdAt])
  @@index([targetUserId])
  @@map("admin_audit_log")
}
```

`AdminAuditLog` is the same model the suspended pages spec needs. Whichever PR lands first adds it; the other reuses it. Audit rows keep `actorId` and `targetUserId` as plain integers with no foreign key, so a later account deletion does not remove the record.

### 7.10 API

All under `admin.handles`, `adminProcedure`, every mutation writes `AdminAuditLog`:

| Procedure | Kind | Notes |
| --- | --- | --- |
| `list({ filter, search, cursor, limit })` | query | Both tiers; system rows come from code, marked `tier: "system"` |
| `get({ id })` | query | Row, holder, last 5 log rows |
| `checkCollisions({ word, kind })` | query | Matching accounts, first 20 and a count |
| `reserve({ word, kind, category, reason, expiresAt?, holders: [{ userId, action }] })` | mutation | One transaction; bumps the cache version |
| `update({ id, category?, reason?, expiresAt? })` | mutation | Word and kind are fixed |
| `assign({ id, userId, reason, redirectOld, notify })` | mutation | Exact words only |
| `unassign({ id, reason, startNotice })` | mutation | |
| `release({ id, reason })` | mutation | Ends any redirect pointing at the released word's old holder |
| `holders.list({ state, cursor })` | query | |
| `holders.resend`, `holders.extend`, `holders.exempt`, `holders.renameNow`, `holders.startNotice` | mutations | Each takes `{ noticeId, reason }` |
| `redirects.list({ cursor })`, `redirects.end({ oldHandle, reason })` | query, mutation | |
| `log.list({ action?, actorId?, cursor })`, `log.export({ from, to })` | queries | |

Rate limits from the rate limiting spec apply as `*private` defaults.

## 8. Decisions

R1 to R4 were answered as recommended on 28 Oct and stand:

| Id | Question | Choice |
| --- | --- | --- |
| R1 | Existing holders with a live page | 14 day notice, rename, 90 day redirect |
| R2 | Brand and trust words | Reserve them |
| R3 | Prefixes | Reserve `amped-`, `amped_`, `admin-`, `support-` |
| R4 | Reserved or taken | Say reserved |

New in revision 2 (recommended first):

**A1. Where the list lives.** Recommended: two tiers. Route and infrastructure words in code and locked; company, trust, brand, partner and hold words in the database, managed in the admin app. Why: route words must ship with the route, so code is right for them; everything else needs to change without a deploy and be assignable. Alternatives: everything in code (revision 1; a deploy per brand and no assignment), or everything in the database (a route word could be released by mistake and hide a page).

**A2. Reserving a word someone already holds.** Recommended: the admin picks per account, with Keep and exempt as the default for admin tier words and Start notice as the default for system tier words. Why: taking a creator's handle is a moderation action and should be a deliberate choice; a route word has no choice. Alternative: always start the notice.

**A3. Who can manage reserved handles.** Recommended: the `admin` role only, for every read and write. Why: one role exists today and the tab holds partner names. Alternative: add a `support` role with read only access to the Reserved and Holders tabs.

**A4. Temporary holds.** Recommended: a Hold category with a required end date, for partners and creators in onboarding talks. Why: a word held for a deal should free itself if the deal ends. Alternative: permanent reservations only, released by hand.

**A5. Client visibility.** Recommended: ship only the system tier in the client; the admin tier stays on the server. Why: a reserved brand or partner name in the public bundle can disclose a deal before it is announced. Alternative: ship both tiers for instant feedback on every word.

**A6. Requests from brands and creators.** Recommended: no in app request flow in this build; a brand asks through a Freshdesk support ticket and an admin assigns. Why: volume is low and identity checks for brands belong with #7 Brand portal. Alternative: a "Request this handle" link on the Reserved status line.

## 9. Build

| PR | Branch | Scope | Size |
| --- | --- | --- | --- |
| RH1 | `fix/reserved-handles` | System tier constants, `matchReserved` (system tier only, admin tier stubbed empty), `assertHandleAllowed`, sign up and generator checks, Reserved status line on the three surfaces, route guard test | 0.5 day |
| RH2 | `feat/reserved-handles-admin-api` | Migration (four models, seed rows), admin tier in `matchReserved` with the cache, `admin.handles` router, notice and redirect sweeper, landing redirect middleware, emails, tests. Labeled `migration` | 2 days |
| RH3 | `feat/reserved-handles-admin-ui` | Handles destination with four tabs, sheets RA2 to RA5, Users slab badge and Change handle action | 1.5 days |

RH1 can ship alone and closes the sign up gap. RH2 must land before any route on the board ships, because the notice flow runs from it. The launch audit runs on staging after RH2.

## 10. Acceptance

1. `checkAvailability` returns reserved for every word and prefix in both tiers, in any case, and the response does not reveal the tier or category.
2. Register, Public URL and the publish sheet show the Reserved line and keep submit disabled.
3. A direct Better Auth sign up call with `handle: "admin"` or `handle: "A B"` is refused with INVALID_HANDLE.
4. Google sign up with a reserved handle in the state creates the account with a generated handle.
5. `processEmailToUniqueHandle("support@example.com")` never returns `support`.
6. The audit script lists collisions and changes nothing.
7. A unit test fails if a new top level folder appears in `apps/landingpage/src/app` without a matching system tier entry.
8. A word reserved in the admin app is refused on register within 5 s on every API instance, with no deploy.
9. A system tier word cannot be released, edited or assigned through any `admin.handles` call.
10. Assigning `amped` to the company account lets that account publish at amped.bio/amped; every other account still gets Reserved. Releasing it leaves the company account on `amped`.
11. Reserving a word that an account holds shows that account before save; Start notice sends the email, and on day 14 the sweeper renames the handle and creates a 90 day redirect.
12. A hold past its end date stops matching and writes one `handle.hold_expired` audit row.
13. Every admin mutation writes exactly one audit row with actor, word, target and reason. Audit rows survive deletion of the target account.
14. The admin tier never appears in any client bundle or public response.
15. A non admin calling any `admin.handles` procedure gets FORBIDDEN.
16. Typecheck, build and tests pass. Copy has no em or en dashes.

## 11. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| Which account holds `amped` (the company page), and is it created before RH2 seeds the list? | Rob | RH2 seed |
| Any brand or partner words to reserve at launch (for example names in active partnership talks)? | Rob | No; added in the app |
| Does #28 R1 (Safety admin) land `AdminAuditLog` first? | Gustavo | No |
