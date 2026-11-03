# Content takedown (C7a)

Build Board #20 (Content system) and #28 (Adult content). PR C7a, branch `feat/content-takedown`.
Revision 1, 3 Nov 2026. Written from the C7 readiness check on 3 Nov: content PR 7 is split. C7a is the delivery plumbing that makes "stop serving this item" true within a minute. The rest of PR 7 moves into the Safety PRs R1, R2 and R3 (`docs/features/adult-content-review.md` revision 6, section 16a).

Supersedes in `docs/features/content-system.md`: in 3.6, the **Takedown** bullet and "written by the API on block and delete" in **Worker steps**; in 3.16, the **PR 7** paragraph (see section 9). Everything else in the content spec stands.

## 1. Problem

The media gateway already refuses an item whose `blocked:{publicId}` key is in the `TAKEDOWN` KV namespace (`apps/media-gateway/src/index.ts:108`). Nothing writes that key. Today:

1. **Delete and unpublish keep serving.** A gateway URL signed before the change works until it expires: 24 hours (rounded up to the hour, at most 25) for public images, covers and audio, 1 hour for public documents.
2. **Gating keeps serving.** C8 (#442) lets a creator put a rule on a published item. Public URLs signed before the rule keep working for the same 24 hours.
3. **Moderation blocks keep serving.** `failItem(..., { blocked: true })` (`apps/server/src/services/content/state.ts:34`) marks the item BLOCKED but writes no takedown.
4. **Account suspension keeps serving.** `admin.users.updateUser` sets `User.block = "yes"`. Every item of that user stays reachable through issued URLs.
5. **Video is outside the gateway.** Stream plays from `customer-{code}.cloudflarestream.com` with its own signed token (public: duration plus 30 minutes, at most 6 hours). The KV list never sees it.
6. **No retry.** A takedown that has to call Cloudflare needs a durable record, or a failed call leaves an item serving with nobody told.

The Safety PRs (R1 to R3) and the TAKE IT DOWN Act desk (hide within 48 hours, target 1 minute in acceptance 7) all assume a working hide. C7a builds it once, for every caller.

## 2. Research

| Fact | Source | Effect on design |
| --- | --- | --- |
| A KV write is visible at once in the writing location and within 60 seconds elsewhere, longer if a reader set `cacheTtl` | Cloudflare KV docs, write key value pairs | The gateway reads with no `cacheTtl`. Acceptance targets 1 minute. |
| One write per second per key; a second write within a second answers 429 | Same | Writes per item are coalesced by the outbox (4.3). |
| Bulk write takes up to 10,000 pairs per request, REST only | Same | Suspend and reinstate use bulk writes. |
| KV values carry metadata up to 1,024 bytes | Same | The block reason rides in the value (4.2). |
| Stream tokens cannot be revoked one by one. Deleting a signing key invalidates every token signed with it. Up to 1,000 keys | Cloudflare Stream, securing your stream | A per video hard stop does not exist. See TD1. |
| `allowedOrigins` on a Stream video limits which sites can play it, manifests and segments included, but it is origin based, not a token check | Same | A browser stop, not a hard stop. See TD1. |
| The gateway checks the takedown key before the cache lookup (`index.ts:108`, then `caches.default.match` at line 133) | Code on `development` | No cache purge is needed to stop delivery. Purge is cleanup only (4.5). |
| Public tokens carry no class today: `MediaTokenPayload` is `{ k, r, exp, dl, fn?, j? }` (`packages/constants/src/mediaToken.ts`) | Code | The gateway cannot tell an old public URL from an owner preview. See TD2. |
| The content sweeper runs every 15 minutes (`state.ts:378`) | Code | C7a adds its own 1 minute loop for the outbox. |

## 3. Decisions

Recommended answers first. Boards tk1 and tk2 are drawn with them.

| Id | Question | Recommended | Alternative |
| --- | --- | --- | --- |
| TD1 | How a video stops | **On hide, stop issuing tokens and set the video's `allowedOrigins` to a closed list (`takedown.invalid`), which stops playback in every browser within a minute. On a permanent removal, delete the Stream video after the evidence copy (when there is one). For child safety, the safety lead runbook rotates the Stream signing key, which ends every outstanding video token on the platform.** Why: Stream has no per video revocation, and the remaining gap (a token copied out of a browser, played by a non browser client, for at most 6 hours) is closed by the key rotation where it matters most | Proxy Stream through our own gateway Worker so KV covers video. Weeks of work, and it changes how Stream bills delivery |
| TD2 | Old public URLs after unpublish or gating | **Public tokens carry `p: 1`. A second KV key, `private:{publicId}`, makes the gateway refuse `p: 1` tokens for that item while private tokens (owner preview, fans who pass the rule) keep working.** Why: unpublish and gating stop the old public links within a minute without breaking the owner or paying fans | Accept the gap: old public URLs work up to 25 hours after unpublish or gating |
| TD3 | Public Stream token lifetime | **Cut it to the private lifetime: duration plus 10 minutes, at most 4 hours.** Why: it shortens the video gap in TD2 from 6 hours to 4, and the player already refreshes a minute before expiry | Keep duration plus 30 minutes, at most 6 hours |

## 4. Design

### 4.1 Edge state

Every item has one edge state. It is derived from the item, never set by hand.

| Edge state | When | KV | Stream (video) |
| --- | --- | --- | --- |
| `OPEN` | `isPublicItem` (READY, PUBLISHED, CLEAR, no rule, not 18+, not deleted, creator page published and not suspended) | no key | normal origins |
| `PRIVATE` | Not public and not blocked: draft, archived, held for review (`HELD`, `PENDING`), gated, 18+, creator page unpublished | `private:{publicId}` | normal origins (TD2 covers gateway files; video relies on TD3) |
| `BLOCKED` | `status` DELETED or BLOCKED, `moderationState` BLOCKED, the creator suspended (`User.block` not "no"), or a Safety hide (`ContentItem.hiddenAt` set) | `blocked:{publicId}` | `allowedOrigins: ["takedown.invalid"]` |

`desiredEdgeState(item, creator)` lives in `apps/server/src/services/content/edge.ts`. BLOCKED wins over PRIVATE. The function is the one place that decides; every caller marks the item dirty and lets the outbox apply it.

### 4.2 KV values

- `blocked:{publicId}` value `{"r":"<reason>","at":"<iso>"}`. Reasons: `deleted`, `moderation`, `suspended`, `safety`, `child_safety`.
- `private:{publicId}` value `{"at":"<iso>"}`.
- No expiration on either key. The outbox deletes them.

### 4.3 Outbox and loop

Schema (one migration, additive):

```prisma
enum ContentEdgeState { OPEN PRIVATE BLOCKED }

model ContentItem {
  // ...existing fields
  edgeState     ContentEdgeState @default(OPEN) @map("edge_state")     // what the edge holds now
  edgeDirtyAt   DateTime?        @map("edge_dirty_at")                  // set when the desired state may differ
  edgeAttempts  Int              @default(0) @map("edge_attempts")
  edgeError     String?          @map("edge_error") @db.VarChar(160)
  hiddenAt      DateTime?        @map("hidden_at")                      // Safety hide (R1 sets and clears it)
  hiddenReason  String?          @map("hidden_reason") @db.VarChar(24)  // safety | child_safety | take_it_down | withdrawn
  @@index([edgeDirtyAt])
}
```

- **Mark.** Every change that can move the edge state sets `edgeDirtyAt = now()` in the same transaction: `content.publish`, `unpublish`, `delete`, `restore`, `update` (when `access` or `adult` changes), `failItem` with `blocked`, processor callbacks that change `moderationState`, `purge.ts`, `admin.users.updateUser` (when `block` or `page_status` changes: all of that user's items), the page publish and unpublish in the editor (all of that user's items), and the Safety hide and restore helpers (4.6).
- **Apply now.** After the transaction commits, the caller runs `syncEdge(publicIds)` once, best effort, so the common case lands in the same request.
- **Loop.** `startEdgeSync()` runs every 60 seconds (skipped in tests): up to 500 items where `edgeDirtyAt` is set, oldest first. For each, compute the desired state; if it equals `edgeState`, clear `edgeDirtyAt`; otherwise apply (4.4), then set `edgeState`, clear `edgeDirtyAt`, `edgeAttempts`, `edgeError`. On failure, keep `edgeDirtyAt`, increment `edgeAttempts`, store a short `edgeError` (never a token or URL), back off by attempt (1, 2, 5, 10, then 15 minutes).
- **Bulk.** More than 20 items in one call (suspend, reinstate, page unpublish) use the KV bulk write and bulk delete endpoints, 1,000 keys per request.
- **Reconcile.** Once a day the loop marks dirty every item whose stored `edgeState` differs from the desired state computed in SQL, in pages of 5,000, so a missed mark heals within a day.
- **Alert.** An item dirty for more than 10 minutes, or 10 or more items with `edgeAttempts >= 5`, raises `[content] ALERT edge sync behind` in the logs and shows on the admin dashboard tile (board tk2). Monitoring pages on that line.

### 4.4 Applying a state

| From to | KV | Stream (video items) | Cache purge |
| --- | --- | --- | --- |
| to OPEN | delete `blocked:` and `private:` | restore `allowedOrigins` from `streamAllowedOrigins()` | none |
| to PRIVATE | put `private:`, delete `blocked:` | restore origins | none |
| to BLOCKED | put `blocked:` with the reason, delete `private:` | `allowedOrigins: ["takedown.invalid"]` | asset URLs when the reason is `deleted`, `moderation` or `child_safety` (4.5) |

Writes go to the Cloudflare REST API with `fetch`, the way `apps/server/src/services/cloudflare/queue.ts` already calls Queues:

- `PUT /accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_TAKEDOWN_NAMESPACE_ID}/values/{key}` (single), `/bulk` and `/bulk/delete` (many).
- `POST /client/v4/accounts/{CF_ACCOUNT_ID}/stream/{uid}` with `{ allowedOrigins }` (existing `streamJson` helper).
- `POST /client/v4/zones/{CF_MEDIA_ZONE_ID}/purge_cache` with `{ files: [...] }`, 30 URLs per request.

A 429 from KV (one write per key per second) is retried by the loop, not in a tight loop.

### 4.5 Cache purge

The gateway checks the takedown key before the cache, so purge is not what stops delivery. It is cleanup: it removes the cached bytes of an item that is gone for good, and it covers the 60 second KV propagation window in the data center that cached the file. URLs are the token free gateway URLs (`pathForKey`) for every R2 asset of the item. Purge failures are logged and not retried; the cached copy expires within 24 hours and the KV key refuses it before that.

### 4.6 Helpers for Safety

`apps/server/src/services/content/edge.ts` exports, for R1 to R3 and any admin action:

- `hideItems(publicIds, reason)` sets `hiddenAt`, `hiddenReason`, marks dirty, syncs. Returns when KV accepted the write or the outbox holds it.
- `restoreItems(publicIds)` clears `hiddenAt` and `hiddenReason`, marks dirty, syncs. The item returns to whatever its other fields say (OPEN or PRIVATE), never straight to OPEN.
- `hideCreator(userId, reason)` and `restoreCreator(userId)` for suspend and reinstate (all items, bulk).
- `edgeStatus(publicId)` for the case view: `{ state, dirtySince, attempts, lastError }`.

R1 (`adult-content-review.md` 16a) builds on these and adds the Safety tables. R1's "KV hide and restore helpers" item is this section.

### 4.7 Gateway changes (`apps/media-gateway`)

1. **Token class.** `MediaTokenPayload` gains `p?: 1` (public class) and `a?: "safety"` (a Safety reveal token, R2). The API sets `p: 1` when it signs with access `public`.
2. **Private check.** After the takedown check: if `payload.p === 1` and `private:{publicId}` exists, refuse with reason `private`.
3. **Blocked check.** `blocked:{publicId}` refuses every token, except a token with `a: "safety"` when the stored reason is not `child_safety` (R2 reviewers open hidden items; nobody opens a child safety item).
4. Both checks read KV with no `cacheTtl`. Two reads per request: `blocked:` first, `private:` only for `p: 1` tokens.
5. Logs keep `reason: "takedown" | "private"`, never the token.

### 4.8 Delivery changes on the API

- `Signer` in `delivery.ts` adds `p: 1` to tokens signed with access `public`. `buildCard` already signs public; `buildLockedCard` (C8) signs the blur as public, so the blur of a gated item keeps serving to everyone, as content gating 3.2 requires (`private:` refuses `p: 1` tokens, so the blur role is exempt: the gateway lets `r: "blur"` through `private:`).
- TD3: `deliveryExpiry("stream", "public", ...)` becomes duration plus 10 minutes, at most 4 hours.
- `getReadUrl` and `getPreview` already refuse BLOCKED items. With `hiddenAt` set, the content resolver answers `available: false` and `ownerCanOpen` returns false, so nobody, the owner included, gets a token. The owner still sees the item in their library as "Hidden by Safety", with no playback and a link to the notice.

### 4.9 Configuration

| Name | Where | What |
| --- | --- | --- |
| `CF_TAKEDOWN_NAMESPACE_ID` | API secret store | The `TAKEDOWN` namespace id (`takedown`, `takedown-staging`) |
| `CF_KV_API_TOKEN` | API secret store | API token with Workers KV Storage Edit on that account |
| `CF_MEDIA_ZONE_ID` | API secret store | Zone id of `ampedusercontent.com` (staging: `ampedusercontent-staging.com`) |
| `CF_CACHE_PURGE_TOKEN` | API secret store | API token with Zone Cache Purge on that zone |
| `CF_STREAM_API_TOKEN` | exists | Already has Stream Edit; used for `allowedOrigins` |

Without the KV values the loop logs `[content] ALERT edge sync not configured` once a minute and leaves items dirty, and the admin tile shows "Not configured". Delivery behaves as today; nothing is marked synced that is not.

## 5. Screens

C7a is mostly server work. Two boards cover what people see (page "Takedown and Safety additions", https://claude.ai/artifact/41WUvZcFU7KLVm1KBb86ta, Screen Review rows 372 and 373):

- **tk1, viewer states.** A fan whose item was removed or hidden while the page was open: the player stops and shows "This item is no longer available." with Back to the page; the item page answers the standard not found page; a fan on a gated item that was just unpublished sees "This item is not available right now." The creator's library shows "Hidden by Safety" with "Open the notice" (R2 notices), and "Stopping delivery" for a minute after delete.
- **tk2, admin delivery health.** A Dashboard tile, "Takedown sync": items waiting, oldest wait, failures, last run, and a state (Healthy, Behind, Not configured). In the Safety case view, a line under the media: "Delivery stopped 14:02" or "Stopping delivery, 2 retries" with Retry now (safety lead).

## 6. Tests

- `desiredEdgeState`: every row of the 4.1 table, BLOCKED over PRIVATE, suspension, `hiddenAt`.
- Marks: publish, unpublish, delete, restore, gating on and off, 18+ on, moderation block, suspend and reinstate, page unpublish each set `edgeDirtyAt` in the same transaction.
- Loop: applies, clears, backs off, alerts after 10 minutes, bulk path above 20 items, coalesces repeated marks into one write, and never logs a token.
- Gateway: `blocked:` refuses every token; a `safety` token passes unless the reason is `child_safety`; `private:` refuses `p: 1` tokens and lets private tokens and the blur through.
- Stream: hide sets the closed origin list; restore puts the configured origins back.
- Not configured: nothing is marked synced, the alert line appears, delivery is unchanged.
- End to end on staging (section 7).

## 7. Acceptance

1. Delete a published image: its old gateway URL answers 403 within 60 seconds, from a second region too.
2. Unpublish an item, or put a rule on it: the old public URL answers 403 within 60 seconds; the owner's preview and a passing fan keep playing; the blur still loads.
3. A moderation block, a suspension and a Safety hide each stop every gateway URL of the affected items within 60 seconds.
4. A hidden video stops playing in a browser within 60 seconds and gets no new token; a restored one plays again.
5. A failed Cloudflare call leaves the item dirty, retries, and shows on the admin tile; nothing is marked done that is not.
6. A Safety reveal token opens a hidden item for a reviewer and never opens a child safety item.
7. Typecheck, build and tests pass for server, gateway and constants.

## 8. Build

| PR | Branch | Scope | Needs | Days |
| --- | --- | --- | --- | --- |
| C7a | `feat/content-takedown` | Sections 4.1 to 4.9, the migration, the gateway changes, boards tk1 and tk2, tests in 6 | #348, #442 (the blur exemption touches C8's locked card) | 3 |

Gustavo before staging: create the two API tokens, add the four values in 4.9 to the API secret store for staging and production, deploy the gateway with the new checks before the API change (an old gateway ignores `p` and `a`, so the order is safe the other way only for `blocked:`).

## 9. Where the rest of content PR 7 went

| PR 7 item (content system 3.16) | Now in |
| --- | --- |
| Admin content queue and decisions | R2 (Safety queue and case view) |
| DMCA tools | R3 (copyright desk, notice and counter notice, adult content review 7.5) |
| Hash blocklist actions | R1 (service, reasons, `caseId`) and R2 (Block this file on Remove, the Blocked files list in Settings) |
| CSAM evidence path and alerting | R1 (evidence copy helper, alert channel) and R2 (Escalate runs them) |
| KV takedown writes and cache purge | C7a |
| 18+ refusals in every public procedure | Done: `PUBLIC_ITEM_WHERE` and `LISTED_ITEM_WHERE` exclude 18+ (C8), the engine's age check runs before any rule (G1) |
| Analytics events | `content_blocked` and `content_unsafe_served` in C7a's loop and gateway logs; Safety and DMCA counts in R2 and R3; the rest of content system 3.13 stays with Analytics (#11) |
| Copy scan over content components | Done: `CONTENT_COPY` and `SITE_CONTENT_COPY` tests and `check:copy` (C8) |

## Sources

- Cloudflare, Write key value pairs (KV): https://developers.cloudflare.com/kv/api/write-key-value-pairs/
- Cloudflare, Securing your Stream (signed URLs, key revocation, access rules): https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
- Cloudflare, Purge cache (by URL): https://developers.cloudflare.com/cache/how-to/purge-cache/
- Code on `development`: `apps/media-gateway/src/index.ts`, `packages/constants/src/mediaToken.ts`, `apps/server/src/services/content/{state,delivery,purge}.ts`, `apps/server/src/trpc/admin/users.ts`.

## Revision log

- 2026-11-03: Revision 1. Content PR 7 split into C7a (this spec) and the Safety PRs. Decisions TD1 to TD3 with recommendations. Boards tk1 and tk2.
