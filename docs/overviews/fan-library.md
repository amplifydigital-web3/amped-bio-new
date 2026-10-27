# Fan Library: everything your creators gave you, in their style, on your phone

Build Board #26. Drafted by Claude for Rob Frasca, 2026-10-08; revised 2026-10-23 (creator ownership, mobile first). Spec: `docs/features/fan-library.md`. Design QA: `docs/features/fan-library-design-qa.md`. Boards: Fan Library design page, version 2 (m1 to m12, d1, d4, d10). Screen Review rows 124, 125, 127 to 130, 180 to 184.

## Why this exists

Every spec so far is written from the creator's side: upload a file, gate it, price it, send a broadcast. A fan who joins three memberships, follows ten creators and buys a course has no screen that shows what they now have. Their memberships sit in a Wallet tab beside token balances. Their content is scattered across creator pages.

A fan's content also comes from many creators. Each item belongs to the creator who made it, and the fan can open it for a reason: a membership, a purchase, a follow or a pool stake. The Library makes both things obvious: whose content it is, and why the fan can open it. Most fans will use it on a phone, so it is designed for the phone first.

## What it does

The Library is one page in the Amped.Bio app, for every account, fan or creator. On a phone it reads top to bottom with no tabs:

1. **Continue.** What the fan was watching or listening to, on any device, with a play button and the minutes left.
2. **Saved and Downloads.** Two shortcuts.
3. **Your creators.** Every creator the fan follows, joined or bought from, shown with their own color. A count shows new items; a warning shows when a payment is past due.
4. **Memberships.** One row with the count and the next charge. It opens the list where the fan renews, manages or cancels.
5. **Newest.** The newest items the fan can open, from all their creators.

A Filter button narrows by type, by how the fan has the item (membership, purchase, pool, free) or to what is on the phone. Search looks across all creators, inside one creator, or on the phone.

**Creator sections.** Opening a creator opens their section at /library/@handle, in that creator's colors, fonts and buttons, inside the Amped.Bio frame. One line at the top says how the fan is connected: "Tide Circle, renews 14 Nov, 1 purchase, following". Tapping it opens the details: membership with Manage and Receipts, purchases, follow settings, and the line that the creator owns this content. Below sit two segments. **Yours** is everything the fan can open from that creator, courses first. **Shop** is what the creator offers that the fan cannot open yet, each with one button: Join, Rejoin, Buy or Go to the pool. Paying opens the creator's own payment sheet: the fan pays the creator directly in USDC, with the Amped.Bio fee of 5% included.

**Ownership is always clear.** Every item names its creator. Each item shows at most one label: the plan name for membership items, Purchased, or Pool fans. When an item comes from more than one source, the strongest shows, so a course the fan bought stays open after their membership ends. When a membership lapses, its items stay open for three days, then leave the Library, and the fan sees why with a Rejoin button.

**The player.** One player everywhere: creator pages, item pages, the Library. Video plays in portrait or full screen sideways, with double tap to skip and swipe down to shrink. Audio keeps playing with the phone locked, with a sleep timer and a queue. The small player at the bottom carries the creator's color; swipe it up to open, down to stop, sideways for the next item. Autoplay continues with the same creator and never plays something the fan cannot open. PDFs and photo sets open in the creator's look too.

**Offline.** Where the creator allows downloads, the fan can keep video, audio and files on the phone, one item or a whole course at a time, on Wi-Fi by default. They disappear when access ends. The app installs on the home screen as a web app.

**New items.** When a creator publishes something for members or followers, every fan who can open it gets an item in their inbox, with an optional daily email per creator.

## How it works

- **One question per item.** The Library asks the access engine whether this account can open each item, and the server returns the label with it. Nothing new is invented for access.
- **One app frame, many creator looks.** Amped.Bio's design owns navigation, notices and settings sheets. The creator's theme owns their section, the players and their payment sheet. Heavy effects from creator pages are off in the Library, and any color pair that is hard to read falls back to a readable one.
- **Progress lives on the server,** so a fan can start on a phone and finish on a laptop.
- **Free content first.** The first release covers public and followers content from followed creators, branded sections and the new player. Member content, the Shop and membership management follow as the access engine, the store checkout and memberships ship.

## Who it is for

- Fans who pay: what they bought from each creator, what renews when, what each membership includes.
- Fans who follow: one place per creator instead of ten bookmarks.
- Creators: their brand follows their fans into the Library, their Shop sits next to what the fan already has, and a fan who can find the content keeps the membership.

## Competition

| | Fan home | Per creator view | Memberships | Resume across devices | Offline |
| --- | --- | --- | --- | --- | --- |
| Patreon app | Home and Memberships feeds, Library | Creator page in the app, Patreon look | Settings list | Yes | Yes |
| Gumroad | Library of purchases | Grouped by seller, no seller look | None | No | Files |
| Shopify Shop app | Orders feed | Each store branded inside the app | None | n/a | n/a |
| OnlyFans, Fanfix | Feed by subscription | Creator profile, platform look | Subscriptions list | Partial | No |
| Linktree, Beacons | None | None | None | No | No |
| Amped.Bio | One page Library | Creator section in the creator's look, with access and Shop | One list with renewals and Manage | Yes | Where the creator allows |

What is different: one Library covers paid, free and staked relationships, every creator keeps their own look inside it, and every item says whose it is and why the fan can open it.

## Key marketing

- **Headline.** Everything your creators gave you, in one place, in their style.
- **Proof points.** Pick up where you left off on any device. Each creator has their own section in your Library. See what you bought and what your membership includes. Listen with the screen off. Take it offline when the creator allows.
- **For creators.** Your brand follows your fans into their Library. Your Shop sits next to what they already have.
- **Compliance in the copy.** Pool rows keep the verbatim testnet line. Memberships, purchases and the payment sheet carry no staking words. No earn, return or income language. The creator owns the content; the fan has access.
- **Not yet.** No native iOS or Android app. No comments or likes. No cross creator recommendations. Say Later with no date.

## Decisions

All answered by Rob with the recommended answers (8 and 23 Oct). The full table is in spec section 2.3.
