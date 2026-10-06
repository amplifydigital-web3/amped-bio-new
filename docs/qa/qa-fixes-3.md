# QA fixes 3: public site

Source: Amped.Bio staging QA, 5 and 6 Oct 2026. Tracker IDs are QA-xxx.
One commit per item, so each can be reviewed or reverted alone. Mostly `apps/landingpage`, plus the page link helper and the editor preview in `apps/client`. No server changes.

| QA | Area | Change | Files | How to check |
|---|---|---|---|---|
| QA-010 | Public site | Pages render when browser storage is blocked; storage falls back to memory for the visit | `lib/storageGuard.ts`, `lib/installStorageGuard.ts`, `app/layout.tsx`, `providers/AppProviders.tsx` | Chrome, block all site data for staging.amped.bio, open /privacy, /i/pools, /register, a creator page: each renders |
| QA-023 | Header | Neutral slot until the session read settles; no Sign in flash for signed in visitors | `auth/UserMenu.tsx` | Signed in, open /i/pools/<address>: no Sign in before Open editor |
| QA-015 | Links | Analytics freshness link, Live Copy page link and the Creator pool block use the environment host; public site canonical falls back to `NEXT_PUBLIC_LANDINGPAGE_URL` | `shell/pageLink.ts`, `AnalyticsPanel.tsx`, `RealtimeCard.tsx`, `CreatorPoolBlock.tsx`, `lib/seo.ts` | Staging /analytics: link reads staging.amped.bio/rob; Copy page link copies it. View source on staging.amped.bio/rob: canonical is staging |
| QA-032 | Follow | A failed status read (network or 5xx) shows Follow disabled with Try again; `?follow=1` is removed after use | `follow/useFollow.ts`, `follow/FollowControls.tsx`, `ProfileView.tsx` | Block `follow.status` in DevTools, load a creator page: Follow and Try again. Open a page with `?follow=1` signed in: the param leaves the URL |
| QA-004 | Themes | Video backgrounds get the background thumbnail as poster and a dark backdrop until the first frame | `ProfileView.tsx`, `Preview.tsx` | Throttle to Slow 4G, open a video theme page: dark backdrop, no flat card |
| QA-024 | Editor preview | Phone 390 x 844 and Desktop 1440 x 900 devices scale to fit the frame, page scrolls inside; preview background stays put while scrolling | `preview/PreviewFrame.tsx`, `Preview.tsx` | /page at desktop width: Phone is a full device height; Desktop shows a whole 1440 x 900 screen, scrollable |

## Root cause notes

- QA-010: the MetaMask SDK, loaded through Web3Auth, reads `window.localStorage` at module scope. With storage blocked that read throws a SecurityError during import, and the whole app falls to the global error page. Our own storage calls were already guarded (consent, motion pause, follow intent). The guard runs inline in `<head>` before any chunk; AppProviders also runs it on import, because the not-found and error shells stream the layout head late. The inline copy avoids `typeof window`, which the server build folds to a constant and strips.
- QA-032: `refresh` set the status to null on any error, and `showFollow` needs a status. The auto follow effect rebuilt the query string from `params` without deleting `follow`.
- QA-024: Rob chose scale to fit (6 Oct). The frame is about 466 wide, so Desktop shows at about 0.32 scale; a full size Desktop view would need the modal option.

## Scope notes

- QA-029 needs no change. Rob picked Privacy Policy (30 Sep), and every visible label already reads Privacy Policy: public footer, creator page footer, follow sheet, the five email templates, and the /privacy title and heading. Only design docs still say Privacy Notice.
- QA-004 stays Won't fix for the S3 object (it streams correctly). This is the poster and backdrop follow up. The Cube Wall preset has no background thumbnail, so it gets the backdrop only; a 720p re-encode is still open.
- QA-023: the home page ClaimBar has the same signed out first paint. It is left as is, since the signed out claim field is what most visitors should see first.
- `ProfileView.tsx` is also edited by batch 12d. Land this first or rebase 12d; the changes here are the follow capsule (four lines) and the video backdrop.

## Verification

- Typecheck: `tsc -b` in apps/client and `tsc --noEmit` in apps/landingpage clean.
- Builds: client (`vite build --mode staging`) and landing (`next build`) pass.
- eslint on changed files: no new warnings.
- QA-010 reproduced and fixed with Chromium and blocked storage (accessors throw SecurityError): /privacy, /i/pools, /register, /login and / crashed before and render after, on a production build. The inlined guard was run on its own against blocked storage: localStorage and sessionStorage work from memory, indexedDB is undefined. Creator pages could not be loaded locally (no API access from the test environment); check one on staging.
- QA-023: the server HTML for /i/pools has the placeholder and no Sign in; signed out it resolves to Sign in.
- No screenshots of the preview frame or the follow capsule. Check them on staging with the table above.
