# Batch 9b: Explore search, filter and sort (Screen Review 045)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

| Piece | File | Rule |
|---|---|---|
| Stack | `client/components/panels/explore/ExplorePanel.tsx` | Tabs (Users, Pools), then the search row (well, count, Sort), then the chips. The in content Explore heading and subtitle are gone; the top bar title is the only h1 (I03). NFTs is not rendered (D07) |
| URL | same | `?tab=users\|pools`, plus the active tab's `?q=`, `?filter=` and `?sort=` (defaults are left out). Legacy `?t=` is rewritten. `?pool=` still opens the Pools tab and the pool panel (D27) |
| Per tab state | same | Each tab keeps its own query, filter and sort. Switching tabs shows that tab's own query in the field |
| Search | same | G2 well 44 with a 21 search icon, hidden label, placeholders "Search people by name or @handle" and "Search pools or creators". 300ms debounce. Clear (44 icon button) and Escape clear it |
| Count | same, `components/PoolsTab.tsx`, `components/UsersTab.tsx` | "342 people" or "6 pools", aria-live polite. While a new query loads the results stay on screen and the count reads Searching |
| Sort | same | Desktop: secondary lens "Sort: <current>" opening the Prism menu, check on the current option. Mobile: a 44 icon button opening the options in a bottom sheet. Pools: Most backed (default), Most staked, Newest, Name A to Z, Name Z to A. Users: Newest (default), Name A to Z, Name Z to A |
| Chips | same | Prism ChipGroup (radiogroup). Users: All, Has a pool. Pools: All, 10+ fans, 10,000+ tREVO staked, No fans yet. Mobile: one line that scrolls |
| No results | `PoolsTab.tsx`, `UsersTab.tsx` | Clear search and Clear filter ghost buttons, each only when its control is set (I13) |

## Not in this PR

- Active this week (I07) is not offered until `user.getUsers` applies the active-7-days filter on the server.
- Searching by pool name (I11) needs `fan.getPools` to include the pool name. Server change for Gustavo.
- The user and pool result cards themselves are rows 042 and 043.
