# One Cloudflare account and usercontent.amped.bio

Status: ready for review, 3 November 2026.
Owner: Rob Frasca. Drafted by Claude. Reviewer: Gustavo.
Build Board: #20 Content system.
Branch: `feat/single-account-usercontent`, targets `development`.

## 1. What changed and why

Rob decided on 3 Nov 2026:

1. Staging and production run on **one Cloudflare account**, not two.
2. The media gateway host moves to **`usercontent.amped.bio`** (production) and **`usercontent.staging.amped.bio`** (staging). The separate domains `ampedusercontent.com` and `ampedusercontent-staging.com` are no longer needed.

Two accounts were in the spec for two reasons. Stream allows only one webhook subscription per account, and a Worker custom domain needs a zone on the Worker's own account. On one account the `amped.bio` zone holds both media hosts, so the second reason goes away. This PR solves the first with a router Worker.

## 2. What is in this PR

| Area                                            | Change                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/stream-webhook-router` (new)              | The account's one Stream webhook. Verifies the Stream signature with the account secret, reads `meta.env`, and forwards the exact body to that environment's API, re-signed with a secret only that environment holds. No `meta.env`: sent to both APIs, and each acts only on its own video ids. Any other env: dropped. A failed target answers 502 so Stream retries. 10 tests. |
| `apps/server/src/routes/content.ts`             | The Stream webhook ignores an event whose `meta.env` names another environment. Test added.                                                                                                                                                                                                                                                                                        |
| `apps/media-gateway/wrangler.jsonc`             | Routes `usercontent.staging.amped.bio` and `usercontent.amped.bio`. Comments describe one account.                                                                                                                                                                                                                                                                                 |
| `apps/media-gateway/test/gateway.test.ts`       | New test: the sandbox CSP and `nosniff` are on 200, cache hit, 206, 403 and 405 responses. The host now shares a site with the app, so this header is the main barrier.                                                                                                                                                                                                            |
| `apps/media-gateway/scripts/sign-url.mjs`       | Default origin is the new staging host.                                                                                                                                                                                                                                                                                                                                            |
| `apps/media-processor/wrangler.jsonc`           | Comments describe one account.                                                                                                                                                                                                                                                                                                                                                     |
| `apps/server/.env.example`, `env.ts`, two tests | New hosts. `CF_STREAM_WEBHOOK_SECRET` is now the router's forward secret.                                                                                                                                                                                                                                                                                                          |
| `.github/workflows/typecheck-build.yml`         | Runs the router tests.                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm-lock.yaml`                                | Adds the router importer only. Same resolutions as the gateway.                                                                                                                                                                                                                                                                                                                    |
| Docs                                            | Spec principle 5, 3.4, 3.6, 3.11, 3.17 and the revision log. Gateway, PR 2 and processor handoffs. This file.                                                                                                                                                                                                                                                                      |

No migration. No feature flag change. Nothing is live until the Workers are deployed.

## 3. Resource map on the one account

| Resource           | Production                                                                              | Staging                                                          |
| ------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| R2 bucket          | `amped-content`                                                                         | `amped-content-staging`                                          |
| R2 token           | Object Read and Write on `amped-content` only                                           | Object Read and Write on `amped-content-staging` only            |
| Queue and DLQ      | `content-ingest`, `content-ingest-dlq`                                                  | `content-ingest-staging`, `content-ingest-staging-dlq`           |
| KV                 | `takedown`                                                                              | `takedown-staging`                                               |
| Gateway Worker     | `amped-media-gateway-production` on `usercontent.amped.bio`                             | `amped-media-gateway-staging` on `usercontent.staging.amped.bio` |
| Processor Worker   | `amped-media-processor-production`                                                      | `amped-media-processor-staging`                                  |
| Stream             | One library, tagged `meta.env: production`                                              | Same library, tagged `meta.env: staging`                         |
| Stream signing key | Its own key                                                                             | Its own key                                                      |
| Webhook            | Router forwards with `PRODUCTION_FORWARD_SECRET`                                        | Router forwards with `STAGING_FORWARD_SECRET`                    |
| Router             | `amped-stream-webhook-router-account` on `stream-hooks.amped.bio` (one for the account) |                                                                  |

## 4. Setup (Gustavo)

Staging first. `CLOUDFLARE_ACCOUNT_ID` is the same for every command. The `--env` flag is what separates staging from production: always pass it.

### 4.1 Zone

