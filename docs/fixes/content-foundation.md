# Content system PR 2: foundation (tables, Cloudflare services, upload API)

Branch `feat/content-foundation`. PR 2 of the content system plan (`docs/features/content-system.md`, section 3.16). Build Board #20. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-10-12.

**Stacked on PR 1 (#316).** This branch starts from `fix/uploads-sdk-v3-validation` because it reuses `services/s3Upload.ts` and `utils/fileSignature.ts`. It opens as a draft. Merge #316 first. Then rebase this branch onto `development` (section 4.1, step 1) and mark it ready.

**Server only. Flags off.** No UI and no change for anyone until `CONTENT_UPLOADS_ENABLED=true` and the Cloudflare setup in section 5 is done. One migration, new tables only, applied by hand.

## 1. Why we are doing this

The content system lets creators upload video, audio, images, PDFs, ebooks and ZIP files, and later sell them in their store. Rob chose Cloudflare for all of it (12 Oct): R2 for files, Stream for video, Workers for delivery and processing. Every later PR builds on this one:

| Later PR | Needs from PR 2 |
| --- | --- |
| 3 media gateway Worker | The token format and signer (`mediaToken.ts`), the R2 key layout |
| 4 media processor Worker | The callback route and schema, the asset model, the Stream client (clips, downloads) |
| 5 library UI | The `content` router, the upload targets, `getStorage` |
| 6 public pages | Items, assets and publish state, playback tokens |
| 7 trust and safety | `ContentReport`, `CopyrightNotice`, `BlockedContentHash` |

PR 2 is the part that has to be right first: the data model, how bytes get to storage without passing through our servers, and the checks that stop a bad file before anyone sees it.

## 2. How an upload works

```
browser                      API (content router)                    R2 / Stream
  | createUpload ----------> | flag, type, size, quota reserve      |
  |                          | ContentItem UPLOADING                 |
  |<-- target ---------------| put: one presigned PUT  (< 100 MB)   |
  |                          | multipart: uploadId + part count      |
  |                          | stream: one time TUS URL (video)      |
  | bytes ---------------------------------------------------------> incoming/{publicId}/original.{ext}  or Stream
  | signParts (multipart) -> | part URLs, each bound to its length   |
  | completeUpload --------> | R2: HeadObject size + 4 KB magic      |
  |                          | Stream: video exists, not pending     |
  |                          | PROCESSING                            |
  |                                                                   |-- R2 event -> processor (PR 4)
  |                          |<-- POST /webhooks/cloudflare-stream ---| video ready or failed
  |                          |<-- POST /internal/content/processed ---| processor steps (PR 4)
  |                          | READY, reserved bytes become used     |
```

- **Our servers never carry the bytes.** The browser sends files to R2 or Stream directly.
- **Every URL is bound.** A presigned PUT signs `Content-Type` and `Content-Length`. Each multipart part URL signs its exact length. A Stream upload URL is created with the exact `Upload-Length`. Storage refuses anything else.
- **The bytes are checked again.** At `completeUpload` the API compares the stored size with the declared size, reads the first 4 KB, and checks the real type against the kind. A mismatch deletes the file, fails the item and gives the bytes back.
- **Quota is reserved up front.** `createUpload` reserves the declared size with one conditional `UPDATE`, so two uploads racing for the last gigabyte cannot both pass. READY moves reserved bytes to used. A failure or abort releases them. Uploads left unfinished for 24 hours are failed by a sweep every 15 minutes.
- **The API is the only writer of item state.** The router, the Stream webhook and the processor callback all go through `services/content/state.ts`. Every transition is conditional on the current status, so a retried webhook cannot commit quota twice.

## 3. What changes, file by file

### 3.1 Database

| File | Change |
| --- | --- |
| `packages/database/prisma/schema.prisma` | 7 enums and 6 models, copied from spec 3.3: `ContentItem`, `ContentAsset`, `UserStorageQuota`, `ContentReport`, `CopyrightNotice`, `BlockedContentHash`. Two back relations on `User` (`contentItems`, `storageQuota`). UUID v7 `BINARY(16)` ids per `AGENTS.md`. No `offerItems` yet: that comes with `Offer` in PR 9, per spec 3.3 "Migrations per PR". The existing schema is untouched; only the new section is Prisma formatted. |
| `packages/database/prisma/migrations/20261012120000_content_foundation/migration.sql` | Creates the 6 tables and 4 foreign keys. Written in the same form `prisma migrate` emits for MySQL (names, `DATETIME(3)`, charset). No existing table is altered. |

### 3.2 Shared constants (`@repo/constants`)

| File | Change |
| --- | --- |
| `packages/constants/src/content.ts` (new) | Kinds and accepted types (spec 3.2), size defaults, upload mechanics (100 MB multipart threshold, 10 MB parts, 15 minute URLs, Stream limits), public id format, R2 key prefixes, `contentTypeAllowed`, every tRPC input schema, the processor callback schema shared with the PR 4 Worker, the signature header names. |
| `packages/constants/src/mediaToken.ts` (new) | The gateway token format `v1.{kid}.{payload}.{sig}` (spec 3.6), shared with the PR 3 Worker. Format only, no crypto, and pure base64url and UTF-8 helpers, because this package has no Node or DOM globals and the same code must run on the API and in a Worker. `parseMediaTokenKeys` refuses a short secret or a duplicate kid instead of signing with it. |
| `packages/constants/src/index.ts` | Exports both. |

### 3.3 Server

| File | Change |
| --- | --- |
| `apps/server/src/env.ts`, `.env.example` | 20 variables (section 5.3). All default to empty or off. |
| `services/cloudflare/config.ts` (new) | `contentUploadsOpen()`: the flag is on **and** every required setting exists. A half configured environment answers "Uploads are not open yet." instead of a broken upload. |
| `services/cloudflare/r2.ts` (new) | One S3 client on the R2 endpoint: region `auto`, path style, checksums `WHEN_REQUIRED` (PR 1 trap 3.2). Presigned PUT, multipart create, part presign bound per part, complete, abort, delete, verify. Reuses PR 1's `createPresignedPutUrl` and `verifyUploadedObject`. |
| `services/cloudflare/stream.ts` (new) | Direct creator upload over TUS. Video get, update (meta, `allowedOrigins`, `requireSignedURLs`) and delete, plus clip and downloads for PR 4. RS256 playback token signing with our Stream key, so playback needs no API call. Webhook signature check: HMAC-SHA256 of `time.body` with a 5 minute window. |
| `services/cloudflare/mediaToken.ts` (new) | Gateway token signer and a reference verifier with key rotation (the first key signs, all verify). `mediaUrl()`. Processor callback signing and verification. Nothing hands out a token yet: `getReadUrl` is PR 6. |
| `services/content/quota.ts` (new) | `ensureQuota` (env defaults: 5 GB, 300 minutes), plus `reserveBytes`, `releaseBytes` and `commitBytes` as single conditional `UPDATE` statements, floored at zero. |
| `services/content/ids.ts` (new) | 16 character public ids from a to z and 0 to 9, using rejection sampling so every character is equally likely. |
| `services/content/state.ts` (new) | `failItem`, `applyStreamWebhook`, `applyProcessorCallback`, the sweep, and `enqueueVideoProcessing` (a logged no-op until PR 4, section 6.4). |
| `trpc/content.ts` (new) | `createUpload`, `signParts`, `completeUpload`, `abortUpload`, `list`, `get`, `update`, `getStorage`. Owner only. Someone else's item reads as NOT_FOUND, so ids cannot be probed. Outputs never include the numeric user id, R2 keys or Stream uids. |
| `trpc/index.ts` | Registers `content`. |
| `routes/content.ts` (new) | `POST /webhooks/cloudflare-stream` and `POST /internal/content/processed`. Both read the raw body (the signatures cover exact bytes). Each answers 404 until its secret is set and 401 on a bad signature, and does not depend on the upload flag, so items already in flight still finish during a pause. |
| `services/API.ts` | Mounts both routes before the global JSON parser, next to the Telegram webhook. |
| `bootstrap.ts` | Starts the stale upload sweep. |
| `utils/fileSignature.ts` (from PR 1) | Recognises MP3, AAC, WAV, FLAC, M4A, PDF, EPUB, ZIP, HEIC and MKV. Profile and theme uploads are unchanged: their allowed lists do not include these types, so they are still refused. |

### 3.4 Tests (84 new, 450 in total)

| File | Tests | Covers |
| --- | --- | --- |
| `content-tokens.test.ts` | 23 | Type rules, part maths, public ids, base64url and UTF-8 matching Node byte for byte, token round trip and tamper, key rotation, callback and Stream webhook signatures (format from Cloudflare's docs), RS256 token verified with the public key, the TUS request, per part length binding on real presigned R2 URLs |
| `content-signatures.test.ts` | 17 | Every R2 content type detected; renamed and cross kind files refused; EXE, HTML and shell scripts refused for every kind |
| `content-router.test.ts` | 20 | Flag and config gate, type and size checks, quota refusal, each target type, video minutes, cleanup when storage fails, completeUpload pass, mismatch, retry, multipart and idempotence, ownership, signParts bounds, abort, no leaks in owner output, preview rules, getStorage |
| `content-state.test.ts` | 12 | Step recording, READY commits once, video minutes rounding, held stays held, failed and blocked release bytes, malware hash blocklisted, CSAM hash never stored, asset upsert, Stream ready and error, sweep |
| `content-quota.test.ts` | 5 | The exact SQL of reserve, release and commit; defaults |
| `content-routes.test.ts` | 8 | 404 without secret, 401 on bad signature, 400 on a bad body, 200 and 404 paths |
| `upload-validation.test.ts` (PR 1) | changed | ZIP and HEIC are now recognised; they are still refused for profile uploads |

## 4. What Gustavo needs to do

### 4.1 Review and merge

1. **After #316 merges**, rebase this branch:

   ```bash
   git fetch origin
   git checkout feat/content-foundation
   git rebase --onto origin/development fix/uploads-sdk-v3-validation
   git push --force-with-lease
   ```

   If you squash merged #316, the rebase replays only this PR's commits. Then mark the PR ready for review.
2. Read sections 1 and 2.
3. Read in this order: `services/content/state.ts`, `trpc/content.ts`, `services/cloudflare/r2.ts`, `services/cloudflare/stream.ts`, `routes/content.ts`. The constants and tests read as reference.
4. Run locally:

   ```bash
   pnpm install
   pnpm --filter @repo/constants run build
   pnpm run --filter server run prisma:generate
   cd apps/server
   pnpm run typecheck
   pnpm run test:unit
   pnpm run lint
   pnpm run build
   ```

   Results on this branch: typecheck clean (server and client), 35 test files and 450 tests pass, lint clean on every changed file (three warnings predate this PR and were left alone: in `API.ts` a prettier hint on the well-known route array and an unused `next`, in `env.ts` a trailing blank line), build clean. The rollback SQL in 4.2 was also run on that MariaDB.

### 4.2 The migration

Applied by hand after merge, like every migration here:

```bash
pnpm --filter @repo/database exec prisma migrate deploy --schema=./prisma/schema.prisma
```

What was checked: all 32 migration folders, from `0_init` through this one, applied in order on a fresh MariaDB 10.11 with no errors. On that database:
- Defaults are right: UPLOADING, DRAFT, PENDING.
- Deleting a user cascades to items, assets, reports and the quota row.
- The reserve statement refuses a reservation past the limit.
- Release floors at zero.

Production runs MySQL 8, and the DDL uses only syntax both share. Please run `prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url <scratch db>` once locally. It should print no changes. I could not run it here: the sandbox cannot download Prisma's schema engine.

Rollback, if ever needed (the tables are empty until the flag goes on):

```sql
DROP TABLE content_assets, content_reports, content_items, user_storage_quotas, copyright_notices, blocked_content_hashes;
DELETE FROM _prisma_migrations WHERE migration_name = '20261012120000_content_foundation';
```

### 4.3 Review checklist

- [ ] No route or procedure works with the flag off, except the two webhooks, which answer 404 without their secrets.
- [ ] `createUpload` reserves before it creates anything, and every failure after that releases.
- [ ] Every presigned URL binds its length: PUT (type and length), parts (length), Stream (`Upload-Length`).
- [ ] `completeUpload` deletes and fails a mismatched file. A missing file stays UPLOADING so the client can retry.
- [ ] State changes are conditional on the current status, so quota moves once.
- [ ] Owner outputs carry no user id, R2 key or Stream uid.
- [ ] Logs never print a token, a signed URL or a secret.
- [ ] Copy: no banned words (earn, yield, return, income, invest), no dashes.

## 5. Cloudflare setup (Gustavo, before the flag goes on in staging)

Spec 3.17 in executable form. Do staging first, on **its own Cloudflare account**, because Stream allows one webhook URL per account.

### 5.1 Accounts and R2

1. Create or choose the staging Cloudflare account. Turn on Workers Paid (needed for Queues and Containers in PR 4).
2. R2, Create bucket: `amped-content-staging`, location hint North America. Leave Public access off. Do not enable the `r2.dev` URL.
3. Bucket, Settings, CORS policy:

   ```json
   [
     {
       "AllowedOrigins": ["https://app.staging.amped.bio"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   `ETag` must be exposed, or the browser cannot read part ETags for multipart.
4. Bucket, Settings, Object lifecycle rules:
   - Abort incomplete multipart uploads after 1 day.
   - Delete objects with prefix `quarantine/` after 30 days.
5. R2, Manage API tokens, Create token: Object Read and Write, applied to `amped-content-staging` only. Record the Access Key ID and Secret Access Key. Cloudflare shows the secret once.

### 5.2 Stream

1. Stream, Signing keys (or `POST /accounts/{id}/stream/keys`): create one key. Record `id` and `pem`. The `pem` is base64 encoded. Store it as returned; the server decodes it.
2. Create an API token with **Stream Edit** on this account. This is `CF_STREAM_API_TOKEN`.
3. Set the webhook:

   ```bash
   curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream/webhook" \
     -H "Authorization: Bearer $CF_STREAM_API_TOKEN" -H "Content-Type: application/json" \
     -d '{"notificationUrl":"https://api.staging.amped.bio/webhooks/cloudflare-stream"}'
   ```

   The response carries `secret`. That is `CF_STREAM_WEBHOOK_SECRET`.
4. Prepay Stream storage for the pilot, starting at 10,000 minutes, with a usage alert at 80%.

### 5.3 Secrets and settings (staging API)

| Variable | Value |
| --- | --- |
| `CONTENT_UPLOADS_ENABLED` | `false` until section 5 is done, then `true` |
| `CF_ACCOUNT_ID` | Staging account id |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | From 5.1 step 5 |
| `R2_BUCKET` | `amped-content-staging` |
| `CF_STREAM_API_TOKEN` | From 5.2 step 2 |
| `CF_STREAM_KEY_ID`, `CF_STREAM_KEY_PEM` | From 5.2 step 1 |
| `CF_STREAM_WEBHOOK_SECRET` | From 5.2 step 3 |
| `CF_STREAM_ALLOWED_ORIGINS` | `staging.amped.bio,app.staging.amped.bio` |
| `MEDIA_GATEWAY_ORIGIN` | `https://media.ampedusercontent-staging.com` (used from PR 3; host changed in PR 3, see `docs/fixes/content-media-gateway.md`) |
| `MEDIA_TOKEN_KEYS` | `s1:` followed by the output of `openssl rand -base64 48 \| tr '+/' '-_' \| tr -d '='` (used from PR 3) |
| `CONTENT_PROCESSOR_SECRET` | `openssl rand -hex 32` (used from PR 4) |
| `UPLOAD_LIMIT_CONTENT_*_MB`, `CONTENT_QUOTA_*` | Leave unset for the spec defaults |

The other spec 3.17 items (the `ampedusercontent.com` zone, Queues, KV, event notifications, WAF, the CSAM Scanning Tool, the classifier account) belong to PR 3 and PR 4. Their handoff docs will list them. They are not needed to test PR 2.

## 6. Decisions made in this PR

1. **The multipart `uploadId` goes back to the browser** and returns on `signParts`, `completeUpload` and `abortUpload`, instead of a new column. It is useless without our presigned part URLs, and R2 rejects it for any other key. The spec's model stays exactly as written.
2. **Path style R2 URLs** (`https://{account}.r2.cloudflarestorage.com/{bucket}/{key}`), the form Cloudflare's presigned URL examples use.
3. **Only documented TUS metadata keys** (`maxDurationSeconds`, `requiresignedurls`, `expiry`). Name, `meta.publicId` and `allowedOrigins` are set right after with a documented video update. If that call fails, signed URLs are still required from creation, so playback never opens.
4. **Video processing hand-off is a seam.** When Stream reports a video ready, the item goes to PROCESSING with step `stream_ready` and `enqueueVideoProcessing` logs it. PR 4 replaces that body with a Queue send. Until then a video never reaches READY, which is correct: it has not been checked.
5. **The sweep covers abandoned uploads only** (UPLOADING over 24 hours). The PROCESSING timeout ships with the processor in PR 4. Before PR 4 nothing processes, so it would fail every item.
6. **`VITE_CONTENT` moves to PR 5**, the first PR with UI.
7. **PhotoDNA and classifier keys stay out of the API env.** Only the processor Worker calls them (PR 4). PhotoDNA is after beta (Rob, 12 Oct).
8. **CSAM matches never touch these tables.** A blocked callback from the `csam` step blocks the item. It does not write `BlockedContentHash`; evidence handling is PR 7.

## 7. Staging QA (after section 5 and the flag)

There is no UI until PR 5, so QA runs from the browser console on `https://app.staging.amped.bio` while signed in. Paste this:

```js
const api = "https://api.staging.amped.bio/trpc";
const call = (path, input) =>
  fetch(`${api}/${path}`, {
    method: "POST", credentials: "include", headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).then(r => r.json());
const query = (path, input) =>
  fetch(`${api}/${path}` + (input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`), {
    credentials: "include",
  }).then(r => r.json());

