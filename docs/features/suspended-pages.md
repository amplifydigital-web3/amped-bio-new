# Hide suspended users' bios

Status: revision 2, 28 Oct 2026. Rob's answers recorded: D1 alternative ("This page is unavailable"), D2, D3 and D4 as recommended. Revision 1 was 27 Oct. Screen QA fixes 3 Nov 2026 (rows 338 to 340): sections 3.2, 3.3, 3.4, 4, 7 and the new section 9 "For counsel" changed. Build Board: D10 "Hide suspended users' bios" (Step 1, priority 2).
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

- `getHandle` refuses a suspended account, owner included (the owner sees the editor notice in 3.3 instead), with `NOT_FOUND` and `cause.unavailable = true`. The error formatter in `trpc/trpc.ts` passes `unavailable` to the client the same way it passes `retryAfter`. The landing app renders a new "This page is unavailable" state (D1, Rob chose the alternative on 28 Oct) inside `PublicHeader` and `PublicFooter`, like every public page: heading "This page is unavailable", one line "There is nothing to show at amped.bio/{handle} right now.", a primary "Go to Amped.Bio" (to `/`) and a ghost "Explore pools" (to `/i/pools`), the same actions as `apps/landingpage/src/app/not-found.tsx`. The landing app has no explore route yet; when it ships, Explore creators may replace Explore pools. It never shows "Check and claim" and never links to register, so a suspended handle is never offered for claiming (QA RH-Q29, RH-Q30). No reason is given. The response is HTTP 404 with `noindex`, so search engines drop it.
- A handle that never existed keeps the shipped handle 404, `HandleNotFoundCard.tsx`: "No page at @{handle}", "Want this name? Check if it is free when you sign up.", Check and claim, Go to Amped.Bio. When the path is a system tier word (`isSystemReservedHandle` from `packages/constants`), the card hides Check and claim and its line, because register would only answer Reserved (QA RH-Q31). Other paths are unchanged.
- Share image: the OG route returns the generic Amped.Bio image for a suspended handle. Suspension calls `revalidateTag("profile:<handle>")` on the landing app (new internal route, section 4) so the cached image clears at once rather than after an hour.
- Pools: `getPools` adds `wallet: { user: notSuspendedWhere() }` to the where clause. `getPoolByAddress` and `getPoolDetailsForModal` return NOT_FOUND for a suspended creator's pool. The pool contract stays on chain; fans keep their stake and can unstake from the Wallet Stakes tab, which reads by fan wallet and stays open.
- Telegram door and Message me: `telegramDoor` returns null for a suspended creator. Existing threads close for new fan messages with the standard "This creator is not taking messages" state.
- Content and store (#20, PR #348): every public content read adds the same check. A fan who bought an item keeps it in Fan Library (decision 3).

### 3.3 The suspended owner

- Sessions: suspension revokes every session of the account (`prisma.session.deleteMany({ where: { userId } })`), and after #308 the admin app calls the plugin's `banUser`, which does the same. The next request signs the user out.
- Sign in is refused, as today, but with a stable code (QA RH-Q32, S1). Both `session.create.before` hooks (`apps/server/src/utils/auth.ts` and `apps/auth-server/src/utils/auth.ts`) throw `APIError("FORBIDDEN", { code: "ACCOUNT_SUSPENDED", message: "This account is suspended" })` when `isSuspended` is true. The client classifier in `packages/ui/src/prism/auth.tsx` (today `/blocked/i` on the message) classifies on `code === "ACCOUNT_SUSPENDED"` first and keeps the `/blocked|suspended/i` text match only as a fallback, so changing the server text can never drop the card to "You are not signed in".
- One shared notice, `SuspendedNotice` in `packages/ui/src/prism/auth.tsx`, used by all three sign in surfaces: `SignInForm.tsx` (/login), `SignFlow.tsx` (/sign) and `packages/ui/src/oauth/oauth-login-screen.tsx` (OAuth login). Solid warning notice, title "Account suspended", body "This account is suspended. To ask about it, open a support ticket.", and a kit ghost `Button` at 44 high, "Open a support ticket", to the Freshdesk new ticket page (`SUPPORT_TICKET_URL`). It replaces the "Account blocked" and "Contact support" copy on all three.
- Google sign in (QA RH-Q33). The session hook also throws for a Google sign in, which today lands on `/login?error=google` and shows "Google sign in did not finish". The Better Auth error callback passes the code through: `errorCallbackURL` stays `/login?error=google`, and the auth server redirects with `error=suspended` when the code is `ACCOUNT_SUSPENDED`. `SignInForm.tsx` maps `?error=suspended` to the suspended notice.
- If a session survives (another device mid request), the editor shell shows a solid notice under the top bar on every panel (Page, Content, Inbox, Wallet and the rest, inside the Prism rail and phone dock shell) and turns the Publish and Share actions off: "Your page is suspended. It is not visible to anyone. Open a support ticket to ask about it." with the same ghost Button "Open a support ticket". No other edit is blocked, so nothing the owner types is lost.

### 3.4 Admin

- `admin.users.updateUser` with `block: "yes"` runs `suspendUser(userId, reason)` in one transaction: write `block`, delete sessions, bump the follow card cache version for the creator, write an `AdminAuditLog` row (actor, action, target, reason, time).
- The block toggle in `UsersSlab.tsx` asks for a reason (required, 1 to 500 characters) before it blocks, in the shared `Dialog` (bottom sheet below 640, 508 centered above) over the Users slab. States: empty reason on submit shows `FieldError` "Add a reason to block this account." and keeps focus in the field; the field stops at 500 characters with a counter "{n} of 500"; an API failure keeps the dialog open with `retryToast` "@{handle} was not blocked"; success closes it with the toast "Blocked @{handle}" and Undo (8 s), which unblocks.
- Unblock needs no reason. Its toast "Unblocked @{handle}" has no Undo (QA RH-Q36). Today `setBlock` in `apps/admin/src/components/users/UsersSlab.tsx` offers Undo on both, and Undo of an unblock calls `updateUser({ block: "yes" })` with no reason, which acceptance 7 refuses. Change `setBlock` so the success toast carries the Undo action only when `block === "yes"`. To block again, the admin uses Block, which asks for a reason.
- Suspension notice to the creator (QA RH-Q38). Recommended, pending counsel (section 9): `suspendUser` sends a transactional email "Your Amped.Bio page is suspended" with a general category and the support ticket link, never the internal reason. Not built until counsel answers.
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
| `apps/admin/src/components/users/UsersSlab.tsx` | Reason dialog before block; `setBlock` keeps Undo for Block only |
| `apps/server/src/utils/auth.ts`, `apps/auth-server/src/utils/auth.ts` | `session.create.before` throws code `ACCOUNT_SUSPENDED` |
| `packages/ui/src/prism/auth.tsx` | Classify on the code; new `SuspendedNotice` |
| `apps/landingpage/src/components/auth/SignInForm.tsx`, `apps/landingpage/src/components/sign/SignFlow.tsx`, `packages/ui/src/oauth/oauth-login-screen.tsx` | Use `SuspendedNotice`; `SignInForm` maps `?error=suspended` |
| `apps/landingpage/src/components/HandleNotFoundCard.tsx` | Hide Check and claim for system tier words |
| `apps/landingpage/src/app/[handle]/not-found.tsx` | Unavailable state inside `PublicHeader` and `PublicFooter`, Go to Amped.Bio and Explore pools |

Today none of this exists in code (QA RH-X2): `getHandle` (`apps/server/src/trpc/handle.ts` lines 154 to 178) checks `page_status` only; the error formatter (`apps/server/src/trpc/trpc.ts` lines 71 to 81) passes only `retryAfter`; `updateUser` (`apps/server/src/trpc/admin/users.ts` lines 419 to 446) writes `block` with no reason, no session delete and no audit row; there is no `AdminAuditLog`, `isSuspended` or revalidate route. The design boards S1 to S4 describe the behavior after `fix/hide-suspended-pages` lands and stay in review until it merges.

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
7. A block without a reason is refused by the API. Each block and unblock writes one audit row. The Unblock toast has no Undo; the Block toast's Undo unblocks.
8. With #308 merged, an active Better Auth ban hides the page; an expired ban does not.
9. Tests cover `isSuspended` against `notSuspendedWhere` on the same fixtures, so the two cannot drift.
10. Typecheck, build and tests pass. Copy has no em or en dashes.
11. Email, Google and OAuth sign in for a suspended account all show the shared suspended notice, classified on `ACCOUNT_SUSPENDED`, whatever the server message says.
12. The unavailable page shows Go to Amped.Bio and Explore pools inside the public header and footer, and never Check and claim. The handle 404 for a system word hides Check and claim.

## 8. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| Is there an appeal path beyond the Freshdesk ticket? | Rob | No |
| Does #28 R1 (Safety admin) bring its own audit table? If yes, reuse it | Gustavo | No |

## 9. For counsel

Draft for counsel review. Not final legal text; `docs/legal` does not change until counsel approves.

1. Statement of reasons (QA RH-Q38). Question: do EU users need a statement of reasons when their page is suspended? Proposed email, transactional, sent by `suspendUser`: subject "Your Amped.Bio page is suspended". Body: "Hi {name}, your page amped.bio/{handle} is suspended and is not visible to anyone. Category: {category}. To ask about it or to appeal, open a support ticket." Categories proposed: Impersonation, Terms of use, Safety, Payments, Legal request. The internal reason is never sent.
2. Retention, proposed addition to `docs/legal/privacy-parameters.md`: "Moderation records about account suspensions (the admin who acted, the reason and the time) are kept for 5 years and then deleted. They are kept after the account closes."

