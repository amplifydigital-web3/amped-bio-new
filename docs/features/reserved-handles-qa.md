# Reserved handles Full QA

Build Board D2, Step 1 priority 5. Date 28 Oct 2026. Baseline `development` at a3ce333.
Spec: `docs/features/reserved-handles.md`, revision 2 with the QA edits applied. Admin boards: Reserved handles admin, https://claude.ai/artifact/MvT99NKcyF3aeC4XopgjRZ (version 3).

Full QA is the last design check before handoff to development. Two independent reviewers, who did not write the spec or draw the boards, ran the same checklist: spec completeness, decisions, repo rules (`AGENTS.md`), security and abuse, design against Prism 2.2 and the shipped admin kit, accessibility (axe-core, 44 targets, measured contrast, type floor, reflow at 320 and 200 percent text, light and dark), copy and compliance, and edge cases. The spec and code reviewer checked every path in today's code that sets or checks a handle. The design reviewer measured the boards in Chromium and redrew them.

## Verdicts

| Review | Verdict before fixes | After fixes |
| --- | --- | --- |
| Spec and code | Fail, 4 blockers | Pass with fixes, 2 decisions for Rob |
| Design and accessibility | Pass with fixes, 5 majors | Pass |

48 spec edits are applied: 34 from the spec review and 14 from the design review, with 5 overlaps merged by hand.

## Blockers found and fixed in the spec

1. **Sign up runs in `apps/auth-server`, which revision 2 never named.** It has its own Better Auth instance, create hook, session backfill and handle generator, and no Redis. The matcher now lives in `packages/constants`; the auth server reads `reserved_handles` directly at sign up; RH1 covers both servers.
2. **Better Auth update user accepts any handle.** `handle` is an `additionalFields` entry without `input: false` on both servers, with no update hook. This is open in production today (see below).
3. **`HandleRedirect` used a string primary key.** Now `id Bytes @id @db.Binary(16)` with `oldHandle` unique, per `AGENTS.md`.
4. **Generated handles stayed under a reserved prefix.** `amped-joe` became `amped-joe7319`; a fan named "Amped Support" became `amped-support-4821`. The generators now check the final handle and strip a matched prefix.

## Live issue outside this feature

Any signed in account can call Better Auth's update user endpoint on auth.amped.bio with `{ handle: "..." }` and set any handle. It skips the regex, the taken check and every reserved check. Only the unique index stops a duplicate. No client calls the endpoint today, so the fix breaks nothing: set `input: false` on `handle` in `apps/server/src/utils/auth.ts` (line 474) and `apps/auth-server/src/utils/auth.ts` (line 345), and add a `user.update.before` hook that refuses a `handle` change. Confirm with one call on staging first. Added to the Build Board as a P0 fix.

## Majors fixed in the spec

- `User` back relations added for the three new relations. `actorId` and `createdById` are nullable so seeds and the sweeper can write audit rows. String columns became enums, as the schema does elsewhere.
- Prefix guard: a prefix needs at least 3 letters or digits before its `-` or `_`. A prefix that matches more than 200 accounts is refused as too broad. Above 20 matches the sheet adds an **Action for all** choice. `_` is escaped in the MySQL `LIKE`.
- Separator variants now match: `admin_`, `-admin-` and `ad-min` all match `admin`.
- The redirect is defined: page level in `[handle]/page.tsx` through `handle.resolveRedirect`, HTTP 307, a live account on the handle wins, and a claim ends the redirect.
- Release has one definition: open notices close as `cancelled`, redirects stay, and Undo runs `admin.handles.restore` within 8 s, the admin default.
- `handle.redeem` refreshes no cache today, so the spec adds one `changeHandle` service that every path uses.
- The sweeper lock the spec cited does not exist. Each due notice is now claimed with a conditional `updateMany`, as the Telegram outbox does, so two instances never act on one row and Redis is not needed. The matcher cache reloads from the database every 60 s, so a Redis outage leaves at most 60 s of staleness.
- "Email bounced" had no source; Failed now means the send call failed.
- Retention for handle history and audit rows is added for the privacy notice.
- Admins cannot set an ordinary handle in this build. The Users slab action is **Give reserved word**, which picks from admin tier exact words.
- Unassign records the holder as Exempt so Holders can show it.
- No keyboard shortcut: Cmd plus Option plus H is Hide Others on macOS.

## Board fixes (design review)

- Every board redrawn in the shipped admin shell and kit: rail dock, top bar with Refresh, Open editor and avatar, Prism Tabs, 44 chips, WordBadge, SlabTable, Dialog as a bottom sheet on phone and a centered dialog on desktop, Menu.
- Reserve a word moved out of the top bar into the filter row, as New client on OAuth clients.
- Reserved status moved from danger red to ink. Release is the only danger button.
- New states drawn: loading, error, empty, no match (RA1e, RA1n, RA1x), reserve errors (RA2e, RA2f), 20+ collisions (RA3b), Release and Unassign confirms (RA4c to RA4f), Holders on phone (RA6m).
- Example brand name `linktree` replaced with made up names, since the project holds a Linktree partnership analysis.
- System chip count corrected to 49 (48 words and the `_` prefix).

| Measure (1280 and 320, light and dark, 100 and 200 percent text) | Before | After |
| --- | --- | --- |
| Controls under 44 by 44 | 97 of 118 | 44 of 414, all the shared Tabs trigger |
| Contrast failures | 0 | 0 |
| Screen text under 13 px | 51 | 0 |
| Page width at 320 | 324 and 376 | 320 and 320 |
| axe serious or critical | 2, board frame only | 0 |

## Needs Rob

- **A2, changed after QA.** Recommended now: Start notice is the default for system, company and trust words; Keep and exempt for brand, partner and hold words. Why: a creator who keeps `support` or `amped` is the impersonation R2 exists to stop. Alternative: revision 2's Keep and exempt for every admin word.
- **A5, changed after QA.** Recommended now: Partner and Hold words answer "taken", not "reserved". Why: `checkAvailability` answers one word at a time, so a "reserved" answer for a guessed partner name confirms the hold. "Taken" looks like any held handle. Company, Trust and Brand words still say reserved (R4). Alternative: say reserved for every admin word and accept that a guessed partner name can be confirmed.
- Open from revision 2: which account holds `amped`, and any launch brand or partner words.

## For Gustavo (outside this feature)

- Prism `TabsTrigger` is 43 high, under the 44 target (`packages/ui/src/prism/tabs.tsx`).
- Kit Button and Chip are `whitespace-nowrap` and overflow at 200 percent text on 320.
- The admin mobile dock needs 333 px for 5 items and has 294 at 320 wide.
- Fan sign up and Google state handling exist only in the `apps/server` Better Auth copy, not in `apps/auth-server`, which serves sign up.
- The account deletion spec holds a deleted handle in its own `ReleasedHandle` table that this matcher ignores. Recommended follow up: write a Hold row in `reserved_handles` instead.

## Full reports

Both reviewers' reports, with every finding and its evidence, are in the project doc `claude/amped-reserved-handles-qa-full-reports-2026-10-28.md`: spec and code (SP-01 to SP-28) and design and accessibility.
