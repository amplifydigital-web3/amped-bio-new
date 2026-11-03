# Content gating (content PR 8)

Build Board #20 (Content system) and #21 (Access gating engine). PR C8, branch `feat/content-gating`.
Revision 3, 3 Nov 2026. Written after the C8 Full QA against `development` at 0500800b, which has G1 (#398), I1 (#397) and content PR 6 (#348).

Supersedes these parts of `docs/features/content-system.md`: in 3.6, the **Access check** and **Broadcast attachments** bullets; in 3.10, the auth column for `content.getPreview` and `content.getReadUrl`; in 3.16, the **PR 8** paragraph; in 3.15, "broadcast attachments" in the Phase 2 row. Where the content spec and this document disagree on PR 8, this document wins. Everything else in the content spec and in `docs/features/access-gating-engine.md` stands.

## 1. Decisions

| Id | Question | Answer | Date |
| --- | --- | --- | --- |
| v2-one-call | Client grant or one call reveal | One call. `open` checks and reveals in one request. No `issueGrant`, no `verifyAccessGrant`, no grant parameter | 23 Oct |
| CQ1 | Broadcast attachments | Move to Broadcast phase 2 with `Broadcast.accessRuleId` and a `broadcast` resolver. Not in C8 | 3 Nov |
| CQ2 | Batch decisions for cards | C8 builds `access.checkPage` for content cards. G3 extends it to blocks | 3 Nov |

## 2. What exists on development

- `services/access/engine.ts`: `registerResolver`, `check`, `checkBatch`, `open`, `bumpViewer`, `eligibleUserIds`. Only the `block` resolver is registered (`services/access/index.ts`).
- `trpc/access.ts`: `access.check` (public, 30 a minute per viewer) and `access.rules.list`, `create`, `update`, `delete`. All refuse while the `accessGating` feature flag is off.
- Live kinds: `follower`, `pool_member`, `stake_min`, `any`, `all`. `any` and `all` take 2 to 4 rule ids. Stake kinds pass only for owners on the stake allowlist (`stakeKindsAllowed`), read from the site setting `access_stake_kinds_allowlist` with `ACCESS_STAKE_KINDS_ALLOWLIST` as the environment fallback.
- `ContentItem.accessRuleId` has its foreign key to `AccessRule` (`onDelete: Restrict`). `baseAccessRuleId` exists and is for store PR 9.
- `services/content/access.ts`: `PUBLIC_ITEM_WHERE` (requires `accessRuleId: null` and `adult: false`), `isPublicItem`, `openDecision` (owner or public), `servedAssetsClean`.
- `services/content/viewer.ts`: `loadItemForViewer`, used by `content.getReadUrl`. `trpc/progress.ts` calls `openDecision` itself.
- `services/content/delivery.ts`: `deliveryExpiry` already signs the gated (`private`) lifetimes in content spec 3.6.
- The processor already writes `BLUR`, `PREVIEW_CLIP`, `AUDIO_PREVIEW` and `PAGE_PREVIEW` assets.
- Not on development: `content.getPreview`, `access.checkPage`, a content resolver.

## 3. Server

### 3.1 Content resolver

`services/access/resolvers/content.ts`, registered in `services/access/index.ts` beside `block`.

`get(publicId)` returns:

- `ownerUserId`: the item's `userId`.
- `ruleId`: `accessRuleId`, or null.
- `adult`: the item's `adult` flag.
- `available`: true only for an item that is READY, PUBLISHED, moderation CLEAR, not deleted, and whose served assets pass `servedAssetsClean`. Anything else is false, so the engine answers `not_found` to everyone but the owner.

It returns null for an id that does not match `contentPublicIdSchema` or does not exist. The creator's page and suspension checks stay in the engine (`decide`).

### 3.2 Two filters for public reads

`services/content/access.ts` gains `LISTED_ITEM_WHERE`: READY, PUBLISHED, moderation CLEAR, `adult: false`, not deleted. It allows any `accessRuleId`.

| Surface | Filter | Gated items |
| --- | --- | --- |
| `content.listForBio`, `content.feed` | `LISTED_ITEM_WHERE` | Locked cards |
| `content.getPublic` (item page) | `LISTED_ITEM_WHERE` | Locked page |
| `contentSitemapCount`, `contentSitemapEntries`, `hasPublicContent`, `llms.txt`, JSON-LD | `PUBLIC_ITEM_WHERE` (unchanged) | Never listed |

- A locked card or page carries: `publicId`, title, kind, duration, page count, the blur cover URL, and `gate: { kind, summary }` from `ACCESS_RULE_SUMMARIES`. Never a media token, rendition, poster, waveform or description.
- A locked item page renders with `noindex` and no share image other than the blur cover.
- The feed page's index rule ("Yes when the creator has a public item") keeps reading `hasPublicContent`.
- While the `accessGating` feature flag is off, the listed surfaces keep `PUBLIC_ITEM_WHERE`, so nothing changes on public pages until the flag turns on.

### 3.3 Reveals go through `open`

- `content.getReadUrl({ publicId, download? })` calls `open(viewer, { type: "content", id: publicId }, reveal)`. The reveal builds playback or the download as today. A refusal returns the decision (`{ decision, playback: null, download: null }`) instead of NOT_FOUND, so the item page can show the unlock card. `not_found` decisions still return NOT_FOUND.
- `content.getPreview({ publicId })` is new and public. It returns the blur cover, and by kind: the Stream clip token for `PREVIEW_CLIP`, a gateway URL for `AUDIO_PREVIEW`, and gateway URLs for `PAGE_PREVIEW` pages. Preview tokens live 1 hour (content spec 3.6). It never signs the full video, audio, document or original. It runs `check` with intent render, not `open`: a preview needs `available` and the 18+ check, not the rule. Rate limit: `limitViewerReads`.
- Owners keep the public lifetimes for their own public items (`loadItemForViewer`'s current rule). Gated items always sign with the `private` lifetimes.
- Downloads: `getReadUrl({ download: true })` runs through `open` first, then the daily download count, then `buildDownload`.
- Progress: `trpc/progress.ts` replaces its `openDecision` call with `check(viewer, resource, { intent: "open" })`. A refused viewer gets `{ saved: false }`.
- `loadItemForViewer` keeps its scan and READY checks. Its access step becomes the engine decision.

### 3.4 `access.checkPage` (CQ2)

`access.checkPage({ handle, resources: AccessResource[] })`: public, behind the `accessGating` feature flag.

- Up to 48 resources per call, all owned by the handle's user. Any other resource is dropped from the answer.
- Calls `checkBatch` with intent render. Returns `{ [type:id]: AccessDecision }`.
- C8 accepts `content` resources only. G3 adds `block`.
- Rate limit: 30 a minute per viewer key, counted per call, not per resource.

### 3.5 Writing a rule on an item

`content.update` gains `access`:

```ts
access?: null | { ruleId: string } | AccessRuleInput | { kind: "any"; leaves: AccessRuleInput[] } // 2 to 4 leaves
```

- `null` sets the item to Everyone. An `AccessRuleInput` creates an inline rule (`name: null`). `{ ruleId }` attaches a saved rule; it must belong to the item's owner. `any` with leaves creates each leaf inline, then the `any` rule over them, in one transaction.
- Refused while the `accessGating` feature flag is off: `PRECONDITION_FAILED`, "Gating is not available yet."
- Refused for `pool_member` and `stake_min`, including inside `any`, when the owner is not on the stake allowlist: `FORBIDDEN`, "Not available for your page yet." `access.rules.create` gets the same check.
- Refused for kinds outside `LIVE_ACCESS_RULE_KINDS` (Members and Paid until PR 10 and PR 11).
- An 18+ item may carry a rule. The age check runs before the rule (gating 3.4).
- Placement of an 18+ item with people who appear on a surface (store, memberships, paid messages, Broadcast, live) must be allowed by every person's release (`docs/features/store-policy.md` 4.2). C8 writes rules only; the check is built in R4, which refuses rule writing for an excluded surface. C8 leaves a `releaseAllowsSurface` hook that returns true until R4.

**Inline rule cleanup.** When an item's rule changes or is cleared, its previous rule is deleted in the same transaction if it is inline (`name` null) and nothing else references it: no `ContentItem.accessRuleId` or `baseAccessRuleId`, no `Block.accessRuleId`, no `any` or `all` rule. Its inline leaves follow by the same test. Saved rules are never deleted by this. `purge.ts` deletes the item first, then runs the same cleanup, which keeps the AD2 order (items and blocks, then rules, then the user).

### 3.6 Access events

`check` on development records an `AccessEvent` for every locked render. With cards that would be one row per card per bio view. Gating spec 3.2 step 6 already sets the rule, and C8 applies it in `recordEvent`: render events are deduplicated per viewer key and resource for 10 minutes (a Redis key with a 10 minute TTL; without Redis, a per process map with the same window). `denied` and `revealed` on open are recorded every time. The privacy entries from G1 cover these rows.

## 4. Client and landing

### 4.1 Item editor (cs3)

"Who can open this" in the item editor:

- Everyone, Followers, Pool fans, Fans with a minimum stake (whole tREVO), Any of (2 to 4).
- Members and Paid show Later (`LaterPill`) until PR 10 and PR 11. Any of offers only live kinds.
- Outside the stake allowlist, Pool fans and Fans with a minimum stake show disabled with "Not available for your page yet."
- Live preview as a locked fan, from `content.getPreview`.
- Hidden behind the `accessGating` feature flag, read in the client with `isFeatureOn("accessGating")` (`apps/client/src/config/featureFlags.ts`), so the picker never shows against a server that refuses. This PR changes the registry entry's `scope` from `"server"` to `"public"` so the client receives it. No new `VITE_` variable.

### 4.2 Locked cards and the locked item page (cs4, cs5, s1)

- Phone layouts follow the 24 Oct phone boards s1 (Screen Review rows 154 and 155), which supersede the phone layouts of cs4 and cs5. Desktop follows cs4 and cs5.
- The server renders locked cards and the locked page from the locked DTO in 3.2. After hydration the landing app calls `access.checkPage` for the cards on the page and `content.getPreview` for the item page.
- The unlock card follows the decision's hint: `sign_in`, `follow` (Follow button), `view_pool` (Go to the pool, with the stake disclosures, no amount in public HTML), `verify_age` (the Over 18 sheet from A1), `unavailable`. No `buy` or `join_membership` hints exist before PR 10 and PR 11.
- Unlocked in place: on a pass the page calls `content.getReadUrl` and swaps the preview for the player without a reload.

## 5. Tests and checks

- Resolver: available rules for each item state, and null for bad ids.
- `getReadUrl`: owner, public, follower pass and refuse, stake refuse outside the allowlist, 18+ before the rule, `chain_unavailable` refuses.
- `getPreview` never returns a full asset key or token. A locked viewer gets only preview roles.
- `checkPage`: drops resources owned by someone else; caps at 48; counts one rate limit hit per call.
- `content.update`: flag off, stake allowlist, non live kinds, `{ ruleId }` owned by someone else, inline cleanup with and without other references.
- Progress and downloads refuse a locked viewer.
- **Leak test** (gating acceptance 5), extended to content: signed out, the bio, feed page, item page, `getHandle`, JSON-LD, share tags, the sitemap and `llms.txt` carry no media token, rendition, poster, waveform or description for a gated item. C8 adds the content part. G3 adds blocks.
- A render event is recorded once per viewer key and resource in 10 minutes.

## 6. Build

| PR | Branch | Scope | Needs | Days |
| --- | --- | --- | --- | --- |
| C8 | `feat/content-gating` | 3.1 to 3.6 and 4.1 to 4.2, tests in 5. No migration | G1 (#398), #348 | 5 |

Flag: `accessGating` in `packages/constants/src/feature-flags.ts`, off in production and switched in admin › Feature flags with no rebuild or redeploy. The server reads it with `isFeatureOn("accessGating")` (`apps/server/src/services/featureFlags.ts`), the client with `isFeatureOn("accessGating")` (`apps/client/src/config/featureFlags.ts`), the landing app with `useFeatureFlag("accessGating")`. `ACCESS_GATING_ENABLED` stays only as the server fallback while no admin row is set. The Phase 2 gate in content spec 3.15 stands: counsel receives the stake copy in parallel.

Not in C8: broadcast attachments (CQ1), block locks (G3), Members and Paid (PR 10 and PR 11), the store (PR 9).

## Revision log

- 2026-11-03: Revision 3. The stake allowlist is the `access_stake_kinds_allowlist` site setting, not an environment variable.

- 2026-11-03: Revision 2. One rule from the performer release: excluded surfaces are refused at rule writing from R4; C8 adds the hook only. Source: #420.

- 2026-11-03: Revision 1. Written from the C8 Full QA (0 P0, 4 P1, 7 P2) with Rob's answers to CQ1 and CQ2. Replaces the grant model with `open`, moves broadcast attachments out, adds `access.checkPage` for content, splits the public filters, and adds the rule writing, stake allowlist, inline cleanup, flag, progress and download rules, and applies the 10 minute render event deduplication from gating spec 3.2.
