# Account deletion

Status: spec for approval, 27 Oct 2026. Build Board: D13 "Account deletion flow" (Step 1, priority 8).
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at a3ce333.
Design: Delete account flow, https://claude.ai/artifact/CMzEB63HnvyGZ9bBVT3Pjd
Needed by: #20 Content system launch. Legal basis: GDPR Art. 17 (one month), CCPA and CPRA (45 days), the retention table in `docs/legal/privacy-parameters.md`.

## 1. Problem

There is no way to delete an Amped.Bio account. The privacy parameters already promise "accounts deleted within 30 days of closing". There is no closing, so the promise cannot be met. Two facts make a naive delete unsafe:

1. **The wallet key is tied to the account.** Web3Auth derives the wallet from a JWT that Amped signs with `sub` set to the Amped user id (`apps/server/src/trpc/auth.ts` line 49). Once the account is gone, no login can produce that `sub` again. Any tREVO, USDC, stake or RNS name left in the wallet is lost to the user for good.
2. **Cascades delete records the law requires us to keep.** The schema cascades `User` and `UserWallet` deletes into 40 relations, including `UsdcSend`, `OnrampSession`, `StakeEvent`, `AnalyticsConsent` and `TelegramLinkEvent`. The retention table keeps wallet and transaction records 5 years after close, consent records 5 years, Telegram link history 5 years and ndau conversion records 7 years. The OAuth tables use the default `Restrict`, so a plain `prisma.user.delete` fails for anyone who has used Connected apps.

## 2. What the code has

| Piece | State |
| --- | --- |
| Delete procedure | None in `trpc/user.ts` or Better Auth config (`user.deleteUser` is not enabled) |
| Settings UI | None. `PrismGallery.tsx` line 226 has a sample "Delete account" button only |
| Storage cleanup | `services/S3Service.ts` delete, `services/cloudflare/r2.ts` `deleteR2Object`, `services/cloudflare/stream.ts` `deleteStreamVideo` exist |
| Relations | 40 cascades, 5 Restrict (OAuth client, refresh token, access token, consent, the profile image relation on `UploadedFile`) |
| Suspension | `block` stops sign in (D10 spec covers it) |

## 3. Flow

### 3.1 Start (Account > Delete account)

A last row on the Account panel, in danger colour text, opens the "Delete your account" sheet. The sheet first runs `account.deletionCheck`, which returns blockers and warnings:

