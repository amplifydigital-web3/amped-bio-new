# FL-1: player v2 (phone video and audio, mini player, queue, autoplay, sleep timer, viewers)

Branch `feat/library-player-v2` into `development`. Fan Library plan FL-1 (Build Board #26). Screen Review rows 128 and 184, boards m6, m7, m8, fl-q10-d2 and fl-q11-d2. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-03.

**No migration. No new dependency. No lockfile change.** One new feature flag, `fanLibrary` (site settings, default off), gates the parts that are new to the public item page: Up next, the queue and the phone action row. The player changes below apply wherever the shared player already plays, which is behind the `content` flag today.

## 1. What changes

### Shared player (`packages/ui/src/player`)

1. **Queue, up next and autoplay** (`queue.ts`, `PlayerProvider.tsx`).
   - The viewer's queue: `playNext(entry)` and `addToQueue(entry)`. A locked entry (`canOpen: false`) or the item playing now is refused and the call returns false.
   - The page's up next list: `setUpNext(entries)`, the creator's items newest first.
   - When an item ends: the sleep timer wins; then the queue in order, skipping locked entries; then, with autoplay on, the next up next entry from the **same creator** (`PlayerItem.ownerId`) that the viewer can open and has not played. Nothing else ever plays. Autoplay off stops at the end.
   - Autoplay is on by default (decision D). `setAutoplay(false)` turns it off for the session.
   - `next()` and `previous()`. Previous restarts the item after 3 seconds of play; otherwise it goes back through a history of up to 50 items, and the item left behind plays next again.
   - Lock screen and headset next and previous through Media Session.
2. **Sleep timer**: Off, End of this item, 15, 30 and 60 minutes. `setSleepTimer(choice)`. Stop clears it.
3. **Mini player** (`MiniPlayer.tsx`): 64 high (was 55), no close button (was line 85). Tap the title or swipe up opens the item; swipe down stops and dismisses; swipe left plays next, swipe right previous. Pause is the one 52 px target. The More sheet has Stop playing and the queue sheet has Next and Previous, so every gesture also has a button.
4. **Phone video** (`MediaPlayer.tsx`, touch screens only, `(pointer: coarse)`):
   - A tap shows the controls for 3 seconds instead of pausing.
   - Top row: Minimize (when the host passes `onMinimize`, or in full screen), Captions, AirPlay, and the gear for Chapters and speed.
   - Center: back 10, play or pause (56), forward 10, with the seconds drawn in the arrows.
   - Bottom row: time, seek bar, duration, Full screen.
   - Double tap the left or right third skips 10 seconds and shows a ring.
   - Swipe down minimizes.
   - Turning the phone sideways while playing enters full screen; turning back leaves it, only when rotation entered it.
   - Desktop keeps the PR 6a overlay bar and click to pause.
5. **Phone audio**: Speed, back 15, play, forward 15 and the sleep timer in one row; a 20 px scrub handle on the 44 high slider; Captions, Queue and Mute below.
6. **Sheets and lists** (`PlayerSheets.tsx`), on the Prism bottom sheet:
   - `PlayerOptionsSheet`: chapters and speed chips.
   - `PlayerMoreSheet`: Play next and Add to queue when the item is not the one playing; Speed, Captions, AirPlay, Sleep timer and Stop playing for the item playing; Report; an optional note such as the downloads off line.
   - `QueueSheet`: Autoplay switch with its line, Now playing with Previous and Next, the queue with a drag handle (also arrow keys) and Move up, Move down and Remove buttons, then what autoplay would pick from the creator.
   - `SleepTimerSheet`, `KeyboardShortcutsDialog`.
   - `UpNextList`: the creator's items the viewer can open, with the Autoplay switch.
   - `PlayerActions`: phone Save, Chapters and More; desktop Save, Report, Keyboard shortcuts and Queue. Save shows only when the host passes `onSave` (the Library API, FL-2).
7. **Photo viewer** (`PhotoViewer.tsx`): swipe, Previous and Next buttons, thumbnail strip, double tap or the button to zoom, arrow keys. Photo sets come with bundles (content C9, C10); an image item is a set of one today, so it shows zoom only.

### Public site (`apps/landingpage`)

1. **Item page** (`ItemPageView.tsx`), with `fanLibrary` on and a video or audio item:
   - Up next from the creator, read from the public `content.feed` (video and audio only, never the item itself).
   - The action row: More on phones (with Report and the downloads off line), Report, Keyboard shortcuts and Queue on desktop.
   - Chapters as a sheet on phones; the chapter list stays beside the player from `md` up.
   - Swipe down or Minimize goes back (or to the creator's page), and the mini player carries on there.
   - With the flag off, the page is the PR 6 page.
2. **Image items** use the photo viewer, with or without the flag.
3. **PDF viewer** (`PdfViewer.tsx`): a sticky bar with Page n of N (follows the page on screen) and Search in document. Search reads each page's text once through pdf.js and lists the pages that hold every word; tapping one scrolls there. The helper is `lib/pdfSearch.ts`.
4. `playerItemFromCard` sets `ownerId` to the creator's handle. `ReportDialog` is exported so the More sheet can open it.

### Editor (`apps/client`)

- The phone spacer under the mini player grows from 63 to 72 for the 64 high bar. No other editor change: the editor preview gets the phone controls and the new mini player through the shared player.

### Constants

- `fanLibrary` in `FEATURE_FLAGS` with `env: {}` (a new flag, AGENTS.md step 1).
- `test/feature-flags.test.ts`: the fallback check now skips flags with `env: {}` and checks that they default to off. It used to require a fallback on every public flag, which no new flag could meet without a new environment variable.

## 2. Not in this PR

- **Save** needs `library.save` and `SavedItem` (FL-2). `PlayerActions` hides Save until a host passes `onSave`.
- **The Library's own full screen players** (the "Playing from" header in m7) arrive with the Library page (FL-3).
- **The creator's colors on the mini player and players** need `CreatorThemeScope` (FL-4). They stay media dark here.
- **Play next and Add to queue in item menus across the Library** come with the item menu (FL-3, m10). Here they are in the More sheet on an item page while something else plays.
- **Locked items in up next** arrive with gating (FL-6). The public feed lists only items every visitor can open, so every entry here has `canOpen: true`; the player still checks it.
- **Client events** (`player_autoplay_next`, `player_sleep_timer` and the other player events in the spec's events list) are not wired.
- **Spec text**: spec 3.5 in PR #438 already describes this build. No spec edit here, to keep #438 clean.

## 3. Checks run

- `tsc -b` in `apps/client` (covers `@repo/ui`) and `tsc --noEmit` in `apps/landingpage`: pass.
- Tests: client 261 of 261 (new `player-v2.test.tsx`, 17 tests; `player.test.tsx` updated for swipe down), server unit 1,211 of 1,211, `@repo/ui` 83, `@repo/constants` 208, landing 48 of 49. The one landing failure is RegisterForm "network error notice", which fails on `development` too (recorded in #348).
- Builds: client and landing pass. The landing build logs sitemap fetch errors because the build machine had no network; the build itself completes.
- `oxlint` on the changed folders: no new warnings.

## 4. Staging check for Gustavo

1. Turn on `content` and `fanLibrary` on the admin Feature flags page.
2. On a phone, open a public video item:
   - Tap shows the controls; double tap left and right skips 10 seconds with the ring.
   - The gear opens Chapters and speed; turn the phone sideways for full screen.
   - Swipe down goes back and the mini player keeps playing.
3. On the mini player:
   - Swipe left plays the creator's next item.
   - Swipe up opens it.
   - Swipe down stops it. There is no close button.
4. Let an item end with autoplay on: the creator's next item plays. Turn autoplay off in the queue: play stops at the end.
5. Open a public audio item and set the sleep timer to End of this item: play pauses at the end and nothing else starts.
6. Open a PDF: the page count follows the scroll, and Search in document finds a word and jumps to its page.
7. Turn `fanLibrary` off: the item page has no Up next or action row; the player and mini player still work.
