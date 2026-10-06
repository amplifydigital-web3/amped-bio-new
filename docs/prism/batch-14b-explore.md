# Batch 14b: Explore Users and NFTs tabs (Screen Review 042, 044)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

## Rows

| Row | Screen | Result |
|---|---|---|
| 042 | Explore, Users tab | Built |
| 044 | Explore, NFTs tab | Built for flag off. The flag on tab (I05, I07) is not built: no NFT data exists yet |

## What changed

| Piece | File | Rule |
|---|---|---|
| Room | `client/components/Layout.tsx`, `panels/explore/ExplorePanel.tsx` | Explore joins the restyled destinations and sits on the room, not in the white card. Desktop content starts at x 131 under the top bar; at 390 the gutter is 21 (13 from the shell plus 8). Pools and Following sit on the room too |
| Grid | `panels/explore/components/UsersTab.tsx` | One column at 390 with 13 between cards. From `sm` up, `repeat(auto-fill, minmax(272px, 1fr))` with 21 gaps: four columns of 306 at 1440 (I01) |
| Person card | same, `PersonCard` | G1 clear r21, 189 high, padding 21. 55 avatar, 13 to its right the name 16/20 700 ink on one line and @handle 13/16 ink-2. Bio 13/16 ink-2, two lines, 13 below. 21 external link icon top right. No banner (I02, I04) |
| Link | same | The whole card is one anchor to the page, new tab, `rel="noopener noreferrer"`, aria-label "View @handle's page (opens in a new tab)". The View Profile button is gone. Hover ILLUMINATED (top highlight, 144ms), press REFRACTED (rim flash, 89ms), Prism focus ring; no shadow jump (I03) |
| Long names | same | Name truncates with a `title` tooltip and is the card's `aria-describedby`, so screen readers hear it in full (I11) |
| Avatar | same, `PersonAvatar` | 55 circle with a 1px line ring. No photo, or the photo fails (`onError`): the first letter of the name (else the handle) 20/23 700 nav-pressed on the lens thumb gradient (I05) |
| Bio | same, `user.getUsers` | Plain text from the server (`htmlToPlainText`, already in development), whitespace collapsed on render, no `dangerouslySetInnerHTML`. Empty bio renders nothing; the card keeps 189 (I06) |
| Show more | same | "Showing 20 of 342 people" 13/16 tabular ink-2, 13 above a centered Show more secondary lens 44 (full width at 390). It appends the next 20 of the same query, reads Loading and is disabled while appending, and is hidden once every result is shown. A new search, filter or sort starts again from the first page (I07) |
| Loading | `components/UserSkeleton.tsx` | Nothing before 400ms, then 8 skeleton cards 189 high on G1 clear with a 55 disc and two bars on line fill, in the same grid. No pulse under reduced motion (I08) |
| No results | `UsersTab.tsx` | EmptyState on a G1 clear card (max 610, centered): "No people match '{query}'", "Check the spelling or search by @handle.", Clear search; a filter only: "No people match this filter" with Clear filter (I09) |
| Error | same | ErrorCard (max 610): "People did not load", "Check your connection and retry.", Retry. The count beside Sort clears while it shows. A failed Show more shows the same card in place of the button and keeps the loaded cards (I09) |
| Search scope | `server/trpc/user.ts` | `user.getUsers` matches name or handle; a leading @ is stripped. The users table collation (utf8mb4_unicode_ci) makes the match case insensitive (I10) |
| NFTs | `ExplorePanel.tsx`, `vite-env.d.ts` | No NFTs tab, placeholder, sort options or NFT copy on Explore (they were already gone since 9b). `nfts` leaves the tab prop types. `?t=nfts` and `?tab=nfts` open Users and the URL is replaced with `?tab=users`. `VITE_SHOW_NFTS` (optional, default off) is declared as the gate (044 I01 to I04, I06) |
| Following | `ExplorePanel.tsx` | Untouched: still the third tab behind `VITE_FAN_GRAPH`, with search, chips and Sort hidden on it |

## Instruction coverage

### 042

