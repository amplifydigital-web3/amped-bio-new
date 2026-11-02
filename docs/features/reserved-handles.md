# Reserved handle list

Status: revision 2, 28 Oct 2026, for approval. Revision 1 (27 Oct) had R1 to R4, all answered as recommended on 28 Oct. Revision 2 adds the admin interface (section 7): the list moves to two tiers, a locked system tier in code and an admin managed tier in the database, with screens to reserve, assign and release words, run the holder notices from R1, and see redirects and the audit log. Changed sections: 3, 4, 5, 7 (new), 8, 9, 10, 11.
Full QA, 28 Oct 2026: two independent reviewers (spec and code; design and accessibility). 48 spec edits applied from their reports. Results: `docs/features/reserved-handles-qa.md`. A2 and A5 recommendations changed after QA and are open for Rob.
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
| Email sign up | Better Auth `additionalFields.handle`. Served by `apps/auth-server/src/utils/auth.ts` `databaseHooks.user.create.before` (line 261). `apps/server/src/utils/auth.ts` (line 353) holds a second copy | **Nothing.** Only the database unique index. A direct API call can set any string, including `Admin` or `a b` |
| Google sign up | `apps/server/src/utils/auth.ts` `readSocialSignUpState` (line 30). The auth server copy has no such step | Regex, length, unique |
| Better Auth update user | `/update-user` on auth.amped.bio. `handle` is an `additionalFields` entry without `input: false` in both instances (`apps/auth-server/src/utils/auth.ts` line 345, `apps/server/src/utils/auth.ts` line 474), and there is no `user.update.before` hook | **Nothing.** A signed in user can send any `handle` |
| Generated from email | `utils/onelink-generator.ts` `processEmailToUniqueHandle`, one copy in `apps/server` and one in `apps/auth-server` | Unique only. `support@gmail.com` becomes `support` |
| Fan handle | `apps/server/src/utils/onelink-generator.ts` `generateFanHandle` | Unique only. A fan named "Amped Support" gets `amped-support-4821` |
| Session backfill | `customSession` in both instances (`apps/server` line 134, `apps/auth-server` line 89) | Unique only |

Better Auth runs in two processes. `apps/auth-server` answers every sign up, social callback and `/update-user` call at auth.amped.bio (`apps/auth-server/src/services/API.ts` line 130; the landing auth client points there). `apps/server` builds its own instance only for `auth.api.getSession` and the OAuth admin calls, so its `customSession` runs on every API request but its `create.before` hook does not serve sign up. Every rule in section 4 goes into both files.

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

