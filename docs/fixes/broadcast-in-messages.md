# M9: Broadcast in Messages, to pool stakers, followers or both

Branch `feat/broadcast-audiences` into `development` (the planned name `feat/broadcast-in-messages` holds the closed #491). Amped Messages PR plan M9, Build Board #2 (Amped Messages) and #1 (Broadcast). Spec: `docs/features/messaging.md` sections 6, 7.5, 8.6 and 9, and decisions msg-broadcast, bc-audience, bc-rules, bc-email and bc-pool-terms. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-05.

## 0. Base: `development`, without M8

M8 (#415) stays closed. Rob decided on 4 Nov to keep the Telegram code for a gated feature later (card #65). This PR is built on `development` as it is:

- The Telegram broadcast columns stay (`sendTelegram`, `telegramStatus`, `tgMessageId`).
- The composer's Telegram checkbox stays.
- The Telegram fan out runs over the deliveries of any audience.
- My Pool keeps the Telegram group tab.

The Telegram flags stay off in production. Nothing Telegram changes here.

## 1. Migration

One migration, label `migration`. `packages/database/prisma/migrations/20261105120000_broadcast_audiences/migration.sql`:

```sql
ALTER TABLE `broadcasts` MODIFY `audienceKind` ENUM('ALL_MEMBERS', 'POOL_MEMBERS', 'FOLLOWERS', 'POOL_AND_FOLLOWERS') NOT NULL DEFAULT 'ALL_MEMBERS';
UPDATE `broadcasts` SET `audienceKind` = 'POOL_MEMBERS' WHERE `audienceKind` = 'ALL_MEMBERS';
ALTER TABLE `broadcasts` MODIFY `audienceKind` ENUM('POOL_MEMBERS', 'FOLLOWERS', 'POOL_AND_FOLLOWERS') NOT NULL DEFAULT 'POOL_MEMBERS';
```

```bash
pnpm --filter @repo/database exec prisma migrate deploy --schema=./prisma/schema.prisma
```

Rollback: add `ALL_MEMBERS` back to the enum, set `POOL_MEMBERS` rows to it, then drop the two new values (no `FOLLOWERS` or `POOL_AND_FOLLOWERS` rows may remain).

No new env values and no new flags. The work stays behind the `broadcast` and `messages` feature flags.

## 2. What ships

| Area          | Change                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Audiences     | `services/broadcast/audience.ts`. Pool stakers are `pool_member` on the creator's own pool. Followers are `follower`, with the 30 day email grace. Both are read through the access engine's `eligibleUserIds`, paged to the end. One delivery per person. Left out: the creator, people the creator blocked from following, and Messages blocks either way.                                                                         |
| Stake pilot   | Broadcasts call `eligibleUserIds` with `stakeAllowlist: false`. The counsel pilot allowlist gates access to items, and a broadcast opens nothing. Pool broadcasts were open to every pool owner before M9, so this keeps that. **Decision for Rob** (see 4).                                                                                                                                                                         |
| Email         | Email is still phase 2, so every delivery is `NOT_ELIGIBLE`. The skip reason is kept for when email ships: a follower without `Follow.email_updates` for this creator is `no_email_consent` (bc-email). Pool stakers keep their stake time opt in (`phase1_inbox_only`).                                                                                                                                                             |
| Fan out       | `processBroadcast` freezes the audience for the broadcast's kind. A followers broadcast needs no pool. An audience with the pool and no pool fails.                                                                                                                                                                                                                                                                                  |
| Routes        | `broadcast.creator.audienceCounts` returns `{ hasPool, pool, followers, total }`, where total is deduplicated. `send` takes `audience` (default `POOL_MEMBERS` for older clients) and needs the creator's pool only when the audience includes it. An empty audience refuses with its own line. `list` covers every audience. `overview` adds `counts` and `last`. Inbox `list` and `get` carry `audience`; `get` carries `testnet`. |
| Quotas        | Unchanged and per creator across audiences: 3 a day, 10 a week, first broadcast reviewed, report and rejection pauses (bc-rules).                                                                                                                                                                                                                                                                                                    |
| Composer      | Audience picker: Pool stakers, Followers, Both, each with its count. Both shows the deduplicated total. The button reads "Send to N people". Without a pool, only Followers can be picked. The Testnet notice shows in the preview for a pool audience or pool language (bc-pool-terms).                                                                                                                                             |
| Broadcast tab | Received for everyone. Each row shows its audience line ("To followers"). An opened broadcast shows the Testnet notice when the server says so. Sent shows for anyone with followers, a pool or a sent broadcast. It has New broadcast, the quota line ("2 of 3 left today", "3 of 3 sent today", "10 of 10 this week") and the sent list with audience lines and status.                                                            |
| My Pool       | The Broadcasts tab goes. Overview has a Broadcast card with the last broadcast and a Broadcast button, which opens `/inbox/broadcast/new?audience=pool`.                                                                                                                                                                                                                                                                             |
| Links         | `/inbox/broadcast/new?audience=pool\|followers\|both` and `/inbox/broadcast/{id}`. Broadcast push links now use `/inbox/broadcast/{id}`. The old `?tab=broadcast&id=` opened the tab with nothing selected.                                                                                                                                                                                                                          |
| Privacy       | The notice describes broadcasts to followers and pool stakers, the email consent rule, and how long delivery records are kept. `CONSENT_POLICY_VERSION` is `2026-11a`. Counsel should read the Broadcasts paragraph.                                                                                                                                                                                                                 |
| Admin         | Review rows show the audience line. The Senders notice says every creator can send.                                                                                                                                                                                                                                                                                                                                                  |
| Copy          | `BROADCAST_UI` in `packages/constants/src/messages.ts`, checked by `check:copy`.                                                                                                                                                                                                                                                                                                                                                     |

## 3. Not in this PR

1. **Broadcast email.** Phase 2. The consent rule is recorded on each delivery.
2. **Members audience.** Members join the picker when Memberships ships (bc-audience).
3. **Mute from the creator row** in Received. Mute stays on the opened broadcast, as today.
4. **Telegram.** It is unchanged (see 0). The composer's Telegram reach counts pool stakers, as before.
5. **Docs PR #427** (QA fixes for the Messages screens) still targets the closed `chore/remove-telegram`. Retarget it to `development`. Its section 8.6 text matches what is built here.

## 4. Decision for Rob

**bc-allowlist.** Should broadcasts to pool stakers follow the stake pilot allowlist (`access_stake_kinds_allowlist`)?

- Recommended: no, as built. The allowlist is a counsel gate on unlocking items by stake. A broadcast unlocks nothing, it carries the Testnet notice, and the financial promise word list warns before send. Following the allowlist would silence every pool broadcast for creators outside the pilot. That would be a regression from today.
- Alternative: yes. Then outside the pilot, Pool stakers and Both reach followers only.

## 5. Checks run

- `pnpm run typecheck:affected` and `pnpm run build:affected`: all pass, run with turbo concurrency 1.
- `pnpm run test:affected`:
  - Client 268, landing 62, constants 213, ui 87, auth server 5 and the media packages: all pass.
  - Server `test:unit`: 1,343 passed. Two unhandled errors come from `oauth-trpc` and `oauth-scopes`, which need a local MySQL.
- New tests:
  - `broadcast-audience.test.ts` (7): paging, the allowlist bypass, dedupe, blocks both ways, the creator left out, email consent.
  - `broadcast.test.ts`: 8 more covering follower fan out, skip reasons, the pool requirement, audience send, empty audience, the old client default and `audienceCounts`.
  - `access-engine.test.ts`: `stakeAllowlist: false`.
  - Client: `Composer.test.tsx` (6) and `MyPoolDestination.test.tsx` (2).
- `pnpm check:copy` passes. `oxlint` on the changed files: no errors.

## 6. Staging check for Gustavo

1. Run the migration. Turn on `broadcast` and `messages`. Existing broadcasts read "To pool stakers".
2. As a creator with a pool, 2 stakers and 3 followers, one of whom also stakes:
   - Open My Pool. The Broadcast card shows. Press Broadcast. The composer opens with Pool stakers picked: 2 people.
   - Pick Both. It reads 4 people. Send.
   - The person who follows and stakes gets it once. Sent shows "To followers and pool stakers".
3. As a creator with followers and no pool:
   - Inbox, Broadcast, Sent, New broadcast. Only Followers can be picked.
   - Send. A follower who does not stake gets it in Received with "To followers".
   - Their delivery row has `emailSkipReason = no_email_consent` unless they ticked email updates.
4. Block a follower in Messages, then send to Followers. They get nothing.
5. Write "Thanks for staking" in a Followers broadcast. The preview and the opened broadcast show the Testnet notice.
6. Send 3 in a day. The quota line reads "3 of 3 sent today. You can send again tomorrow." and New broadcast is disabled.
7. Tap a broadcast push notification. It opens that broadcast.
8. The privacy notice at staging.amped.bio/privacy has the Broadcasts paragraph, and the consent card asks again.