// 1. A small MP3 through one presigned PUT
const mp3 = new Uint8Array(4096); mp3.set([0x49, 0x44, 0x33, 4, 0, 0]); // "ID3" header
const file = new File([mp3], "qa-tone.mp3", { type: "audio/mpeg" });
const up = await call("content.createUpload", { kind: "audio", fileName: file.name, mimeType: file.type, size: file.size });
console.log("createUpload", up);
const put = await fetch(up.result.data.target.url, { method: "PUT", body: file, headers: up.result.data.target.headers });
console.log("PUT", put.status); // 200
console.log("complete", await call("content.completeUpload", { publicId: up.result.data.publicId })); // processing
console.log("storage", await query("content.getStorage"));
```

Expected and further checks:

1. The script ends with `processing`, and `getStorage` shows `bytesReserved: 4096`.
2. **Wrong size.** Rerun step 1, but PUT a different `File` of another size to the same URL. Expected: R2 answers 403. `completeUpload` then says "File not found in storage. Please upload the file first."
3. **Wrong type.** Rerun with `mp3` filled with `%PDF-1.7` bytes and still called `qa.mp3`. Expected: `completeUpload` returns "This file's contents do not match a supported file type. Please choose another file." `query("content.get", { publicId })` shows `failed`, and `getStorage` shows the bytes released.
4. **Video.** Call `createUpload` with `kind: "video"` and a real small MP4, then upload with `tus-js-client` to `target.uploadUrl`. Within a minute of the upload finishing, the server log shows `[content] video ready for processing`, and `get` shows `processingStep: "stream_ready"`, `durationMs` set.
5. **Webhook security.** `curl -X POST https://api.staging.amped.bio/webhooks/cloudflare-stream -d '{}'` returns 401. With the secret unset it returns 404.
6. **Flag off.** Set `CONTENT_UPLOADS_ENABLED=false`. `createUpload` returns "Uploads are not open yet."
7. **Cleanup.** `content.abortUpload` on a test item returns `deleted`, and the bytes are released.

