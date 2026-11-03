# Amped Messages: native messaging spec (Build Board #2, revision 4)

Status: draft for Rob's review, 2026-11-02. Replaces Messaging on Telegram (claude/amped-telegram-messaging-spec-2026-10-08.md and its revision 3 for phases 2 and 3). Where this file and those differ, this file wins.

## 1. Summary

Amped.Bio drops Telegram as the messaging layer and runs its own direct messages inside the app. Every Amped account can message every other Amped account, the way X direct messages work, subject to the recipient's "Who can message me" setting. Messages from people the recipient has no relationship with land in Requests. The Inbox becomes a destination on the side rail with an unread count. The bell in the top bar becomes the notification center and shows new message alerts in real time. Broadcast moves into Messages as the Broadcast tab, where fans read broadcasts and creators write them. My Pool keeps a Broadcast button that opens the same composer. Creators can broadcast to pool stakers, to followers, or to both, under the same rules.

The invite only pilots for Broadcast and Messages are removed. Admin controls stay: pause a sender, pause a recipient, report queue, first broadcast review, caps and the kill switch.

What already exists makes this a transport swap, not a rebuild. Amped is already the system of record: `MessageThread` and `Message` store every message, `canMessage` is one door for every path, and the web inbox already reads and sends. Telegram was only a transport and a sign up hurdle.

## 2. Why

1. Telegram linking is the largest drop off in the current flow. A fan must have Telegram, link it through OIDC, then press Start in the bot. A creator must do the same before Fan messages can turn on. The staging bug on 29 Oct (Link step green, Messages step "Link Telegram first") came from that handshake.
2. Telegram rules constrain the product. The Mini App TON only rule bans REVO, pool and wallet blocks. Bot messages need a prior Start. Private groups cannot be read by link.
3. Messages are core to the creator relationship and to paid memberships. They belong in the product, next to Content, Memberships and the Wallet, with one account and one notification system.

## 3. Review of what is built

Checked against `development` at f5df98a9 (30 Oct 2026) and re-checked at 0500800b (2 Nov 2026) in the full QA.

