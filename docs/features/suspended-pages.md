# Hide suspended users' bios

Status: revision 2, 28 Oct 2026. Rob's answers recorded: D1 alternative ("This page is unavailable"), D2, D3 and D4 as recommended. Revision 1 was 27 Oct. Build Board: D10 "Hide suspended users' bios" (Step 1, priority 2).
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at a3ce333. Open PR #308 (Better Auth admin plugin) is taken into account.
Design: Suspended page states, https://claude.ai/artifact/Csm9JxUnw2ZtUKsmHpeter

## 1. Problem

An admin can block an account in the admin app. The block stops new sign ins. It does not take the public page down. `handle.getHandle` never reads `User.block`, so a suspended creator's bio, blocks, links, pool card and Telegram door keep serving on amped.bio. The page is only marked noindex and dropped from the sitemap. A block is a moderation action. The page must go dark when it is applied.

## 2. What the code does today

| Surface | Where | Suspended today |
| --- | --- | --- |
| Public page | `apps/server/src/trpc/handle.ts` `getHandle` (line 135) | Served. Checks `page_status` only |
| Share image | `apps/landingpage/src/app/[handle]/opengraph-image.tsx` | Served through `getHandle`; cached 3600 s |
| Sitemap, noindex | `apps/server/src/utils/indexable.ts` | Already excluded (`block: "no"`) |
| Explore list | `apps/server/src/trpc/user.ts` `getUsers` (line 626) | Already excluded |
| Follow, follow card | `apps/server/src/trpc/follow.ts` `findCreator` | Already excluded |
| Broadcast and Telegram audiences | `services/broadcast/index.ts`, `services/telegram/rules.ts` | Already excluded |
| Pool list and pool page | `apps/server/src/trpc/pools/fan.ts` `getPools` (line 215), `getPoolByAddress` (line 32) | Served |
| Sign in | `apps/server/src/utils/auth.ts` session `create.before` (line 425) | New sessions refused |
| Live sessions | same | Not revoked. A blocked creator keeps editing until the session ends |
| Admin action | `apps/server/src/trpc/admin/users.ts` `updateUser` (line 419) | Writes `block` only |

PR #308 adds the Better Auth admin plugin with `banned`, `banReason` and `banExpires`. Its `banUser` endpoint revokes sessions. After #308 merges there are two suspension fields. This spec makes one rule read both.

## 3. Behavior

### 3.1 One rule

New helper `apps/server/src/utils/suspension.ts`:

```ts
export type SuspensionFields = { block: string; banned?: boolean | null; banExpires?: Date | null };

/** Suspended: admin block, or a Better Auth ban that has not expired. */
export function isSuspended(u: SuspensionFields, now = new Date()): boolean {
  if (u.block !== "no") return true;
  if (u.banned && (!u.banExpires || u.banExpires > now)) return true;
  return false;
}

/** Prisma filter equal to !isSuspended. A function, so `now` is current on every call. */
export function notSuspendedWhere(now = new Date()): Prisma.UserWhereInput {
  return { block: "no", OR: [{ banned: false }, { banExpires: { lte: now } }] };
}
```

`indexableUserWhere` becomes a function for the same reason. Until #308 merges, the `banned` branch is left out and the helper reads `block` only. `indexable.ts`, `getUsers`, `findCreator`, broadcast and Telegram rules switch to the helper so the rule lives in one place.

### 3.2 Visitors

