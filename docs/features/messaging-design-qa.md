# Amped Messages: design pass 2 (2 Nov 2026)

Build Board #2, revision 4. Boards: Amped Messages Boards (m1 to m7). Screen Review rows 315 to 321. Checked against Amped Prism 2.2 Balanced v1.0 locked and the app structure record (D08, D09, D11, D21).

## Result

All seven boards were evaluated and redrawn. Each passes the gate (tokens, glass, rim, contrast, targets, trust, content) with four Prism system gaps logged for a v1.1 addition. Rows stay in Design review for Rob.

## Contrast, measured (worst case: purple beam at 0.45 under the surface)

| Pair | Ratio |
|---|---|
| ink-2 on G1 clear | 8.04:1 |
| ink-3 meta on G1 clear | 5.57:1 |
| ink-3 meta on the bare room | 3.61:1, fails; no meta text sits on the bare room after this pass |
| nav on G1 clear | 4.95:1 |
| white on #5650A2 (badge, primary, own bubble) | 6.85:1 |
| #7A4F00 on #FBF1DC (notices) | 6.35:1 |
| white on #B3261E (destructive) | 6.54:1 |
| Graphite text #F4F5F7 on #14161C | 16.58:1 |
| Graphite secondary #B9BDC9 on #14161C | 9.63:1 |

## Fixes by board

- m1 Rail, bell and alerts: rail rebuilt to D08 and shared by every board; rail count holds unread conversations only; toast moved to the D21 convention (bottom left, one ghost action); popover rows route to their tab and add Notification settings; phone dock Home, Page, Inbox, Wallet, More; verbatim Testnet line.
- m2 Inbox and conversation: tabs container 55/43; chips 44 high 16/500; Send is a 55 circle with a dashed disabled ring; Archived view added; message actions (Copy, Report, Unsend within 15 minutes); failed, Retry and Offline drawn; destructive menu items raise the Undo toast; phone conversation moved onto a G1 clear sheet.
- m3 Requests: one primary (Accept); Delete secondary; Block and Report ghost; solid notice recipe for request and waiting notices.
- m4 Start a conversation: creator page in the Graphite demo theme (was a purple page); phones at 390 (were 300); solid sheet over the creator page; four refusal states; signed out copy matches the 30 day email rule.
- m5 Message settings: autosave status, no Save; minimum stake state with the tREVO well and Testnet notice; blocked accounts; switch semantics; push ask after the first message.
- m6 Admin messaging: kill switch secondary at rest, destructive only in the confirm with a reason; case view with one primary; text status badges.
- m7 Broadcast: shared rail; unavailable audiences shown with the reason; Limit reached state; verbatim Testnet notice in the composer and in the fan view; fan item options for Mute and Report.

## Structure decisions recorded (components/app-structure)

- D50 Inbox is a rail destination; tabs Primary | Requests | Broadcast; settings in Account, Messages. Supersedes D42.
- D51 Bell is the notification center; phone dock Home, Page, Inbox, Wallet, More; More gains Design. Amends D09.
- D52 Message me block replaces the Telegram block; rule set only in Account, Messages. Supersedes D44.
- D53 Admin, Safety, Messaging replaces Admin, Telegram. Supersedes D49.
- D54 Broadcast written and read in Messages; audiences Pool stakers, Followers, Both; My Pool Broadcast card. Supersedes D45 and D46.
- D43 and D48 are removed with Telegram.

## Prism system gaps (need Rob's written approval for v1.1)

1. Count badge: 20 high pill, 13/16 700 white on #5650A2.
2. Message bubble: own #5650A2 fill with white 16/24; theirs white 0.9 with a 1px line; r21 with the tail corner r5.
3. Switch: 52 x 32, #5650A2 on, line-strong off, 26 knob.
4. Typing indicator: three 8px ink-3 dots in a white bubble.

## Spec changes in this pass

Section 4.4 quotes the verbatim Testnet line. Section 8.1 sets the rail count rule, the badge values and the D21 toast. Section 8.2 makes Send a 55 circle.
