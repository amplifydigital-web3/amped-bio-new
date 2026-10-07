# QA fixes 7: editor, faucet, landing polish and fan page publish

Source: Amped.Bio staging QA, 7 Oct 2026 (Rob, app.staging.amped.bio and staging.amped.bio). Tracker IDs are QA-xxx.
One commit per item, in the order below. Branch `fix/staging-qa-7` from `development`. One migration, for QA-008 step 2. Numbered 7 because #287 (`fix/staging-qa-5`) and #288 (`fix/staging-qa-6`) were opened first.

| QA | Area | Change | Files | How to check on staging |
|---|---|---|---|---|
| QA-041 | Server, editor | `handle.getHandle` returned NOT_FOUND for any unpublished page, so fan accounts could not open the editor. The signed in owner now gets the page. Signed out visitors and other users still get NOT_FOUND. Vitest covers owner, visitor, other user, published and unknown handle. | `apps/server/src/trpc/handle.ts`, `apps/server/src/__tests__/handle-owner.test.ts` | Follow a creator while signed out to make a fan account, then open app.staging.amped.bio: the editor loads. Open `staging.amped.bio/<fan handle>` signed out or as another user: the not found card shows. |
| QA-004 | Page and preview | The backdrop layer set `backgroundColor` and `background` together. React wrote `background=""` on the client, which cleared the color and the video backdrop. Both renderers now set only the `background` shorthand. | `apps/landingpage/src/components/ProfileView.tsx`, `apps/client/src/components/Preview.tsx` | Set a video background. The public page and the editor preview show the dark backdrop behind the video after hydration. Solid color and gradient backgrounds still show. |
| QA-012 | Radix, side panel | `pnpm.overrides` pins the shared Radix primitives (dismissable-layer 1.1.11, focus-scope 1.1.7, focus-guards 1.1.3, popper 1.2.8, portal 1.1.9, primitive 1.1.3, react-primitive 2.1.3, slot 1.2.3, arrow, collection, roving-focus, visually-hidden). Dialog and dropdown menu now share one layer stack. The SidePanel Escape guard is removed. | `package.json`, `pnpm-lock.yaml` (regenerate before merge, see the PR), `packages/ui/src/prism/flow.tsx` | `pnpm why -r @radix-ui/react-dismissable-layer` lists one version. In a pool side panel, open the More actions menu and press Escape: only the menu closes. Press Escape again: the panel closes. |
| QA-042 | Wallet faucet | A paused faucet returns amount 0 and every step unchecked. The card now shows "The test token faucet is paused." in place of the amount line, hides the checklist, and shows a disabled Get tREVO button. Amount 0 also counts as paused. | `apps/client/src/components/panels/wallet/faucet/useFaucet.ts`, `FaucetCard.tsx` | Turn the faucet off in admin settings. Wallet > Get tREVO: one plain line, no checklist, disabled button. The Fund row meta reads Paused. |
| QA-043 | Wallet faucet | The conversion note is removed. No other file in the repo carried the sentence. | `apps/client/src/components/panels/wallet/faucet/FaucetCard.tsx` | The faucet card notes show only the testnet notice. |
| QA-044 | Landing not found | The handle not found card no longer says the name is available. Title "No page at @name", body "Want this name? Check if it is free when you sign up.", button "Check and claim" to `/register?handle=name`. | `apps/landingpage/src/components/HandleNotFoundCard.tsx` | Open `staging.amped.bio/<unused name>` and `staging.amped.bio/<unpublished fan handle>`: both show the same card with no claim about availability. |
| QA-045 | Editor load | The editor reused the sign in timeout card ("We did not confirm your sign in") for a profile load failure. It now has its own loading state (room, then shell skeleton) and its own error, "We could not load your page." with Retry. Retry reuses a request that is still running, so `setUser` runs once. A load past 10 s shows the error and still lands if it finishes. A session with no handle shows the error, and Retry reloads the session. | `apps/client/src/pages/Editor.tsx`, `apps/client/src/components/shell/ShellGate.tsx` | Throttle the API in DevTools: the skeleton shows, then the editor error after 10 s. Press Retry: one `handle.getHandle` request in the Network tab, and the editor opens when it returns. |
| QA-046 | Landing blog | `getBlogPostBySlug` returned null on any failure, so the post page called `notFound()` and an outage was cached as a 404. It now throws on network errors and error statuses and returns null only when WordPress has no such post. | `apps/landingpage/src/lib/blog.ts`, `apps/landingpage/src/app/i/blog/[slug]/page.tsx` | `staging.amped.bio/i/blog/<missing slug>` shows the 404. With WordPress unreachable, a post URL shows the error card, and the post returns once WordPress is back. |
| QA-048 | Wallet | The Tokens row rounded the balance (9.9984) while the wallet header rounded down (9.9983). The row now uses `formatTokenAmount`, the shared rounded down formatter the header uses. | `apps/client/src/components/panels/wallet/ProfileTabs/components/TokensTab.tsx` | Wallet: the header figure and the tREVO row show the same digits. |
| QA-049 | Explore | Empty pool lists say "No pools found." in the editor and on the public site. | `apps/client/src/components/panels/explore/components/PoolsTab.tsx`, `apps/landingpage/src/components/pools/PoolsTab.tsx` | Explore > Pools with no pools on the chain shows "No pools found." in both apps. |
| QA-050 | Landing error page | The Try again count lived in a module variable that never reset, so a later error on the same path opened on "This keeps failing". It is now keyed by path and error digest and expires a minute after the last Try again. | `apps/landingpage/src/app/error.tsx` | Force a render error: first card says "Something went wrong on our side. Try again." Two failed Try again presses change the cause line. A new error, or the same page a minute later, starts at the first line. |
| QA-051 | Editor preview | Fixed in #287 (QA-054 there). The editor preview renders the Prism pool block. Not changed in this branch. | None | See #287. |