- `getHandle` refuses a suspended account, owner included (the owner sees the editor notice in 3.3 instead), with `NOT_FOUND` and `cause.unavailable = true`. The error formatter in `trpc/trpc.ts` passes `unavailable` to the client the same way it passes `retryAfter`. The landing app renders a new "This page is unavailable" state (D1, Rob chose the alternative on 28 Oct): heading "This page is unavailable", one line "There is nothing to show at amped.bio/{handle} right now.", and an Explore creators button. No reason is given. The response is HTTP 404 with `noindex`, so search engines drop it. A handle that never existed keeps the standard "Page not found" state.
- Share image: the OG route returns the generic Amped.Bio image for a suspended handle. Suspension calls `revalidateTag("profile:<handle>")` on the landing app (new internal route, section 4) so the cached image clears at once rather than after an hour.
- Pools: `getPools` adds `wallet: { user: notSuspendedWhere() }` to the where clause. `getPoolByAddress` and `getPoolDetailsForModal` return NOT_FOUND for a suspended creator's pool. The pool contract stays on chain; fans keep their stake and can unstake from the Wallet Stakes tab, which reads by fan wallet and stays open.
- Telegram door and Message me: `telegramDoor` returns null for a suspended creator. Existing threads close for new fan messages with the standard "This creator is not taking messages" state.
- Content and store (#20, PR #348): every public content read adds the same check. A fan who bought an item keeps it in Fan Library (decision 3).

### 3.3 The suspended owner

- Sessions: suspension revokes every session of the account (`prisma.session.deleteMany({ where: { userId } })`), and after #308 the admin app calls the plugin's `banUser`, which does the same. The next request signs the user out.
- Sign in is refused, as today. The sign in card shows the existing message with the support link. Copy (unchanged in meaning, cleaned): "This account is suspended. To ask about it, open a support ticket." Link: the Freshdesk new ticket page.
- If a session survives (another device mid request), the editor shows a solid notice on every panel and turns the Publish and Share actions off: "Your page is suspended and is not visible to anyone. Open a support ticket to ask about it." No other edit is blocked, so nothing the owner types is lost.

### 3.4 Admin

- `admin.users.updateUser` with `block: "yes"` runs `suspendUser(userId, reason)` in one transaction: write `block`, delete sessions, bump the follow card cache version for the creator, write an `AdminAuditLog` row (actor, action, target, reason, time).
- The block toggle in `UsersSlab.tsx` asks for a reason (required, 1 to 500 characters) before it blocks. Unblock needs no reason. The existing Undo toast stays.
- Unsuspend restores the page at once. The page was never unpublished, so `page_status` is unchanged.

## 4. Changes by file

| File | Change |
| --- | --- |
| `apps/server/src/utils/suspension.ts` | New. `isSuspended`, `notSuspendedWhere` |
| `apps/server/src/trpc/handle.ts` | `getHandle` refuses suspended accounts |
| `apps/server/src/trpc/pools/fan.ts` | `getPools`, `getPoolByAddress`, `getPoolDetailsForModal`, `searchPoolsForBlockEditor` filter suspended creators |
| `apps/server/src/services/messaging/door.ts` | Null door for suspended creators |
| `apps/server/src/utils/indexable.ts`, `trpc/user.ts`, `trpc/follow.ts`, `services/broadcast/index.ts`, `services/telegram/rules.ts` | Use the helper |
| `apps/server/src/services/moderation/suspend.ts` | New. `suspendUser`, `unsuspendUser` |
| `apps/server/src/trpc/admin/users.ts` | `updateUser` routes block changes through the service; `reason` input |
| `packages/database/prisma/schema.prisma` | `AdminAuditLog` model (UUIDv7 id, actor_id, action, target_user_id, reason, created_at) unless an audit table already lands with #28 R1, in which case reuse it |
| `apps/landingpage/src/app/api/revalidate/route.ts` | New internal route, shared secret header, revalidates the profile tag |
| `apps/client` editor shell | Suspended notice and disabled Publish and Share (design boards S3) |
| `apps/admin/src/components/users/UsersSlab.tsx` | Reason sheet before block |

## 5. Decisions for Rob (recommended first)

**D1. What a visitor sees.** **Chosen 28 Oct: the alternative, "This page is unavailable" with no reason.** Recommended was the standard 404 "Page not found", which reveals nothing about a moderation action. The chosen state is clearer for fans who had the link. It signals that something happened, so the copy gives no reason and the status stays 404 with noindex.

**D2. Owner sessions.** Chosen 28 Oct: recommended. Recommended: revoke every session when an account is suspended. Why: a suspended creator should not keep editing, messaging or publishing. Alternative: keep sessions and rely on the editor notice. Less disruptive during a mistaken suspension, but the creator can still send messages.

**D3. Fans who paid.** Chosen 28 Oct: recommended. Recommended: purchases and memberships already paid stay in Fan Library and keep playing; nothing new can be bought. Why: the fan paid in good faith; refunds follow the store terms. Alternative: hide paid items too and handle refunds case by case.

**D4. One field after #308.** Chosen 28 Oct: recommended. Recommended: keep `block` as the admin switch and treat a plugin ban as suspended too, through `isSuspended`. Retire `block` in a later cleanup once the admin app moves to `banUser`. Why: no data migration now. Alternative: migrate `block` into `banned` in #308's follow up.

## 6. Build

One PR, `fix/hide-suspended-pages`, about 1 day. Lands after or rebased on #308. Migration only if the audit table is new (label the PR `migration` per the repo rule).

## 7. Acceptance

1. A blocked account's handle shows "This page is unavailable" with HTTP 404 and noindex, for a signed out visitor, a signed in visitor and the owner. A handle that never existed still shows "Page not found".
2. The share image for that handle is the generic image within one minute of the block.
3. The account's pool is gone from the pool list and its pool page returns 404. A fan can still unstake from the Wallet Stakes tab.
4. The Message me block and Telegram door are gone; a fan cannot start or continue a thread.
5. Every session of the account ends within one request of the block.
6. Unblocking restores the page, pool and door without other changes.
7. A block without a reason is refused by the API. Each block and unblock writes one audit row.
8. With #308 merged, an active Better Auth ban hides the page; an expired ban does not.
9. Tests cover `isSuspended` against `notSuspendedWhere` on the same fixtures, so the two cannot drift.
10. Typecheck, build and tests pass. Copy has no em or en dashes.

## 8. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| Is there an appeal path beyond the Freshdesk ticket? | Rob | No |
| Does #28 R1 (Safety admin) bring its own audit table? If yes, reuse it | Gustavo | No |
