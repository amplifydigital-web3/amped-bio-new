# Batch 16: Loading and auth check screens (Screen Review 081)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

## Rows

| Row | Screen | Result |
|---|---|---|
| 081 | Loading and auth check screens | Built, except I11 (see Not built) |

## What changed

| Piece | File | Rule |
|---|---|---|
| Shell skeleton | `client/components/shell/ShellSkeleton.tsx` | The room, the rail capsule at x 21 with 61 x 64 r27 shapes, the 55 top bar with a 20 x 144 title bar and a 44 circle, a content skeleton, and the preview frame on /page and /design (lg and up). Line token bars; no pulse under reduced motion. Visually hidden status Loading your editor; the container is aria-busy (I01, I03, I12) |
| Pending gate | `client/components/shell/ShellGate.tsx` | `ShellPending`: the room at once, the skeleton after 400ms, the timeout card after 10 s: We did not confirm your sign in, The server took too long to respond., Retry. The tab title reads Amped.Bio while loading (I01, I03, I08) |
| Error card | same, `ShellErrorCard` | G1 clear r21, 508 wide, centered on the room: danger icon, title, one line cause, Retry 55, Contact support (Help, D15), and Nothing was changed. Editing and autosave start once your page loads. Focus moves to the title (I07) |
| Auth gate | `client/components/ProtectedRoute.tsx` | The spinner and gradient are gone. Signed out goes to `/login?returnTo=<this URL>` (I02, I05) |
| Editor | `client/pages/Editor.tsx` | The You need to log in toast and the second redirect are gone; ProtectedRoute owns sign in. The profile load shows the pending gate; a failed load shows Your editor did not load with Retry. The tab title becomes `<Destination> · Amped.Bio` (I03, I06, I07) |
| Public paths | `client/App.tsx` | PublicSiteRedirect paints only the room while it leaves; signed out it passes returnTo (I04, I05) |
| Session ended | `client/components/shell/SessionEndedDialog.tsx`, `client/contexts/unsavedEdits.ts`, `client/contexts/EditorContext.tsx` | Any 401 during a session (React Query query or mutation, or an autosave) opens Your session ended on the shared Dialog with Sign in. Edits not stored yet are kept in this tab's sessionStorage when it opens, and the body promises that only when they were kept. After sign in the editor loads the profile, puts the kept edits back (same account, within 12 hours) and autosave stores them. A session that ends without a 401 (the session read turns signed out) keeps the edits the same way before the redirect. `auth:token-expired` was never dispatched; `useTokenExpiration` is removed (I09) |
| Admin gate | `admin/src/ProtectedRoute.tsx` | The room, the admin shell skeleton (rail, top bar, slab of 44 rows) after 400ms, the timeout card after 10 s, returnTo on sign in. A non admin account leaves for amped.bio before any admin chrome renders (I10) |
| Sign in return | `landingpage/src/lib/panel.ts`, `landingpage/.env.*`, `SignInForm.tsx` | `getSafeRedirect` also accepts the admin origin (`NEXT_PUBLIC_ADMIN_URL`). The sign in card reads Sign in to open your editor. when it carries a safe return address (I05, I06) |

## Instruction coverage

| Id | Where |
|---|---|
| I01 | `ShellPending`, `ShellSkeleton` |
| I02 | Client and admin `ProtectedRoute`, `PublicSiteRedirect` |
| I03 | Hidden status, aria-busy, document titles |
| I04 | `PublicSiteRedirect` |
| I05 | `signInUrl`, admin gate, `getSafeRedirect` |
| I06 | Toast removed; sign in context line |
| I07 | `ShellErrorCard` in `Editor` |
| I08 | `ShellPending` timeout |
| I09 | `SessionEndedDialog`, `unsavedEdits.ts`, `EditorContext` |
| I10 | Admin `ProtectedRoute` |
| I12 | `motion-safe:animate-pulse` on every bar |

## Not built

- I11 (a Suspense fallback per lazy destination and tab, and Amped.Bio was updated with Reload on a failed chunk): Wallet's lazy sections are rewritten in #280, so this follows after #280 merges.

## Notes

- `NEXT_PUBLIC_ADMIN_URL` values: staging `https://admin.staging.amped.bio`, production `https://admin.amped.bio`, development `http://localhost:5174`. Confirm the production and development hosts.
- The auth context has no refetch, so Retry on the auth timeout reloads the page.
- The board's Unsaved changes row naming each field is not drawn; the body sentence carries it.
- Kept edits (display name, bio, photo URL, blocks, theme) stay in this browser tab's sessionStorage for at most 12 hours and are never sent anywhere else. Check against `docs/legal/privacy-parameters.md` before release.

## Waits

None. No file in #210, #225, #277, #279, #280, #281 or #282 is touched.

## How to test on staging

1. Open https://app.staging.amped.bio/page on a slow connection: the room, then the shell skeleton with the preview frame, then the editor. No spinner, no gradient.
2. Signed out, open https://app.staging.amped.bio/explore?pool=0x...: sign in reads Sign in to open your editor. and returns to the same URL.
3. Block `handle.getHandle` in DevTools and reload: Your editor did not load with Retry and Contact support.
4. Block every API call and reload: after 10 s, We did not confirm your sign in.
5. Signed in on /page, edit the bio, then sign out in another tab and make one more edit: Your session ended with the kept edits sentence (or straight to sign in, when the session read notices first). Sign in: the bio edit is back and saves.
6. Open https://admin.staging.amped.bio signed out: sign in, then back to admin. As a non admin: straight to amped.bio.

Screenshots are not included.
