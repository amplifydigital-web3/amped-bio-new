# PR 6: content on public pages, publish, delete and retry

Branch `feat/content-public-pages` into `development`, stacked on PR 6a (`feat/media-player`). Merge PR 6a first. Content system plan PR 6 (Build Board #20). Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-10-23.

**No migration.** The columns this PR uses (`status`, `visibility`, `deletedAt`, `purgeAfter`, `publishedAt`) came with PR 2. Everything in the editor sits behind `VITE_CONTENT`. Public pages show content only when a creator publishes an item and adds a Content block, so nothing changes for existing pages.

## 1. Why

After PR 6a a creator can upload, process and preview an item, but nobody else can see it. This PR puts content on the creator's public page and gives the creator the controls around it.

1. **Publish and unpublish** from the item page. Only a READY, CLEAR, non 18+ item publishes.
2. **Content block** on the bio page: a label, a layout (featured, grid or list) and up to 12 published items picked by the creator.
3. **Public pages** on the landing app: `/{handle}/c/{publicId}` (one item: player, image, PDF reader, download) and `/{handle}/content` (the creator's feed). Both carry SEO metadata, JSON-LD and a content sitemap.
4. **Report** on every public item. Reports are stored in `content_report`. They never take an item down by themselves.
5. **Delete and restore.** Delete is soft for 30 days, then a sweeper purges the files.
6. **Retry processing** for a FAILED item, with or without a new file.

## 2. Decisions

| Decision | Chosen | Why | Alternatives |
| --- | --- | --- | --- |
| Storage on delete | Freed at the purge, when the files are gone | The files stay in the bucket for 30 days, so the space stays charged: the creator can not store more than the limit while the files are there (spec 3.12). | Freed at delete (the creator could fill the bucket far past the limit). |
| FAILED and BLOCKED delete | Purged now, not restorable | Nothing playable to restore. BLOCKED files must not linger. | Same 30 days as READY. |
| Retry without a file | Re-queue when the source is still held (Stream keeps a video; an R2 upload is kept when processing never started), once an hour | Most failures are transient. The creator should not upload again. | Always ask for the file. |
| Retry with a file | Uploads into the same item, keeping title, description and settings | Keeps the public ID and any block placement. | Delete and upload a new item. |
| Reports | Stored in `content_report`. A CSAM report logs an ALERT line. No automatic takedown. | Automatic takedown on report is abusable. Admin takedown with KV and cache purge is PR 7. | Hide after N reports. |
| 18+ items | Refused on every public surface until age assurance (#28) | No age gate exists yet. | Blur with a click through (not compliant without verification). |
| Cards for suspended or unpublished pages | Not computed in `getHandle` | A blocked creator's cards must not leak through the page data. | Filter on the client. |
| PDF viewer | pdf.js loaded on demand, page images as fallback | Text selection and zoom where pdf.js runs, a working reader where it does not. | Page images only. |

## 3. Server

- `content.publish`, `unpublish`, `delete`, `restore`, `retryProcessing` (private).
- `content.listForBio`, `feed`, `getPublic`, `report`, `getSitemapCount`, `getSitemapEntries` (public). Reads share the 30 a minute viewer limit from PR 6a; reports 10 an hour per viewer.
- `services/content/publicView.ts`: one query shape for every public read, built on `PUBLIC_ITEM_WHERE` and `PUBLIC_CREATOR_WHERE` from `access.ts`.
- `services/content/purge.ts`: deletes Stream videos, R2 objects, asset rows and viewer progress for items past `purgeAfter`, and releases the quota the item held. Runs inside the existing content sweeper.
- `services/content/blockConfig.ts`: block saves keep only content IDs the editor owns.
- `handle.getHandle` returns `contentCards` for the Content blocks on the page.
- `content.update` turns on Stream downloads when the creator allows downloads on a READY video.

## 4. Editor

- Item page: Publish card (publish, unpublish, view the public link, delete) and Retry for FAILED items.
- Library: a Removed filter with restore and the last restore date.
- Page panel: the Content block (label, layout, item picker, reorder) and its preview.

## 5. Landing app

- `app/[handle]/layout.tsx` mounts the site player, so playback continues between the bio page, the feed and an item page.
- `components/content/*`: cards, the Content block, item and feed views, report dialog, PDF reader, download button. All copy in `copy.ts`.
- `app/i/sitemaps/content/sitemap.ts` and an entry in the sitemap index. `llms.txt` lists the feed.
- `pdfjs-dist` 4.10.38 added. The lockfile diff is that package only.

## 6. Not in this PR

- Admin takedown, KV block list and cache purge (PR 7). Until then a gateway URL issued before an unpublish works until it expires (24 hours at most for public images and audio).
- Gated items (PR 8) and 18+ (#28).
- A Follow button on the feed page.
- Purge on account deletion (follow up on #13).
- Fan Library phases B to D (#26).

## 7. What Gustavo needs to do

1. **Merge PR 6a first**, including its lockfile commit. Then merge `development` into this branch.
2. **Lockfile.** `pnpm-lock.yaml` is too large to push through the GitHub connector. The exact change is in `docs/fixes/content-public-pages.lockfile.patch` (adds `pdfjs-dist` 4.10.38 to the landing app, nothing else). It applies on top of PR 6a's lockfile. On the branch:

   ```bash
   git apply docs/fixes/content-public-pages.lockfile.patch
   pnpm install --frozen-lockfile
   git rm docs/fixes/content-public-pages.lockfile.patch
   git add pnpm-lock.yaml && git commit -m "chore(landingpage): lockfile for pdfjs-dist"
   ```

3. **Run the checks.** `pnpm run typecheck`, `pnpm run build`, server, client and landing app tests, `pnpm run format:check`.
4. **Staging QA** with the manual check in section 8, then add the results to the PR.
5. Labels can not be set through the connector. Please add them on the PR.

## 8. Testing

- Server: `__tests__/content-public.test.ts` (24). Full suite passes.
- Client: PublishCard (6), RetryProcessing (4), ContentBlockFields (3), status (removed case).
- Landing app: `components/content/content.test.tsx` (10).
- Typecheck: server, ui, landing app. Builds: client (vite), landing app (next).
- Known failures not from this PR: the landing app RegisterForm "network error notice" test fails on `development` too; the client `tsconfig.app.json` has 9 type errors already on `development`.

### Manual check on staging

1. Upload a video, an audio file, an image and a PDF. Wait for READY.
2. Publish each. Add a Content block with all four. Publish the page.
3. Signed out, open the bio page, each item page and `/{handle}/content`. Play, scrub, leave and come back.
4. Report an item. Confirm a `content_report` row and no change to the item.
5. Unpublish one item. Confirm it leaves the block and the feed, and its page returns 404.
6. Delete an item. Confirm the storage meter still counts it (its files stay until the purge). Restore it. Confirm it returns as a draft and the storage does not change.
7. Force a processing failure. Retry without a file, then with a file.