| Area | Built | Keeps, changes or goes |
|---|---|---|
| `MessageThread`, `Message`, `MessageReport` | Creator and fan roles, unread counters, read times, mute, block, report | Keeps. Migrated to a symmetric model (section 6) |
| `CreatorMessagingSettings` | enabled, ruleKind, stakeMin, dailyNewThreadCap, replyFromTelegram, invitedAt, pausedAt | Becomes `MessagingSettings` for every account. `invitedAt` and `replyFromTelegram` go |
| `MessagingSenderStatus` | Sender pause with an end date | Keeps |
| `services/messaging/access.ts` `canMessage` | One door: page published, not paused, rule, block, caps, threshold pauses | Keeps. Invite check removed, request routing added |
| `services/messaging/threads.ts` | send, reply, block, mute, report, markRead | Keeps. Outbox calls to Telegram replaced by the event bus |
| `services/messaging/delivery.ts` | Telegram copy of each message | Goes |
| `services/telegram/*` (11 files), `routes/telegram.ts`, `routes/telegramOidc.ts`, bot, loop, OIDC | Linking, bot, outbox loop, webhook | Goes. The claim loop pattern is reused for notification jobs |
| `TelegramAccount`, `TelegramLinkEvent`, `TelegramUpdateLog`, `TelegramInbox`, `TelegramOutbox` | Telegram tables | Dropped one release after M7 |
| `Broadcast.sendTelegram`, `BroadcastDelivery.telegramStatus`, `tgMessageId` | Telegram copy of broadcasts | Goes. Broadcasts raise a bell notification and an optional push |
| `NotificationPreference.telegramEnabled` | Telegram opt in | Replaced by `pushEnabled` |
| Client: `InboxPanel`, `MessagesTab`, `ThreadView`, `FanMessagesSettings`, `RuleTiles` | Inbox tabs, list, thread, settings, rule tiles | Keeps and is redesigned. Polling every 60 s replaced by a live stream |
| Client: `TelegramWizard`, `TelegramHomeCard`, `TelegramBotStartNotice`, `TelegramConnection`, `TelegramBlockFields`, `TelegramBlock` | Telegram setup and blocks | Goes |
| `TelegramMessageBlock` (Message me on Telegram) | Public button with the rule line | Becomes the Message me block. Opens the Amped composer |
| `InboxButton` (bell in top bar, Inbox, dot) | Opens the Inbox panel | Becomes the notification bell with a count and a popover |
| `destinations.ts` | No Inbox on the rail | Inbox added to the rail with a count badge |
| `MESSAGING_INVITE_ONLY`, `BROADCAST_INVITE_ONLY` and admin Pilot tabs | Invite gates | Removed |
| Admin `telegram.ts` router | Reports, paused, pilot, bot health | Becomes admin Messaging under Safety. Pilot and bot health go |
| PRs #383, #386, #390 (gated Telegram groups, groups UI, Mini App) | Merged to development on 2 Nov: `TelegramGroup`, `TelegramGroupMember`, `services/telegram/groups.ts`, `inline.ts`, `miniapp.ts`, `initData.ts`, `trpc/telegram/groups.ts` and `miniapp.ts`, landing `/tg` and `MiniApp.tsx`, `TelegramGroupBlock`, `TelegramGroups.tsx`, the My Pool Telegram group tab, admin Groups tab, migration `20261029180000_telegram_groups` | Removed in M8 with the rest of Telegram |
| Access engine (#398, access-core) | Merged 2 Nov. `services/access/engine.ts` with `check`, `open`, `eligibleUserIds`; resource type `dm` is reserved. Messaging still calls `evaluateRule` in `services/telegram/rules.ts` | Messaging rules stay open to every creator (Rob, 2 Nov): M2 moves `evaluateRule` to `services/messaging/rules.ts` and does not read the engine's `ACCESS_STAKE_KINDS_ALLOWLIST` pilot. Broadcast (M9) uses `eligibleUserIds` for audiences only |

Production has `VITE_SHOW_TELEGRAM=false` and `TELEGRAM_ENABLED=false`. No production user has a Telegram link or a thread, so there is no production data migration risk. Staging threads are migrated by M1.

## 4. Research

### 4.1 How X direct messages work

1. A setting decides who can message you: anyone, or only people you follow and people you have messaged before. Turning the open setting off does not stop past conversation partners.
2. Messages from people you do not follow arrive as requests. You accept or delete them. Replying accepts.
3. Report closes the conversation: the reported account cannot message you again until you message it first. Block stops all messages.
4. Sending caps apply per account per day (X: 500 DMs a day), and duplicate messages to many accounts are flagged as spam with a cool down.

Amped keeps this shape and adds what X does not have: the creator's access rules (followers, members, pool fans, minimum stake), because a creator page is a storefront and the rule is part of the offer.

### 4.2 Realtime transport options

| Option | Fit | Cost and risk | Verdict |
|---|---|---|---|
| tRPC v11 subscription over Server Sent Events, Redis pub/sub between instances | Uses the existing Express and tRPC stack and the Redis already used for locks and caching. tRPC recommends SSE for subscriptions. `tracked()` ids let a client resume after a drop and the server replays what it missed. Sends stay ordinary mutations | One open HTTP stream per signed in tab. Cloudflare closes silent streams, so the server pings every 25 s. No sticky sessions needed | Recommended for v1 |
| Socket.IO with the Redis adapter | Bidirectional, mature. `socket.io` is already a server dependency but unused | Needs sticky sessions behind a load balancer, a second auth path and a second protocol to test | Alternative |
| Cloudflare Durable Objects with WebSocket Hibernation | Scales to very large connection counts at low idle cost; an object sleeps while clients stay connected. Fits the Cloudflare first direction (R2, Stream, Workers) | New runtime, auth bridge from the Express session, and the DB still lives on the origin | Phase 3 path if concurrent connections pass about 50,000 |
| Managed chat (Stream, Sendbird, Ably) | Fast to ship with SDKs | Per MAU pricing, message data held by a vendor, and moderation, access rules and payments would have to be mirrored | Not recommended |

### 4.3 Notifications outside the app

1. Web Push with VAPID keys through a service worker. Works on Chrome, Edge, Firefox and Safari on macOS. On iPhone and iPad it works only when the person has added Amped.Bio to the home screen and opens it from there, and the permission prompt must follow a tap. A subscription in Safari and one in the home screen app are separate.
2. Email reminder for unread messages through SMTP2GO, the existing transactional path.
3. In app: the bell count, a toast when a message lands on another screen, and the rail badge.

### 4.4 Safety and compliance

1. Text only in v1. Images and files in messages wait for v2 behind hash matching against `BlockedContentHash` and a CSAM matching vendor. Once Amped stores user images in messages, the US provider duty to report apparent CSAM to NCMEC (18 U.S.C. 2258A) applies to that surface. Amped allows adult content, so this is a launch gate for media, not an option.
2. No end to end encryption in v1. Reports must be reviewable and admins read only reported threads. Bodies are encrypted at rest with the existing AES-256-GCM helper (`secret.ts`, moved to `services/crypto`).
3. Requests never render links as clickable and never unfurl until accepted. This blocks the most common DM spam and phishing pattern.
4. Financial promise language is checked with the Broadcast word list. Messages warn the sender and store the flag. They do not block. Reports can use the Financial promise reason.
5. The Testnet notice stays on any message surface that shows tREVO or pool context. It imports `TESTNET_NOTICE` from `packages/constants/src/testnet.ts`, the one line every surface uses since PR #382: "Testnet only. Pool rewards come from the network, vary, and are not guaranteed." The Prism doc section 15 line differs ("set by the creator") and is out of date; the v1.1 change log records it.
6. Notification previews (push, email, lock screen) never show message text from a request, and never show text from an 18+ creator. They say "New message from @handle". A creator counts as 18+ when any of their published `ContentItem` rows has `adult` true, or when they turn on 18+ in Adult setup once Adult Content Review ships. There is no creator level flag today.

## 5. Decisions

Each has the recommended answer, why, and the alternatives. The recommended answer is what this spec builds.

| Id | Question | Recommended | Why | Alternatives |
|---|---|---|---|---|
| msg-transport | How does a message reach the other person live? | tRPC subscription over SSE, fanned out with Redis pub/sub. MariaDB stays the system of record | Same stack, no sticky sessions, resumable, works behind Cloudflare with a 25 s ping | Socket.IO with the Redis adapter; Cloudflare Durable Objects; a managed chat vendor |
| msg-model | Who can message whom? | Any Amped account can message any other, one to one, subject to the recipient's setting. Every account has the same settings, creator or fan | Matches X. Fans are also creators on Amped | Keep creator inbound only, fans never receive |
| msg-requests | What happens to a first message from a stranger? | It lands in Requests. Primary holds people you follow, people you messaged, your paid members and accepted requests. Before acceptance the sender may send up to 3 messages, links show as plain text and no push or email preview shows the text | Keeps the inbox clean without blocking fans | Everything in one inbox; block until accepted |
| msg-rules | Do creator rules stay? | Yes, as "Who can message me": Anyone, Followers and members, Members only, Pool fans only, Fans with a minimum stake, No one. Default for a new account: Followers and members. People you follow and people you messaged can always reply | The rule is part of the creator offer and the existing door already enforces it | Anyone by default; drop the stake rule |
| msg-invite | Invite only? | Removed for Messages and Broadcast. Env flags, `invitedAt` checks and the Pilot admin tabs go | Rob's call (2 Nov) | Keep a pilot |
| msg-new-accounts | What replaces the invite gate against abuse? | Accounts younger than 7 days may start 5 new conversations a day. Email verification follows the 30 day grace (PR #300). Sender caps: 20 per conversation per hour, 200 a day, 50 new conversations a day. Admin can change each cap | Throttles throwaway accounts without friction for real fans | Phone verification to message strangers; a captcha per new conversation |
| msg-rail | Where does Inbox live? | Rail item Inbox in the Start group after Explore, with an unread conversation count. On phones Inbox replaces Design in the dock; Design moves to More | Most fans use phones; messaging needs one tap | Keep Inbox only behind the bell; add Inbox to More |
| msg-bell | What does the bell do? | Notification center: a count of unseen alerts, a popover of the latest 20 (new message, new request, new broadcast) and Mark all as seen. Opening Inbox clears message alerts | Rob asked for new message alerts on the bell; a later follow and sale alert can reuse it | Bell opens Inbox as today |
| msg-push | Out of app alerts? | Web Push, asked after the first message is sent or received, never on load. Email reminder for an unread message after 30 minutes, at most one per conversation per 6 hours and 3 a day, on by default with a one tap off | Reaches people who closed the tab, iPhone included once on the home screen | Email only; native app later |
| msg-content | What can a message hold? | Text up to 2,000 characters, emoji and links. Images and files in v2 behind hash matching | Keeps v1 outside the CSAM storage duty and the adult surface rules | Images in v1 |
| msg-receipts | Read receipts and typing? | Read receipts on by default with a setting to turn them off (off hides yours and theirs). Typing shows for 6 s, not stored | X and most messengers behave this way | Off by default; no typing |
| msg-delete | Delete and unsend? | Delete for me at any time. Unsend for both within 15 minutes. Reported messages are kept for admins even after unsend | Normal expectation; reports stay reviewable | No unsend; edit as well |
| msg-encryption | End to end encryption? | No in v1. TLS plus field encryption at rest. Admins read only reported threads | Reports need readable text | Encrypted DMs like XChat in a later version |
| msg-account-deletion | What happens when an account is deleted (#326)? | Conversations survive. The departed member shows as Deleted account and their messages read "Message removed". `ON DELETE RESTRICT` plus `anonymizeMessagingForUser(userId)` in M1, called by the account deletion sweeper when that spec ships (no sweeper exists yet) and by admin user deletion today | The other person keeps their history | Cascade delete both sides |
| msg-groups | Group conversations? | Not in v1. The schema supports members per conversation so groups can arrive with member gated creator groups later | Groups need their own moderation and gating design | Ship small groups now |
| msg-telegram | What happens to Telegram? | Removed: linking, bot, Broadcast on Telegram, groups, Mini App. Remove what #383, #386 and #390 added (merged 2 Nov). Tables dropped one release after removal | Rob's call. One messaging system | Keep Telegram as an optional push channel |
| msg-broadcast | Does Broadcast change? | Rob, 2 Nov: Broadcast moves into Messages and is called Broadcast. The Inbox tab and the composer live there. My Pool keeps a Broadcast button that opens the composer with Pool stakers picked. `sendTelegram` goes. Each delivery raises a bell alert and an optional push | One place for everything a creator sends and a fan receives | Keep the composer in My Pool only |
| msg-open-rules | Do messaging stake rules follow the access engine pilot allowlist? | Rob, 2 Nov: no, they are open. `services/messaging/rules.ts` reads Follow and pool stakes directly for every creator | Who may message a creator is the creator's choice, not a pilot gate | Gate stake rules behind `ACCESS_STAKE_KINDS_ALLOWLIST` |
| bc-audience | Who can a broadcast go to? | Rob, 2 Nov: pool stakers, followers, or both. One delivery per person when someone is both. Members join the picker when Memberships ships | Followers are the largest audience a creator has | Pool stakers only |
| bc-rules | Do follower broadcasts follow the pool rules? | Rob, 2 Nov: the same rules. 3 a day and 10 a week per creator across all audiences; the first broadcast is admin reviewed once per creator; flagged terms warn and are stored; reports from 1% of recipients, minimum 3, pause the sender | One rule set is easier to explain and to enforce | Separate quotas per audience |
| bc-email | Do followers get broadcast email? | Only followers who ticked email updates when they followed (`Follow.email_updates`). Pool stakers keep their stake time opt in. Everyone else gets the Inbox, the bell and push | A follow alone is never email consent (Fan Graph rule) | Email every follower |
| bc-pool-terms | What if a follower broadcast mentions the pool or staking? | The Testnet notice shows under the broadcast for every recipient. Financial promise terms warn the creator before send, as today | Followers who have not staked are the audience most likely to read pool language as an offer | Block pool language to followers |
| msg-telegram-groups | Gated Telegram groups merged on 2 Nov (#383, #386, #390). Keep them? | Remove them with the rest of Telegram in M8. Existing telegram_group blocks stop rendering with an editor notice pointing to the Community block. Staging only; production never had them | Rob removed Telegram; groups depend on the bot, linking and the Mini App | Keep groups only; build native group conversations later (msg-groups) |
| msg-door | How does a visitor start a conversation from a page? | The Message me block opens the composer. Signed in: a sheet on the public page. Signed out: sign up or log in, then the composer with the draft kept. The public page is the landing app on amped.bio and reaches the API with the session cookie shared across subdomains (`COOKIE_DOMAIN`), as sign in already does | One tap from page to message | Link to app.amped.bio/inbox only |

## 6. Data model

New tables use UUID v7 `Binary(16)` ids, as today. Migration `20261103000000_native_messaging`.

```prisma
enum ConversationKind { DIRECT }
enum MemberFolder { PRIMARY REQUESTS }
enum MemberState { ACTIVE BLOCKED LEFT }

model Conversation {
  id            Bytes            @id @db.Binary(16)
  kind          ConversationKind @default(DIRECT)
  // DIRECT: "{lowUserId}:{highUserId}", one conversation per pair
  pairKey       String?          @unique @db.VarChar(32)
  createdById   Int
  lastMessageId Bytes?           @db.Binary(16)
  lastMessageAt DateTime?
  createdAt     DateTime         @default(now())
  members  ConversationMember[]
  messages DirectMessage[]
  @@index([lastMessageAt])
  @@map("conversations")
}

model ConversationMember {
  conversationId Bytes        @db.Binary(16)
  userId         Int
  folder         MemberFolder @default(PRIMARY)
  state          MemberState  @default(ACTIVE)
  acceptedAt     DateTime?    // null in REQUESTS until accepted or replied
  lastReadId     Bytes?       @db.Binary(16)
  lastReadAt     DateTime?
  unread         Int          @default(0)
  mutedUntil     DateTime?
  archivedAt     DateTime?
  clearedBeforeId Bytes?      @db.Binary(16) // delete for me
  joinedAt       DateTime     @default(now())
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Restrict)
  @@id([conversationId, userId])
  @@index([userId, folder, archivedAt])
  @@map("conversation_members")
}

model DirectMessage {
  id             Bytes     @id @db.Binary(16) // UUID v7, sortable: cursor and SSE event id
  conversationId Bytes     @db.Binary(16)
  senderId       Int
  bodyEnc        String    @db.Text          // AES-256-GCM envelope
  bodyLength     Int
  idempotencyKey String?   @db.VarChar(64)
  flaggedTerms   Json?
  unsentAt       DateTime?
  createdAt      DateTime  @default(now())
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@unique([conversationId, idempotencyKey])
  @@index([conversationId, id])
  @@index([senderId, createdAt])
  @@map("direct_messages")
}

model MessagingSettings {        // renamed from creator_messaging_settings
  userId            Int        @id
  ruleKind          DmRuleKind @default(FOLLOWER) // adds NOBODY
  stakeMin          String?    @db.VarChar(80)
  dailyNewThreadCap Int        @default(50)
  readReceipts      Boolean    @default(true)
  pausedAt          DateTime?
  pausedReason      String?    @db.VarChar(255)
  updatedAt         DateTime   @updatedAt
  @@map("messaging_settings")
}

enum NotificationKind { MESSAGE REQUEST BROADCAST }

model Notification {
  id        Bytes            @id @db.Binary(16)
  userId    Int
  kind      NotificationKind
  actorId   Int?
  refId     Bytes?           @db.Binary(16) // conversation or broadcast
  // Collapses repeats: one row per conversation until seen
  groupKey  String           @db.VarChar(64)
  count     Int              @default(1)
  seenAt    DateTime?
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt
  @@index([userId, groupKey, seenAt]) // collapse in code: one unseen row per groupKey
  @@index([userId, createdAt])
  @@map("notifications")
}

model PushSubscription {
  id        Bytes    @id @db.Binary(16)
  userId    Int
  endpoint  String   @unique @db.VarChar(512)
  p256dh    String   @db.VarChar(128)
  auth      String   @db.VarChar(64)
  userAgent String?  @db.VarChar(255)
  failedAt  DateTime?
  createdAt DateTime @default(now())
  @@index([userId])
  @@map("push_subscriptions")
}

model NotificationJob {          // replaces TelegramOutbox; same claim loop
  id        Bytes    @id @db.Binary(16)
  channel   String   @db.VarChar(8) // push | email
  userId    Int
  payload   Json
  status    String   @default("PENDING") @db.VarChar(8)
  attempts  Int      @default(0)
  runAfter  DateTime @default(now())
  claimedAt DateTime?
  doneAt    DateTime?
  error     String?  @db.VarChar(255)
  createdAt DateTime @default(now())
  @@index([status, runAfter])
  @@map("notification_jobs")
}
```

Broadcast changes: `BroadcastAudienceKind` becomes `POOL_MEMBERS | FOLLOWERS | POOL_AND_FOLLOWERS` (existing `ALL_MEMBERS` rows map to `POOL_MEMBERS`). `Broadcast.poolId` becomes optional and is required only when the audience includes the pool. `processBroadcast` freezes the audience with the access engine's `eligibleUserIds` (the gating spec names broadcast audiences as its use): the union of pool member ids and follower ids (excluding `FollowBlock` and accounts that blocked the creator in Messages); `BroadcastDelivery @@unique([broadcastId, userId])` with `skipDuplicates` already gives one delivery per person. `BroadcastDelivery.emailStatus` for a follower is eligible only when `Follow.email_updates` is true. `sendTelegram`, `telegramStatus` and `tgMessageId` are dropped.

`MessagingSenderStatus` keeps its shape. `MessageReport` gains `conversationId` and `directMessageId` and keeps a copy of the reported text (`bodySnapshotEnc`) so unsend cannot erase evidence. `NotificationPreference` drops `telegramEnabled` and adds `pushEnabled Boolean @default(true)` and `messageEmailEnabled Boolean @default(true)` on the global row.

Migration steps:
1. Create the new tables.
2. Copy each `MessageThread` to a `Conversation` with two members. Staging only; production has no threads (`TELEGRAM_ENABLED=false`). The creator side keeps PRIMARY; the fan side keeps PRIMARY. Unread counters and read times carry over. Status BLOCKED_BY_* becomes the blocking member's `state = BLOCKED`.
3. Copy each `Message` to `DirectMessage`, encrypting the body. Telegram ids are dropped.
4. Rename `creator_messaging_settings` to `messaging_settings`, drop `enabled` (ruleKind NOBODY replaces off), `replyFromTelegram` and `invitedAt`.
5. M7 drops `message_threads`, `messages` and the Telegram tables one release later, after staging sign off.

Scale notes: the hot reads are the inbox list (`conversation_members` by `userId, folder, archivedAt` joined to `conversations.lastMessageAt`) and a page of messages (`direct_messages` by `conversationId, id`). Both are index range scans. The total unread count is cached in Redis per user and rebuilt on miss. At 1 million messages a day the table grows about 30 GB a year at 2,000 character worst case and far less in practice. Monthly partitioning of `direct_messages` by `createdAt` is planned for when it passes 200 million rows.

## 7. Server

### 7.1 Access (`services/messaging/access.ts`)

`canMessage(senderId, recipientId)` keeps its order of checks and adds request routing. Step 4 evaluates the recipient's rule with `evaluateRule` in `services/messaging/rules.ts` (moved from `services/telegram/rules.ts`). Decision (Rob, 2 Nov): messaging stake rules are open to every creator. They do not call the access engine and are not limited by its `ACCESS_STAKE_KINDS_ALLOWLIST` pilot. A refusal never carries an amount. Limits move from `TELEGRAM_LIMITS` to `MESSAGE_LIMITS` in `packages/constants/src/messages.ts`.

1. Self, missing account, account blocked, sender paused: refuse.
2. Recipient has blocked the sender (member state or `FollowBlock`): refuse `blocked`.
3. Relationship: the recipient follows the sender, or they have an accepted conversation, or the sender is the recipient's paid member. If yes: allowed, folder PRIMARY, no rule check.
4. Recipient rule: NOBODY refuses `closed`. Otherwise `evaluateRule` as today. A failed rule refuses with the rule reason (`not_follower`, `not_member`, `not_pool_fan`, `stake_below`). No amount is ever returned.
5. Caps: per conversation per hour, per day, new conversations per day, the recipient's `dailyNewThreadCap`, new account cap. Refuse `sender_cap` or `cap_reached`.
6. Allowed, folder REQUESTS. While the recipient has not accepted, the sender's 4th message refuses `awaiting_accept`.

The env check `MESSAGING_INVITE_ONLY` and `settings.invitedAt` are removed. The kill switch is the `messages` feature flag (admin › Feature flags), resolved on the API with `isFeatureOn("messages")`; without an admin row it falls back to the server variable `MESSAGING_ENABLED` (default true). When off, sends refuse `disabled` and the Inbox reads only.

### 7.2 Sending (`services/messaging/send.ts`)

One transaction: re check `canMessage`, upsert the conversation by `pairKey`, insert the message, update `lastMessageId` and `lastMessageAt`, increment the recipient member's `unread`, upsert the recipient's `Notification` (collapsed by `groupKey = conv:{id}`, count +1). After commit: publish to Redis, enqueue a push job when the recipient has no live stream, enqueue the email reminder check at +30 minutes. Idempotency key from the client returns the first message on retry.

### 7.3 Realtime (`services/realtime/*`)

1. Bus: Redis pub/sub channel `rt:u:{userId}` (`services/realtime/bus.ts`). Publish is best effort; the database is the record. Signals carry ids only, never message text: the stream that receives a signal loads and decrypts what its own user may see (`services/realtime/stream.ts`), so plaintext never crosses Redis. Each instance keeps one subscriber connection and subscribes to a user's channel while that user has a stream open there. Without Redis the bus runs in process.
2. Stream: `realtime.events` tRPC subscription over SSE at `/trpc`. Auth by the session cookie, the same as every private procedure. Pings use the shared tRPC `sse` config (every 3 s, client reconnects after 10 s of silence), which is tighter than the 25 s first planned and keeps Cloudflare's idle timeout far away. An Express middleware sets `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform` on `/trpc/realtime.events`.
3. Events: `message.new`, `message.unsent`, `conversation.read` (for receipts), `conversation.updated` (accepted, deleted, read, cleared, muted, unmuted, archived, unarchived, blocked, unblocked), `typing`, `notification.new`, `unread.changed`, and `resync`. Each is `tracked(id)` with a UUID v7; a message event's id is the message id.
4. Resume: on reconnect the client sends `lastEventId`. The server subscribes first, then replays `direct_messages` in the user's conversations after `lastEventId` (at most 200; beyond that it sends `resync` and the client refetches) and the current unread totals. A message replayed and also received live is sent once.
5. Typing: a mutation `realtime.typing({ conversationId })`, one every 3 s per conversation (extra calls are dropped quietly), published only, never stored. Only between members who both accepted: a stranger in Requests never sees typing.
6. Who hears what: a new message goes to both sides (the sender's other tabs too); unsend to both; a read reaches the other side only when both keep receipts on and the reader accepted; accept reaches both; delete request, clear, mute, archive and block reach only the caller's own tabs. A blocked person is never told.
7. Presence: each open stream refreshes `rt:on:{userId}` (60 s TTL) every 25 s. M4 reads `isLive(userId)` to skip a push while the app is open.
8. Cloudflare: a Cache Rule bypasses caching on `/trpc/realtime.*`; compression is off on that route.

### 7.4 Notifications (`services/notifications/*`)

1. Bell: `notifications.list` (latest 20, newest first, with the actor), `notifications.unseenCount` (capped at 100 for the 99+ badge), `notifications.markSeen({ ids? })` (no ids marks every unseen row, which is what opening the bell does). Opening a conversation marks its MESSAGE and REQUEST rows seen. A muted conversation adds no row. Broadcast delivery adds one BROADCAST row per recipient (`groupKey = broadcast:{id}`). Each new row sends `notification.new` on the realtime stream.
2. Push: `web-push` with VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). `push.publicKey` (null while push is not set up), `push.subscribe`, `push.unsubscribe`. A push is queued only when the recipient has a device, push is on, the conversation is not muted, and no app stream is open (`isLive`). It is checked again when it runs: nothing is sent if the message was read or unsent meanwhile. A 404 or 410 from the push service deletes the subscription; other failures retry with backoff up to 5 attempts. Payload: title "@handle", body "Sent you a message" for requests and for senders with any 18+ label (a block or a content item), otherwise the first 80 characters. The tap opens `/inbox/{conversationId}`. The service worker (`apps/client/public/sw.js`) is push only: no cache, no fetch handler, and no system notification while the app is focused.
3. Email: one `NotificationJob` (channel email) per conversation runs at +30 minutes and sends only if the conversation is still unread, the person has a verified email, the conversation is not muted, and message emails are on. At most one per conversation every 6 hours and 3 a day. The email never carries the message text. Requests say so. The footer link (`https://API_HOST/email/messages-off?t=`, signed per account, no expiry) opens a page with one button that turns message emails off. It is a POST so mail scanners that open links cannot switch people off.
4. The job loop (`services/notifications/jobs.ts`) uses the Telegram claim pattern (conditional `updateMany`), polls every 2 s behind a Redis lock so one instance polls, and purges finished jobs after 30 days.

### 7.5 tRPC routes (`trpc/messages/*`)

`messages.list({ folder, filter, cursor })`, `messages.get({ conversationId, cursor })`, `messages.canMessage({ handle })`, `messages.send({ to | conversationId, body, idempotencyKey })`, `messages.accept`, `messages.delete` (request), `messages.read({ conversationId, messageId })`, `messages.unsend({ messageId })`, `messages.clear` (delete for me), `messages.mute({ until })`, `messages.archive`, `messages.block`, `messages.unblock`, `messages.report({ reason, note, messageId? })`, `messages.settings.get`, `messages.settings.set`, `messages.search({ q })` over the user's own conversations by name and handle.

Filters on the list: All, Unread, Members, Pool fans, Followers. The relation label on each row ("Member", "Pool fan", "Follower") comes from `views.ts` as today.

Broadcast routes: `broadcast.audienceCounts` returns pool, follower and deduplicated totals; `broadcast.create` takes `audience: POOL_MEMBERS | FOLLOWERS | POOL_AND_FOLLOWERS` and `poolId` when the pool is included. Quotas, first send review and pause rules are unchanged and count per creator across audiences.

Rate limits through the shared limiter (rate limiting spec): send 30 a minute, report 10 a day, typing one per 3 s, search 60 a minute.

### 7.6 Moderation and admin (`trpc/admin/messaging.ts`, under Safety)

Kept: report queue with the reported text and 20 messages of context, resolve, pause a sender (with or without an end), pause a recipient's inbound messages, the automatic thresholds (3 blocks in 7 days pauses a sender for 24 hours; reports from 1 percent of active conversations, minimum 5 distinct reporters, pauses inbound).

New: caps panel (the numbers in decision msg-new-accounts, stored in `SiteSettings` under keys `messaging.caps.*`, the key value table the admin settings router already uses), the kill switch, a flagged terms list shared with Broadcast, and a health card: messages per hour, live streams, push success rate, email reminders sent, open reports.

Removed: Pilot (invites), Bot health, Groups.

Roles: admin and moderator (both exist). safety_lead joins when Adult Content Review adds it. Route: admin `/messaging` replaces `/telegram` beside Broadcasts; it moves under Safety when that section ships.

## 8. Client

### 8.1 Shell

1. Rail: Inbox (MessageCircle icon) in the Start group after Explore, behind the `messages` feature flag (admin › Feature flags). A count badge shows unread conversations, capped at 99+. Requests and broadcasts never raise it; they count on their tab and on the bell. Badge: 20 high pill, 13/16 700 white on #5650A2 (6.85:1), tabular figures (Prism v1.1 addition pending approval).
2. Phone dock: Home, Page, Inbox, Wallet, More. Design moves to More.
3. Top bar bell: count of unseen alerts in a small pill on the bell. The popover (desktop) or sheet (phone) lists alerts with avatar, "@handle sent you a message", time, and an unread mark. Mark all as seen. View all opens Inbox.
4. Toast (D21 convention): G1 clear, r13, min 55, bottom left of the context field (above the dock on phones), sender and first line, one ghost action Reply, dismisses after 5 s. Never for muted conversations, never while that conversation is open.
5. Tab title prefix "(3)" while there are unseen alerts.

### 8.2 Inbox (`/inbox`, `/inbox/{conversationId}`)

1. Desktop: list on the left (360 wide), conversation on the right. Phone: list, then the conversation full screen with Back.
2. List header: Primary and Requests tabs (Requests shows its count), a search well, filter chips. New message (pen icon) opens the people search sheet.
3. Row: avatar, name, relation label, last message preview (Message removed when unsent), time, unread dot and count. Muted shows a muted mark.
4. Conversation: header with avatar, name and handle (opens their page), relation label, and a menu: Mute, Archive, Block, Report, Delete for me. Messages grouped by day; own messages right in the indigo bubble, theirs left on clear glass. Read receipt under the last own message ("Seen 2:14 PM") when both sides keep receipts on. Typing dots.
5. Composer: a well that grows to 6 lines, a character count from 1,800, Send (indigo 55 circle, primary action; dashed disabled ring while empty). Enter sends on desktop, Shift Enter breaks a line. Draft kept per conversation.
6. Request view: the stranger's messages with links as plain text, a notice "@handle is not someone you follow. Links are off until you accept.", and Accept (primary), Delete, Block, Report. Replying accepts.
7. Refusals as inline notices: "@maya takes messages from followers and members. Follow to message her." with Follow. "You have reached today's limit. Try again tomorrow." "@maya is not taking messages."
8. Broadcast tab, the third tab. See 8.6.

9. Built in M5: the open conversation lives in `?c=`; `/inbox/{conversationId}` (push and email links) redirects there. `?to={handle}` opens New message for that handle. The Broadcast tab shows the existing broadcast inbox until M9 rebuilds it. Message text search runs in the client over the loaded rows (bodies are encrypted at rest); people search runs on the server. Touch screens show a message's actions after a tap on the bubble.

### 8.3 Settings (Account, Messages)

Who can message me (rule tiles as today plus No one, with the stake input for the stake rule), Requests explainer, Read receipts switch, Notifications (Push on this device with Turn on, Email reminders), Blocked accounts list with Unblock. The iPhone install hint shows only on iOS Safari when not installed: "To get alerts on iPhone, add Amped.Bio to your Home Screen, then open it from there."

### 8.4 Message me block

Block kind `message` replaces `telegram_message`; existing blocks migrate in place and keep their label. Default label "Message me". The rule line stays ("Followers and members"). Tap: signed in opens the composer sheet over the page (calls `messages.canMessage` first and shows the refusal notice in the sheet); signed out opens sign up with `returnTo` and the draft in session storage. Inside in app browsers the sheet works in place; no hand off is needed.

### 8.5 Service worker and manifest

New `apps/client/public/sw.js` for push only (no offline caching in v1) and `manifest.webmanifest` with `display: standalone`, name Amped.Bio, the brand mark icons. Registration after sign in.

### 8.6 Broadcast in Messages

1. **Fan view.** Inbox, Broadcast tab: broadcasts from creators the person follows or stakes with, newest first, with the creator, the audience line ("To pool stakers", "To followers") and a Report action. Unread broadcasts count on the bell, not on the rail badge, so a busy creator list never drowns out direct messages. Mute a creator's broadcasts from the creator row (uses `NotificationPreference.mutedUntil`).
2. **Creator view.** The same tab shows New broadcast, the quota line ("2 of 3 left today"), and Sent with recipient counts and status (In review, Sending, Sent, Rejected).
3. **Composer.** Title, body (Markdown subset, 5,000 characters, 5 links), and an audience picker: Pool stakers (with the count), Followers (with the count), Both. The deduplicated total shows before send. First broadcast notice: "Your first broadcast is reviewed by Amped before it sends." The Testnet notice shows in the preview when the body mentions the pool, staking or tREVO.
4. **My Pool.** The Broadcasts tab is removed and the Telegram group tab goes with Telegram, leaving Overview. Overview gains one Broadcast card with the last broadcast and a Broadcast button. The button opens Inbox, Broadcast, New broadcast with Pool stakers picked.
5. **Routes.** `/inbox?tab=broadcast`, `/inbox/broadcast/new?audience=pool`, `/inbox/broadcast/{id}`.

## 9. Copy

All strings live in `packages/constants/src/messages.ts` and pass `check:copy`. No dashes. Key strings:

- Rail: "Inbox". Bell label: "Notifications, {n} new".
- Empty Primary: "No messages yet. Message a creator from their page, or start one here." Button: "New message".
- Empty Requests: "No requests. Messages from people you don't follow show up here."
- Request notice: "@{handle} is not someone you follow. Links are off until you accept."
- Push ask: "Get a notice when someone messages you?" Buttons: "Turn on", "Not now".
- Refusals: closed "@{handle} is not taking messages." rule "@{handle} takes messages from {rule label}." cap "You have reached today's message limit. Try again tomorrow." awaiting "Wait for @{handle} to accept your request before sending more."
- Report reasons: Spam, Harassment, Financial promise, Other.
- Broadcast tab: "Broadcast". Audience picker: "Pool stakers", "Followers", "Both". Audience line: "To pool stakers", "To followers", "To followers and pool stakers". Quota: "{n} of 3 left today". First send: "Your first broadcast is reviewed by Amped before it sends." My Pool button: "Broadcast".

## 10. Analytics

Events through the analytics registry: `message_sent` (folder, relation, is_first), `request_accepted`, `request_deleted`, `message_reported`, `message_blocked`, `push_prompt_shown`, `push_enabled`, `notification_opened` (channel), `message_door_opened` (from block, signed in). KPIs: share of Message me taps that send, request accept rate, median first reply time, push opt in rate, reports per 1,000 conversations.

## 11. Acceptance

1. A fan with no Telegram sends a creator a message from the Message me block in two taps after sign in.
2. The creator sees it within 2 s on any open tab, with the rail badge, the bell count and a toast.
3. A stranger's message lands in Requests with links as plain text; Accept moves it to Primary; a 4th message before acceptance is refused.
4. A fan who does not meet the rule sees the refusal with the path to qualify, and no amount.
5. A dropped connection resumes and shows every message sent while away, in order, with no duplicates.
6. Push arrives on Chrome desktop and on an iPhone home screen install; a request push shows no text.
7. An unread message produces one email after 30 minutes and none if read first.
8. Unsend within 15 minutes removes the text for both; a report filed before unsend keeps the snapshot for admins.
9. Block stops sends both ways and hides the conversation from the blocked side's Primary.
10. No `MESSAGING_INVITE_ONLY`, `BROADCAST_INVITE_ONLY`, `invitedAt` gate or Telegram call remains (grep check in CI).
11. Admin pauses a sender and the next send refuses `sender_paused`; the kill switch makes the Inbox read only.
12. A follower who does not stake receives a Followers broadcast in the Broadcast tab; a fan who both follows and stakes receives a Both broadcast once; a follower without email updates gets no broadcast email.
13. My Pool, Broadcast opens the composer with Pool stakers picked.
14. Every screen passes the Prism 2.2 gate at 1440 and 390, with no horizontal scroll and 44 targets.

## 12. Build plan (PRs to `development`)

| PR | Branch | Scope | Needs |
|---|---|---|---|
| M1 | feat/messages-schema | Migration, models, data copy from threads, settings rename, constants file | None |
| M2 | feat/messages-server | access with requests, send, list, get, accept, unsend, clear, mute, block, report, settings, search; invite gates removed for Messages and Broadcast | M1 |
| M3 | feat/realtime | Redis bus, `realtime.events` SSE subscription, replay, typing, Cloudflare rule notes | M2 |
| M4 | feat/notifications | Notification rows, bell routes, web push with VAPID, service worker, manifest, email reminder jobs | M3 |
| M5 | feat/messages-ui | Rail Inbox with badge, dock change, bell popover, toast, Inbox list, conversation, requests, composer, settings, refusals | M3, M4 |
| M6 | feat/message-door | Message me block (`message` kind and migration), composer sheet on public pages, signed out return | M5 |
| M7 | feat/messages-admin | Admin Messaging under Safety: reports, paused, caps, kill switch, flagged terms, health; Pilot, Bot health and Groups removed | M2 |
| M9 | feat/broadcast-in-messages | Audience kinds and migration, follower fan out, composer audience picker with counts, Broadcast tab (fan and creator views), My Pool Broadcast button, `BROADCAST_INVITE_ONLY` removed | M2, M5 |
| M8 | chore/remove-telegram | Delete services/telegram (including groups, inline, miniapp, initData), routes, trpc/telegram, the wizard, TelegramGroups and InboxTelegramGroups, landing `/tg` and MiniApp, the telegram_group block kind (telegram_message migrates to message in M6; telegram_group blocks stop rendering and the editor shows "Telegram groups are no longer supported. Add a Community link instead."), the admin Telegram page, env vars and Broadcast Telegram fields. The `tg` handle stays reserved. Drop the Telegram tables (seven, with TelegramGroup and TelegramGroupMember) in a follow up migration after staging sign off | M5, M6, M7, M9 |

Production migrations are applied by hand after merge, as today. Each PR says so.

## 13. Open items for counsel

1. Privacy notice: replace the Telegram section with Amped Messages (what is stored, retention, who can read reported messages, push and email reminders).
2. CSAM reporting process and vendor before media in messages (v2).
3. Retention period for messages of deleted accounts (recommended: kept for the other member, anonymized; reported content kept 1 year).

## 14. Sources

- tRPC subscriptions: https://trpc.io/docs/subscriptions
- tRPC HTTP Subscription Link: https://trpc.io/docs/client/links/httpSubscriptionLink
- SSE and WebSockets behind Cloudflare: https://stackharbor.com/en/knowledge-base/cffix-websockets-sse-behind-cloudflare/
- Durable Objects WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- iOS web push requirements: https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications
- X Direct Message FAQs: https://help.x.com/en/using-x/direct-message-faqs
