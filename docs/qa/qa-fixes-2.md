# QA fixes 2: editor fixes

Source: Amped.Bio staging QA, 5 and 6 Oct 2026. Tracker IDs are QA-xxx.
One commit per item, so each can be reviewed or reverted alone. Editor app and `@repo/ui` only, no server changes.

| QA | Area | Change | Files | How to check |
|---|---|---|---|---|
| QA-003 | Shell | Announcement notice opens at once in a hidden tab or under reduced motion; the clip stays until the row has opened | `Banner.tsx` | Load the editor in a background tab, switch to it: the notice is open, nothing overlaps |
| QA-011 | Pools | Prism pool cards fall back to the trophy tile when the image fails | `packages/ui/src/prism/pool-card.tsx` | Explore Pools and /i/pools: no alt text or broken image icons |
| QA-028 | Explore | Explore Pools uses `PoolCardMedium` (as the public directory); whole card opens the pool panel | `PoolsTab.tsx`, `PoolSkeleton.tsx` | Explore, Pools: Prism cards with fans and total staked |
| QA-012 | Pools | SidePanel ignores Escape while a Radix menu, select or popover is open | `packages/ui/src/prism/flow.tsx` | Pool panel, More actions, Escape: menu closes, panel stays |
| QA-036 | Page | Escape in the Creator pool search closes the results, not the block row | `PoolSearchInput.tsx` | New Creator pool block, type, Escape: results close, draft stays |
| QA-016 | Fan graph | People list cursor is tied to the search and filter | `PeoplePanel.tsx` | Show more, then clear the search: only the first page of the new query |
| QA-017 | Fan graph | Remove restarts from page 1, pages never repeat a person, removed people stay out until Undo | `PeoplePanel.tsx` | Show more, Remove a follower: no duplicate rows |
| QA-026 | Wallet | Legacy summary tiles use the app network unit (tREVO) | `MyWalletPanel.tsx` | Wallet: Total tREVO, My Stake in tREVO |

## Root cause notes

- QA-012: `@radix-ui/react-dialog` 1.1.14 and `@radix-ui/react-dropdown-menu` 2.1.12 resolve to different copies of `react-dismissable-layer` (1.1.10 and 1.1.7). Each copy keeps its own layer stack, so the dialog and the menu both close on one Escape. A lasting fix is to dedupe the Radix packages in the lockfile.
- QA-003: requestAnimationFrame does not run in a hidden tab while timers do, so the 300 ms settle timer opened the overflow while the row was still at 0 height.
- QA-036: the search handled Escape but let it bubble to the block row, which collapsed. Collapsing an empty draft removes it by design (037 I14).

## Scope notes

- QA-024 (preview frame) is not here. It waits for Rob's call on the desktop preview approach and moves to PR 3.
- QA-027 was in this PR and is reverted: #278 (Prism 14b) builds the full row 042 Users tab and changes the same three files. QA-027 ships with #278.
- QA-026 is interim. Rows 049 and 050 replace the tiles.

## Verification

- Typecheck: client, admin, landing, server, ui pass; `tsc -b` in apps/client clean. `@repo/auth-server` fails at `apps/auth-server/src/utils/auth.ts:229` on `development` 63b7b288 itself (the extended Prisma client is passed where `PrismaClient` is expected). 787dd0d2 and 63b7b288 fixed the same call in apps/server only. Not touched here.
- Client build passes. eslint on changed files: no new warnings (MyWalletPanel keeps its 3 existing warnings).
- No screenshots in this PR. Check each row on staging with the table above after deploy.
