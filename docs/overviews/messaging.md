# Amped Messages: overview

Build Board #2, revision 4. 2 Nov 2026. Replaces the Messaging on Telegram overview.

## What it does

Amped Messages is direct messaging inside Amped.Bio. A fan taps Message me on a creator's page and writes. The creator sees it in their Inbox at once, with a count on the rail and an alert on the bell. Either side can reply from any device. No Telegram account, no bot, no linking step.

Every Amped account can message every other account, the way X direct messages work. Each person decides who may reach them: anyone, followers and members, members only, pool fans only, fans with a minimum stake, or no one. Messages from people you have no relationship with arrive as Requests, with links switched off until you accept.

## How it works

1. **Door.** The Message me block on a public page opens a composer sheet over the page. A signed out visitor signs up and returns to the composer with the draft kept. Amped checks the creator's rule first and shows the way to qualify (Follow, Join, Become a member) if the visitor does not meet it. No amount is ever shown.
2. **Inbox.** A rail destination with Primary, Requests and Broadcast. Primary holds people you follow, people you messaged, your members and accepted requests. Filters narrow by relation: Members, Pool fans, Followers, Unread.
3. **Live delivery.** Messages arrive in about a second on every open tab. Read receipts and typing show when both sides keep them on.
4. **Alerts.** A count on the rail Inbox, a bell notification center with recent alerts, a toast on other screens, Web Push on desktop and on iPhone once Amped.Bio is on the Home Screen, and an email reminder when a message waits 30 minutes.
5. **Control.** Mute, archive, delete for me, unsend within 15 minutes, block and report. Sending caps and new account limits replace the invite pilot.
6. **Admin.** Safety, Messaging: report queue with the reported text kept, sender and recipient pauses, automatic thresholds, caps, flagged terms shared with Broadcast, a kill switch and a health strip.

7. **Broadcast.** Creators broadcast from Messages to pool stakers, followers or both, under one set of rules: 3 a day, 10 a week, first broadcast reviewed by Amped. My Pool has a Broadcast button that opens the same composer. Followers get broadcast email only if they opted in when they followed.

## Why now

Telegram linking was the biggest drop off in the flow and the source of the 29 Oct staging bug. Telegram rules also limited the product: the Mini App could not show REVO, pool or wallet blocks, and private groups could not be read. Messages sit next to Content, Memberships and the Wallet, so they belong in one account with one notification system.

Most of the work is done. Amped already stores every message, runs one access check for every path, and has a web inbox. This build swaps the transport, opens messaging to every account, adds Requests and live alerts, and removes Telegram.

## Competition

| Product | Messaging model | Gap Amped fills |
|---|---|---|
| X | Open DMs, requests for non follows, caps per day | No creator access rules, no paid member priority |
| Instagram | DMs with a requests folder, creator inbox tabs (Primary, General) | No stake or membership gating; links in bio send fans off platform |
| Patreon | Member messages and community chats inside the membership | Card payments and platform held funds; no open page to fan door |
| OnlyFans | Paid DMs to subscribers | Adult first positioning; the platform keeps 20% |
| Linktree and Beacons | No messaging; contact forms or links out to other apps | Fans leave the page to reach the creator |

## Key marketing

1. "Message me, right on my page." The fan never leaves Amped.Bio and never needs another app.
2. "Your members first." Paid members and pool fans land in Primary; strangers wait in Requests.
3. "Reach every fan at once." Broadcast to followers and pool stakers from one composer.
4. "You decide who can reach you." Six clear rules, including members only and minimum stake.
5. "Alerts that reach you." Live in the app, push on desktop and iPhone, a gentle email if you miss one.

Guardrails for marketing copy: no promises of income or returns from messaging or staking; tREVO is a testnet token with no cash value; never say messages are end to end encrypted.

## What changes for people already set up

- Creators who linked Telegram keep their Inbox and every past message. Their Message on Telegram block becomes Message me with the same label.
- The Telegram wizard, bot, groups and Mini App are removed. The groups and Mini App that merged to development on 2 Nov (#383, #386, #390) are removed too. They never reached production.
- Broadcast and Messages no longer need an invite.

## Links

- Spec: docs/features/messaging.md
- Design boards: Amped Messages Boards (m1 to m7)
