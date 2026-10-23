# Fan Library: design QA and UI evaluation

Build Board #26. 23 Oct 2026. Spec `docs/features/fan-library.md`. Boards on the Fan Library design page.

## 1. Expert UI evaluation of version 1 (fl1 to fl15)

Four independent reviewers, each with one lens, then reconciled: mobile navigation and consumption, readability and accessibility, simplicity and cognitive load, benchmark against Spotify, YouTube, Apple Podcasts, Netflix, Patreon, Substack and the Shop app. Rob's brief: fans consume mostly on phones; design, readability, usability and simplicity rule.

**Kept.** Every item names its creator and why the fan can open it; creator sections in the creator's look; the payment sheet; membership status per creator with one action per card; purchase card with Yours to keep and Receipt; lesson progress states; lock screen controls. Text contrast passed on every creator theme (18 sampled pairs, all 4.5:1 or better).

**Found.** Too heavy for a phone: the dock, four Library tabs, a filter chip row and five creator tabs stacked before content, each scrolling sideways and clipping. About 45 concepts where 14 would do. No phone video player. Half the journeys drawn for desktop only. No queue, autoplay, swipe gestures or offline media. Three filled buttons on one screen. Phone metadata at 12 to 13 px. Titles cut to one line. Off toggles at 2.2:1. Per row delete next to Open in Downloads.

**Decisions taken (A to D).** One page Library on the phone; creator sections with Yours and Shop; offline video and audio where the creator allows downloads; autoplay within the same creator.

## 2. Version 2 boards (m1 to m12, d1, d4, d10)

| Board | Screen | Row |
| --- | --- | --- |
| m1 | Library one page, scrolled, Filter sheet | 124 |
| m2 | Search: recent, results grouped by creator | 183 |
| m3 | Your creators | 180 |
| m4 | Creator section and status sheet (Graphite) | 181 |
| m5 | Buyer only (Sakura), lapsed member with Shop (Crystal Clear), payment sheet | 182 |
| m6 | Video: portrait, chapters and speed sheet, landscape | 128 |
| m7 | Audio player, queue with Autoplay, mini player gestures | 128 |
| m8 | PDF and photo viewers | 184 |
| m9 | Memberships list and Manage sheet | 125 |
| m10 | Downloads with offline video, item menu | 129 |
| m11 | Inbox content items and notification settings | 130 |
| m12 | Empty, loading, offline, access ended | 124 |
| d1 | Library desktop | 124, 180 |
| d4 | Creator section desktop | 181 |
| d10 | Video player desktop | 128 |

## 3. Gate results (every board)

| Check | Result |
| --- | --- |
| Tokens | Prism 2.2 tokens on Amped.Bio surfaces; creator surfaces use the creator theme values only |
| Contrast | Creator text 5.7:1 or better on every background; buttons 6.4:1 or better; brand accents 6.4:1 or better on white; off toggle border 4.5:1 |
| Targets | Every control 44 or larger; primary 55; pause on the mini player 52 |
| One primary | One filled button per screen |
| Type | Body and meta 14 to 15, item titles 16 on up to 2 lines, labels 13. Smaller only for dock labels (12), badge counts (11) and numerals inside skip icons (10) |
| Content | No dashes, no earn, yield, income, invest or gains words. Rewards appears only inside the verbatim testnet line |
| Trust | Payment sheet keeps the fee line, consent sentence, checkbox and wallet note; no staking words on memberships, purchases or the sheet |

Fixes made during drawing: squashed buttons in creator sections, the segment control using the creator button color for the selected state (now an outline), repeated Purchased labels on a bought course (now once at the group heading), the Inbox segment name, the phone status bar over themed screens, the desktop player's keyboard legend (now behind a button).

## 4. Approval

Approved by Rob on the Screen Review, 23 Oct: rows 124, 125, 128, 129, 130, 180, 181, 182, 183 (127 earlier). Row 184 (viewers) in Design review. Row 126 merged into 180 and 181.

## 5. Build checks

Each Fan Library PR runs the same gate on the built screens against these boards at 390 and 1440, in Graphite and one light creator theme, and moves its rows to In PR.
