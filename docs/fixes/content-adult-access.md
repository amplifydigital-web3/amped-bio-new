# A1: 18+ for fans who pass Over 18 (with R6 and C1)

Specs: `docs/features/identity-checks.md` 4.1 to 4.4 (PR A1); `docs/features/adult-content-review.md` section 9 (R6 shelf, C1 statutory notices).
Branch: `feat/content-adult-access`, stacked on F1 (`fix/content-adult-unlabel`, #495). Merge F1 first.

## The switch

A new public feature flag, `adultContent` (site_settings `feature_flag.adultContent`, default off, `env: {}`). While it is off nothing changes from today: 18+ is closed to everyone but the owner and `content.publish` refuses 18+.

Turn it on only after the safety queue, adult setup and review before publish ship (#28 R1 to R5). The flag description in the admin says so.

## What turns on with the flag

### Server
- `services/content/adult.ts`: `adultOpen`, `viewerAdultRefusal`, `canViewAdult(userId)` (an `age_over_18` pass from `checkIdentity`), `hasAdultItems`, `creatorAdultBlocker` (decision A2: the creator's own `age_over_18` and `seller` passes).
- `content.listAdultForBio({ handle, cursor?, limit? })` and `content.getAdult({ handle, publicId })`, private. Before a pass they answer `{ open: false, reason }` with nothing else; `closed` when the flag is off or the page is not public. After a pass they return the 18+ feed page or item (`publicFeed` and `publicItem` with scope `"adult"`).
- `content.getReadUrl` with accessGating off: `loadItemForViewer` opens an ungated, listed 18+ item to a viewer with a pass, on the private lifetimes. Gated 18+ waits for the engine.
- With accessGating on, the engine's age step already decides (it calls `checkIdentity`). The content resolver now marks 18+ unavailable to non owners while the flag is off.
- `content.publish` on an 18+ item: refused while the flag is off; with it on, refused unless the creator passes Over 18 and seller. `content.update` turning the label on asks the same once the flag is on.
- `handle.getHandle` returns `hasAdult`: true when the page has a listed 18+ item and the flag is on. No title, cover or count.
- `content.report` accepts an 18+ item from a fan who passed the check, so the Report button on the 18+ shelf and item page works. Without the pass the item does not exist for them. R3 adds the 18+ report reasons.
- Public reads are unchanged: `PUBLIC_ITEM_WHERE` and `LISTED_ITEM_WHERE` keep `adult: false`, so server HTML, the sitemap, `llms.txt`, share tags, email, push and Telegram stay 18+ free.

### App host (`apps/client`)
- `/age-check?returnTo=...`: the Over 18 check sheet, six states (signed out, verify, share, checking, under 18, unavailable). Not behind sign in. Verify and Share open Authbase in a new tab; on return (tab visible again, or reload) the page runs a fresh `identity.recheck` and goes back to `returnTo` on a pass. `returnTo` is a path on the app host or a URL on the public site, nothing else.
- The pay sheet reads `identity.myChecks` before sending a fan to the sheet, so a fan back from a pass is not sent round again.
- Item editor: the Publish card lets 18+ publish when the flag is on, with the new notice copy.

### Public site (`apps/landingpage`)
- One "Adult items" card at the end of the creator's blocks when `hasAdult`. It links to the shelf.
- `/{handle}/adult` and `/{handle}/adult/{publicId}`: empty shells (noindex, no share image, disallowed in robots.txt). They fill in the browser from the signed in calls. Before a pass they show the Over 18 sheet step, which links to the app host sheet.
- The shelf shows the 18+ chip on each card.

### C1: statutory notices
- `ALABAMA_HEALTH_WARNINGS` and `SAMHSA_HELPLINE_NOTICE` in `packages/constants/src/compliance.ts`, verbatim from spec 9. `packages/constants/test/statutory-notices.test.ts` compares them byte for byte with the spec block.
- `StatutoryNotice` in `@repo/ui` (Prism): 16 px, semibold, full ink in the current color, 1.5 px outline, never collapsed.
- Warnings: on the Over 18 sheet in every state before a pass, on the shelf landing, and on an 18+ item page before a pass. Helpline: on the shelf and every 18+ item page.
- The copy checker never reads `compliance.ts` as product copy, so the statute is exempt from the dash and banned word checks.

## Tests
- Server: `content-adult.test.ts` (6), `content-router.test.ts` 18+ block (5), `content-gating.test.ts` updated for the flag (+1). Content, access, handle, identity and progress suites: 297 pass.
- Client: `pages/AgeCheck.test.tsx` (9), Pay and content panel suites: 120 pass. `tsc -b` clean.
- Landing: `components/content/adult.test.tsx` (7), 69 pass; `next build` passes.
- Constants: 215 pass. The flag registry test now allows `env: {}` for brand new flags, as AGENTS.md says.

## Not in A1
- R4 (adult setup, people, releases, review before publish). Until it ships, keep the flag off.
- Fan Library 18+ (decision D4) and saving progress on 18+ items: progress writes still use the public rule, so 18+ never enters Continue lists.
- Report reasons for 18+ (R3).
