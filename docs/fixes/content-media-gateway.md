# Content system PR 3: media gateway Worker

Branch `feat/media-gateway`. PR 3 of the content system plan (`docs/features/content-system.md`, section 3.16). Build Board #20. Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-10-17.

**From a fresh `development`** (PR 2, #317, is merged). No migration. No server behavior change: the API still hands out no gateway URLs until PR 6 adds `content.getReadUrl`.

**Nothing serves until it is deployed.** The Worker is a new app, `apps/media-gateway`. It is deployed by hand with Wrangler (section 5). Until then nothing reads R2 for viewers.

## 1. Why we are doing this

Creator files live in a private R2 bucket. Viewers must never reach R2 directly: there is no public bucket, no `r2.dev` URL and no presigned GET (spec 1.3). The gateway is the only door. It runs on its own registrable domain (`ampedusercontent.com`), so a creator file can never run script on `amped.bio`.

| Later PR           | Needs from PR 3                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 4 media processor  | Nothing at runtime. The processor writes `originals/`, `audio/` and `derived/`, which are the only prefixes the gateway serves |
| 6 public pages     | `content.getReadUrl` signs tokens this Worker verifies. The players and the PDF viewer load gateway URLs                       |
| 7 trust and safety | Takedowns write `blocked:{publicId}` to the `TAKEDOWN` KV namespace the gateway reads                                          |
| 8 gating           | Short lived tokens for gated items, the stream rule for audio, single use downloads                                            |

## 2. How a request is answered

```
viewer -- GET /{r2Key}?t={token} --> gateway (media.ampedusercontent.com)
   1. GET or HEAD only (OPTIONS answers CORS preflight for the app origins)
   2. path is a served key: originals/, audio/ or derived/, then a 16 character public id
   3. token: v1.{kid}.{payload}.{sig}
        known kid, HMAC SHA-256 valid (WebCrypto), canonical signature
        not expired, lifetime at most 25 hours, payload.k equals the path
        a download (dl=1) carries a jti
   4. KV TAKEDOWN blocked:{publicId} absent
   5. download: Durable Object DownloadClaims(jti).claim() is true the first time only
   6. edge cache by the token free URL: hit answers (Range and If-None-Match included)
      miss: R2 binding get with Range and onlyIf, stream the body,
            store a copy up to 512 MB (a range miss fills the cache in the background)
   any refusal: 403, no body, Cache-Control: no-store
```

- **The token is checked on every request, cache hit or not.** The cache key never contains the token, so one cached copy serves every viewer who holds a valid token.
- **Takedown runs before the cache.** A blocked item stops at once from the cache too, within KV propagation (about 60 seconds). No purge is needed to stop delivery.
- **A token opens one object.** The path must equal `payload.k`. Unscanned uploads (`incoming/`) and malware positives (`quarantine/`) are refused even with a valid token.
- **Creator files are treated as hostile.** Every response carries `nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`, `Referrer-Policy: no-referrer` and a content type from a fixed list. HTML, SVG or script stored by mistake is served as `application/octet-stream`.
- **Logs never hold a token.** The Worker logs `{status, reason, key, role, cache}`. Cloudflare's own request logs have `redact_query_string` on, so the `?t=` query never reaches logs or traces.

## 3. What changes, file by file

### 3.1 New app `apps/media-gateway` (`@repo/media-gateway`)

| File                              | What it does                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrangler.jsonc`                  | Worker `amped-media-gateway`. Bindings: R2 `CONTENT`, KV `TAKEDOWN`, Durable Object `DOWNLOADS` (class `DownloadClaims`, SQLite backed). Var `ALLOWED_ORIGINS`. Required secret `MEDIA_TOKEN_KEYS`. `workers_dev` and preview URLs off. Top level is local only; `env.staging` and `env.production` hold the custom domain, bucket, KV namespace and origins for each. |
| `src/index.ts`                    | The request flow in section 2. `handle()` is exported for tests.                                                                                                                                                                                                                                                                                                       |
| `src/token.ts`                    | WebCrypto verification with key rotation (every key in `MEDIA_TOKEN_KEYS` verifies). Keys are imported once per isolate. A missing or weak key list throws, and the request answers 503 so monitoring sees a config fault.                                                                                                                                             |
| `src/path.ts`                     | Decodes the path one segment at a time. Refuses encoded slashes, dot segments, empty segments and control characters. Only the served prefixes and a valid public id pass.                                                                                                                                                                                             |
| `src/range.ts`                    | One `bytes=` range (start and end, open, or suffix). Multi range headers are ignored and the whole file is served, which RFC 9110 allows.                                                                                                                                                                                                                              |
| `src/headers.ts`                  | Content type list, CORS, `Content-Disposition` with an ASCII fallback and the UTF-8 name, the cache copy headers and the viewer headers.                                                                                                                                                                                                                               |
| `src/downloads.ts`                | `DownloadClaims` Durable Object. First `claim()` wins. An alarm deletes the record a minute after the token expires.                                                                                                                                                                                                                                                   |
| `scripts/sign-url.mjs`            | QA only. Prints a signed gateway URL for one key, signed exactly as the API signs. Used in section 6 until PR 6 exists.                                                                                                                                                                                                                                                |
| `test/*`                          | See 3.4.                                                                                                                                                                                                                                                                                                                                                               |
| `.dev.vars.example`, `.gitignore` | Local key template. `worker-configuration.d.ts` is generated by `wrangler types` before typecheck, lint and test, and is not committed (627 KB).                                                                                                                                                                                                                       |

### 3.2 Shared constants (`@repo/constants`)

| File                       | Change                                                                                                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/mediaToken.ts`        | Adds `MEDIA_TOKEN_MAX_LIFETIME_SECONDS` (25 hours: a 24 hour public token rounded up to the hour), `MEDIA_GATEWAY_SERVED_PREFIXES` and `MEDIA_TOKEN_JTI_REGEX`. The payload decoder now also refuses a non integer `exp` and a non string `fn` or `j`. The rotation comment now says 25 hours, not 6. |
| `src/contentKeys.ts` (new) | `CONTENT_PUBLIC_ID_*` and `CONTENT_R2_PREFIXES`, moved out of `content.ts` unchanged. `content.ts` re-exports them, so every existing import keeps working.                                                                                                                                           |
| `src/content.ts`           | Imports and re-exports `contentKeys.ts`.                                                                                                                                                                                                                                                              |

Why the split: the Worker imports `mediaToken.ts` and `contentKeys.ts` by path (`@repo/constants/src/...`). Importing the package entry pulled zod and yaml into the Worker (239 KiB). By path it is 19 KiB (6 KiB gzip), which matters on a hot path with cold isolates.

### 3.3 Server

| File                                | Change                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `services/cloudflare/mediaToken.ts` | `signMediaToken` takes an optional `now` and refuses an expiry past 25 hours, so the API cannot mint a token the gateway would refuse. |
| `.env.example`                      | `MEDIA_GATEWAY_ORIGIN` for staging is now `https://media.ampedusercontent-staging.com` (decision 1).                                   |
| `__tests__/content-tokens.test.ts`  | Two tests: the lifetime refusal, and the shared vectors (3.4).                                                                         |

### 3.4 Tests

| File                                               | Tests | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/media-gateway/test/token.test.ts`            | 9     | The shared vectors verify in workerd; the test signer matches them; tampered payload, flipped and non canonical signatures; unknown kid; removed key; garbage; expired; past 25 hours; download without a jti; bad jti; missing and weak keys                                                                                                                                                                                                          |
| `apps/media-gateway/test/units.test.ts`            | 8     | Served prefixes, traversal and encoding attacks, UTF-8 key round trip, range parsing and resolution, content type list, `Content-Disposition`                                                                                                                                                                                                                                                                                                          |
| `apps/media-gateway/test/gateway.test.ts`          | 21    | End to end in workerd with local R2, KV, Durable Object and Cache API: serving and headers, HTML and SVG neutered, HEAD, refusals, token on another path, `incoming/` and `quarantine/`, missing object, 405, 503 without keys, takedown after caching, Range, suffix, 416, 304, cache hits by the token free key, ranges from the cache, token still checked on a hit, single use download with the UTF-8 name, the alarm cleanup, CORS and preflight |
| `apps/server/src/__tests__/content-tokens.test.ts` | +2    | Lifetime refusal; `signMediaToken` produces the shared vectors byte for byte                                                                                                                                                                                                                                                                                                                                                                           |

**Cross runtime proof.** `apps/media-gateway/test/fixtures/token-vectors.json` holds three tokens signed with test keys: one per key (rotation) and a download with a UTF-8 file name. The server test signs the same payloads with `signMediaToken` (node:crypto) and must produce the exact strings. The Worker test verifies them with WebCrypto in workerd. If either side drifts, one of the two fails.

### 3.5 Repo wiring

| File                                    | Change                                                                                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/typecheck-build.yml` | New step: `pnpm --filter @repo/media-gateway run test`. Typecheck and build already run through turbo: the Worker's `typecheck` runs `wrangler types` then `tsc`, and its `build` is `wrangler deploy --dry-run --outdir dist` (bundles and validates the config without an account). |
| `eslint.config.js`                      | Ignores `worker-configuration.d.ts` and `.wrangler/`.                                                                                                                                                                                                                                 |
| `docs/features/content-system.md`       | 3.6 header rule, 3.17 step 2 (staging domain), revision log.                                                                                                                                                                                                                          |
| `docs/fixes/content-foundation.md`      | 5.3: the staging `MEDIA_GATEWAY_ORIGIN`.                                                                                                                                                                                                                                              |
| `pnpm-lock.yaml`                        | **Not in this PR. See 4.1 step 1.**                                                                                                                                                                                                                                                   |

## 4. What Gustavo needs to do

### 4.1 Review and merge

1. **Commit the lockfile.** The lockfile is too large for the tool that pushed this branch. On the branch:

   ```bash
   git fetch origin
   git checkout feat/media-gateway
   pnpm install
   git add pnpm-lock.yaml
   git commit -m "chore(media-gateway): lockfile for the new Worker app"
   git push
   ```

   CI uses `--frozen-lockfile`, so it fails until this commit lands. The new devDependencies are `wrangler`, `@cloudflare/vitest-plugin`, `vitest` 5 and `typescript`, all in `apps/media-gateway` only.

2. Read sections 1 and 2.
3. Read in this order: `src/index.ts`, `src/token.ts`, `src/path.ts`, `src/headers.ts`, `src/downloads.ts`, then `wrangler.jsonc`.
4. Run locally:

   ```bash
   pnpm run build:packages
   pnpm --filter @repo/media-gateway run typecheck
   pnpm --filter @repo/media-gateway run test
   pnpm --filter @repo/media-gateway run lint
   pnpm --filter @repo/media-gateway run build
   pnpm --filter @repo/server run test:unit
   pnpm run typecheck
   pnpm run build
   ```

   Results on this branch: Worker typecheck, lint and build clean (19.27 KiB, 5.93 KiB gzip); 3 Worker test files and 38 tests pass; server unit tests 42 files and 564 tests pass; `pnpm run typecheck` 7 of 7 and `pnpm run build` 9 of 9 succeed; Prettier clean on every new file and every changed code file (the two existing docs were not Prettier formatted before this PR and are left as they were).

### 4.2 Review checklist

- [ ] Every refusal is 403 with no body, except 405 (method), 416 (range), 503 (keys not configured).
- [ ] The token is verified before the cache is read, and takedown is checked before the cache.
- [ ] The cache key has no token. The cached copy is `public, max-age=86400`; the viewer copy is `private`, at most 5 minutes and never past the token.
- [ ] `incoming/` and `quarantine/` are never served.
- [ ] Content types outside the list become `application/octet-stream`.
- [ ] A download needs a jti and works once.
- [ ] No log line holds a token, and `redact_query_string` is on.

## 5. Cloudflare setup and deploy (Gustavo)

Spec 3.17 steps 2, 6, 8 and 12 in executable form. Staging first. Run every Wrangler command with `CLOUDFLARE_ACCOUNT_ID` set to the account you mean, because staging and production are separate accounts.

### 5.1 Domains

1. Register `ampedusercontent-staging.com` and add it as a zone on the **staging** account. Register `ampedusercontent.com` and add it as a zone on the **production** account. (Decision 1 explains why staging needs its own domain.)
2. On each zone: SSL/TLS Full (strict), Always Use HTTPS on, minimum TLS 1.2.
3. Turn on the CSAM Scanning Tool for each zone (Caching, Configuration). It scans images that pass through the cache.

### 5.2 KV namespace and the Worker

```bash
cd apps/media-gateway
export CLOUDFLARE_ACCOUNT_ID=<staging account id>
pnpm exec wrangler login
pnpm exec wrangler kv namespace create takedown-staging --env staging
```

1. Paste the printed id into `wrangler.jsonc`, `env.staging.kv_namespaces[0].id` (it says `REPLACE_WITH_TAKEDOWN_STAGING_KV_ID` today). Commit it: KV ids are not secrets.
2. Set the token keys. **Same value as the API's `MEDIA_TOKEN_KEYS` on staging**, or every URL is refused:

   ```bash
   pnpm exec wrangler secret put MEDIA_TOKEN_KEYS --env staging
   ```

3. Deploy:

   ```bash
   pnpm --filter @repo/media-gateway run deploy:staging
   ```

   Wrangler creates the `DownloadClaims` Durable Object class (migration `v1`) and attaches the custom domain `media.ampedusercontent-staging.com`.

4. On the API (staging): `MEDIA_GATEWAY_ORIGIN=https://media.ampedusercontent-staging.com`.

Production later is the same with `takedown`, `--env production` and `media.ampedusercontent.com`.

### 5.3 Rate limit (WAF)

Security, WAF, Rate limiting rules, on each media zone: requests per IP to the media host, 600 per minute, action Block for 1 minute. A player fetching audio in Range requests stays far below this. Raise it if real viewers hit it.

### 5.4 Key rotation

Add the new key first on both sides (`s2:...,s1:...`): the API's `MEDIA_TOKEN_KEYS` and `wrangler secret put MEDIA_TOKEN_KEYS`. The API signs with the first key. After 25 hours remove the old key from both. Tokens never live longer than 25 hours, so nothing breaks.

## 6. Staging QA (after section 5)

From the repo root, with the staging key in your shell (never paste it into a ticket):

```bash
pnpm run build:packages
export MEDIA_TOKEN_KEYS='<staging value>'
export CLOUDFLARE_ACCOUNT_ID=<staging account id>
cd apps/media-gateway
pnpm exec wrangler r2 object put "amped-content-staging/derived/qatestqatestqa00/cover.png" --file ./cover.png --content-type image/png --remote
URL=$(node scripts/sign-url.mjs derived/qatestqatestqa00/cover.png)
```

`./cover.png` is any small PNG you put in `apps/media-gateway` for the test (do not commit it). Then:

1. **Serves.** `curl -sI "$URL"` returns 200 with `content-type: image/png`, `x-content-type-options: nosniff`, `content-security-policy: sandbox; default-src 'none'` and `cache-control: private, max-age=300`.
2. **Refuses without a token.** `curl -sI "${URL%%\?*}"` returns 403.
3. **Refuses another object.** Change `cover.png` to `other.png` in the URL and keep the token: 403.
4. **Range.** `curl -s -o /dev/null -w '%{http_code}\n' -H 'Range: bytes=0-99' "$URL"` prints 206.
5. **Cache.** Run step 1 twice, with `pnpm exec wrangler tail --env staging` open. The second request logs `"cache":"hit"`. The tail never shows the `t=` value.
6. **Takedown.** `pnpm exec wrangler kv key put --env staging --binding TAKEDOWN --remote "blocked:qatestqatestqa00" qa`, wait a minute, then step 1 returns 403. Remove it with `wrangler kv key delete` and it serves again within a minute.
7. **Single use download.** `D=$(node scripts/sign-url.mjs derived/qatestqatestqa00/cover.png --download)`. `curl -sI "$D"` returns 200 with `content-disposition: attachment`. The same command again returns 403.
8. **CORS.** `curl -sI -H 'Origin: https://app.staging.amped.bio' "$URL"` shows `access-control-allow-origin: https://app.staging.amped.bio`. With `Origin: https://example.com` the header is absent.
9. **No other door.** `https://amped-content-staging.<account>.r2.dev` does not resolve, and `amped-media-gateway.<subdomain>.workers.dev` does not answer.
10. Clean up: `pnpm exec wrangler r2 object delete "amped-content-staging/derived/qatestqatestqa00/cover.png" --remote`.

## 7. Decisions made in this PR

1. **Staging media host is `media.ampedusercontent-staging.com`, on its own domain.** A Worker custom domain needs a zone on the Worker's own account. The staging gateway must live on the staging account to bind the staging bucket, and a zone lives on one account, so `media-staging.ampedusercontent.com` cannot work. Cost: one more domain, about $10 a year. Spec 3.17 step 2, the server `.env.example` and the PR 2 handoff are updated.
2. **Viewer cache policy is the same for every response:** `private`, the lesser of 5 minutes and the token's remaining life. The token carries no gated flag, and a 5 minute browser cache on a public image is harmless because the edge copy answers revalidation. The edge copy is `public, max-age=86400` under the token free key.
3. **Token lifetime cap of 25 hours on both sides** (`MEDIA_TOKEN_MAX_LIFETIME_SECONDS`). A signing bug cannot mint a lasting URL, and it fixes the key rotation wait.
4. **A download token must carry a jti.** Spec 3.6 makes R2 downloads single use. Refusing `dl=1` without `j` means a mistake in PR 6 fails closed.
5. **Range misses fill the cache in the background.** Audio and PDF viewers send Range from the first byte, so filling only on full requests would leave them uncached. The fill reads the whole object once per colo, at most 512 MB.
6. **Missing objects answer 403, not 404,** so the gateway does not confirm which keys exist. A config fault answers 503 so it shows in monitoring.
7. **A fixed content type list.** Anything else is served as `application/octet-stream`, on top of the sandbox CSP. `Referrer-Policy: no-referrer` added beyond the spec so the token never leaves in a Referer header.
8. **The test package is `@cloudflare/vitest-plugin`.** The spec named the Workers Vitest pool; Cloudflare renamed it (`@cloudflare/vitest-pool-workers` is deprecated). Same runtime, same bindings.
9. **The Worker imports two constants files by path** to stay small (3.2).
10. **No `dev` script.** `turbo dev` would start Wrangler inside `pnpm run dev:full`. Run `pnpm exec wrangler dev` in `apps/media-gateway` with a `.dev.vars` when needed.

## 8. Follow-ups

1. PR 6: `content.getReadUrl` signs with `signMediaToken` and the TTLs in spec 3.6, rounds public expiries up to the hour, and sets `j` with `newDownloadJti()` on every download.
2. PR 7: block and delete write `blocked:{publicId}` to the `TAKEDOWN` namespace through the Cloudflare API (the API needs the namespace id and a KV Edit token), and purge `https://{media host}/{key}` from the cache for each key of the item. The token free URL is the cache key.
3. PR 4: the processor must write `httpMetadata.contentType` from the list in `src/headers.ts` (for example `audio/mp4` for m4a renditions and `application/json` for waveforms), or the gateway serves `application/octet-stream`.
4. Deploy automation: a GitHub Action with `wrangler deploy --env staging` on merge to `development`, once a scoped API token exists.
5. Privacy notice: Cloudflare is already listed as a follow-up in PR 2 (delivery is part of it).

## 9. References

- Spec: `docs/features/content-system.md` sections 1.3, 3.4, 3.6, 3.11, 3.16, 3.17
- PR 2 handoff: `docs/fixes/content-foundation.md`
- Workers Vitest integration: https://developers.cloudflare.com/workers/testing/vitest-integration/
- Cache API (Range and conditional matches, put limits): https://developers.cloudflare.com/workers/runtime-apis/cache/
- Workers custom domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Build Board: https://claude.ai/artifact/FK8J7ZXWEcYXg5zvHwffxh