## 8. Follow-ups

1. PR 3: the media gateway Worker verifies `mediaToken.ts` tokens with WebCrypto. Its tests should load a token signed by `signMediaToken` to prove the two runtimes match.
2. PR 4: replace `enqueueVideoProcessing`; add the PROCESSING timeout to the sweep; the processor posts to `/internal/content/processed` with `signProcessorCallback`'s format.
3. PR 5: `VITE_CONTENT`, the library UI on these procedures, `tus-js-client` with `chunkSize: CONTENT_UPLOAD.streamChunkBytes`.
4. Account deletion (#13): `ContentItem` rows cascade with the user, but R2 objects and Stream videos need the purge job (PR 6) to run for that user.
5. Privacy notice: Cloudflare becomes a recipient of creator files and fan playback data once the flag goes on. The published Privacy Policy must name it before production (the `AGENTS.md` privacy rule). Staging needs no change.

## 9. References

- Spec: `docs/features/content-system.md` sections 3.2 to 3.6, 3.10, 3.16, 3.17 (on #311)
- PR 1 handoff: `docs/fixes/uploads-sdk-v3-validation.md` (on #316)
- Cloudflare direct creator uploads: https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads
- Cloudflare Stream webhooks: https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
- R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Build Board: https://claude.ai/artifact/FK8J7ZXWEcYXg5zvHwffxh
