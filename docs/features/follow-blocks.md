# Follow block and Followers block (Fan Graph phase 1c)

Status: built 2026-10-08 (phase A), behind `VITE_FAN_GRAPH` and `NEXT_PUBLIC_FAN_GRAPH`. Build Board item #30.
Owner: Rob Frasca. Drafted by Claude, 2026-10-07. Built by Claude, 2026-10-08.
Parent: Fan Graph spec (Build Board #22), [fan-graph.md](fan-graph.md). This document amends it; it does not replace it.
Screens: Prism 2.2 boards fb1 to fb6 in the Board Screen Designs gallery (https://claude.ai/artifact/GKy9Lvcbg6zckkuDLHrYhv#fb).
Full spec with research and decisions: project doc `claude/amped-follow-blocks-spec-2026-10-07.md` (Amped bio GTM project). Design QA: `claude/amped-follow-blocks-design-qa-2026-10-07.md`.

## 1. What ships

Two blocks a creator adds from Add block, under a new People eyebrow. Both are singletons, like the referral block.

1. **Follow block** (`type = "follow"`). A creator-styled Follow button in the page flow. Same anatomy as every creator button (55 high, icon left, label centered). It runs the capsule's flows: the fan sign up card when signed out, the first-follow sheet once, a toast with Undo after that, the Following menu once followed. Label editable, 24 characters, default Follow.
2. **Followers block** (`type = "followers"`). A social proof card in the creator's theme with a configurator: five rows (count and growth, opted-in faces, Pool fan overlap, milestone, where followers come from), growth period, faces order and count, and a Follow button inside the card (on by default).

## 2. Decisions

1. **Placement: both.** The blocks add to the capsule. When a renderable block carries a Follow button (a Follow block, or a Followers card with its button on), the capsule drops its count and Follow and keeps View pool and Edit page. One Follow on screen at a time. Decision 2 of the Fan Graph spec is amended.
2. **Block data: all four families**, each a checkbox.
3. **Singletons.** One Follow block and one Followers block per page. The dialog shows "On your page" and opens the existing row. The server refuses a second add.
4. **The Followers card never shows a number under 10.** New on Amped in place of the count; growth, milestone, Pool fan and sources rows stay hidden until the count reaches 10.
5. **Growth never goes negative.** "+48 this week" only when the period added followers; the sparkline draws the cumulative count built backwards from the current total, so it cannot fall.
6. **Faces come only from opted-in followers** (`show_publicly = true`, verified, not suspended). Up to 6 or 12, newest first by default. The row hides under 3 opted in.
7. **Sources show kinds, not campaigns.** At most three kinds (This page, Explore, QR code, Pool, Broadcast) as shares; kinds under 5 percent drop. Campaign names and ids never leave People.
8. **A new source value, `block`.** Follows from either block record `source = block`. Follow rate counts page plus block follows over page views. People's sources list folds `block` into "Your page". The CSV keeps the raw value.
9. **Add block section is called People.**

## 3. Where the code lives

| Piece | Path |
| --- | --- |
| Block types, schemas, defaults, `SINGLETON_BLOCK_TYPES`, `blockCarriesFollow` (capsule rule) | `packages/constants/src/blocks.ts` |
| Pure card rules (floor, growth, series, faces, sources, milestone) | `apps/server/src/services/follow/blockRules.ts` |
| `follow.blockData` (public, cached 60 s per creator and options, 60 a minute per IP) and `source = block` | `apps/server/src/trpc/follow.ts` |
| Singleton guard on add, config defaults on serve | `apps/server/src/trpc/blocks.ts`, `apps/server/src/utils/sanitizeBlockConfig.ts` |
| Shared Followers card (public page and preview) | `packages/ui/src/creator/followers-card.tsx` |
| Public page renderers and the one `useFollow` per page | `apps/landingpage/src/components/blocks/FollowBlock.tsx`, `FollowersBlock.tsx`, `follow/FollowContext.tsx`, `ProfileView.tsx` |
| Editor: Add block People, rows, fields, notices, preview | `apps/client/src/components/panels/page/blocks/AddBlockDialog.tsx`, `BlocksSection.tsx`, `BlockRow.tsx`, `blockInfo.ts`, `FollowBlockFields.tsx`; `apps/client/src/components/blocks/FollowBlock.tsx`, `FollowersBlock.tsx`; `Preview.tsx` |
| Tests: floor and hidden rules, growth, faces opt-in, sources, milestones, capsule rule, compliance scan | `apps/server/src/__tests__/fan-graph.test.ts` |

## 4. `follow.blockData`

Input: `{ handle, growthRange: 7d | 30d, facesOrder: newest | longest | poolFans, facesMax: 6 | 12 }`. Public. Published, not suspended pages only.

Returns `showCount`, `newOnAmped`, `followerCount` (null under 10 or hidden), `newInRange` (null when 0, under 10 or hidden), `series` (30 daily cumulative counts, null under 10 or hidden), `faces` (opted-in followers: name, handle or null for an unpublished fan page, photo, poolFan; empty under 3 opted in), `othersCount` (the count beyond the faces, null under 10 or hidden), `poolFans` and `poolFanShare` (null without a pool, under 10, hidden or at 0), `milestone` (100 to 100000 or null), `sources` (up to three `{ kind, share }`, null under 10 or hidden), `poolAddress`.

Cache: 60 seconds on the shared cache, keyed by creator, a per-creator version number and the options. The version bumps on `follow`, `unfollow`, `undoUnfollow`, `update`, `removeFollower`, `restoreFollower`, `blockFollower` and `setCountVisibility`, so a fan who leaves the public list is gone on the next read.

## 5. Build notes and judgment calls

- **Faces while the count is hidden.** The 3.3 table in the project spec says faces are empty while hidden; the editor notice in 3.7 and design QA finding 4 say visitors see the people who chose to appear with no number anywhere. The build follows the notice and the design QA: with the count hidden the faces row shows opted-in followers (three or more) and the line reads "Jordan, Priya and others follow" with no count. The same wording applies under 10 followers. `follow.publicList` is unchanged.
- **Config validation by type.** `blockSchema` and `addBlockSchema` now validate `config` with the schema its `type` names instead of a union, so a link with a bad URL is refused rather than parsing as another block's config. Unknown types fall back to the union.
- **Singleton adds.** Follow button and Followers add at once from the dialog and open their row, as the referral block does, because their defaults make them renderable without any field.
- **Preview on a failed read or an unpublished page.** `follow.blockData` answers only for published pages. The editor preview keeps the card with its title and Follow button in that case instead of a local error card, so the creator still sees the block they placed.
- **Followers card in `@repo/ui`.** The card is one component used by the public page and the preview; each app supplies its own Follow button (live on the page, inert in the preview). Theme Engine v2 phase 1 has not landed, so the Follow button itself is a per-app copy, as the pool block is today.
- **Rate limit key.** `ctx.req.ip`, which honours the server's `trust proxy` setting.
- **Phase B and C** (analytics split by placement, `followers_block_viewed`, faces linking to the public follower list page) are not in this build.

## 6. Acceptance walk (2026-10-08)

| # | Criterion | How it is met |
| --- | --- | --- |
| 1 | Add Follow button from People; second add opens the existing row | `BlocksSection.pick` adds singletons at once and opens the row; `AddBlockDialog` shows On your page and opens the existing row; the server refuses a duplicate |
| 2 | Follow in the block records `source = block` | `useFollow.startFollow("block")` carries the source through the sheet and the sign up return (`amped_follow_source`) |
| 3 | Capsule drops count and Follow with a block; back when hidden | `blockCarriesFollow` over `renderable` in `ProfileView`; hidden blocks are not renderable |
| 4 | No number under 10 or while hidden, in UI or API | `numbersVisible` gates every numeric field; unit tests cover both states |
| 5 | Faces are opted-in only; under 3 hides the row | `show_publicly = true` and `COUNTED_FOLLOWER` in the query; `publicFaces` returns none under 3; cache version bumps on `follow.update` |
| 6 | No email, wallet, id, campaign, unfollow count or negative delta | The select never reads them; `publicGrowth` and `cumulativeSeries` cannot go negative; sources are kinds only |
| 7 | Sources at most three kinds, never a campaign | `publicSources`, tested |
| 8 | Configurator autosaves and the preview updates with live data; everything off leaves the header | D11 autosave through `onValid`; the preview reads `follow.blockData` for the creator's handle; the card keeps title and count line |
| 9 | Notices only in their states | `FollowersBlockFields` reads `showCount` and `newOnAmped`; the two buttons notice needs a renderable Follow block and the card button on |
| 10 | Keyboard and screen reader | Checkboxes, chips (roving radio group) and wells are native controls; the faces list names each person; the sparkline has `role="img"` and a sentence label |
| 11 | Theme only, no Prism token inside either block | The card and buttons read font, font color, button color, button style, hover effect and container transparency; the renderers were scanned for Prism color classes |
| 12 | Compliance scan | The six new files are in the scan list; the run passes |
| 13 | Typecheck, build and tests | server, client, landingpage and `@repo/ui` typecheck; server `tsc` build, client `vite build --mode staging` and `next build` pass; 46 fan graph tests pass |

## Revision log

- 2026-10-08: Built phase A. Build notes in section 5.
- 2026-10-07: First spec. Rob chose both placements with the capsule rule and all four data families.
