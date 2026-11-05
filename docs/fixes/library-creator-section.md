# FL-4: Fan Library creator section (theme scope, status sheet, Yours)

Branch `feat/library-creator-section` into `development`. Fan Library plan FL-4 (Build Board #26), spec `docs/features/fan-library.md` sections 2.2 item 5, 3.2 and 3.5 Theme scope. Screen Review row 181. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-04.

**Merge order.** Stacked on FL-3 (`feat/library-page`), which is stacked on FL-1 (#451) and FL-2 (#453). Merge #451, #453 and FL-3 first; this PR's diff then shrinks to the FL-4 files below. No migration, no server change.

**Behind `fanLibrary`**, like the rest of the Library.

## 1. What ships

| Area            | Files                                                                                                                                                                                                                                                                | Board         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Theme scope     | `packages/ui/src/creator/section-scope.tsx`: `creatorSectionColors` (the contrast guard) and `CreatorSectionScope` (sets `--c-bg`, `--c-bg2`, `--c-surface`, `--c-ink`, `--c-muted`, `--c-line`, `--c-btn`, `--c-btnink`, the card text pair and both font families) | spec 3.2, 3.5 |
| Creator section | `apps/client/src/components/panels/library/CreatorSection.tsx` at `/library/@handle?seg=yours\|shop`: header in the name font, status line, Search this creator, Visit page, Continue for this creator, Yours and Shop, ownership line                               | m4, d4        |
| Status sheet    | same file: "{Creator} and you", the ownership line, Purchases when there are any, Following with Show me on the public list and Email me updates (On and Off in words), Unfollow with Undo                                                                           | fl-q2         |
| Library parts   | `ItemRow` and `ContinueCard` take the creator's card and button colors inside a section                                                                                                                                                                              | m4            |
| Routing         | `LibraryPanel.tsx`: `/library/@handle` renders the section instead of the FL-3 hand off to the public page                                                                                                                                                           | spec 3.5      |

## 2. How the look is applied

- **Source.** `library.creator` returns the still theme summary from FL-2: button and label, text, container, fonts, and the scene base as a color or gradient. Image, video and shader scenes send no base, so the container color stands in.
- **Contrast guard.** Page text needs 4.5:1 on the base, card text 4.5:1 on the container, the button label 4.5:1 on the button, secondary text 4.5:1 on its background. A failing pair takes the Graphite values for that pair (`#14161c`, `#1d2029`, `#f4f5f7`, `#b9bdc9`). A button whose own label fails first tries ink, then white, before Graphite.
- **Logging.** A fallback sends `library_theme_fallback` with the pair names only (`page`, `surface`, `button`, `muted`). No titles, no handle.
- **What stays Prism.** Rail, top bar, dock, the status sheet, the Filter sheet, menus, toasts and error states. Mixed screens keep the avatar ring, the 4 px accent and the button color only.
- **Fonts.** The catalog fonts already load with the app shell, so the section sets the families and loads nothing new.

## 3. Choices made in the build

1. **No connection sends the fan to the public page** (spec 3.2), with `window.location.assign`, once the header answers `connected: false`.
2. **Shop is an empty state** until FL-6 gives it items and unlock hints. The segment and its count are already live.
3. **Membership in the status sheet** (Manage, Receipts) is FL-7. Purchases shows a count when the header carries one.
4. **New content alerts** is FL-6 (a server setting in Amped Messages). The Following section has the two Follow settings that exist today.
5. **Unfollow** works like Explore: it unfollows at once, returns to the Library, and the toast offers Undo for 8 seconds, which restores the follow with its settings and date (QA-033).
6. **Toggles save at once** with the change shown before the server answers, and roll back with a toast on failure.
7. **Yours is newest first.** Grouping by course and collection arrives with bundles (C9, C10), as FL-2 notes.

## 4. Checks run

- Typecheck: client and landing pass. `@repo/ui` builds.
- Builds: client and landing pass.
- Tests:
  - Client: 299 of 299, including 6 new in `panels/library/creator-section.test.tsx` (look variables, no connection, fallback log, Shop empty, status sheet On and Off and `follow.update`, Unfollow with Undo).
  - `@repo/ui`: 94 of 94, including 7 new in `test/section-scope.test.tsx` (themes that read, label search on a light button, page fallback, gradient base, image scene, 4.5:1 on awkward themes, scope variables).
- Visual gate: the 390 and 1440 comparison against m4, d4 and fl-q2 runs on staging, in Graphite and one light creator theme (design QA section 55). No dev server was run.

## 5. Staging check for Gustavo

1. With FL-1, FL-2 and FL-3 merged and `fanLibrary` on, sign in as a fan who follows a creator with a light theme.
2. Open the creator from Your creators. The section shows their background, text, fonts and button color; the rail, top bar and dock stay Prism.
3. The status line reads Following. Tap it: the sheet reads "{Creator} and you" and "{Creator} owns this content." Turn Show me on the public list on: the creator's public followers list shows the fan.
4. Yours lists the creator's items newest first. Play one: the mini player continues when you leave.
5. Shop shows the empty state with a 0 count.
6. Open a creator with a low contrast theme (light text on a light background). The section falls back to Graphite for the page text.
7. Open `/library/@someone-you-do-not-follow`: the browser goes to their public page.
8. Unfollow from the sheet: you land on the Library with an Undo toast. Undo brings the section back.
