# PR 6a: shared media player, playback progress and captions

Branch `feat/media-player` into `development`. Content system plan PR 6a (Build Board #20) and Fan Library phase A (#26). Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-10-23.

**One migration, new table only, applied by hand.** No flag of its own: everything here sits behind `VITE_CONTENT` (the Content destination) and the content uploads flag, because there is nothing to play until a creator uploads. Nothing public changes. PR 6 (`feat/content-public-pages`) builds on this branch.

## 1. Why

PRs 2 to 5 let a creator upload and process files, but nobody, the creator included, could open them: no procedure handed out a URL. Fan Library phase A (spec `docs/features/fan-library.md`) also needs one player for every surface before PR 6 puts content on public pages, or PR 6 would build a throwaway player.

This PR adds:

1. **Signed delivery** (`content.getReadUrl`): gateway URLs for R2 objects and Stream tokens for video, with the lifetimes in content system spec 3.6. Today it opens items to their owner (a preview in the editor). PR 6 adds publishing, and the same procedure then opens public items to anyone.
2. **The shared player** in `@repo/ui/player`: video (Stream HLS) and audio, full and mini layouts, resume, captions, speed, PiP, AirPlay, Media Session, keyboard.
3. **Playback progress** per account (`progress.get` and `progress.set`), so a viewer resumes on any device.
4. **Captions** (`content.setCaptions` and `removeCaptions`): one WebVTT file per language, up to 5.
5. **Editor**: a Preview section on the item page (play, view or page through your own item) and a Captions section for video and audio; the mini player in the shell.

## 2. How delivery works

```
editor or page                API                                    viewer's browser
  | getReadUrl(publicId) -->  | rate limit 30/min per viewer         |
  |                           | loadItemForViewer: owner or public?  |
  |                           |   NOT_FOUND otherwise (no probing)   |
  |                           | every asset scanned (or Stream)?     |
  |                           | buildPlayback: sign each URL         |
  |<-- { playback } ----------|                                      |
  | player.load(item, resolve) ------------------------------------> | HLS from customer-x.cloudflarestream.com/{jwt}/manifest/video.m3u8
  |                                                                  | audio from media.ampedusercontent.com/audio/{id}/full.m4a?t={token}
  | a minute before expiresAt: getReadUrl again, swap URLs, keep place
  | every 10 s of play, on pause, hide and leave: progress.set ----> API
```

- **Who opens what** lives in one file, `services/content/access.ts`. Public: READY, PUBLISHED, moderation CLEAR, no access rule, not 18+, not deleted, on a published page that is not suspended. Owner: any READY item that is not blocked. Gated items wait for PR 8; 18+ items are refused everywhere public until age assurance (#28).
- **Lifetimes** (`services/content/delivery.ts`, spec 3.6 table): public images and audio 24 hours rounded up to the hour; private 5 minutes (images, documents) or duration plus 10 minutes, 4 hours at most (audio); Stream tokens duration plus 30 minutes, 6 hours at most (public) or plus 10 minutes, 4 hours at most (private); downloads 2 minutes. An owner previewing their own published item gets the public lifetimes.
- **Downloads**: `getReadUrl({ download: true })` only when the creator allows downloads, 10 a day per viewer per item (Redis window), R2 files with a single use `jti` the gateway enforces, video from Stream's MP4.
- **Never served**: `incoming/` and `quarantine/` keys, any asset whose scan is not CLEAN or SKIPPED (Stream's own encodes excepted), and the upload itself (only renditions and the scanned original).

## 3. How the player works

`packages/ui/src/player/`:

| File                                 | What                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlayerProvider.tsx`                 | Owns one `<video>` and one `<audio>` per page. The full player moves the video element into its well; on unmount it moves back to a hidden parking div and the mini player shows. A media element moved within the document keeps playing (HTML standard: the pause on removal waits for a stable state). Progress writes, URL refresh, Media Session, captions.                                    |
| `MediaPlayer.tsx`                    | Full layouts. Video: 16:9 well, poster and Play, then controls (play, seek with chapter ticks, time, mute, captions, speed, PiP, AirPlay, full screen) that fade 3 s after the last movement while playing. Audio: cover, title, waveform seek, back and forward 15 s, captions shown as text, speed, mute. Resume at mm:ss and Start over. `ChapterList` (cs7). Keyboard map in `handlePlayerKey`. |
| `MiniPlayer.tsx`                     | 55 high bar: cover, title, creator, play, close, a progress line. Shows after play starts, while no full player for the item is on screen.                                                                                                                                                                                                                                                          |
| `attach.ts`                          | Native HLS on Safari and iOS, hls.js elsewhere (imported on demand), audio `src` plus `<track>` elements. `swap` keeps the position when URLs refresh.                                                                                                                                                                                                                                              |
| `format.ts`, `copy.ts`, `content.ts` | Pure helpers, strings, and `playbackToSource` (getReadUrl to player).                                                                                                                                                                                                                                                                                                                               |

The chrome is media dark on every surface, as players are, so it sits on a creator's theme or on Prism glass without borrowing either. Every control is 44 square or larger and labelled.

Editor wiring: `pages/Editor.tsx` wraps the shell in `EditorPlayerProvider` (progress through `trpcClient.progress`), `Layout.tsx` renders `EditorMiniPlayer` (above the dock on phones, sticky at the foot of the context field on desktop; Expand opens `/content?tab=library&item={id}`). The item editor shows `ItemPreview` and `CaptionsSection` (`panels/content/ItemMedia.tsx`).

## 4. What changes, file by file

### 4.1 Database

| File                                                                               | Change                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/prisma/schema.prisma`                                           | `ViewerProgress` (UUID v7 id, user, item, `positionMs`, `durationMs`, `completed`, `lastPlayedAt`), unique on user plus item, cascades with the user and the item. Back relations on `User` and `ContentItem`. No other model changes. |
| `packages/database/prisma/migrations/20261023120000_viewer_progress/migration.sql` | Creates `viewer_progress` with its indexes and two foreign keys. Written in the form `prisma migrate` emits for MySQL.                                                                                                                 |

### 4.2 Shared constants

| File                                            | Change                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/constants/src/contentPlayer.ts` (new) | `CONTENT_PROGRESS` (10 s writes, resume from 30 s to 95 percent, 12 writes a minute), speeds and seek steps, progress and read URL schemas, the `ContentPlayback` and `ContentDownload` shapes, caption schemas, `normalizeWebVtt`, `captionLabel`, `contentResumePoint`. |

### 4.3 Server

| File                                      | Change                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `services/content/access.ts` (new)        | Public and owner rules, `assetServable`, `openDecision`.                                                                        |
| `services/content/delivery.ts` (new)      | `deliveryExpiry`, `buildPlayback`, `buildDownload`, `downloadFileName`. The Stream delivery host is looked up once per process. |
| `services/content/viewer.ts` (new)        | `loadItemForViewer` (NOT_FOUND for anything the viewer may not open), per viewer rate limit keyed by account or IP.             |
| `trpc/content.ts`                         | `getReadUrl` (public procedure, access checked), `setCaptions`, `removeCaptions`.                                               |
| `trpc/progress.ts` (new), `trpc/index.ts` | `progress.get`, `progress.set`.                                                                                                 |
| `services/cloudflare/r2.ts`               | `putR2Object` for caption files the API writes itself.                                                                          |
| `services/cloudflare/stream.ts`           | `putStreamCaptions`, `deleteStreamCaptions`.                                                                                    |
| `services/content/state.ts`               | `assetRowId` exported, so caption rows use the same deterministic ids as processor rows.                                        |

### 4.4 Shared UI and client

| File                                                                                         | Change                                                                                |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/ui/src/player/*` (new), `packages/ui/src/index.ts`, `packages/ui/package.json`     | The player. `hls.js` 1.6.15 added; the lockfile change is that one package (8 lines). |
| `apps/client/src/components/player/EditorPlayer.tsx` (new)                                   | Provider with the progress adapter, and the mini player placement.                    |
| `apps/client/src/pages/Editor.tsx`, `components/Layout.tsx`                                  | Mount the provider and the mini player.                                               |
| `apps/client/src/components/panels/content/ItemMedia.tsx` (new), `ItemEditor.tsx`, `copy.ts` | Preview and Captions sections.                                                        |
| `docs/features/fan-library.md` (new)                                                         | The Fan Library spec, with the 23 Oct corrections in its revision log.                |

### 4.5 Tests

| File                                                           | Tests | Covers                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/server/src/__tests__/content-delivery.test.ts`           | 15    | Access rules; every lifetime class; video, audio, image, PDF and EPUB playback with real token signing; nothing from `incoming/`; downloads single use with safe names; Stream MP4                                                                                                                                       |
| `apps/server/src/__tests__/content-player.test.ts`             | 15    | getReadUrl for owner, stranger and signed out viewer; 18+ and unscanned refusals; download allowance and daily cap; read rate limit; captions for video (Stream) and audio (R2), replace, remove, refusals; progress save, clamp, completion, ignore without access, rate limit                                          |
| `apps/client/src/components/player/player.test.tsx`            | 15    | Clock, chapters, seek clamp, refresh timing, caption and speed cycles, waveform parsing, resume rule, WebVTT check, playback mapping, copy rules, keyboard map; the provider: Resume from saved progress, save on pause, refresh a minute before expiry, refused refresh, mini player show and close, 10 s write cadence |
| `apps/client/src/components/panels/content/ItemMedia.test.tsx` | 7     | Preview per kind; captions list, upload, size check, server error, five language cap                                                                                                                                                                                                                                     |

## 5. What Gustavo needs to do

### 5.1 Review and merge

0. **Lockfile.** `pnpm-lock.yaml` is too large to push through the GitHub connector. The exact change is in `docs/fixes/media-player.lockfile.patch` (adds `hls.js` 1.6.15 to `@repo/ui`, nothing else). On the branch:

   ```bash
   git apply docs/fixes/media-player.lockfile.patch
   pnpm install --frozen-lockfile
   git rm docs/fixes/media-player.lockfile.patch
   git add pnpm-lock.yaml && git commit -m "chore(ui): lockfile for hls.js"
   ```

   A plain `pnpm install` also works but re-resolves unrelated packages. The patch keeps the lockfile diff to the new package.

1. Read section 2, then `services/content/access.ts`, `services/content/delivery.ts`, `trpc/content.ts` (the three new procedures), `trpc/progress.ts`, then `packages/ui/src/player/PlayerProvider.tsx` and `MediaPlayer.tsx`.
2. Run locally:

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @repo/constants run build
   pnpm run --filter server run prisma:generate
   cd apps/server && pnpm run typecheck && pnpm run test:unit
   cd ../client && pnpm test && npx vite build
   ```

   Results on this branch are in the PR description.

### 5.2 The migration

```bash
pnpm --filter @repo/database exec prisma migrate deploy --schema=./prisma/schema.prisma
```

Rollback, if ever needed (the table is empty until someone plays an item):

```sql
DROP TABLE viewer_progress;
DELETE FROM _prisma_migrations WHERE migration_name = '20261023120000_viewer_progress';
```

### 5.3 Staging settings

Nothing new. `getReadUrl` uses the PR 2 and PR 3 settings: `MEDIA_GATEWAY_ORIGIN`, `MEDIA_TOKEN_KEYS` (the same value as the gateway Worker's secret), `CF_STREAM_KEY_ID`, `CF_STREAM_KEY_PEM`, and `CF_STREAM_CUSTOMER_CODE` (set it, or the first video read looks the host up once). The Stream token for captions needs the existing `CF_STREAM_API_TOKEN` with Stream Edit. The media gateway's `ALLOWED_ORIGINS` already holds the staging app and site hosts, which the audio, waveform and caption fetches need.

### 5.4 Review checklist

- [ ] A non owner gets NOT_FOUND for a draft, and nothing reveals whether the id exists.
- [ ] No URL for `incoming/` or `quarantine/` can be signed.
- [ ] Every signed URL expires within its spec 3.6 lifetime.
- [ ] `progress.set` never writes for a viewer who may not open the item.
- [ ] Caption text is validated as WebVTT and stored as text only.
- [ ] Copy: no dashes, no banned words.

## 6. Staging QA

On `https://app.staging.amped.bio`, with `VITE_CONTENT` and uploads on, signed in as a creator.

| #   | Do                                                                                                   | Expect                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Upload a short MP4. Open it once it is Ready.                                                        | Preview shows the poster and Play. Play starts the video in the well.                                                                                                     |
| 2   | Seek, change speed, mute, full screen; use space, arrows, f, m.                                      | Each works; the time and seek bar follow.                                                                                                                                 |
| 3   | While it plays, open Home.                                                                           | The mini player shows above the dock (phone) or at the foot of the column (desktop) and keeps playing. Tap the title: the item opens and the video continues in the well. |
| 4   | Play past 30 seconds, close the tab, open the item on another browser signed in as the same account. | Resume at mm:ss and Start over show; Resume continues from the saved point.                                                                                               |
| 5   | Add an English .vtt, reload, play, press c.                                                          | Captions show over the video.                                                                                                                                             |
| 6   | Upload an MP3, open it once Ready.                                                                   | Audio card with the waveform; back and forward 15 s; lock the phone: the lock screen shows title and controls.                                                            |
| 7   | Add Spanish captions to the audio, press c.                                                          | The cue text shows under the player.                                                                                                                                      |
| 8   | Upload a JPEG and a PDF.                                                                             | Preview shows the image and the first pages.                                                                                                                              |
| 9   | Leave a video paused for 25 minutes, press play.                                                     | It plays: the player fetched fresh URLs before the token expired.                                                                                                         |
| 10  | In the console, call `content.getReadUrl` for your item while signed out.                            | NOT_FOUND until PR 6 publishes it.                                                                                                                                        |

## 7. Decisions made in this PR

1. **`getReadUrl` is a public procedure now**, with the access check inside, so PR 6 only adds publishing and the public pages. Until then the only allowed viewer is the owner.
2. **Media dark chrome** on every surface instead of the creator theme or Prism: a player sits on both and should look the same on both. Text around it (title, chapters) follows the surface.
3. **One `<audio>` element for audio**, not the video element: iOS keeps audio elements playing when the screen locks.
4. **Captions are text the API stores**, not an upload to R2 from the browser: files are small (512 KB), validated as WebVTT on the server, and never reach the processor.
5. **hls.js from npm, imported on demand**, instead of a CDN script: no new script origin for the CSP and no unpinned remote code.
6. **Owner preview uses private lifetimes** unless the item is already public, so preview URLs of drafts expire in minutes.

## 8. Follow-ups

1. PR 6: publishing, public pages, the content block, public `getReadUrl` callers, Report, the purge job, `retryProcessing`.
2. Boards fl8 to fl10 (player full and mini) are not drawn yet. The build follows spec rows 128 and board cs7. Run the Prism 2.2 gate on the shipped player during PR 6 QA.
3. Phase B to E of the Fan Library (Library destination, Saved, Downloads list, installable app, Live tab).
4. Turning downloads on for a video after it is Ready does not yet turn on Stream's MP4. PR 6 calls `enableStreamDownloads` from `content.update`.
