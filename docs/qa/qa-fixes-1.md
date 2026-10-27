# QA fixes 1: staging fixes and error states

Source: Amped.Bio staging QA, 5 and 6 Oct 2026. Tracker IDs are QA-xxx.
One commit per item, so each can be reviewed or reverted alone.

| QA | Area | Change | Files | How to check |
|---|---|---|---|---|
| QA-006 | Fan graph | `VITE_FAN_GRAPH=true` in staging and development, `false` in production | `apps/client/.env.*` | Staging editor shows People in the rail and a Following tab in Explore |
| QA-007 | Compliance | Pool panel help links hidden: `RATE_ARTICLE` and `POOL_REWARDS_ARTICLE` are null until an article without "apy" in its slug is approved | `pool-panel/sections.tsx`, `PoolPanel.tsx` | Open any pool: no How it is calculated, no How pool rewards work |
| QA-009 | Client | Shared QueryClient retries only network errors and 5xx. Any 4xx fails at once | `packages/ui/src/trpc.ts` | A 404 or 401 shows the error state right away, also in a background tab |
| QA-002 | Server | errorFormatter drops `data.stack` in every environment | `apps/server/src/trpc/trpc.ts` | Any 4xx from the API has no `error.data.stack` |
| QA-018 | Admin | Broadcast lists show an error line with Try again when the query fails | `apps/admin/src/pages/AdminBroadcasts.tsx` | Block the API in DevTools, open each admin broadcast tab |
| QA-031 | Broadcast | Broadcasts list shows an ErrorCard when it fails; list polls every 5 s while a send is QUEUED or SENDING | `BroadcastsTab.tsx` | Send a broadcast: its chip moves from Sending to Sent without a reload |
| QA-037 | Broadcast | Quota sentence hidden until the creator is invited | `BroadcastsTab.tsx` | Uninvited creator: header shows members only, no sends left line |
| QA-035 | Home, Account | Notice reads "Your email is not verified yet. Resend the link." (approved by Rob, 6 Oct). Account Email row shows a Not verified chip | `VerifyEmailNotice.tsx`, `EmailRow.tsx`, `DisclosureRow.tsx`, `packages/ui/src/auth-*`, `apps/server/src/trpc/auth.ts` | Unverified account: Home copy and the chip on Account; verified account: neither |

## Root cause notes

- QA-009: httpBatchLink 11.1.2 does map a whole-batch 404 to every operation. The queries hung because React Query retried each 404 and its retryer pauses while the tab is hidden (`focusManager`), so the error never surfaced.
- QA-002: tRPC adds `data.stack` when `NODE_ENV` is not production. Staging should still run with `NODE_ENV=production`.
- QA-035: `auth.me` had `emailVerified` commented out. It now returns `user.email_verified`. The chip shows only on an explicit false.

## Verification

- Typecheck 6 of 6 and `tsc -b` in apps/client: clean, with the two local workarounds below applied and not committed.
- Client and admin builds pass. eslint on changed files: no new warnings.
- QA-009: `shouldRetryQuery` checked against real `TRPCClientError` objects: 404, 401 and 429 do not retry; 500 retries until the third failure; a network error retries.
- QA-002: the formatter checked with a standalone tRPC server in dev mode: 400, 404 and a mixed batch carry no `stack`.
- No screenshots in this PR. Each change is a copy, state or link change; check on staging after deploy with the table above.

## Heads up: development does not typecheck at 19ce424

- `withUuidV7Id(client: any)` in `packages/database/src/index.ts` returns `any`, so `prisma` is untyped. Server typecheck shows 188 errors and the router output types collapse to `never` in client and admin. Typing it as `(client: PrismaClient): PrismaClient` with an internal cast clears them.
- `authbase.ts:106`: the `featureInterest.upsert` create input fails the generated types because `id` has no default in the schema. This one predates 19ce424.
- Both were applied locally to verify this PR and are not part of it.

## Not in this PR

- `NODE_ENV=production` on staging (deployment, QA-002).
- `confirmEmailChange` does not touch `email_verified`. A user who confirms a new address by code keeps the old verified state. Server decision for Gustavo.
