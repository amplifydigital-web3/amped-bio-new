# Fan Graph design QA

Build Board item #22. Spec: [fan-graph.md](fan-graph.md).

Date: 2026-10-03. Boards: fg1 to fg12 in the Board Screen Designs gallery (https://claude.ai/artifact/GKy9Lvcbg6zckkuDLHrYhv#fg). The PNGs are not in the repo; the connector cannot push binary files. Source of truth: Amped Prism 2.2 Balanced v1.0, locked. Method: the Screen Review element evaluation (job, function inventory, anatomy, five lenses, instructions with done-when checks, scores) applied to new screens, plus the automated Prism gate on every board.

Result: 12 of 12 boards pass the gate (37 of 37 across the gallery). 14 findings, all fixed in the boards. No S1 open. One recorded exception.

## 1. Elements, jobs and primary actions

| Element                                  | Job                                                    | Primary action               | Flags                     |
| ---------------------------------------- | ------------------------------------------------------ | ---------------------------- | ------------------------- |
| Frame capsule (fg1, fg2, fg8, fg9)       | Let a visitor follow the creator from any theme        | Follow                       | Creator rule (frame only) |
| First-follow sheet (fg3)                 | Tell the fan once what the creator sees, then follow   | Follow Maya Lin              | Privacy                   |
| Fan sign-up card (fg4)                   | Create an account that can follow, with no page        | Create account and follow    | Privacy                   |
| People, Followers (fg5, fg7, fg10, fg11) | Show a creator who follows them and let them act on it | Search and filter the list   | Privacy                   |
| Explore, Following (fg6, fg12)           | Let a fan see and control who they follow              | Change a per-creator setting | Privacy                   |

## 2. Function inventory (parity list)

Every capability in the spec has a place on a board.

| Capability                                         | Where                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Follow, signed in                                  | fg1, fg2                                                                                                     |
| Follow, signed out, then return                    | fg9 row 1, fg4                                                                                               |
| First-follow disclosure, two opt-ins               | fg3                                                                                                          |
| Unfollow, public list toggle, email updates toggle | fg8 (capsule menu), fg6 (per card)                                                                           |
| Undo after follow                                  | fg2 toast                                                                                                    |
| Pending follow until email confirmed               | fg9 row 3                                                                                                    |
| Under 10 shows New on Amped                        | fg9 row 2                                                                                                    |
| Count hidden by creator                            | fg9 row 4                                                                                                    |
| Owner sees Edit page, never Follow                 | fg9 row 5                                                                                                    |
| Blocked fan's follow fails with one line           | fg9 row 6                                                                                                    |
| Totals, sources, search, filters, list             | fg5, fg7                                                                                                     |
| Remove follower with Undo                          | fg11 toast                                                                                                   |
| Block follower with confirm                        | fg11 dialog                                                                                                  |
| Blocked accounts list                              | fg5 settings, Manage                                                                                         |
| Show my follower count setting                     | fg5, fg10                                                                                                    |
| Export CSV without emails                          | fg5 top bar, fg7 top bar                                                                                     |
| Empty states                                       | fg10 (creator), fg12 (fan)                                                                                   |
| Loading and error                                  | Built to the app-structure conventions (skeletons after 400ms, local error card with Retry). No board needed |

## 3. Findings and fixes

All fixed in the boards before this report.

| #   | Sev | Lens        | Board          | Instruction (done)                                                                  | Why                                                                                                          |
| --- | --- | ----------- | -------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | S2  | usability   | fg9            | Stack the count above the buttons on the 390 capsule, as fg2 does                   | Inline count pushed View pool past the capsule edge at 390                                                   |
| 2   | S2  | consistency | fg5, fg7, fg10 | Remove the Followers and Broadcasts tabs; show a Followers eyebrow. Title is People | D07: unreleased items are not rendered. Broadcasts arrive in phase 2, and one tab is not a tabs container    |
| 3   | S2  | consistency | fg6            | Remove the Creators and Pools chips inside Following                                | The pool watchlist is not built (D07)                                                                        |
| 4   | S2  | ease        | fg6            | Replace the "Email updates: on/off" button with a labeled checkbox                  | A toggle drawn as a button hides its state (Nielsen: visibility of status). Matches the public list checkbox |
| 5   | S2  | usability   | fg4            | Move "At least 8 characters" below the password field as helper text                | Forms convention: no placeholder doing a label's or helper's job                                             |
| 6   | S2  | function    | new fg8        | Draw the Following menu: public list, email updates, Unfollow                       | The capsule menu existed only in the spec                                                                    |
| 7   | S2  | function    | new fg9        | Draw capsule states: signed out, under 10, pending, count hidden, owner, blocked    | Six states were in the spec without a picture                                                                |
| 8   | S2  | function    | new fg10       | Draw the creator empty state with Copy page link                                    | Empty-state convention: never-had-data state with one next step                                              |
| 9   | S2  | function    | new fg11       | Draw the block confirm dialog and the remove Undo toast                             | Block is irreversible from the fan's side, so it confirms; remove uses Undo                                  |
| 10  | S2  | function    | new fg12       | Draw the fan empty state with Explore creators                                      | Same convention as 8                                                                                         |
| 11  | S3  | consistency | fg5, fg6       | Add the Help icon button to the desktop top bar                                     | D15                                                                                                          |
| 12  | S3  | consistency | fg5            | Remove Share your page from the top bar                                             | The top bar carries title, actions for the view, Help and avatar. Sharing lives in the empty state           |
| 13  | S3  | usability   | fg5, fg7       | Give every icon-only button an accessible name                                      | WCAG 4.1.2                                                                                                   |
| 14  | S3  | content     | fg5            | Drop "Reach followers with a broadcast" from settings                               | Broadcast to followers is phase 2 (D07)                                                                      |

## 4. Scores (1 to 5, after fixes)

| Element            | clarity | hierarchy | system | states | mobile | a11y | copy | trust |
| ------------------ | ------- | --------- | ------ | ------ | ------ | ---- | ---- | ----- |
| Frame capsule      | 5       | 5         | 4      | 5      | 5      | 4    | 5    | null  |
| First-follow sheet | 5       | 5         | 5      | 4      | 5      | 5    | 5    | null  |
| Fan sign-up        | 5       | 5         | 5      | 4      | 5      | 5    | 5    | null  |
| People, Followers  | 5       | 4         | 5      | 5      | 5      | 5    | 5    | null  |
| Explore, Following | 5       | 4         | 5      | 5      | 5      | 5    | 5    | null  |

Capsule system 4 and a11y 4: see the exception below.

## 5. Exception recorded

- **Follow in the capsule is 44 high, not 55.** Prism 8 sets primary actions at 55. The approved 039 capsule holds 44 buttons (View pool, Edit page) inside a 55 capsule, and Follow joins it. Done when: the capsule stays 55 and Follow keeps the primary fill. This keeps the frame compact on creator pages (section 17). No decision needed from Rob unless he wants a 55 Follow and a taller capsule.

## 6. Gate

Tokens, glass, rim, contrast (pixel sampled, 4.5:1 body, 3:1 large), 44 targets, trust, content (no earn, reward, points, tokens, perks, APY, APR, dashes on follow surfaces): pass on all 12 boards.

## 7. Build alignment (after the build, 2026-10-03)

The boards were updated to match approved patterns the build reuses:

- fg4: Continue with Google sits after Create account and follow, and the password helper is the register checklist, as on the approved Register card (008).
- fg5, fg7: Export CSV and the period select sit in the Followers header row, and the tiles use the Analytics tile anatomy (Figtree 26/33), as on Analytics (093).
- fg6, fg12: the first Explore tab keeps its current label, Users. Creators arrives with the Pool Explorer (#9).
- Built screens were checked against the boards in a local harness at 1440 and 390 (mock API). Fixes from that pass: the first-follow sheet stacks label over value at 390; the follower list is a grid so names keep their width at 390; tile labels wrap instead of truncating; People sits on the room like Page and Design.