## Notes

- QA-012: regenerating the lockfile with the overrides also re-resolved two unrelated entries: the optional `drizzle-orm` peer dropped out of the `@better-auth/oauth-provider` peer key, and `sharp` picked up `semver` 7.8.5 (was 7.7.4). Both are pnpm re-resolution side effects. `pnpm install --frozen-lockfile` passes.

## Verification

- Typecheck: `tsc --noEmit` in apps/server, apps/landingpage and packages/ui, `tsc -b` in apps/client. All clean.
- Tests: `vitest run` in apps/server with QA-008 included. 190 passed, 6 skipped. The 26 failures are the oauth endpoint tests that call the live API; they fail on `development` too.
- Lint and format: eslint on changed files has no errors (warnings are on untouched lines), prettier check clean.
- Builds: `vite build --mode staging` in apps/client and `next build` in apps/landingpage pass.

## QA-008 step 2: publish your page

Spec: Fan page publish (QA-008 step 2), approved 6 Oct 2026 with all four recommendations. Behind `VITE_FAN_GRAPH`.

| Part | What changed | Files |
|---|---|---|
| Server | `user.publishPage` (optional new handle, same checks as a URL change, idempotent) and `user.unpublishPage` (keeps follows). Both rate limited. `auth.me` and `onboarding.status` return `pageStatus`. | `trpc/user.ts`, `trpc/auth.ts`, `trpc/onboarding.ts`, `services/pagePublish.ts`, `services/pageHandle.ts`, `trpc/handle.ts` (redeem uses the shared check) |
| Migration | `20261007130000_add_publish_card_dismissed` adds nullable `publish_card_dismissed_at` to `user_onboarding`. Not now hides the card for 30 days. | `packages/database/prisma` |
| Home | Unpublished accounts see "Make your own page" instead of the setup checklist. | `panels/home/MakeYourPageCard.tsx`, `HomePanel.tsx`, `PageStatusCard.tsx` |
| Publish sheet | URL prefilled with a live check, the visibility line, toast "Your page is live." A Publish button sits in the top bar while unpublished. | `shell/PublishPageSheet.tsx`, `shell/TopBar.tsx`, `panels/account/publicUrlInput.ts`, `PublicUrlRow.tsx` |
| While unpublished | View page, Copy and Share are disabled with "Publish your page first." The preview shows "Only you can see this preview." | `shell/PublishFirstHint.tsx`, `preview/PreviewFrame.tsx`, `shell/AccountMenu.tsx` |
| Account | Page visibility row. Unpublish sits behind a confirm. | `panels/account/PageVisibilityRow.tsx`, `AccountSettings.tsx` |

Verify on staging:

1. Sign up from a Follow button. Home shows "Make your own page", not the checklist.
2. View page and Copy are disabled with the reason. The preview shows the label.
3. Publish with the prefilled handle. The toast shows and `staging.amped.bio/<handle>` renders. Home shows the checklist with the URL step done.
4. Publish again from Account. Nothing changes and no error shows.
5. Try a taken handle in the sheet. The same error as Account shows and nothing publishes.
6. Unpublish from Account. The page is not found, it leaves Explore and the sitemap, and followers stay.
7. A creator account sees no change except the Account row reading Published.

Follow-up: Analytics links and the Realtime card copy action still work while unpublished.
