# Content system PR 4: media processor

Branch `feat/media-processor`. PR 4 of the content system plan (`docs/features/content-system.md`, section 3.16). Build Board #20. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-10-17.

**Stacked on PR 3 (#329, `feat/media-gateway`).** This branch starts from PR 3. Merge #329 first, then rebase this branch on `development` (section 4.1). The two PRs touch different files except the CI workflow and the spec, where this PR only adds lines.

**No migration.** Every table PR 4 writes (`ContentItem`, `ContentAsset`, `BlockedContentHash`) came with PR 2.

**Uploads stay closed until the Queue is configured.** `contentUploadsOpen` now also needs `CF_QUEUES_API_TOKEN` and `CF_CONTENT_QUEUE_ID`. Without them `createUpload` answers "not available" exactly as it does today without R2. Nothing processes until the Worker is deployed (section 5).

## 1. Why we are doing this

PR 2 accepts uploads and leaves them in `incoming/` in PROCESSING. Nothing turns them into something a fan can see. PR 4 is that step. It is also where most of the compliance work of the content system happens:

| Duty | Where in PR 4 |
| --- | --- |
| Location privacy | Every image is re-encoded with no EXIF, GPS, XMP or IPTC. Audio loses every tag. PDFs lose the info dictionary and XMP |
| Malware (decision 12) | ClamAV on documents, zip files and anything fans can download. Zip bombs, encrypted archives and over limit files fail |
| Repeat offenders | SHA-256 of every upload, checked against `BlockedContentHash`. Malware hashes join the list |
| CSAM (decision 11) | The matcher step runs on what a viewer would see. Beta uses the no op adapter that logs. PhotoDNA is a GA gate |
| Adult content (decision 13) | The classifier step holds explicit items not labeled 18+. Production holds every image and video until a vendor runs |
| Least privilege | The container has no internet and no credentials. It reaches R2 only through the Worker, limited to its own item |
| Spend and abuse | Reserved bytes are released on every failure. A 2 hour sweep fails stuck items. The dead letter queue fails the rest |

| Later PR | Needs from PR 4 |
| --- | --- |
| 5 library UI | Items reach READY, FAILED or BLOCKED. The `failureReason` codes in section 7 become creator messages |
| 6 public pages | Renditions, covers, page previews, audio and waveform under the prefixes the gateway serves |
| 7 trust and safety | The CSAM evidence path takes over the `quarantine/` copy. Admin review clears HELD items |
| 8 gating | The PREVIEW_CLIP asset (video) and the AUDIO_PREVIEW asset (audio) for locked viewers |

## 2. How an item is processed

```
completeUpload (R2)         Stream webhook ready (video)
      |                               |
      +-- publish {type, publicId} ---+---> Queue content-ingest
                                               |
                                    processor Worker (queue consumer)
                                               |
          POST /internal/content/job (signed) -+-> API answers the job: kind, status, settings,
                                               |   the upload key, signed Stream thumbnail URLs
                                               |
              steps, one callback each --------+-> POST /internal/content/processed (signed)
                                               |   the API applies it and answers applied, blocked or ignored
                                               |
              heavy work ----------------------+-> toolbox Container: /scan /image /audio /document
                                                   reads incoming/, writes outputs, through http://r2.internal
```

**Why the API publishes, not an R2 event.** The spec had an R2 `object-create` notification on `incoming/`. An event can arrive before completeUpload has checked the size and the magic bytes, or for an upload that is about to be refused. Publishing from completeUpload, after the item is PROCESSING, removes the race and lets the publish failure be handled in the same request. The Stream webhook already published for video in PR 2.

**Why the job is fetched, not carried.** The message is only `{ type, publicId }`. The Worker asks the API for the rest. The answer has no user id, email or wallet. It is read at the moment of processing, so a creator who deleted the item a second ago gets `skipped:deleted`, not a run.

**The steps.** Each step reports to the API. The Worker only goes on while the API answers `applied`.

| Step | Audio | Image | Document (PDF, EPUB) | File (zip) | Video |
| --- | --- | --- | --- | --- | --- |
| hash | yes | yes | yes | yes | no (Stream holds the bytes) |
| malware | when downloads are on | when downloads are on | yes | yes | no (Stream re-encodes) |
| normalize | m4a, preview, waveform | renditions | cleaned PDF, page previews, cover | none | poster from Stream as COVER |
| csam | no | renditions | page previews or EPUB cover | no | keyframes, every 5 s, max 60 |
| blur | no | yes | yes when a cover exists | no | yes |
| classifier | no | yes | no | no | 5 keyframes |
| done | ORIGINAL row moves | ORIGINAL row moves | ORIGINAL row moves | ORIGINAL row moves | Stream clip and downloads (API) |

**The ORIGINAL row.** At upload the ORIGINAL asset points at `incoming/{id}/original.{ext}`. It moves only with the `done` report, so any retry before `done` still finds the upload. Where it points afterwards:

| Kind | ORIGINAL after done |
| --- | --- |
| Image | `derived/{id}/rendition/full.jpg`. The upload is never kept (spec 3.5) |
| Audio | `originals/{id}/original.{ext}` when downloads are on, else `audio/{id}/full.m4a` |
| Document | `originals/{id}/original.pdf` (cleaned) or `original.epub` (as uploaded) |
| File | `originals/{id}/original.zip` |
| Video | No R2 original. The STREAM row stays |

After `done` the Worker deletes `incoming/{id}/`.

**Failures.**

- A problem with the file itself (unreadable, wrong format, zip bomb, encrypted archive, over the scan limits, PDF with a password) is a `failed` report with a reason code. The item goes FAILED, its bytes are released, and its files are removed. The message is acknowledged. No retry.
- Malware is a `blocked` report with the signature name and the hash. The upload is copied to `quarantine/` first. The API adds the hash to the blocklist.
- Anything else (API down, container error, Stream thumbnail not ready) throws. The Queue retries after 1, 2 and 4 minutes. After the third retry the message goes to the dead letter queue, whose consumer reports `done` `failed` with `processing_error` and removes the files.
- An item stuck in PROCESSING for 2 hours with no step reported is failed by the sweep (`processing_timeout`), which now runs next to the 24 hour upload sweep.

**Concurrency and retries are safe.** Every output key is fixed (for example `derived/{id}/rendition/640.webp`), so a second run overwrites the same objects. The API applies steps idempotently (PR 2). When a step answers `ignored` (a parallel run finished first, or the item was deleted), the run stops and touches nothing.

## 3. What changes, file by file

### 3.1 Server (`apps/server`)

| File | Change |
| --- | --- |
| `services/cloudflare/queue.ts` (new) | `publishContentJob(message)`: `POST /accounts/{account}/queues/{queue_id}/messages` with `{ "body": {...} }`. 3 attempts on a network error or a 5xx; a 4xx is a configuration fault and throws at once. `contentQueueConfigured()` |
| `services/content/job.ts` (new) | `buildProcessorJob(publicId)`: the job JSON. For a video in PROCESSING it signs a Stream token (2 hours) and builds the poster URL (at 5 s, 1280 px) and keyframe URLs (every 5 s, at most 60, 640 px). `streamCustomerHost(uid)` reads `CF_STREAM_CUSTOMER_CODE` or the video's own thumbnail host |
| `services/content/state.ts` | `enqueueVideoProcessing` publishes (it only logged in PR 2) and throws on failure so Stream retries the webhook. The `hash` step checks `BlockedContentHash` and answers `blocked`. `finishVideo` at READY creates the PREVIEW_CLIP (Stream clip) and turns on MP4 downloads, best effort. `sweepStuckProcessing` (2 hours) |
| `trpc/content.ts` | completeUpload publishes `{ type: "r2", publicId }` once the item moved to PROCESSING. A publish failure deletes the object, fails the item (`queue_unavailable`), releases the bytes and answers "Could not start processing this file. Upload it again." |
| `routes/content.ts`, `services/API.ts` | `POST /internal/content/job`. Same signature as the callback. 404 until `CONTENT_PROCESSOR_SECRET` is set, 401 on a bad signature, 400 on a bad body, 404 `{ error: "not_found" }` for an unknown item |
| `services/cloudflare/stream.ts` | `StreamVideo.thumbnail`. Comments on clip and downloads say they run at READY |
| `services/cloudflare/config.ts` | Uploads need the two Queue variables |
| `env.ts`, `.env.example` | `CF_QUEUES_API_TOKEN`, `CF_CONTENT_QUEUE_ID`, `CF_STREAM_CUSTOMER_CODE` (optional) |

### 3.2 Shared constants (`packages/constants/src/contentJob.ts`, new)

`CONTENT_JOB_PATH`, `CONTENT_CALLBACK_PATH`, the queue message type and `parseContentQueueMessage`, the `ContentJob` type, `CONTENT_OUTPUT_KEYS` (every key the processor writes), and `contentKeyframeTimes`. No zod, so the Worker imports it by path and stays small (80 KiB, 20 KiB gzip, most of it `@cloudflare/containers`).

### 3.3 New app `apps/media-processor` (`@repo/media-processor`)

| File | What it does |
| --- | --- |
| `src/index.ts` | Queue handler for `content-ingest` and its `-dlq`. Acknowledges, or retries with backoff. Exports the container class and `ContainerProxy` (required for outbound interception) |
| `src/pipeline.ts` | The steps in section 2. `processMessage` and `failDeadLetter` |
| `src/api.ts` | Signed calls to the API. A bare 404 (route closed) is retried, never treated as "item not found" |
| `src/container.ts` | `ProcessorContainer` (port 8080, sleeps after 10 idle minutes, no internet, `database.clamav.net` allowed) and the `r2.internal` outbound handler |
| `src/grant.ts` | Per job grants: `{publicId}.{exp}.{hmac}`, 1 hour. The container may GET `incoming/{id}/...` and PUT `originals/`, `audio/`, `derived/{id}/...`. Nothing else, no other item |
| `src/toolbox.ts` | Calls the container. Items spread over `CONTAINER_POOL_SIZE` named instances |
| `src/adapters.ts` | CSAM matcher (`none`) and classifier (`mock`, `none`). A vendor adapter is one more branch |
| `src/storage.ts` | Streamed SHA-256, R2 copy, prefix delete (refuses any prefix that is not `{prefix}/{publicId}/`) |
| `wrangler.jsonc` | Top level is local and has no container (tests fake it). `staging` and `production` declare the container, the queues with the dead letter queue, the R2 bucket and the vars |

### 3.4 The toolbox container (`apps/media-processor/container`)

A small Node service. Not a workspace package: wrangler builds it from the Dockerfile.

| File | What it does |
| --- | --- |
| `Dockerfile` | `node:24-bookworm-slim` with ffmpeg, ClamAV (clamd, clamdscan, freshclam), poppler-utils, qpdf, libheif-examples, unzip, tini. Signatures are downloaded at build |
| `entrypoint.sh` | Starts clamd, refreshes signatures in the background when they are over 20 hours old, runs the server as the `node` user |
| `clamav/clamd.conf`, `freshclam.conf` | Scan limits (600 MB file, 2 GB scan, 16 levels, 20,000 files), alerts on limits and encryption. HTTPS only to the mirror, no DNS check |
| `src/server.mjs` | `/scan`, `/image`, `/audio`, `/document`, `/health`. One job at a time per instance. A file problem answers 200 `{ ok: false, reason }`; anything else 500 |
| `src/scan.mjs` | Archive limits from the zip central directory (10 times, 2 GB), then ClamAV |
| `src/image.mjs` | sharp: orientation, 4096 cap, 320, 640, 1280 and full in WebP and JPEG, 32 px blur. HEIC through heif-convert. 100 megapixel limit |
| `src/audio.mjs` | ffmpeg AAC 160 kbps m4a, no tags or chapters, preview cut by stream copy, 1000 peak waveform streamed from a 4 kHz mono decode |
| `src/document.mjs` | qpdf removes `/Info` and the catalog `/Metadata` (qpdf 11 JSON update, since bookworm has no single flag), pdftoppm pages 1 to 3, EPUB cover from the package file |
| `src/r2.mjs` | GET and PUT on `http://r2.internal/object/{key}` with the grant header |

### 3.5 Tests

| Suite | Count | What it covers |
| --- | --- | --- |
| `container/test/toolbox.test.mjs` (node:test) | 18 | Real tools. EICAR alone and inside a zip, zip bomb, encrypted zip, renamed EXE as zip, image, MP3 and PDF. GPS PNG: no EXIF, XMP or copyright text in any output, orientation applied. 30 s tagged MP3: AAC, no tags, 10 s preview, 1000 peaks. PDF: info and XMP gone, 4 pages, 3 previews. EPUB cover. A job cannot read another item |
| `container/test/clamd.test.mjs` | 1 | The same EICAR check through clamd and `clamdscan --fdpass`, as in the image. Skipped unless `CLAMD_CONFIG` and `CLAMD_SOCKET` are set |
| `test/pipeline.test.ts` (workerd) | 21 | Step order and payloads per kind, the ORIGINAL row per kind, quarantine on malware, cleanup on failure, nothing touched on `ignored`, blocklist stop, missing upload, skip after READY, video poster and frame counts, dead letter |
| `test/grant.test.ts` | 7 | Grant expiry, tampering, other items, and the outbound handler's allow and refuse rules with the local R2 |
| `test/api.test.ts` | 4 | The signature matches the API's HMAC (a vector computed with `node:crypto`), 404 handling, results |
| `test/queue.test.ts` | 3 | Ack, retry with backoff, malformed messages, dead letter |
| Server `content-queue`, `content-job` | 12 | Publish retries and 4xx, job JSON without user data, video URLs, customer host |
| Server `content-state`, `-router`, `-routes` | +11 | Blocklist stop, clip and downloads at READY, a failing clip keeps READY, the queue down on the webhook, the 2 hour sweep, completeUpload publishes once, a publish failure, the job route (404, 401, 400, 404, 200) |

Fixtures are generated by the tests. The repository holds no binary fixture and no malware sample. EICAR is the industry's harmless test string, assembled from two halves so the test file itself is not flagged by scanners on laptops or CI.

### 3.6 Repo wiring

- CI (`typecheck-build.yml`): a step for the Worker tests, and a `media-toolbox` job that installs ffmpeg, clamav, poppler-utils, qpdf, libheif-examples and unzip on the runner and runs the toolbox tests.
- `apps/media-processor/.gitignore` (generated types, `.wrangler`, `.dev.vars`) and `container/.gitignore` (`node_modules`).
- Spec: 3.5 step 2, 3, 6, 3.16 PR 4, 3.17 steps 3, 5 and 9, the comparison table, sources and the revision log (section 7).

## 4. What Gustavo needs to do

### 4.1 Review and merge

1. **Merge #329 first.** Then rebase this branch:

   ```bash
   git fetch origin
   git checkout feat/media-processor
   git rebase origin/development
   ```

   Expect no conflicts in code. If the spec or the CI workflow conflicts, keep both sides: this PR only adds.

2. **Commit the lockfile.** The lockfile is too large for the tool that pushed this branch:

   ```bash
   pnpm install
   git add pnpm-lock.yaml
   git commit -m "chore(media-processor): lockfile for the new Worker app"
   git push --force-with-lease
   ```

   CI uses `--frozen-lockfile`, so it fails until this lands. The new dependencies are `@cloudflare/containers` 0.3.7 (pinned) in `apps/media-processor`, and the same dev tools as the gateway. The container has its own `package-lock.json` (sharp 0.34.5).

3. Read sections 1 and 2.
4. Read in this order: `src/pipeline.ts`, `src/container.ts`, `src/grant.ts`, `container/src/server.mjs` and the four tool modules, then `apps/server/src/services/content/state.ts` and `job.ts`, then `wrangler.jsonc` and the Dockerfile.
5. Run locally:

   ```bash
   pnpm run build:packages
   pnpm --filter @repo/media-processor run typecheck
   pnpm --filter @repo/media-processor run lint
   pnpm --filter @repo/media-processor run test
   pnpm --filter @repo/media-processor run build
   pnpm --filter @repo/server run test:unit
   pnpm run typecheck
   pnpm run build
   # The toolbox tests need ffmpeg, clamav, poppler-utils, qpdf, libheif-examples, unzip
   pnpm --filter @repo/media-processor run test:toolbox
   ```

   Results on this branch: Worker typecheck, lint and build clean (79.82 KiB, 20.20 KiB gzip); 4 Worker test files and 35 tests pass; toolbox 19 tests pass (18, plus the clamd test run against a local clamd); server unit tests 44 files and 587 tests pass; `pnpm run typecheck` 8 of 8 and `pnpm run build` 10 of 10 succeed; Prettier clean on every new code file.

6. **Build the image once.** The image could not be built where this PR was written (no Docker Hub access). On your machine:

   ```bash
   cd apps/media-processor/container
   docker build -t amped-media-toolbox .
   docker run --rm -p 8080:8080 amped-media-toolbox &
   sleep 40 && curl -s localhost:8080/health
   ```

   Expect `{"ok":true}`. If an apt package name differs on bookworm, fix the Dockerfile in this PR. The code only needs the binaries `ffmpeg`, `ffprobe`, `clamd`, `clamdscan`, `freshclam`, `pdfinfo`, `pdftoppm`, `qpdf`, `heif-convert` and `unzip`.

### 4.2 Review checklist

- [ ] The container can read only `incoming/{its id}/` and write only `originals/`, `audio/`, `derived/{its id}/` (`grant.ts` `keyAllowed`, tests in `grant.test.ts`).
- [ ] No step logs a title, file name, user id or token. Logs carry the public id, the step and the outcome.
- [ ] A file problem never retries; every other error does (`ContentError` in the container, `ToolboxError` and `ApiError` in the Worker).
- [ ] Nothing is deleted after an `ignored` answer.
- [ ] Production vars: `CLASSIFIER=none`, `CLASSIFIER_REQUIRED=true`, `CSAM_MATCHER=none`.
- [ ] `CONTENT_PROCESSOR_SECRET` is the same value on the API and the Worker of each environment.
- [ ] The server change to `contentUploadsOpen` is intended: no uploads without a Queue.

## 5. Cloudflare setup and deploy (Gustavo)

Per account (staging first). Wrangler needs `CLOUDFLARE_ACCOUNT_ID` set to the account you are working on.

### 5.1 Containers

Containers must be enabled on the account (Workers Paid). Docker must run on the machine that deploys: `wrangler deploy` builds the image and pushes it to the Cloudflare registry.

### 5.2 Queues

```bash
cd apps/media-processor
npx wrangler queues create content-ingest-staging
npx wrangler queues create content-ingest-staging-dlq
npx wrangler queues info content-ingest-staging   # note the queue id
```

Production: `content-ingest` and `content-ingest-dlq`. Do not add an R2 event notification on the bucket (the spec no longer uses one).

### 5.3 API token for publishing

Dashboard, My Profile or Account API Tokens, Create Token, Custom: permission **Account, Queues, Edit**, this account only. Then on the API host:

| Variable | Value |
| --- | --- |
| `CF_QUEUES_API_TOKEN` | the token |
| `CF_CONTENT_QUEUE_ID` | the id from `queues info` |
| `CF_STREAM_CUSTOMER_CODE` | optional. The `xxxx` in `customer-xxxx.cloudflarestream.com` (Stream, any video, Embed). Saves one Stream API call per video |

`CF_ACCOUNT_ID` and `CONTENT_PROCESSOR_SECRET` already exist from PR 2.

### 5.4 Deploy the Worker

```bash
cd apps/media-processor
npx wrangler secret put CONTENT_PROCESSOR_SECRET --env staging   # same value as the API
pnpm run deploy:staging
```

The first deploy builds the image (a few minutes; ClamAV signatures are about 300 MB). Check the container appears under Workers, Containers, and the consumer under Queues.

### 5.5 R2 lifecycle rule

On the bucket: objects under `incoming/` expire after 7 days. It removes uploads whose processing never finished. The quarantine rule (30 days) and the multipart rule (1 day) from PR 2 stay.

### 5.6 Signature updates

The image carries signatures from build time. The entrypoint refreshes them from `database.clamav.net` when they are over 20 hours old. Check once on staging that the refresh works through the container egress (`wrangler tail --env staging`, look for `toolbox.freshclam_failed`). If it fails, the fallback is to redeploy weekly, which rebuilds the image with fresh signatures. Redeploy weekly anyway: it also picks up Debian security updates.

## 6. Staging QA (after section 5)

Turn on `CONTENT_UPLOADS_ENABLED` on staging. Upload through the API (the library UI is PR 5; use the tRPC calls from the PR 2 handoff, section 6). Watch `npx wrangler tail --env staging` and the `ContentItem` and `ContentAsset` rows.

| Upload | Expect |
| --- | --- |
| A phone photo (JPEG or HEIC) with location on | READY. 8 renditions and a blur in `derived/`. Download `full.jpg` through the gateway and check `exiftool` shows no GPS |
| A 30 s MP3 with tags, preview 10 s | READY. `audio/{id}/full.m4a` with no tags, `preview.m4a` of 10 s, `waveform/peaks.json`. ORIGINAL points at the m4a |
| The same MP3 with downloads on | Also a `malware` step, and `originals/{id}/original.mp3` |
| A PDF with author metadata | READY. `pageCount` set, 3 page previews, `pdfinfo` on the original shows no Author or Producer |
| An EPUB with a cover | READY with a COVER and a blur |
| A zip holding the EICAR test file (https://www.eicar.org) | BLOCKED, `moderationReason` the signature, a row in `BlockedContentHash`, the file in `quarantine/` |
| The same zip again | BLOCKED at the hash step (`blocklist:malware`) before any scan |
| A zip of 50 MB of zeros | FAILED `archive_ratio` |
| An image titled `qa-explicit test` | READY with `moderationState` HELD (mock classifier) |
| A 1 minute video with a 15 s preview and downloads on | After Stream is ready: COVER renditions, a PREVIEW_CLIP asset, downloads enabled on the Stream video |
| Stop the API for 10 minutes during an upload | Retries in the tail; the item finishes when the API is back, or fails with `processing_error` after the third retry |

## 7. Decisions made in this PR

1. **The API publishes jobs; no R2 event notification.** The event raced completeUpload. Spec 3.5 and 3.17 step 5 updated.
2. **The Worker fetches the job from the API.** The queue carries ids only. Item state is read at processing time and the API stays the only writer.
3. **CSAM matching after normalize.** It runs on renditions, page renders and keyframes, which is what a viewer would see and what PhotoDNA expects. A match copies the upload to `quarantine/` and removes the outputs before anything is published. PR 7 replaces the quarantine copy with the evidence path.
4. **Poppler and qpdf instead of pdfium.** Both are Debian packages and are tested here. Same result: page renders and metadata removal.
5. **Video is not malware scanned.** Stream re-encodes every video and downloads are Stream MP4 files, so the uploaded bytes never reach a fan.
6. **Stream clip and downloads are set by the API at READY**, not by the processor, so the Stream API token stays on the API.
7. **Production fails closed on the classifier.** With no vendor, every image and video is HELD for review. Staging uses the mock.
8. **One job at a time per container instance**, a pool of 2 (staging) and 3 (production) instances, `standard-2` (1 vCPU, 6 GiB), because clamd and ffmpeg are memory heavy. Raise `CONTAINER_POOL_SIZE`, `max_instances` and the consumer `max_concurrency` together.
9. **The image ORIGINAL is the clean full size JPEG**, so a download never carries the creator's EXIF.
10. **GIFs keep their first frame.** Animated renditions can come later.

Failure reason codes the library UI (PR 5) will turn into messages: `source_missing`, `queue_unavailable`, `image_unreadable`, `image_too_large`, `audio_unreadable`, `audio_too_long`, `pdf_unreadable`, `pdf_encrypted`, `epub_unreadable`, `epub_entry_too_large`, `archive_corrupt`, `archive_ratio`, `archive_too_large`, `archive_encrypted`, `scan_limits`, `processing_error`, `processing_timeout`, `stream:{code}`. Blocked reasons: `blocklist:{reason}`, the ClamAV signature name, `csam_match`.

## 8. Follow-ups

- **PhotoDNA adapter** (`CSAM_MATCHER=photodna`) before general availability. Launch gate.
- **Classifier vendor adapter** (decision 13). Until then production holds every image and video.
- **Creator notice at READY** (spec 3.5 step 7) lands with the library UI in PR 5.
- **`retryProcessing`** (spec 3.5 step 6) in PR 5.
- **CSAM evidence path** and admin review of HELD items in PR 7.
- **Animated GIF renditions**, if creators ask.

## 9. References

- Spec: `docs/features/content-system.md` 3.5, 3.11, 3.16, 3.17
- PR 2 handoff: `docs/fixes/content-foundation.md`. PR 3 handoff: `docs/fixes/content-media-gateway.md`
- Cloudflare Containers: https://developers.cloudflare.com/containers/
- `@cloudflare/containers` outbound interception: https://github.com/cloudflare/containers
- Queues over HTTP: https://developers.cloudflare.com/queues/examples/publish-to-a-queue-via-http/
- Queues retries and dead letter queues: https://developers.cloudflare.com/queues/configuration/batching-retries/
- Stream thumbnails: https://developers.cloudflare.com/stream/viewing-videos/displaying-thumbnails/
- ClamAV configuration: https://docs.clamav.net/manual/Usage/Configuration.html
- EICAR test file: https://www.eicar.org/download-anti-malware-testfile/