/** Lowercase, trimmed, no leading "@". Not named normalizeHandle: @repo/ui already exports one. */
export function handleKey(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

/** Exact rows compare this form: separators removed, so `admin_`, `-admin-` and `ad-min` match `admin`. */
export function handleSkeleton(handle: string): string {
  return handleKey(handle).replace(/[-_]/g, "");
}

/** Prefix rows compare this form: `_` reads as `-`, so `amped_x` matches `amped-`. */
export function handlePrefixForm(handle: string): string {
  return handleKey(handle).replace(/_/g, "-");
}

const SYSTEM_SKELETONS = new Set([...SYSTEM_RESERVED_HANDLES].map(handleSkeleton));

/** Client safe check. Covers the system tier only; the server adds the admin tier. */
export function isSystemReservedHandle(handle: string): boolean {
  const h = handleKey(handle);
  return SYSTEM_SKELETONS.has(handleSkeleton(h)) || SYSTEM_RESERVED_PREFIXES.some(p => h.startsWith(p));
}

/** The one rule, shared by apps/server and apps/auth-server. Rows come from `reserved_handles`. */
export function matchReservedIn(handle: string, rows: AdminReservedRow[], now: Date): ReservedMatch;
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

   It checks the system tier first, then the admin tier. Exact rows compare `handleSkeleton`; prefix rows compare `handlePrefixForm`. The pure rule is `matchReservedIn` in `packages/constants`, so `apps/server` and `apps/auth-server` cannot drift. In `apps/server` the admin rows are held in a process cache keyed by a version counter in Redis (`reserved_handles:version`). Every admin write bumps the version and reloads the writing instance at once; other instances poll the version every 5 s. Every instance also reloads from the database every 60 s whatever Redis says, so a Redis outage leaves at most 60 s of staleness. `apps/auth-server` has no Redis; its sign up hook reads `reserved_handles` directly, one indexed query per sign up. Any row past its `expiresAt` does not match, whatever its category.
2. **One validator.** `services/pageHandle.ts` `assertHandleAllowed(handle, userId?)`: regex, length, then `matchReserved`. A system match always throws. An admin match throws unless `assignedUserId === userId`, or the user has a `HandleNotice` in state `exempt` for that word whose `oldHandle` equals the handle (how a prefix exemption is kept). Message: `HANDLE_RESERVED_MESSAGE = "This handle is reserved"`. `assertHandleAvailable` calls it first.
3. **Availability.** `checkAvailability` returns `{ available: false, handle, reason: "reserved" }` for a reserved word, and `reason: "taken"` when another account holds it. Partner and Hold rows return `reason: "taken"` (decision A5). The account lookup always runs, so reserved and free words take the same time. The procedure gets a per IP limit through `enforceRateLimits` (60 a minute). The client maps `reserved` to a new `HandleStatus` value `Reserved`. The response never says which tier or category matched.
4. **Email sign up.** `databaseHooks.user.create.before` in `apps/auth-server/src/utils/auth.ts` (the instance that serves sign up) and in `apps/server/src/utils/auth.ts` (kept in step) validates a supplied handle with the same rules. A bad or reserved handle throws `APIError("BAD_REQUEST", { code: "INVALID_HANDLE" })`, which the register form already handles (`RegisterForm.test.tsx` line 175). This also closes the gap where a direct API call skips the regex.
5. **Google sign up.** `readSocialSignUpState` drops a reserved handle, so the account falls back to a generated one.
6. **Generated handles.** `generateUniqueHandle` and `generateFanHandle` treat a reserved result as taken and add the numeric suffix (`support` becomes `support4821`). The check runs on the final handle, not the base. The base is first lowercased and cut to `HANDLE_REGEX` characters. A base that matches a prefix row or the `_` system prefix loses that prefix and any leading `-` or `_` before the suffix is added (`amped-joe` becomes `joe4821`, `_foo` becomes `foo4821`). If what remains is shorter than `HANDLE_MIN_LENGTH` or still reserved, the base becomes `user`. The same function makes the rename target in section 5. Both copies of `onelink-generator.ts` change.
7. **Admin.** Assigning, reserving and releasing run through `admin.handles` (section 7.10). Every write is audited.
8. **Better Auth update user.** A `databaseHooks.user.update.before` hook in both instances refuses any `handle` in the update data with `APIError("BAD_REQUEST", { code: "INVALID_HANDLE" })`. Handle changes go through `handle.redeem` only. No client calls `updateUser` today.
9. **Session backfill.** `customSession` in both instances uses the generator in item 6.
10. **Every handle write.** `handle.redeem`, `publishPage`, `admin.handles.assign`, `holders.renameNow` and the sweeper set a handle through one `changeHandle` (section 7.5).

## 5. Accounts that already hold a word

Revision 1 ran a one time script. Revision 2 runs the same check inside the admin app, because a newly reserved word can collide at any time, not only at launch.

- **Collision check.** `admin.handles.checkCollisions({ word, kind })` lists every account whose handle matches, with page status, followers, pool and last sign in. It uses the same folded forms as `matchReserved`. It filters in code or escapes `_` and `%` before any MySQL `LIKE`; a raw `amped_%` pattern also matches `ampedbio`. The Add word sheet runs it before saving (section 7.3, screen RA3). The launch audit is the same call run over the whole list: `pnpm --filter server handles:reserved-audit` prints it and changes nothing.
- **Notice flow (R1).** For each colliding account, the admin chooses one action:
  - **Keep and exempt.** The account keeps the handle. For an admin tier word this is an assignment. A system tier word cannot be exempted, because the route would hide the page.
  - **Start notice.** Accounts with no published page are renamed at once to the generated form (`pools` becomes `pools7319`) with no email. Accounts with a published page get the 14 day email with a one click "Choose a new link" button to Public URL. On day 14 the handle is renamed to the generated form if they have not chosen. Every rename, published or not, writes a 90 day `HandleRedirect` row. A live route always wins over it in Next.js, so the sweeper ends redirects whose old word has become a route.
- **Default.** System, Company and Trust collisions default to Start notice. Brand, Partner and Hold collisions default to Keep and exempt (decision A2). The migration seeds rows and touches no account. RH2 does not reach production until the launch audit has a recorded action for every seed collision.
- **The job.** A sweeper (`setInterval` every 15 minutes, started like `startBroadcastSweeper` in `services/broadcast/index.ts`) sends due notices, runs due renames, removes expired rows and expired redirects, and writes an audit row for each with `actorId` null. It claims each due `HandleNotice` with a conditional `updateMany`, the same lock the Telegram outbox uses (`services/telegram/loop.ts` line 110). Two instances never act on one row, and Redis is not needed. Before a rename it checks again that the word is still reserved and the account still holds `oldHandle`. If the account moved, the notice closes as `chose_new`. If the word was released, it closes as `cancelled`.

## 6. UI (people choosing a handle)

Design boards cover the three surfaces where a person types a handle. One new status line, shared:

| State | Copy |
| --- | --- |
| Reserved | amped.bio/{handle} is reserved. Pick another. |

Shown on the register card (`HandleStatusLine.tsx`), Account > Public URL, and the publish sheet. Submit stays disabled, as it is for Taken. No suggestion list in this PR.

## 7. Admin interface

### 7.1 Where it lives

A new admin destination **Handles** at `/handles`, in the Access group after OAuth clients (`shell/destinations.ts`). No keyboard shortcut: Cmd plus Option plus H is Hide Others on macOS, so the page never sees it; Broadcasts and Telegram also have none. Not in the mobile dock, so it sits in the More sheet. Icon: `AtSign`. Four tabs, built with `Tabs` from `@repo/ui` (the list scrolls sideways inside itself on phone):

| Tab | What it shows |
| --- | --- |
| Reserved | Every reserved word and prefix, both tiers, with status |
| Holders | Accounts in the notice flow, with the day count |
| Redirects | Live `HandleRedirect` rows |
| Log | Audit rows for handle actions |

The Users slab gains two small changes: a `Reserved` WordBadge (nav tone) on the handle line of the Person cell for a handle that holds an assigned admin tier word, and a **Give reserved word** item (icon `AtSign`) in the row menu, after Block and before the separator and Copy user ID, that opens the Assign sheet (RA5) for that user, with the word picked from admin tier exact rows. Admins cannot set an ordinary handle in this build. `admin.users.getUsers` returns `assignedWord` for the badge. Edit stays the pencil button.

Every tab uses the kit's states: `SlabSkeletonRows` while loading; `SlabMessageRow` when empty ("No words match {search}.", "No accounts on notice.", "No live redirects.", "No handle actions yet."); `retryToast` on an API error. A signed in account without the admin role never reaches `/handles`: `ProtectedRoute` sends it to amped.bio, and the API answers FORBIDDEN.

Built with the admin kit: `SlabTable`, `SlabSkeletonRows`, `SearchWell`, `FilterChips`, `WordBadge`, `ConfirmDialog`, `undoToast`, `FieldError`, and from `@repo/ui` `Tabs`, `Dialog`, `Menu`, `EmptyState`, `ErrorCard`. Phone width first (390), as the rest of the admin app. Every sheet in this section is the shared `Dialog`: a bottom sheet below 640 wide, a 508 wide centered dialog above, with the close button and footer order of the kit (primary on top on phone, right aligned on desktop). Page actions sit in the page, never in the top bar; the top bar keeps the title, Refresh, Open editor and the avatar.

### 7.2 Reserved tab

Search well (word or holder handle). Filter chips: All, System, Company, Trust, Brand, Partner, Hold, Assigned.

| Column | Content |
| --- | --- |
| Word | `amped` or `amped-` with a Prefix tag |
| Tier and category | `System` (lock icon) or the category |
| Status | Reserved, Assigned to @handle, Ends {date} for holds |
| Added | Admin handle and date; `Code` for the system tier |

System rows open a read only sheet: "Route and infrastructure word. Change it in code (`packages/constants/src/reservedHandles.ts`)." Admin rows open the word sheet (RA4) with Edit, Assign, Release.

A **Reserve a word** button (secondary, `Plus` icon) ends the filter row, as New client does on OAuth clients. It is full width on phone.

The Word cell of each row is a button that opens the sheet, so rows work from the keyboard.

Badges: category in the nav tone; `System` in the ink tone with a lock; status Reserved in the ink tone, Assigned in success, Ends {date} in warning. Danger is not used for a status on this tab.

States:

| State | Shows |
| --- | --- |
| Loading | `SlabSkeletonRows` after 400 ms |
| Load failed | `ErrorCard` "Reserved words did not load", cause "The server did not answer. Check your connection, then try again.", Retry |
| All, no search | Never empty: system words always show |
| Category with no rows | `EmptyState` "No {category} words yet", one line, Reserve a word |
| Search with no match | `EmptyState` "No words match {query}", Clear search |

### 7.3 Reserve a word (RA2, RA3)

Fields:

| Field | Rule |
| --- | --- |
| Word | Normalized as typed. Must pass `HANDLE_REGEX` and `HANDLE_MIN_LENGTH`. Refused if already reserved in either tier. Errors show under the field as typed (`FieldError`): "{word} is already reserved. Open it from the Reserved tab to edit it.", "{word} is a system word, reserved in code." or "Use only a to z, 0 to 9, - and _." |
| Match | Exact word, or Starts with (prefix). A prefix ends in `-` or `_` and has at least 3 letters or digits before it (`amped-` passes, `ab-` fails). Error: "A prefix needs 3 or more letters or digits, then - or _." A prefix that matches more than 200 accounts is refused as too broad: "{word} matches {n} accounts. Reserve a narrower word." |
| Category | Company, Trust, Brand, Partner, Hold |
| Reason | Required, 1 to 500 characters. Internal only |
| Ends on | Required for Hold, optional for Brand and Partner, not shown for Company and Trust |

Match and Category are `ChipGroup` rows (44 chips). On Continue the sheet runs `checkCollisions`. With no matches it saves and shows the toast "Reserved {word}." With matches it lists every matching account (an exact word matches at most one account; a prefix up to 200, by the guard above) and asks for the action per R1 and A2: Keep and exempt (assigns the word for an exact match; for a prefix, a `HandleNotice` row in state `exempt` records it and the account keeps its handle) or Start 14 day notice. A prefix can match many: with more than 20 matches the sheet adds an **Action for all** choice (default per A2) above the per account choices for the first 20, and says how many accounts are not listed. Those accounts take the action for all. Save writes the row, the per account actions and one audit row each, in one transaction. The primary button reads "Reserve {word}"; Back returns to the form. `reserve` runs the collision query again inside the transaction and refuses with CONFLICT if the accounts differ from `holders`, so a handle claimed between Continue and Save is never skipped. A word already reserved by another admin meanwhile is refused with "amped.bio/{word} is already reserved."

### 7.4 Word sheet (RA4)

Shows category, match, reason, who added it and when, the holder if assigned, and the last 5 log rows for the word. Actions:

- **Assign** (exact words only): opens RA5.
- **Edit**: category, reason, end date. The word and match cannot change; release and reserve again.
- **Unassign**: confirm dialog "Unassign {word} from @{handle}?", body "{word} stays reserved. Choose what happens to @{handle}." Two choices: **Keep the handle** (default; the account keeps it, a `HandleNotice` in state `exempt` records it, and it shows as Exempt in Holders) or **Start 14 day notice**. Reason required. The button reads "Unassign {word}" and is not a danger button.
- **Release**: removes the reservation. Confirm dialog "Release {word}?" with a required reason; the danger button reads "Release {word}". The dialog states the result. Unassigned word: "Anyone can claim amped.bio/{word} again." Assigned word: "@{holder} keeps amped.bio/{word} as an ordinary handle. No one else can claim it while they hold it." Open notices for the word close as `cancelled`; those accounts get no email and keep their handle. Redirects stay until they end or someone claims the old handle (section 7.7). The Undo toast lasts 8 s, the admin default (`undoToast`), and calls `admin.handles.restore({ auditId })`, which rebuilds the row from the release audit row's `before`. Undo does not reopen closed notices. If an account claimed the word meanwhile, Undo fails with "Someone claimed amped.bio/{word}. Reserve it again to start a notice."

### 7.5 Assign a reserved word (RA5)

Search for an account by handle, name or email. The sheet shows the account's current handle, the new one, and two options:

- Redirect the old handle to the new one for 90 days (default on).
- Notify the account by email (default on): "Your Amped.Bio link is now amped.bio/{word}."

Reason required. Assign runs `admin.handles.assign`, which sets the handle through a new `changeHandle(tx, userId, handle, opts)` in `services/pageHandle.ts`. Today `handle.redeem` only updates the row and refreshes no cache (`trpc/handle.ts` lines 103 to 133). `changeHandle` runs `assertHandleAllowed` (on assign it bypasses only the reserved check for this word and this user), writes the handle, deletes any `HandleRedirect` whose `oldHandle` is the new handle, writes the optional redirect for the old one, and revalidates the landing profile tag for both handles through the internal revalidate route in the suspended pages spec.

An account can hold only one handle, so assigning moves it. A word can be assigned to only one account. If the assigned account later changes its handle through Public URL, the assignment ends in the same transaction (one `handle.unassign` audit row with `actorId` null) and the word stays reserved. `checkAvailability` is public and cannot tell the holder apart, so the holder cannot type the word back in; an admin assigns it again. Assign is refused while another account holds the word: "@{holder} holds amped.bio/{word}. Rename them or start a notice first."

### 7.6 Holders tab (RA6)

One row per account in the notice flow: handle, word matched, page status, followers, state, deadline.

| State | Meaning | Actions |
| --- | --- | --- |
| Notice sent | Email sent, waiting | Resend email, Extend 7 days, Exempt, Rename now |
| Chose new | Account changed its handle | None; leaves the tab after 30 days |
| Renamed | Job renamed it on the deadline | Open redirect |
| Exempt | Admin kept the handle | Start notice |
| Failed | The email send threw, or the rename threw. No bounce feed exists today | Retry: resends a failed email, renames again after a failed rename |
| Cancelled | The word was released before the deadline | None; leaves the tab after 30 days |

Exempt is offered only for admin tier words. Extend can be used twice per account.

Each row shows one action as a secondary button (Extend 7 days for Notice sent, Start notice for Exempt, Open redirect for Renamed, Retry for Failed) and the rest in the row menu. Rename now always sits in the menu. On phone the row opens a sheet with the same actions. Filter chips: Open (default: Notice sent and Failed), Notice sent, Exempt, Chose new, Renamed, Failed. With no rows: `EmptyState` "No accounts on notice".

### 7.7 Redirects tab (RA7)

Old handle, the account's current handle, created, ends, hits in the last 30 days (`HandleRedirect.hits`). Action: End now, a secondary button, with an undo toast for 8 s. With no rows: `EmptyState` "No live redirects".

How a redirect resolves:

- `apps/landingpage/src/app/[handle]/page.tsx` `resolveProfile` asks for the profile first. Only on `not_found` does it call a new public `handle.resolveRedirect({ handle })`. An account that holds the handle always wins. `src/proxy.ts` does not change.
- `resolveRedirect` returns `{ to }`, the account's current handle, or null. It returns null when `endsAt` has passed, when `to` equals the old handle, or when the account's page is not published. It adds one to `hits`. It is rate limited per IP like `checkAvailability`.
- The page answers with `redirect()`, HTTP 307. Never a permanent redirect: the redirect ends and the old word can be claimed again, and browsers keep a 308 for good. The page is `force-dynamic`, so no cache holds the 307.
- The row stores `userId`, not the new handle, so it follows the account through later renames. There are no chains and no loops.
- `changeHandle` deletes the redirect for a handle in the same transaction that gives the handle to an account. A redirect therefore ends the moment someone claims the old handle, including after a release.
- A suspended account's redirect still resolves; the target shows the suspended state from the suspended pages spec.

### 7.8 Log tab (RA8)

`AdminAuditLog` rows where `action` starts with `handle.`: time, admin, action, word, target account, reason. Filter by action (`FilterChips`: All, Reserve, Assign, Release, Notice, Hold ended) and by admin (a select). Sweeper rows show "System" as the admin. Export CSV for the visible range, a secondary button. Rows cannot be edited or deleted from the app.

### 7.9 Data model

```prisma
model ReservedHandle {
  id             Bytes     @id @db.Binary(16)              // UUIDv7
  word           String    @unique @db.VarChar(64)          // normalized
  kind           ReservedHandleKind
  category       ReservedHandleCategory
  reason         String    @db.VarChar(500)
  expiresAt      DateTime? @map("expires_at")
  assignedUserId Int?      @unique @map("assigned_user_id")
  createdById    Int?      @map("created_by_id")             // null: migration seed or a system job
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
  tier             ReservedTier
  state            HandleNoticeState
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
  id         Bytes    @id @db.Binary(16)                     // UUIDv7
  oldHandle  String   @unique @map("old_handle") @db.VarChar(64)
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
  actorId      Int?     @map("actor_id")                     // null: system (seed, sweeper, deletion job)
  action       String   @db.VarChar(48)                     // handle.reserve | handle.assign | handle.release | user.block ...
  targetUserId Int?     @map("target_user_id")
  subject      String?  @db.VarChar(64)                     // the word for handle actions
  reason       String?  @db.VarChar(500)
  before       Json?
  after        Json?
  createdAt    DateTime @default(now()) @map("created_at")
  @@index([action, createdAt])
  @@index([targetUserId])
  @@index([subject, createdAt])
  @@map("admin_audit_log")
}
```

```prisma
enum ReservedHandleKind {
  EXACT
  PREFIX
}

enum ReservedHandleCategory {
  COMPANY
  TRUST
  BRAND
  PARTNER
  HOLD
}

enum ReservedTier {
  SYSTEM
  ADMIN
}

enum HandleNoticeState {
  NOTICE_SENT
  CHOSE_NEW
  RENAMED
  EXEMPT
  FAILED
  CANCELLED
}
```

Prose in this spec uses the lower case names (`exempt`, `notice_sent`). The schema uses enums, as it already does for `PageStatus` and 22 others.

`User` gains three back relation fields. No existing `User` field uses these names:

```prisma
  reservedHandle  ReservedHandle? @relation("ReservedHandleAssignee")
  handleNotices   HandleNotice[]
  handleRedirects HandleRedirect[]
```

`VarChar(64)` columns need a maximum: add `HANDLE_MAX_LENGTH = 64` to `packages/constants/src/handle.ts` and to every handle schema. Today no maximum exists and `User.handle` is `VARCHAR(191)`. The launch audit lists handles longer than 64 before the migration runs.

`AdminAuditLog` is defined here, and this definition is the one to build. The suspended pages spec lists a subset of these columns and adopts this model as written. Whichever PR lands first adds it; the other reuses it. Audit rows keep `actorId` and `targetUserId` as plain integers with no foreign key, so a later account deletion does not remove the record. `actorId` null means the system.

Account deletion (D13 spec) holds a deleted handle for 90 days by writing a `ReservedHandle` row: category `HOLD`, reason "Deleted account", `expiresAt` 90 days on, `createdById` null. It skips the write when a row for the word already exists. This replaces the `ReleasedHandle` model in that spec, so one matcher covers every hold.

### 7.10 API

All under `admin.handles`, `adminProcedure`, every mutation writes `AdminAuditLog`:

| Procedure | Kind | Notes |
| --- | --- | --- |
| `list({ filter, search, cursor, limit })` | query | Both tiers; system rows come from code, marked `tier: "system"` |
| `get({ id })` or `get({ word })` | query | Row, holder, last 5 log rows. System rows have no id; they are read by `word` and return the accounts on notice (RA4b) |
| `checkCollisions({ word, kind })` | query | The first 20 matching accounts and the total count; above 200 it returns `tooBroad: true` |
| `reserve({ word, kind, category, reason, expiresAt?, defaultAction, holders: [{ userId, action }] })` | mutation | One transaction; bumps the cache version. Matching accounts not in `holders` take `defaultAction` |
| `update({ id, category?, reason?, expiresAt? })` | mutation | Word and kind are fixed |
| `assign({ id, userId, reason, redirectOld, notify })` | mutation | Exact words only |
| `unassign({ id, reason, startNotice })` | mutation | |
| `release({ id, reason })` | mutation | Closes open notices for the word as `cancelled`. Leaves redirects alone (section 7.7) |
| `restore({ auditId })` | mutation | Undo for a release, within 8 s of it |
| `holders.list({ state, cursor })` | query | |
| `holders.resend`, `holders.extend`, `holders.exempt`, `holders.renameNow`, `holders.startNotice` | mutations | Each takes `{ noticeId, reason }` |
| `redirects.list({ cursor })`, `redirects.end({ oldHandle, reason })` | query, mutation | |
| `log.list({ action?, actorId?, cursor })`, `log.export({ from, to })` | queries | Export columns in section 7.11 |

Public, outside `admin.handles`: `handle.resolveRedirect({ handle })` (section 7.7).

Rate limits from the rate limiting spec apply as `*private` defaults.

### 7.11 Privacy

This build stores handle history linked to an account id (`HandleNotice.oldHandle`, `HandleRedirect`, audit `subject`, `before` and `after`) and admin reasons about accounts. Audit rows are moderation records, kept 5 years and then deleted, and they keep the handle text after the account closes. Notices and redirects are deleted 30 days after they end. Add both to the retention line in `docs/legal/privacy-parameters.md` and to section 5 of the account deletion spec, for counsel review with that spec's open question 1. The log export holds time, admin handle, action, word, target handle and reason. It holds no email and no `before` or `after` JSON.

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

**A2. Reserving a word someone already holds.** Recommended: the admin picks per account. Start notice is the default for system, company and trust words. Keep and exempt is the default for brand, partner and hold words. Why: taking a creator's handle is a moderation action and should be a deliberate choice; a route word has no choice; a creator who keeps `support` or `amped` is the impersonation R2 exists to stop. Alternative: Keep and exempt for every admin tier word, or always start the notice.

**A3. Who can manage reserved handles.** Recommended: the `admin` role only, for every read and write. Why: one role exists today and the tab holds partner names. Alternative: add a `support` role with read only access to the Reserved and Holders tabs.

**A4. Temporary holds.** Recommended: a Hold category with a required end date, for partners and creators in onboarding talks. Why: a word held for a deal should free itself if the deal ends. Alternative: permanent reservations only, released by hand.

**A5. Client visibility.** Recommended: ship only the system tier in the client; the admin tier stays on the server. Partner and Hold words answer `taken`, not `reserved`. Why: a list in the public bundle discloses every deal at once. `checkAvailability` still answers one word at a time, and the system tier is public, so a `reserved` answer for a word outside it shows that the admin tier holds it. A `taken` answer looks the same as any account that holds the handle without a public page, and fan accounts are many. Company, Trust and Brand words still say reserved (R4). Alternative: ship both tiers for instant feedback on every word, or answer `reserved` for every admin word and accept that a guessed partner name can be confirmed.

**A6. Requests from brands and creators.** Recommended: no in app request flow in this build; a brand asks through a Freshdesk support ticket and an admin assigns. Why: volume is low and identity checks for brands belong with #7 Brand portal. Alternative: a "Request this handle" link on the Reserved status line.

## 9. Build

| PR | Branch | Scope | Size |
| --- | --- | --- | --- |
| RH1 | `fix/reserved-handles` | System tier constants and `matchReservedIn` in `packages/constants`, `matchReserved` (system tier only, admin tier stubbed empty), `assertHandleAllowed`, `changeHandle`, sign up, update user, session backfill and generator checks in both `apps/server` and `apps/auth-server`, Reserved status line on the three surfaces, rate limit on `checkAvailability`, route guard test | 1 day |
| RH2 | `feat/reserved-handles-admin-api` | Migration (four models, or three if `AdminAuditLog` already exists; four enums; `User` back relations; seed rows), admin tier in `matchReserved` with the cache, `admin.handles` router, notice and redirect sweeper, `handle.resolveRedirect` and the redirect step in `[handle]/page.tsx`, emails, tests. Labeled `migration` | 2 days |
| RH3 | `feat/reserved-handles-admin-ui` | Handles destination with four tabs, sheets RA2 to RA5, Users slab badge and Give reserved word action | 1.5 days |

RH1 can ship alone and closes the sign up gap. RH2 must land before any route on the board ships, because the notice flow runs from it. The launch audit runs on staging after RH2.

## 10. Acceptance

1. `checkAvailability` returns `reserved` for every system, company, trust and brand word and prefix, and `taken` for partner and hold words. This holds in any case and with `-` or `_` added, removed or swapped (`admin_`, `-admin-`, `ad-min`, `amped_x`). The response does not reveal the tier or category.
2. Register, Public URL and the publish sheet show the Reserved line and keep submit disabled.
3. A direct sign up call to `apps/auth-server` (auth.amped.bio) with `handle: "admin"` or `handle: "A B"` is refused with INVALID_HANDLE. A signed in `/update-user` call with any `handle` is refused.
4. Google sign up with a reserved handle in the state creates the account with a generated handle.
5. In both copies of `onelink-generator.ts`, `processEmailToUniqueHandle("support@example.com")` never returns `support`, `processEmailToUniqueHandle("amped-joe@example.com")` returns a handle outside `amped-`, and `generateFanHandle("Amped Support")` returns a handle `matchReserved` does not match.
6. The audit script lists collisions and changes nothing.
7. A unit test fails if a new top level folder appears in `apps/landingpage/src/app` without a matching system tier entry.
8. A word reserved in the admin app is refused on register within 5 s on every API instance, with no deploy.
9. A system tier word cannot be released, edited or assigned through any `admin.handles` call.
10. Assigning `amped` to the company account lets that account publish at amped.bio/amped; every other account still gets Reserved. Releasing it leaves the company account on `amped`.
11. Reserving a word that an account holds shows that account before save; Start notice sends the email, and on day 14 the sweeper renames the handle and creates a 90 day redirect.
12. Any row past its end date stops matching at once. The sweeper deletes it and writes one `handle.expired` audit row with `actorId` null.
13. Every admin mutation writes one audit row per changed object (a reserve with three holders writes four), each with actor, word, target and reason. Sweeper rows have `actorId` null. Audit rows survive deletion of the target account.
14. The admin tier never appears as a list in any client bundle or public response. A partner or hold word answers exactly as a handle held by an account with no public page does, in body and in timing.
15. A signed in non admin calling any `admin.handles` procedure gets FORBIDDEN. A signed out caller gets UNAUTHORIZED.
16. Typecheck, build and tests pass. Copy has no em or en dashes.
17. An old handle with a live redirect answers HTTP 307 to the account's current handle. An account that holds the old handle is served instead. An ended redirect gives Page not found.
18. Claiming a handle that has a redirect deletes the redirect in the same transaction.
19. Releasing a word with an open notice closes the notice as `cancelled`; the sweeper never renames that account.
20. Reserve refuses a prefix that matches more than 200 accounts or has fewer than 3 letters or digits before its separator. Above 20 matches it shows Action for all.
21. Two sweepers on two instances never act on the same notice twice, with Redis up or down.
22. Assign is refused while another account holds the word.

## 11. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| Which account holds `amped` (the company page), and is it created before RH2 seeds the list? | Rob | RH2 seed |
| Any brand or partner words to reserve at launch (for example names in active partnership talks)? | Rob | No; added in the app |
| Does #28 R1 (Safety admin) land `AdminAuditLog` first? | Gustavo | No |
