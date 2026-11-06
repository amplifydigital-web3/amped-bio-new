# FL-3: Fan Library page (destination, Your creators, search, filter, item menu)

Branch `feat/library-page` into `development`. Fan Library plan FL-3 (Build Board #26), spec `docs/features/fan-library.md` sections 2.2, 3.1, 3.5 and 3.6. Screen Review rows 124, 180 and 183. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-04.

**Merge order.** This branch is stacked on FL-1 (#451, the phone player) and FL-2 (#453, the library API and its migration). Merge #451 and #453 first; this PR's diff then shrinks to the FL-3 files below. No new migration here.

**Behind `fanLibrary`** (site flag, default off). With the flag off the rail has no Library, `/library` lands on Home, and every library call answers "The Library is not available yet."

## 1. What ships

| Area          | Files                                                                                                                                                                                                                                      | Board         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Destination   | `types/editor.ts` (`library` panel), `shell/destinations.ts` (Start after Explore, flag `fanLibrary`, title, rail item), `Layout.tsx` (panel case, restyled list)                                                                          | CT-D1, CK-D4  |
| Routing       | `App.tsx` (`/library/*`), `pages/Editor.tsx` (keeps Library sub paths), `panels/library/paths.ts`                                                                                                                                          | spec 3.5      |
| Library page  | `panels/library/LibraryHome.tsx`: header (Search, Filter, Inbox), Continue, Saved tile, Your creators (first five), Newest with Show more. Desktop puts Your creators and Saved in a side column                                           | m1, d1, fl-q1 |
| Filter sheet  | `panels/library/FilterSheet.tsx`: Type and How you have it, kept in the URL, one removable chip                                                                                                                                            | m1            |
| Search        | `panels/library/LibrarySearch.tsx` at `/library/search`: scope chips, results grouped by creator, recent searches, no results state                                                                                                        | m2, fl-q7     |
| Your creators | `panels/library/YourCreators.tsx` at `/library/creators`: avatar ring, how connected, past due or new count, `TESTNET_NOTICE` under a pool row                                                                                             | m3, fl-q12-d2 |
| Saved         | `panels/library/SavedPage.tsx` at `/library/saved`                                                                                                                                                                                         | m1            |
| Item view     | `panels/library/ItemView.tsx` at `/library/@handle/c/{publicId}`: video and audio in the shared player with Save, chapters and Up next from the same creator; photos in the photo viewer; documents and files link to the public item page | m6, m7, m8    |
| Item menu     | `panels/library/ItemMenu.tsx`: Play next, Add to queue, Save or Remove from Saved, Mark as watched, Go to the creator's section, Remove from Continue                                                                                      | m10           |
| States        | empty (Go to Explore), filtered empty, loading skeletons after 400 ms, error with Try again, offline                                                                                                                                       | m12           |
| Mini player   | `player/EditorPlayer.tsx`: a Library item expands back into its Library view                                                                                                                                                               | FL-1          |
| Server        | `library.markWatched`, `library.removeFromContinue` in `trpc/library.ts` and `services/library/library.ts`                                                                                                                                 | spec 3.6      |

## 2. Choices made in the build

1. **Remove from Continue forgets the position.** It deletes the fan's `viewer_progress` row for that item, so the item leaves Continue and plays from the start next time. No new column.
2. **Mark as watched** sets `completed` with the position at the item's length. Only items the fan can open; anything else is not found.
3. **`/library/@handle` opens the creator's public page** in this PR. FL-4 (stacked on this branch) replaces it with the creator section.
4. **Documents and files open on the public item page**, which has the PDF viewer, search in document and Download from FL-1. Video, audio and photos open in the app.
5. **Free** in the filter asks for `source: public`. Followers only items do not exist until C8 ships the rule picker; FL-6 widens Free to followers and public together.
6. **Not in FL-3**, by plan: Downloads and On this device (FL-5), the Memberships row (FL-7), the long press on items (the more button carries the same menu, so every action already has a button), and Report inside the app item view (Report stays on the public item page).
7. **Saved state on the item view** comes from the list the fan opened it from, then follows the Save button. Opening an item from a link starts unsaved until tapped; a later small `library.item` read can fix that.
8. **Recent searches** stay in this browser, per account, eight at most, and survive blocked storage.

## 3. Checks run

- Typecheck: client and server pass.
- Builds: client and server pass.
- Tests:
  - Client: 293 of 293, including 16 new in `panels/library/library.test.tsx` (flag and rail order, dock and More, sub paths, labels, player owner, filter, page states, testnet line, copy scan for dashes and money words).
  - Server: 1,298 of 1,298 outside the OAuth suites, including 4 new in `library.test.ts` (mark watched, refusal, remove from Continue, flag). The OAuth end to end suites need a live Redis and fail the same way on `development` in this sandbox.
- `oxlint` on the new files: no errors.

## 4. Staging check for Gustavo

1. Merge #451 and #453, run the FL-2 migration, turn on `fanLibrary`.
2. As a fan who follows a creator with public video:
   - The rail reads Home, Explore, Library, Inbox. On a phone Library is in More.
   - `/library` shows Newest with the creator's items, each naming the creator. Your creators shows the creator with a new count.
3. Open a video: it plays in the app with Save and Up next from the same creator. Play past 30 seconds, go back: Continue shows it with minutes left.
4. In the item menu: Save (the Saved tile counts it), Mark as watched (it leaves Continue), Remove from Continue, Play next and Add to queue (the queue sheet lists it).
5. Filter by Audio: Newest narrows, the chip shows Audio, and tapping the chip clears it.
6. Search a word from a title: results group under the creator; the term shows under Recent searches next time.
7. Swipe the mini player up on a phone: it opens the Library item view.
8. Turn `fanLibrary` off: Library leaves the rail and `/library` lands on Home.
