# M9: Broadcast in Messages, to pool stakers, followers or both

Branch `feat/broadcast-in-messages` into `development`. Amped Messages PR plan M9, Build Board #2 (Amped Messages) and #1 (Broadcast). Spec: `docs/features/messaging.md` sections 6, 7.5, 8.6 and 9, and decisions msg-broadcast, bc-audience, bc-rules, bc-email and bc-pool-terms. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-05.

## 0. This PR carries M8

M9 stacks on M8. M8 (#415, `chore/remove-telegram`) was approved and then closed without merging, so `development` still has the Telegram code. This branch is M8's head (`b25059f4`) with `development` merged in, so it includes all of M8. Close nothing else for it. If you would rather land M8 on its own first, reopen #415 against `development`, merge it, and this PR then shows only M9.

Merging `development` into M8:

- Telegram files that `development` changed after M8 stay deleted: the `site_settings` flag move in `0cc0351c` and `services/messaging/door.ts`. The flags `telegram`, `telegramGroups` and `telegramMiniApp` go, with `TELEGRAM_GROUPS` and `TELEGRAM_MINIAPP`.
- `getHandle` keeps G3 `publicBlocksFor` and M8's owner only `telegram_group` filter.
- `check:copy` keeps the content gating check and drops the Telegram one.

Your review items on #415 are fixed in `42c64d75`:

1. **Privacy notice.** The Telegram section now says Telegram ended. It lists what we still hold from before, says that it is deleted with the Telegram tables, and gives privacy@amped.bio for deletion sooner. The Telegram rows leave the uses, recipients and storage tables. The draft key is `amped_message_draft` (the code's name). Broadcasts are described (see 2). `CONSENT_POLICY_VERSION` is `2026-11a`. **Counsel should read sections 2, the Telegram section, 7 and 10 before production.**
2. `ProfileView`: a `telegram_message` row renders nothing while the `messages` flag is off.
3. `editBlock` refuses `telegram_group` and `telegram_message`, as `addBlock` does.
4. `BuyUsdcFlow`: the Telegram Mini App branch goes.
5. Staging groups with bot-approved requests: unchanged. They need the follow up drop migration.

## 1. Migration

One migration, label `migration`. `packages/database/prisma/migrations/20261105120000_broadcast_audiences/migration.sql`:

```sql
ALTER TABLE `broadcasts` MODIFY `audienceKind` ENUM('ALL_MEMBERS', 'POOL_MEMBERS', 'FOLLOWERS', 'POOL_AND_FOLLOWERS') NOT NULL DEFAULT 'ALL_MEMBERS';
UPDATE `broadcasts` SET `audienceKind` = 'POOL_MEMBERS' WHERE `audienceKind` = 'ALL_MEMBERS';
ALTER TABLE `broadcasts` MODIFY `audienceKind` ENUM('POOL_MEMBERS', 'FOLLOWERS', 'POOL_AND_FOLLOWERS') NOT NULL DEFAULT 'POOL_MEMBERS';
ALTER TABLE `broadcasts` DROP COLUMN `sendTelegram`;
ALTER TABLE `broadcast_deliveries` DROP COLUMN `telegramStatus`, DROP COLUMN `tgMessageId`;
```

```bash
pnpm --filter @repo/database exec prisma migrate deploy --schema=./prisma/schema.prisma
```

Rollback: put `ALL_MEMBERS` back in the enum, map `POOL_MEMBERS` to it, and re-add the three Telegram columns with their old defaults. Their values are gone, but nothing reads them.

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
| Admin         | Review rows show the audience line. The Senders notice says every creator can send.                                                                                                                                                                                                                                                                                                                                                  |
| Copy          | `BROADCAST_UI` in `packages/constants/src/messages.ts`, checked by `check:copy`.                                                                                                                                                                                                                                                                                                                                                     |

## 3. Not in this PR

1. **Broadcast email.** Phase 2. The consent rule is recorded on each delivery.
2. **Members audience.** Members join the picker when Memberships ships (bc-audience).
3. **Mute from the creator row** in Received. Mute stays on the opened broadcast, as today.
4. **The drop migration** for the seven Telegram tables, `message_threads` and `messages`. It follows staging sign off, as planned in M8.
5. **Docs PR #427** (QA fixes for the Messages screens) targets `chore/remove-telegram`. Retarget it to `development` after this merges. Its section 8.6 text matches what is built here.

## 4. Decision for Rob

**bc-allowlist.** Should broadcasts to pool stakers follow the stake pilot allowlist (`access_stake_kinds_allowlist`)?

- Recommended: no, as built. The allowlist is a counsel gate on unlocking items by stake. A broadcast unlocks nothing, it carries the Testnet notice, and the financial promise word list warns before send. Following the allowlist would silence every pool broadcast for creators outside the pilot. That would be a regression from today.
- Alternative: yes. Then outside the pilot, Pool stakers and Both reach followers only.

## 5. Checks run

- `pnpm run typecheck:affected` and `pnpm run build:affected`: all pass, run with turbo concurrency 1.
- `pnpm run test:affected`:
  - Client 268, landing 62, constants 213, ui 87, auth server 5 and the media packages: all pass.
  - Server `test:unit`: 1,129 passed. Two unhandled errors come from `oauth-trpc` and `oauth-scopes`, which need a local MySQL.
- New tests:
  - `broadcast-audience.test.ts` (7): paging, the allowlist bypass, dedupe, blocks both ways, the creator left out, email consent.
  - `broadcast.test.ts`: 8 more covering follower fan out, skip reasons, the pool requirement, audience send, empty audience, the old client default and `audienceCounts`.
  - `access-engine.test.ts`: `stakeAllowlist: false`.
  - `blocks-retired.test.ts`: the `editBlock` refusal.
  - Client: `Composer.test.tsx` (6) and `MyPoolDestination.test.tsx` (2).
- `pnpm check:copy` and `pnpm run check:telegram` pass. `oxlint` on the changed files: no errors.

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
8. Telegram is gone, as in #415's staging check. The privacy notice at amped.bio/privacy shows the Telegram (ended) section, and the consent card asks again.
