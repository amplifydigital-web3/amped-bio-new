# Content system PR 5: content library UI

Build Board #20. Spec `docs/features/content-system.md` 3.1 (boards cs1, cs2, cs3, cs8), 3.5 step 1, 3.11, 3.14 and 3.16 PR 5. Boards: https://claude.ai/artifact/5huPNodPAbY59cqFytSyUf

This PR adds the Content destination to the editor. Creators see their storage, upload files straight to Cloudflare, watch each file move through processing, and edit an item's details with autosave. It is client only. It uses the `content` router from PR 2 (#317) as merged, with no server change.

It branches from `development` and does not depend on PR 3 (#329) or PR 4 (#332). With PR 4 not merged, uploads finish at Processing on staging and stay there; with PR 4 merged, they reach Ready, In review, Failed or Blocked.

Flag: `VITE_CONTENT`. On in development and staging, off in production, client only and testing. Uploads also need `CONTENT_UPLOADS_ENABLED` and the Cloudflare settings on the API; until then the library loads and Upload is disabled with "Uploads are not open yet".

## 1. Why we are doing this

| Duty | Where in PR 5 |
| --- | --- |
| No file bytes through the API (acceptance 25) | The browser PUTs to presigned R2 URLs and sends video to Stream by TUS. The API only signs and confirms |
| Refuse before sending (acceptance 7) | Type, size per kind, storage left (video included, since the server reserves its bytes too) and video minutes are checked in the browser before `createUpload`. A batch that overflows is refused file by file. The server repeats every check |
| Uploads survive a dropped connection (acceptance 1, 2) | R2 multipart resumes the missing parts with fresh URLs. Stream resumes at the TUS offset. Offline pauses; online resumes |
| Rights and scanning notice (cs2, 3.11) | "Upload only work you own or have rights to. Every upload is scanned before it goes live." Never a promise that a file is safe |
| Plain status, never internal codes | One status per item. Every `failureReason` from PR 2 and PR 4 maps to a line with the fix. Unknown codes read "Processing did not finish" |
| Copy rules (acceptance 22) | Every string lives in `copy.ts`. `copy.test.ts` fails on a banned term, an em or en dash, or the word "safe" |
| Access (acceptance 23) | 44 targets, labeled controls, `role="progressbar"` and `role="meter"` with values, reduced motion respected. The dialog's live region announces stage changes only, never each percent. Status pills carry an icon and a word, never color alone |
| Public only in PR 5 | The access picker shows Everyone. The six other rules show Later until gated content (PR 8) |

## 2. What the creator sees

| Board | Component | Notes |
| --- | --- | --- |
| Rail, phone More | `shell/destinations.ts` | Content sits after Page in the Page group, icon Library. On phones it lands in More (the dock keeps Home, Page, Design, Wallet) |
| Tabs | `content/ContentPanel.tsx` | Library, Store (Later), Live (Later). Tab in `?tab=`, open item in `?item=publicId` so Back and reload work |
| cs1 meter | `content/StorageMeter.tsx` | Storage by kind plus page images (spec 3.3), video minutes, a full warning |
| cs1 library | `content/LibraryView.tsx`, `content/ItemCard.tsx` | Search by title, filter chips (All, Video, Audio, Images, Documents, Files, Drafts), 30 per page with Show more, polling every 5 s while any item is processing |
| cs2 upload | `content/UploadDialog.tsx` | Drop zone and Choose files, limits table, space and minutes left, rights notice, one row per file with stage, line, progress, Pause, Resume, Cancel, Retry, Remove, Details |
| cs3 editor | `content/ItemEditor.tsx` | Title, description, chapters for video and audio, Allow downloads, 18+ label, Who can open this (Everyone only), autosave status |
| cs8 states | all of the above | Empty library with limits, delayed skeleton, load errors with Try again, offline notice with Retry now, processing failed in the card and the editor |

Statuses in PR 5:

| Item | Card shows |
| --- | --- |
| Uploading (not finished) | Upload not finished. Remove is offered when the file is not in this tab's queue |
| Processing | Processing, "Encoding on Stream" or "Scanning before it goes live" |
| Ready, not published | Draft. "Finish details" until it has a description |
| Ready, held | In review, "Held for review, usually within 1 business day" |
| Failed | Processing failed with the fix, for example "This PDF has a password. Remove it, then upload it again." Remove is offered |
| Blocked | Blocked, "This file can not be published." |
| Published | Public (reached in PR 6) |

## 3. How an upload works

`lib/uploadTask.ts` runs one file. `lib/uploadQueue.ts` runs the queue. `lib/uploads.ts` creates one queue per tab and wires it to the browser and React Query.

| Target from createUpload | Browser | Pause and resume | Failure |
| --- | --- | --- | --- |
| `put` (non video under 100 MB) | One XHR PUT with the signed `Content-Type`. Progress from `upload.onprogress` | Resume sends the file again. If the 15 minute URL expired (403), the item is replaced once and the file sent again | 4 retries (1, 3, 6, 12 s). Then Failed; Retry removes the item and starts over, since a presigned PUT can not be re-signed |
| `multipart` (non video at 100 MB and up) | 10 MB parts, 3 at a time, signed 6 ahead, each URL used within minutes. ETag read from the response | Finished parts are kept. Resume sends only the missing parts, each with a fresh URL | A part retries 4 times and is re-signed on every retry (an expired URL answers 403). Then Failed; Retry continues where it stopped |
| `stream` (all video) | `tus-js-client` with `uploadUrl` set to the server's TUS URL (never `endpoint`), 50 MB chunks, tus retries 0, 1, 3, 5, 10 s, nothing stored in localStorage | `abort(false)` keeps the upload; resume reads the offset with HEAD | A 404 or 410 (the 6 hour URL expired) fails with "This upload took too long and expired" and Retry starts over |

Then `completeUpload`. Once every byte has arrived the task never sends the file again: a pause, an offline spell or a failure from here on only repeats `completeUpload` (idempotent on the server). While Stream or R2 still says "File not found in storage", or the network fails, it asks again at 1.5, 3, 5, 8, 13 and 21 s; Retry asks again and never deletes the sent file. A `BAD_REQUEST` that failed the item (size or type mismatch, unreadable video) shows the server's message, and Retry starts over. A server fault after a multipart complete also starts over on Retry, since R2 can not complete the same upload twice.

After completeUpload the row moves to Scanning and the queue polls `content.get` (2, 3, 5, 8, 13, then every 21 s, for up to 2 hours) until the item is Ready, In review, Failed or Blocked. Each change refreshes `content.list`, `content.getStorage` and `content.get`.

Other rules:

- One file sends at a time. The rest wait with "Starts after the file before it." A file paused by the network holds its turn.
- `offline` pauses the sending file; `online` resumes it, unless the creator started another file meanwhile, in which case it waits its turn. Retry now does the same.
- Cancel while `createUpload` is still in flight waits for it and removes the item it created, so no reservation is left behind.
- Closing the dialog keeps everything going. It clears rows that are Ready or Blocked; failed rows stay until removed.
- Leaving the app while a file is sending asks first (`beforeunload`).
- Server messages are shown only for `BAD_REQUEST`, `PRECONDITION_FAILED`, `TOO_MANY_REQUESTS` and `NOT_FOUND`, which are written for creators in PR 2. Anything else reads "Something went wrong. Try again."
- Video length is read from the file's metadata (8 s timeout) and sent as `durationSec`, so a video longer than the minutes left is refused before upload.

Autosave (`lib/useAutosave.ts`): edits merge into one patch and save 800 ms after the last change, the same delay as Page and Design. One save at a time. A failed save keeps its fields and shows Could not save with Retry. Offline waits for `online`. "All content" flushes what is pending. Anything still unsaved when the editor closes (offline, or a failed save) moves to `lib/deferredSaves.ts`, outside React, which sends it on reconnect and every 21 s (8 tries). Reopening the item shows those edits and takes them back into autosave. An empty title is not sent and shows "Add a title." Chapters save only when every row has a start like 6:12 and a title, sorted by start.

## 4. What changes, file by file

### 4.1 Shell and flag

| File | Change |
| --- | --- |
| `types/editor.ts` | `"content"` in `EDITOR_PANELS` |
| `components/shell/destinations.ts` | Content destination (Page group, `flag: "VITE_CONTENT"`), `destinationForPanel`, `PANEL_TITLES` |
| `components/shell/TopBar.tsx` | Tab titles: Content, Library / Store / Live |
| `components/Layout.tsx` | Panel switch case behind `CONTENT_FLAGS.library`; Content sits on the room (`RESTYLED_PANELS`) |
| `config/content/flags.ts` (new) | `CONTENT_FLAGS.library` |
| `vite-env.d.ts`, `.env.*` | `VITE_CONTENT` |
| `apps/client/package.json` | `tus-js-client` ^4.3.1 |

### 4.2 Content destination (`apps/client/src/components/panels/content/`, new)

| File | What it does |
| --- | --- |
| `ContentPanel.tsx` | Tabs and the `?item=` route between the library and the editor |
| `LibraryView.tsx` | Meter, search, filters, grid, states, Upload, the dialog |
| `ItemCard.tsx` | One item: kind tile, title, status, line, actions |
| `StorageMeter.tsx` | Storage and minutes meters |
| `UploadDialog.tsx` | The dialog and its rows |
| `ItemEditor.tsx` | The editor, access card and autosave status |
| `parts.tsx` | `LaterPill`, `StatusPill`, `KindTile` |
| `copy.ts` | Every string |
| `lib/files.ts` | Kind and MIME from the file, preflight, byte and time formats (binary units, as the server counts) |
| `lib/uploadTask.ts` | One upload: put, multipart, stream, pause, resume, cancel, retry |
| `lib/uploadQueue.ts` | The queue, offline handling, polling after send |
| `lib/browserDeps.ts` | XHR PUT, tus-js-client, tRPC calls with errors normalized |
| `lib/uploads.ts` | The tab wide queue, query refresh, `useUploads()` |
| `lib/useAutosave.ts` | Debounced, serialized autosave |
| `lib/deferredSaves.ts` | Unsaved editor changes kept after the editor closes |
| `lib/status.ts` | Item status and the failure reason lines |
| `lib/rows.ts`, `lib/labels.ts`, `lib/chapters.ts`, `lib/useOnline.ts` | Row view, labels, chapter rows, online state |
| `testUi.ts` | Test helper: real Prism components without the `@repo/ui` index |

### 4.3 Tests (75 new)

| File | Covers |
| --- | --- |
| `lib/uploadTask.test.ts` | PUT, retries then Retry starts over, offline, network blip at completeUpload, Retry after completion failures never re-sends, a slow Stream finish never deletes the video, expired PUT URL replaced once, cancel during createUpload, multipart parts and sorted ETags, resume sends only missing parts, re-sign after 403, missing ETag, cancel aborts multipart, TUS into the server URL with 50 MB chunks and the duration, pending Stream completion, expired TUS URL, unreadable video |
| `lib/uploadQueue.test.ts` | One at a time in order, refused rows, batch overflow refused before sending, polling to Ready, offline and online, one sender after reconnect, cancel, resume waits its turn |
| `lib/files.test.ts` | Kinds, MIME fallback, refused types (SVG, EXE, PPTX, RAR, AVI), limits, storage with reservations, minutes |
| `lib/status.test.ts` | Statuses and failure lines, unknown codes never shown |
| `lib/useAutosave.test.tsx`, `lib/deferredSaves.test.ts` | 800 ms merge, failed save kept for Retry, offline wait, offline edit kept after close and sent on reconnect, flush on close, reopen takes the edit back |
| `LibraryView.test.tsx` | Empty state with limits, uploads closed, statuses, open editor, filters and search, load error and Try again |
| `ItemEditor.test.tsx` | Fields, title autosave, empty title not saved, chapters saved complete and sorted, Everyone only with six Later, failed item, flush before Back |
| `UploadDialog.test.tsx` | Row stages and lines for uploading, offline, refused, processing, ready, review, blocked, failed |
| `copy.test.ts` | Banned terms, dashes in copy and in the sources, the scan line |
| `shell/destinations.content.test.ts` | Flag off renders nothing; Content after Page, in More on phones |

## 5. What Gustavo needs to do

1. **Lockfile.** `pnpm-lock.yaml` is too large to push through the GitHub connector. The exact change is in `docs/fixes/content-library-ui.lockfile.patch` (adds `tus-js-client` 4.3.1 and its 17 dependencies, nothing else). On the branch:
   ```
   git apply docs/fixes/content-library-ui.lockfile.patch
   pnpm install --frozen-lockfile
   git rm docs/fixes/content-library-ui.lockfile.patch
   git add pnpm-lock.yaml && git commit -m "chore(client): lockfile for tus-js-client"
   ```
   A plain `pnpm install` also works but re-resolves some unrelated peer dependencies (zod for better-call, next). The patch keeps the lockfile diff to the new package.
2. **Run the checks.** `pnpm run typecheck`, `pnpm run build`, `pnpm --filter client test`, `pnpm run format:check`, `pnpm run check:copy`.
3. **R2 CORS on the staging bucket** (spec 3.4): allow `PUT` from the staging app host with header `Content-Type`, expose `ETag`, max age 3600. Without `ETag` exposed, every multipart upload (100 MB and up) fails at its first part.
4. **Stream allowed origins.** `CF_STREAM_ALLOWED_ORIGINS` on the API must include the staging app host, or TUS uploads are refused by Stream.
5. **Turn uploads on in staging.** `CONTENT_UPLOADS_ENABLED=true` with the Cloudflare settings from the PR 2 handoff. Until then the library shows "Uploads are not open yet".
6. **Staging QA** (section 6), then add the results to the PR.
7. Labels can not be set through the connector. Please add them on the PR.

## 6. Staging QA

| # | Check | Expect |
| --- | --- | --- |
| 1 | Open Content with no items | Empty state with limits from the server, Upload enabled, meter at 0 |
| 2 | Upload a 5 MB JPG and a 20 MB PDF together | First sends, second waits; both reach Scanning; with PR 4 merged, Ready |
| 3 | Upload a 300 MB WAV; turn Wi-Fi off at about 40%; back on | Row shows Paused with "Stopped at 40%", the offline notice shows; it resumes and sends only the missing parts (DevTools: no repeat of finished part numbers) |
| 4 | Upload a 1 GB MP4 from a phone; drop the connection; reconnect | TUS resumes at its offset (acceptance 1) |
| 5 | Pause and Resume a multipart upload after 20 minutes | Parts re-sign; no 403 reaches the creator |
| 6 | Choose an EXE, an SVG and a 30 MB PNG | Refused rows with the reason; no `createUpload` in the network tab |
| 7 | Fill storage to within 100 MB; upload 200 MB | Refused before any bytes (acceptance 7) |
| 8 | Rename a TXT to `.pdf` and upload | Fails at completeUpload with "This file's contents do not match a supported file type" and Retry starts over |
| 9 | Close the dialog mid upload; switch to Design; come back | Upload kept going; card shows its status |
| 10 | Edit title, description, chapters; reload | Values persist; "Autosaved HH:MM" shows; an empty title is refused |
| 11 | Keyboard only through the library, dialog and editor | Every control reachable, visible focus, 44 targets |
| 12 | Phone width | Content in More, dialog as a bottom sheet, grid one column, no horizontal scroll |
| 13 | Upload with the library open behind the dialog; Remove a failed item | The new card appears and the removed one goes, with no reload |
| 14 | VoiceOver or NVDA during an upload | Stage changes are announced (Uploading, Scanning, Ready); progress percentages are not |

## 7. Not in PR 5

| Missing | Arrives in | Why |
| --- | --- | --- |
| Covers, thumbnails and playback in the library | PR 6 | The router hands out no delivery URL until `getReadUrl` (PR 6). Kind tiles stand in |
| Publish, unpublish, delete a ready item, restore | PR 6 | Not in the router yet. Remove covers unfinished and failed uploads through `abortUpload` |
| Retry processing, Upload the original file (cs8) | The PR that adds `retryProcessing` (spec 3.5) | Not in the router yet. The failed line tells the creator to remove and upload again |
| Cover, captions, preview length, Sell in store, Preview as (cs3) | PR 6, PR 8, PR 9 | Need delivery URLs, gating or the store |
| Gated, For sale and In review filters, rule badges | PR 8, PR 9 | No rules or offers yet; `list` has no moderation filter |
| Server side title search | Later | Search filters the loaded pages; Show more loads the rest |
| Ready notice outside the dialog (spec 3.5 step 7) | Later | Needs an in app notice from the server. The library updates on its own while open |
| 18+ serving rules | PR 7 | The 18+ label saves now. PR 6 must not serve an `adult` item until the PR 7 refusals land, so the label's promise holds |
| Resume after a page reload | Later | The queue lives in the tab. After a reload the item shows "Upload not finished" with Remove; the 24 hour sweep removes it otherwise |

## 8. Validation

- Client tests: 16 files, 96 tests pass (75 new).
- An independent review of the upload, queue, autosave and editor code found 10 issues before the PR opened (list refresh key, Stream restart deleting a sent video, completion retries, PUT expiry, cancel during create, video bytes in preflight, edits lost on leaving offline, two files sending after reconnect, multipart complete retry, per percent announcements). All are fixed. Seven have a regression test. The list refresh (now `trpc.content.list.pathFilter()`, which matches the infinite list keys) and the live region are checked in staging QA rows 13 and 14. The multipart complete retry is a code path only a failing R2 can reach.
- Typecheck: no errors in new or changed files. This sandbox runs Node 22 and shows 9 errors that exist on `development` before this PR (`useFaucet.ts`, `UsdcSendFlow.tsx`, `pools/fan.ts`, `ProtectedRoute.test.tsx`); CI on Node 24 is the reference.
- `vite build` passes with `tus-js-client` bundled.
- ESLint clean on the new and changed files. Prettier clean.
- Copy test: no banned terms, no em or en dashes.
- Not run here: a browser pass against a live API. Section 6 is the plan for staging.
