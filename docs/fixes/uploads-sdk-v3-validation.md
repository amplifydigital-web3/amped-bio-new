# Uploads: AWS SDK v3 signing and real size and type checks

Branch `fix/uploads-sdk-v3-validation`. PR 1 of the content system plan (`docs/features/content-system.md`, section 3.16). Closes the Build Board fix cards **Remove AWS SDK v2** and **Enforce upload size and file type**. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-10-12.

No user facing change for honest uploads. No migration. No new environment variables. No client changes.

**One step for Gustavo before merge:** run `pnpm --filter @repo/server remove aws-sdk` on this branch and commit `apps/server/package.json` and `pnpm-lock.yaml` (section 4.1, step 1). No code imports `aws-sdk` anymore. The lockfile is 790 KB and could not be pushed from the tool that opened this PR.

## 1. Why we are doing this

### 1.1 Anyone can upload any file of any size today

Every upload flow works the same way:

1. The client calls a `request...PresignedUrl` route with `contentType`, `fileExtension` and `fileSize`.
2. The server checks those three values with zod and returns a presigned S3 PUT URL.
3. The browser PUTs the file to S3.
4. The client calls a `confirm...Upload` route. The server checks the object exists, marks the record `COMPLETED` and attaches it to a profile, theme, collection or pool.

The checks in step 2 only look at what the client *says*. Nothing ties the URL to those values:

- **Size.** The v2 presigned URL did not sign `Content-Length`. A client could declare 900 KB, get a URL, and PUT 5 GB. S3 accepted it. We pay to store and serve it.
- **Type.** The browser's `file.type` comes from the file name. An HTML page renamed `avatar.png` is declared as `image/png`, passes zod, uploads, and is then served from our public bucket.
- **Confirm.** Step 4 only ran `HeadObject`. It never compared the stored size or looked at the bytes.

All six flows were open: avatar, theme background (user), pool image, theme collection image (admin), theme thumbnail (admin), theme background (admin).

### 1.2 AWS SDK v2 is end of support

`aws-sdk` v2 reached end of support on 8 September 2025. It gets no security fixes. We only used it for one thing: `getSignedUrlPromise` for PUT URLs. Everything else in `S3Service` was already on v3. v2 also pulled 11 old transitive packages into the server (`xml2js`, `querystring`, `url@0.10`, `uuid@8` and others).

### 1.3 The content system depends on this