| Check | Kind | Copy |
| --- | --- | --- |
| Wallet holds tREVO, USDC or any token above dust | Blocker | Your wallet still holds {amount}. Move it out first. After deletion no one can open this wallet again, including us. |
| The user has an active stake in any pool | Blocker | Unstake from {n} pools first. |
| The user's creator pool has fan stake | Warning | Your pool stays on the network. Fans can still unstake. It will no longer show on Amped.Bio. |
| The wallet owns RNS names | Blocker | Transfer {name} to another wallet first, or it will be lost. Link to the name's Transfer flow |
| Pending USDC sales or payouts (#15, #20) | Blocker | Wait until {n} payments settle. |
| Active memberships sold by this creator (#25) | Blocker | Cancel your plans first. Members keep access to their period end. |
| Active memberships bought by this user | Warning | Your memberships end now and do not renew. |
| Admin or moderator role | Blocker | Ask another admin to remove your role first. |

Each blocker links to the screen that fixes it. Dust is below 0.01 of the token's display unit (decision D4).

### 3.2 Confirm

With no blockers, the sheet shows what goes and what stays (section 5 in plain words), then:

1. Re-authentication: password, or Google for Google accounts, checked against Better Auth's fresh session rule (`session.freshAge` set to 5 minutes for this action). Two factor if enabled.
2. Type the handle to confirm.
3. "Delete my account" (danger button). Below it: "You have 30 days to change your mind."

### 3.3 The 30 days (decision D1)

`account.requestDeletion` sets `User.deletionRequestedAt` and `deletionScheduledFor = now + 30 days`, then at once:

- unpublishes the page (`page_status = UNPUBLISHED`), so the handle 404s,
- hides the creator pool from lists,
- stops broadcasts, message delivery and renewals,
- revokes every session and OAuth token,
- emails a confirmation with a "Keep my account" link (valid until the scheduled date).

Signing in during the 30 days opens one screen: "Your account will be deleted on {date}." with Keep my account and Sign out. Keep my account clears both fields and restores nothing automatically except sign in; the creator republishes the page from the editor.

### 3.4 Deletion job

A sweeper (`services/account/deletion.ts`, a `setInterval` every hour in the same pattern as `services/content/state.ts` and `services/broadcast/index.ts`, guarded by a Redis lock so one instance runs it) picks accounts past `deletionScheduledFor` and, per account, in this order:

1. Re-run `deletionCheck`. If a blocker reappeared (a fan sent USDC to the wallet), the job emails the user and moves the date 7 days. After 3 moves an admin is alerted.
2. Delete stored files: profile images, theme backgrounds, content assets in R2, Cloudflare Stream videos and clips, pool images. Retry with backoff; record failures in the audit row.
3. Write the retained records (section 5) to their pseudonymous form.
4. Delete the user row in one transaction with the explicit deletes for `Restrict` relations first.
5. Unlink Telegram (bot sends nothing; the link row is deleted, the history row kept).
6. Hold the handle (decision D3) by writing a `ReleasedHandle` row.
7. Send the final email: "Your Amped.Bio account is deleted."

## 4. Schema changes

| Change | Why |
| --- | --- |
| `User.deletionRequestedAt DateTime?`, `User.deletionScheduledFor DateTime?` | Grace period |
| `ClosedAccount { id (UUIDv7), closedAt, walletAddress, emailHash }` | The pseudonymous anchor for retained records. `emailHash` is SHA-256 with a server pepper, used only to answer a later legal request about the same email |
| `UsdcSend`, `PaymentEvent`, `OnrampSession`, `OnrampEvent`, `ScreeningEvent`, `StakeEvent`, `NdauConversion`, `AnalyticsConsent`, `TelegramLinkEvent`: `userId` nullable with `onDelete: SetNull`, plus `closedAccountId` | Kept for the retention period after close |
| OAuth relations: delete explicitly in the job | `Restrict` today |
| `ReleasedHandle { handle, releasedAt, availableAt }` | Handle hold |
| `AccountDeletionAudit { id, closedAccountId, requestedAt, completedAt, filesDeleted, filesFailed, steps }` | Proof the request was met |

The migration is labeled `migration`. It changes delete rules only; no data moves.

## 5. What goes and what stays

| Data | On deletion |
| --- | --- |
| Profile, page, blocks, themes, links, tracking pixels, onboarding | Deleted |
| Uploaded files and content (R2, Stream) | Deleted |
| Follows made and received, follow blocks | Deleted |
| Messages the user sent | Deleted from the user's side; the other person's copy shows "Deleted account" as the sender for the rest of its 12 month retention (decision D2) |
| Broadcasts sent, deliveries to the user | Deleted |
| Analytics events about the user's page | Deleted |
| Analytics consent records | Kept 5 years, no IP, linked to `ClosedAccount` |
| USDC sends, payment events, Buy USDC sessions, screening events | Kept 5 years after close, linked to `ClosedAccount` and the wallet address |
| Stake events | Kept 5 years after close (wallet and transaction records) |
| ndau conversion records | Kept 7 years |
| Telegram link history | Kept 5 years; the live link is deleted |
| Referral rows | The row is deleted. The other user's reward history keeps the amounts with "Deleted account" in place of the name |
| Identity check outcomes (D47) | Deleted. Authbase keeps its own record under its own terms |
| On chain data (pool contract, stakes, names, transfers) | Cannot be deleted. The sheet says so |

The visitor privacy notice and creator terms get one paragraph that matches this table (counsel review, open question 1).

## 6. API

| Procedure | Kind | Notes |
| --- | --- | --- |
| `account.deletionCheck` | private query | Blockers and warnings, with links |
| `account.requestDeletion({ confirmHandle })` | private mutation, fresh session | Refuses with blockers present; rate limited 3 a day |
| `account.cancelDeletion` | private mutation | Works during the 30 days, from the sign in screen or the email link |
| `admin.users.deletionQueue` | admin query | Scheduled, moved and failed deletions |
| `admin.users.deleteNow({ userId, reason })` | admin mutation | For a legal request that cannot wait; same job steps, audited |

## 7. Decisions for Rob (recommended first)

**D1. Grace period.** Recommended: 30 days, cancellable. Why: matches the privacy parameters and stays inside GDPR's one month; protects against a hijacked session deleting a creator. Alternative: delete at once. Simpler, but a mistake is permanent.

**D2. Messages the user sent.** Recommended: delete the user's side; the other person keeps their thread with "Deleted account" as sender until its 12 month retention ends. Why: the recipient's copy is also their data. Alternative: delete every message in the user's threads at once.

**D3. Handle after deletion.** Recommended: hold for 90 days, then release. Why: stops someone claiming a deleted creator's handle and receiving their fans' traffic. Alternative: release at once.

**D4. Funds in the wallet.** Recommended: block deletion above dust (0.01 of the display unit) and point to Send. Why: the key cannot be recovered after deletion; losing funds is the worst outcome. Alternative: allow it with a typed acknowledgement ("I understand my funds will be lost"). Gives the user the choice, with real risk of loss and complaints.

**D5. Key export.** Recommended: no key export in this PR. Why: Web3Auth key export changes the wallet's security model and needs its own review. Alternative: offer key export as the way to keep funds.

## 8. Build

| PR | Scope | Size |
| --- | --- | --- |
| AD1 | Migration (delete rules, new fields and models), `deletionCheck`, `requestDeletion`, `cancelDeletion`, unpublish and revoke on request, emails | 2 days |
| AD2 | Deletion job, file cleanup, pseudonymous records, audit, admin queue and delete now | 2 days |
| AD3 | Account row, Delete your account sheet, sign in screen during the 30 days (design boards) | 1.5 days |
| AD4 | Privacy notice and creator terms paragraph (after counsel) | text only |

## 9. Acceptance

1. A user with tREVO above dust cannot request deletion; the sheet links to Send.
2. A user with no blockers who requests deletion is signed out everywhere, their handle 404s and their pool leaves the lists within one minute.
3. Signing in during the 30 days shows only the scheduled screen. Keep my account restores sign in.
4. On day 30 the job deletes the user row; every file is gone from S3, R2 and Stream, or listed as failed in the audit with a retry.
5. The retained tables still hold their rows with `userId` null and a `closedAccountId`, and none of them holds the email, name or handle.
6. A user who used Connected apps deletes without a foreign key error.
7. The deleted handle cannot be claimed for 90 days.
8. An admin can see every scheduled deletion and its date.
9. Typecheck, build and tests pass. Copy has no em or en dashes.

## 10. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| Counsel review of the retained list and the notice paragraph | Counsel | AD4 |
| Does Authbase need a deletion signal from Amped for its consent records? | Authbase team | No |
| Fan purchases of a deleted creator's paid items (#20): keep playing until the content is deleted on day 30, or end at request? | Rob | Content launch |