| Id | Sev | Where |
|---|---|---|
| I01 | S2 | `UsersTab.tsx` `GRID`, `ExplorePanel.tsx` and `Layout.tsx` padding |
| I02 | S2 | `PersonCard` |
| I03 | S2 | `PersonCard` anchor, hover overlay, rim on press |
| I04 | S2 | Banner removed from `PersonCard` |
| I05 | S2 | `PersonAvatar` |
| I06 | S1 | Server plain text plus render as text; no `dangerouslySetInnerHTML` in the component |
| I07 | S2 | Count line and Show more in `UsersTab` |
| I08 | S2 | `UserSkeleton.tsx`, `useDelayed` in `UsersTab` |
| I09 | S2 | Empty and error branches in `UsersTab` |
| I10 | S2 | `user.getUsers` in `server/trpc/user.ts` |
| I11 | S3 | `title` and `aria-describedby` on the name |

### 044

| Id | Sev | Where |
|---|---|---|
| I01 | S2 | No NFTs tab in `ExplorePanel.tsx`; `VITE_SHOW_NFTS` declared in `vite-env.d.ts` |
| I02 | S2 | No placeholder markup anywhere in Explore |
| I03 | S3 | No NFT sort options |
| I04 | S2 | `readTab` maps nfts to Users; the URL effect replaces it with `?tab=users`; `nfts` dropped from the prop types |
| I06 | S2 | No NFT or trading copy on Explore |
| I05, I07 | S3 | Not built. They describe the tab once NFT data exists; there is no NFT procedure on the server |

## Parity

### 042

- [x] Browse members, 20 per request: grid plus Show more
- [x] Avatar, display name, @handle and bio on the card
- [x] Open a member's page in a new tab: the whole card
- [x] Reach every member: count plus Show more (or search)
- [x] Search, filter and sort: row 045 control bar, unchanged
- [x] Loading: 8 skeleton cards after 400ms
- [x] Empty: no results with Clear search or Clear filter
- [x] Hover: ILLUMINATED, no shadow jump
- [x] Avatar missing or failing: initial on the lens disc
- [x] Banner: removed
- [x] Request failed: People did not load with Retry
- [x] Long names and bios: ellipsis, full accessible name, two line bio
- [x] Keyboard focus: Prism focus ring on the card link
- [x] Pressed: REFRACTED rim flash

### 044

- [x] NFTs tab button: not rendered (flag off)
- [x] Coming Soon placeholder: deleted
- [x] NFT sort options: deleted
- [x] Deep link `?t=nfts`: lands on Users, URL `?tab=users`
- [x] Tab change: the tabs container writes `?tab=`

## Notes

- The Active this week chip stays hidden until `user.getUsers` applies the 7 day filter on the server (row 045 I07).
- There is no fade on the mobile chip scroller, so no label is dimmed (design QA S3).
- When the whole community has no published page and no search or filter is set, the tab reads "No people yet" with no action. That copy is not on a board.
- The Pools tab cards are still the pre Prism cards until row 043 is built; they now sit on the room.

## Waits

None. No file in #210, #225 or #277 is touched.

## How to test on staging

1. Open https://app.staging.amped.bio/explore. Desktop 1440: four cards per row, no banner, faces first.
2. Click a card: the creator page opens in a new tab. Tab through the grid: the cyan ring sits on each card.
3. Scroll down: "Showing 20 of N people" and Show more. Click it: 20 more cards are added below; the button is gone on the last page.
4. Search `@` plus a known handle: that member is found. Search `quill`: No people match 'quill' with Clear search.
5. Pick Has a pool with no matches: No people match this filter with Clear filter.
6. Throttle the network to offline and reload the tab: People did not load with Retry, no count beside Sort.
7. Open https://app.staging.amped.bio/explore?t=nfts and `?tab=nfts`: Users shows and the URL reads `?tab=users`.
8. With `VITE_FAN_GRAPH` on, Following is still the third tab.
9. At 390: one card per row, 21 gutter, Show more full width, nothing hidden behind the dock.

Screenshots are not included.