1. Put the `amped.bio` zone on the Cloudflare account. If amped.bio DNS is hosted elsewhere today (Netlify or the registrar), move it first and recreate every existing record, including the email records for SMTP2GO, before changing nameservers.
2. Zone settings: SSL/TLS Full (strict), Always Use HTTPS, minimum TLS 1.2.
3. Rules, Transform Rules, Modify Request Header: when hostname is in `usercontent.amped.bio`, `usercontent.staging.amped.bio`, remove header `Cookie`. The session cookie is scoped to `.amped.bio` in production (`.staging.amped.bio` on staging), so browsers send it to the media hosts. The gateway never needs it.
4. WAF rate limit on the two media hosts: 600 requests per minute per IP, block for 1 minute.
5. CSAM Scanning Tool on for the zone.

### 4.2 Router Worker and the Stream webhook

```bash
cd apps/stream-webhook-router
export CLOUDFLARE_ACCOUNT_ID=<Cloudflare account id>
openssl rand -hex 32   # PRODUCTION_FORWARD_SECRET
openssl rand -hex 32   # STAGING_FORWARD_SECRET (a different value)
pnpm exec wrangler secret put PRODUCTION_FORWARD_SECRET --env account
pnpm exec wrangler secret put STAGING_FORWARD_SECRET --env account
```

Set the account webhook once. The response carries `secret`:

```bash
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/stream/webhook" \
  -H "Authorization: Bearer $CF_STREAM_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"notificationUrl":"https://stream-hooks.amped.bio/cloudflare-stream"}'
```

```bash
pnpm exec wrangler secret put STREAM_WEBHOOK_SECRET --env account   # the secret from the response
pnpm --filter @repo/stream-webhook-router run deploy
```

On each API, `CF_STREAM_WEBHOOK_SECRET` is that environment's forward secret. Neither API holds the account secret. Staging never holds the production forward secret.

### 4.3 Gateway and processor

Follow `docs/fixes/content-media-gateway.md` section 5 and `docs/fixes/content-media-processor.md` with the one account. The gateway deploy attaches the two media hosts. On the APIs: `MEDIA_GATEWAY_ORIGIN=https://usercontent.staging.amped.bio` (staging) and `https://usercontent.amped.bio` (production).

### 4.4 Secrets per environment

Every secret gets a different value per environment: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CF_STREAM_API_TOKEN`, `CF_STREAM_KEY_ID`, `CF_STREAM_KEY_PEM`, `CF_STREAM_WEBHOOK_SECRET`, `MEDIA_TOKEN_KEYS`, `CONTENT_PROCESSOR_SECRET`, `CF_QUEUES_API_TOKEN`. `CF_ACCOUNT_ID` and `CF_STREAM_CUSTOMER_CODE` are the same value on both.

## 5. Staging QA

1. Upload a short video in the staging app. `wrangler tail --env account` on the router shows `"result":"forwarded"` with `"staging":200` and no `production` entry. The item reaches READY.
2. In the Stream dashboard the video's meta shows `env: staging`.
3. Send the router an unsigned POST: 401. Send GET: 404.
4. Gateway QA in `docs/fixes/content-media-gateway.md` section 6, including step 11: the gateway receives no `cookie` header while you are signed in.
5. A staging media token does not open a production media URL (different `MEDIA_TOKEN_KEYS`): 403.

## 6. Tradeoffs Rob accepted

1. **Same site with the app.** `usercontent.amped.bio` shares the registrable domain with `app.amped.bio`. The sandbox CSP, `nosniff`, the content type allowlist and no SVG or HTML are the barrier. The new test pins the header on every response kind.
2. **Reputation.** Web filters and Safe Browsing judge the registrable domain. Adult or abusive content flagged on the media host can affect all of amped.bio, including the app and email deliverability.
3. **Account wide credentials.** The Stream API token and Stream signing keys work on every video in the account. Workers and Queues tokens are account wide. Keep the Stream token and the Queues token for each environment only on that environment's API, deploy production only from CI, and keep the account member list short.
4. **One wrong flag.** A deploy without the right `--env`, or a wrong bucket name in a config, reaches the other environment. Each `wrangler.jsonc` repeats every binding per environment, and the top level binds only local names.

Moving back to a separate domain or a second account later is a configuration change: the gateway route, `MEDIA_GATEWAY_ORIGIN`, and the webhook URL.

## 7. Validation run

- `@repo/stream-webhook-router`: typecheck, 10 tests, build dry run.
- `@repo/media-gateway`: 39 tests, including the new sandbox test.
- `@repo/server`: affected typecheck, build and unit tests (see the PR).
