# QA fixes 4: Explore navigation and the rail logo

Source: Amped.Bio staging QA, 7 Oct 2026 (Rob, app.staging.amped.bio at development 8fcb0ec). Tracker IDs are QA-xxx.
One commit per item. `apps/client` only. No server changes.

| QA | Area | Change | Files | How to check |
|---|---|---|---|---|
| QA-040 | Shell brand | The Amplify mark heads the desktop rail (55 slot above Home) and leads the mobile top bar, both as a Home link with a 44 target. | `assets/amplify-mark.svg`, `shell/BrandMark.tsx`, `shell/Rail.tsx`, `shell/TopBar.tsx` | Desktop: the four stripe mark sits at the top of the rail, 26 high; click it from any destination: `/home`. 390 wide: the mark leads the top bar at 22 high, before the title; tap: `/home`. Tab to it: the focus ring shows and the name reads Amped.Bio home. |
| QA-039 | Shell navigation | Explore in the rail, the mobile dock and every in app link now lands on `/explore?tab=users`. Before, it landed on `/home?tab=users` and showed Home. | `contexts/EditorContext.tsx` | Signed in on `/home`, click Explore in the rail: URL is `/explore?tab=users`, the Explore page shows, Explore carries the rail highlight. Same from the mobile More sheet at 390, and from Wallet > Stakes > Browse pools (`/explore?tab=pools`). Opening `/explore` directly, and Explore in a new tab (cmd click), already worked and still do. |

## QA-040 notes

- The mark is a vector traced from the brand render Rob supplied (four parallelograms, 2:1, shear 0.72; colors #0187E8, #5125DB, #AA10EE, and a #1F33F8 to #DC00FF gradient on the right stripe). The render had a navy background and shadows, so it could not be used as is on the light dock.
- The 55 slot above the Start group is the one `ShellSkeleton` already reserved (081), so the loading skeleton and the live rail now match.
- The public site header still uses `apps/landingpage/public/logo.svg` (mark plus wordmark). Not changed here.

## QA-039 root cause

`setActivePanelAndNavigate` did two updates: `setActivePanel(panel)` (editor context state) and `navigate("/explore", { replace: true })`. React Router 7 commits the new location inside `React.startTransition` (the v7 default), while the context update is a plain synchronous update. React commits the sync update first, so `Layout` mounts `ExplorePage` one render before the URL changes, while `useLocation()` still reports `/home`.

`ExplorePage` writes its active tab to the URL on mount with `setSearchParams(..., { replace: true })`. `setSearchParams` resolves `?tab=users` relative to the location the component rendered with, so it replaced the URL with `/home?tab=users`. The transition then committed `/explore`, the Explore effect's replace landed last, and the editor's URL sync effect set the active panel back to Home.

Sequence seen on staging with `history.replaceState` traced: `/explore` (navigate), then `/home?tab=users` (ExplorePage mount effect).

## QA-039 fix

Both updates run inside one `startTransition`, so they commit in the same render and `ExplorePage` first renders with `/explore` as its location. No change to `ExplorePage`; its URL write now resolves against the right path.

Explore was the only destination affected because it is the only one that writes search params on mount. Direct loads of `/explore` were fine because the location was already `/explore` when the page mounted.

## Verification

- Typecheck: `tsc --noEmit` in apps/client clean.
- Build: `vite build --mode staging` passes. eslint clean on the four shell files.
- QA-040: rendered the rail and mobile bar geometry with the SVG at 26 and 22 high in Chromium; the mark reads cleanly on the dock. Not checked inside the live app from this environment.
- Reproduced outside the app with a 40 line harness (react 18.3.1, react-router 7.11.0, jsdom): a shell that sets panel state and navigates, and a child that writes `?tab=users` on mount. Without the transition the URL ends at `/home?tab=users`; with it, `/explore?tab=users`.
- Not run against a live API from this environment. Check on staging with the table above after the deploy.