The content system (Build Board #20) moves to Cloudflare R2 with the same presign, upload, confirm pattern for much larger files (video, audio, ZIP). PR 2 onwards copies the helpers added here. The two SDK v3 traps in section 3 would break R2 uploads in exactly the same way, so they are fixed once, here, with tests.

## 2. What changes

### 2.1 Behavior, before and after

| Case | Before | After |
| --- | --- | --- |
| Honest upload, any flow | Works | Works. Same routes, same inputs, same responses |
| PUT body larger or smaller than declared `fileSize` | Accepted by S3 | S3 refuses the PUT with 403 `SignatureDoesNotMatch` |
| PUT with a different `Content-Type` header than declared | Accepted by S3 | S3 refuses the PUT with 403 |
| Object in S3 differs in size from the record (any path that gets past the PUT) | Marked `COMPLETED` | Confirm fails, object deleted, record `DELETED` |
| File whose bytes are not the declared type (HTML as PNG, EXE as JPG, PNG declared as JPEG) | Marked `COMPLETED` and served | Confirm fails with BAD_REQUEST, object deleted, record `DELETED` |
| SVG uploaded to the pool image flow (JPG and PNG only) | Possible by declaring `image/png` | Confirm fails |
| Confirm called before the PUT finished | BAD_REQUEST "File not found in S3" | BAD_REQUEST "File not found in storage", record stays `PENDING`, client can retry |
| `fileSize` over the limit on a request route | Users saw "Failed to generate upload URL" (500) because the catch block swallowed the 400 | Users see the real 400 message ("File size exceeds the 1MB limit") |

### 2.2 Files

| File | Change |
| --- | --- |
| `apps/server/package.json`, `pnpm-lock.yaml` | **Gustavo, step 1 in 4.1.** Remove `aws-sdk` v2 and its 11 transitive packages. Verified locally: the lockfile loses `aws-sdk`, `buffer@4.9.2`, `events@1.1.1`, `ieee754@1.1.13`, `jmespath@0.16.0`, `punycode@1.3.2`, `querystring@0.2.0`, `sax@1.2.1`, `url@0.10.3`, `uuid@8.0.0`, `xml2js@0.6.2` and `xmlbuilder@11.0.1`. pnpm may also re-point one `debug` entry under `@metamask/utils@5.0.2`; that is a harmless dedupe. |
| `apps/server/src/services/s3Upload.ts` (new) | Two pure helpers that take an S3 client: `createPresignedPutUrl` (signs `content-type` and `content-length`) and `verifyUploadedObject` (HeadObject size check, then a ranged GET of the first 4 KB and a type check). Pure so they are tested with no network. |
| `apps/server/src/utils/fileSignature.ts` (new) | Magic byte detection for every type we accept: JPEG, PNG, SVG, MP4, QuickTime, AVI, WebM (plus GIF and WebP, recognised but not allowed anywhere yet). `checkFileSignature` compares detected, declared and allowed types. MP4 and QuickTime count as one family because phones label the same file either way. |
| `apps/server/src/services/uploadVerification.ts` (new) | `assertUploadVerified(uploadedFile, allowedTypes)`. The one call every confirm route makes. On a size or type failure it deletes the object, marks the record `DELETED` and throws BAD_REQUEST with a plain message. On a missing object it leaves the record `PENDING`. |
| `apps/server/src/services/S3Service.ts` | v2 client and `AWS.config` removed. One v3 client with `requestChecksumCalculation: "WHEN_REQUIRED"` (section 3.2). `getSignedUrl` now covers get and delete only; uploads use the new `getSignedUploadUrl(key, contentType, contentLength)`. `getPresignedUploadUrl` and `getServerPresignedUploadUrl` take a required `fileSize` and validate it. New `verifyUpload`. `validateFile` fixes (section 2.3). |
| `apps/server/src/trpc/upload.ts` | Avatar and theme background: pass `input.fileSize`, confirm with `assertUploadVerified`, rethrow TRPCError in the avatar catch. |
| `apps/server/src/trpc/admin/upload.ts` | Collection image, theme thumbnail, theme background: same three changes. |
| `apps/server/src/trpc/pools/creator.ts` | Pool image: same three changes. |
| `apps/server/src/__tests__/upload-validation.test.ts` (new) | 32 tests: type detection, signature checks, presigned URL headers, the checksum trap, the confirm step against a fake S3. |
| `apps/server/src/__tests__/upload-confirm.test.ts` (new) | 5 tests: what the confirm routes do on success, size failure, type failure, failed delete, missing object. |
| `apps/server/src/__tests__/s3-service-uploads.test.ts` (new) | 9 tests: `validateFile` limits in bytes, collection image limit, invalid sizes, upload URLs from the real `S3Service`. |

### 2.3 Two latent bugs fixed in `validateFile`

1. **MB compared with bytes.** `maxSize` was set from `env.UPLOAD_LIMIT_*_MB` (for example `1`) and compared with `fileSize` in bytes. Any real file would have failed. It never fired because no caller passed `fileSize`. Now that callers do, the limit is converted to bytes first.
2. **Collection images used the avatar limit.** `getServerPresignedUploadUrl` mapped `"category"` to `"profiles"`, so admin collection images were held to the 1 MB avatar limit while the admin route allows 2 MB. `"category"` now has its own rule: `ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES` and `UPLOAD_LIMIT_COLLECTION_THUMBNAIL_MB`.

## 3. Two SDK v3 traps, and how they are handled

These are the reason this PR is more than a one line swap. Both are covered by tests that fail if someone undoes them.

### 3.1 v3 does not sign Content-Type by default

v2's `getSignedUrlPromise("putObject", { ContentType })` put `content-type` in the signature. The v3 presigner adds `content-type` to its unsignable list by default (`@aws-sdk/s3-request-presigner`, `prepareRequest`). A straight port would silently drop the type binding.

Fix: `createPresignedPutUrl` passes `signableHeaders: new Set(["content-type", "content-length"])`. The URL's `X-Amz-SignedHeaders` reads `content-length;content-type;host`. Test: "signs Content-Type and Content-Length into the URL".

### 3.2 v3 adds a CRC32 of an empty body to every presigned PUT

Since `@aws-sdk/client-s3` 3.729 the client computes a request checksum by default. When presigning, there is no body yet, so it computes CRC32 of nothing and writes `x-amz-checksum-crc32` and `x-amz-sdk-checksum-algorithm` into the URL. S3 then checks the real file against that checksum and rejects every browser upload with `BadDigest`. We are on 3.965.

Fix: the S3 client is created with `requestChecksumCalculation: "WHEN_REQUIRED"` and `responseChecksumValidation: "WHEN_REQUIRED"`. Tests: "does not put an empty body checksum in the URL" and "documents the trap", which builds a default client and shows the checksum appears.

This setting matters again for Cloudflare R2 in PR 2. R2 does not support every checksum algorithm the SDK picks by default.

## 4. What Gustavo needs to do

### 4.1 Review

1. Remove the v2 package and commit the lockfile:

   ```bash
   git fetch origin && git checkout fix/uploads-sdk-v3-validation
   pnpm --filter @repo/server remove aws-sdk
   git diff --stat   # apps/server/package.json and pnpm-lock.yaml only
   git commit -am "chore(server): remove aws-sdk v2"
   git push
   ```

   Then confirm nothing imports it: `grep -rn 'from "aws-sdk"' apps packages --include=*.ts` returns nothing.
2. Read sections 1 to 3 above.
3. Read `s3Upload.ts` and `uploadVerification.ts` first. They hold all the new logic. The router diffs are mechanical: one extra argument and one line replacing the `fileExists` block.
4. Check the allowed list passed at each confirm site matches the request schema in the same file:

   | Route | Allowed list at confirm |
   | --- | --- |
   | `upload.confirmProfilePictureUpload` | `ALLOWED_AVATAR_FILE_TYPES` |
   | `upload.confirmThemeBackgroundUpload` | `ALLOWED_BACKGROUND_FILE_TYPES` |
   | `pools.creator.confirmPoolImageUpload` | `ALLOWED_POOL_IMAGE` |
   | `admin.upload.confirmThemeCollectionImageUpload` | `ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES` |
   | `admin.upload.confirmThemeThumbnailUpload` | `ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES` |
   | `admin.upload.confirmAdminThemeBackgroundUpload` | `ALLOWED_BACKGROUND_FILE_TYPES` |

5. Run locally:

   ```bash
   pnpm install
   cd apps/server
   pnpm run typecheck
   pnpm run test:unit
   pnpm run lint
   pnpm run build
   ```

   Results on this branch: typecheck clean, 29 test files and 366 tests pass (46 new), lint clean on every changed file, build clean.

### 4.2 Before merging to development (staging)

Nothing to configure. Confirm these two things on the staging bucket, because the new confirm step reads the first 4 KB of each upload:

1. **IAM.** The server's key already needs `s3:GetObject` for `HeadObject`. The ranged GET uses the same permission. No policy change expected. If confirm starts failing with `AccessDenied`, this is why.
2. **Bucket CORS.** No change. Browsers set `Content-Length` themselves and it is not a preflight header. `Content-Type` was already allowed.

### 4.3 QA on staging after merge

Happy path, each flow once:

1. Editor, Page panel: upload a JPG avatar, then a PNG, then an SVG.
2. Editor, Design panel: upload an image background, then an MP4 background, then a `.mov` from a phone.
3. Create pool: upload a pool image (JPG or PNG).
4. Admin, Themes: upload a collection image, a theme thumbnail and a theme background.

Each should behave exactly as before.

Rejections:

5. Rename a text or HTML file to `photo.png` and upload it as an avatar. Expected: the photo control shows its existing error ("Photo did not upload. Check your connection."). In the network tab, `confirmProfilePictureUpload` returns BAD_REQUEST with "This file's contents do not match a supported file type. Please choose another file." The S3 object is gone and the `uploaded_files` row is `DELETED`.
6. Rename a PNG to `photo.jpg` and upload it as a pool image. Expected: same rejection (PNG declared as JPEG).
7. Size binding. In devtools, copy a presigned URL from a `requestAvatarPresignedUrl` response, then from a terminal:

   ```bash
   # file must differ in size from the fileSize sent in the request
   curl -i -X PUT -H "Content-Type: image/png" --data-binary @other.png "<presignedUrl>"
   ```

   Expected: `403` with `SignatureDoesNotMatch`. Before this PR the same command returned `200`.

8. Server logs: each rejection logs one `[WARN] Rejected upload` line with `fileId`, `fileKey`, `reason` and `detail`. Each confirm logs one `[INFO] Upload verification` line.

### 4.4 Rollback

Revert the PR. No data migration to undo. Records marked `DELETED` by a rejection stay `DELETED`, and their objects are already gone, which is the intended outcome.

## 5. Not in this PR (follow ups)

1. **SVG scripts.** Avatars, backgrounds and collection images accept SVG. An SVG can contain `<script>`. The public bucket is a separate origin from the app, so it cannot read app cookies, but a visitor opening the raw URL runs the script on the bucket domain. Options: sanitize SVG on confirm, serve with `Content-Disposition: attachment`, or stop accepting SVG for user uploads. Needs a call from Rob. Suggested as a separate fix card.
2. **Orphaned `PENDING` rows.** A record is created when the URL is issued. If the browser never uploads, the row stays `PENDING` forever. A daily job can mark rows older than a day `DELETED`. Separate fix card.
3. **A `REJECTED` file status.** Rejected uploads use `DELETED` today to avoid a migration. A distinct status would make abuse reporting easier. Can ride along with the content system migration in PR 2.
4. **Show the server message in the editor.** The photo control and the background row show their own generic upload error and do not read the server message. A small client change can show the BAD_REQUEST text for a rejected file. Kept out of this PR so it stays server only.
5. **Cloudflare R2.** Existing avatars and backgrounds stay on S3 for now (Rob, 12 Oct). The content system adds R2 in PR 2 and PR 3, reusing `s3Upload.ts`.

## 6. References

- Content system spec, section 3.16 PR plan: `docs/features/content-system.md` (on PR #311)
- AWS SDK v2 end of support: https://aws.amazon.com/blogs/developer/announcing-end-of-support-for-aws-sdk-for-javascript-v2/
- SDK default data integrity protections (`requestChecksumCalculation`): https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html
- Presigned URLs with signed headers: https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
- Build Board: https://claude.ai/artifact/FK8J7ZXWEcYXg5zvHwffxh
