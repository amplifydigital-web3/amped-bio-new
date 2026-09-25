# OAuth 2.1 / OIDC server ("Sign in with Amped.bio")

Amped.bio is an OAuth 2.1 authorization server with OpenID Connect, built on
[Better Auth](https://better-auth.com) and exposed through the `mcp()` provider plugin
(`apps/server/src/utils/auth.ts`). Public documentation for integrators lives in
`apps/landingpage/src/content/docs`.

## Issuer and endpoints

| Thing | Value |
| --- | --- |
| Issuer | `<BETTER_AUTH_URL>/auth` (production `https://api.amped.bio/auth`) |
| OIDC discovery | `<issuer>/.well-known/openid-configuration` |
| OAuth AS metadata | `<issuer>/.well-known/oauth-authorization-server` and `/.well-known/oauth-authorization-server/auth` |
| MCP resource | `MCP_RESOURCE_URL` (`https://api.amped.bio/mcp`) |
| Protected resource metadata | `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` |
| JWKS | `/.well-known/jwks.json` and `/auth/jwks` (same key set) |

The issuer has a path, so Better Auth serves its own documents under `/auth`; the Express app
(`apps/server/src/services/API.ts`) also exposes the RFC 8414 path form and the RFC 9728 protected
resource metadata at the API origin root, and redirects naive root probes to the canonical documents.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_URL` | Public origin of the API. The issuer is this origin plus `/auth`. |
| `MCP_RESOURCE_URL` | Canonical protected resource identifier of the MCP server (HTTPS, no query). |
| `OAUTH_TRUSTED_CLIENT_IDS` | Comma separated client ids that skip the consent screen. |

## Hosted pages

`loginPage`, `consentPage` and the device `verificationUri` are configured as paths, which Better Auth
resolves against the API origin. `apps/server/src/services/API.ts` redirects those three paths to the
landing page, preserving the signed query string:

| API path | Landing page |
| --- | --- |
| `/oauth/login` | `/oauth/login` |
| `/oauth/consent` | `/oauth/consent` |
| `/oauth/device` | `/oauth/device` |

The shared, headless screens live in `packages/ui/src/oauth` and are consumed by the landing page.
`oauthProviderClient()` and `oauthDeviceAuthorizationClient()` are registered in
`packages/ui/src/auth-client.ts`.

## Application management

- Self service: **Developers → OAuth applications** in `apps/client` (`DeveloperPanel`), backed by
  `apps/server/src/trpc/oauthApps.ts`.
- Administrative: `apps/admin` → **OAuth Clients**, backed by `apps/server/src/trpc/admin/oauthApps.ts`
  (restricted fields such as `skip_consent`, `enable_end_session` and client secret expiry).
- Dynamic client registration is enabled for machine clients; unauthenticated registration is not, and
  MCP clients identify themselves with Client ID Metadata Documents.

## Database

`oauth_client`, `oauth_resource`, `oauth_client_resource`, `oauth_refresh_token`, `oauth_access_token`,
`oauth_consent`, `oauth_client_assertion` and `device_code` are defined in
`apps/server/prisma/schema.prisma`.

MySQL has no array type, so Better Auth stores `string[]` fields (redirect URIs, scopes, resources) as
JSON encoded strings in `TEXT` columns, and `json` fields in native `JSON` columns. `advanced.database.generateId`
is `"serial"` because every table uses an autoincrement integer primary key.

Migration: `apps/server/prisma/migrations/20260918120000_add_oauth_provider`.

## Verifying a deployment

```bash
# OIDC discovery
curl -sS "$BETTER_AUTH_URL/auth/.well-known/openid-configuration" | jq '{issuer, authorization_endpoint, jwks_uri}'

# RFC 8414 form and MCP protected resource metadata
curl -sS "$BETTER_AUTH_URL/.well-known/oauth-authorization-server/auth" | jq .issuer
curl -sS "$BETTER_AUTH_URL/.well-known/oauth-protected-resource/mcp" | jq .

# JWKS
curl -sS "$BETTER_AUTH_URL/.well-known/jwks.json" | jq '.keys[0] | {kty, alg, kid}'

# MCP endpoint must answer a challenge when unauthenticated
curl -sSi -X POST "$BETTER_AUTH_URL/mcp" -H 'content-type: application/json' -d '{}' | grep -i www-authenticate
```

## Known limitations

- Access tokens are stateless JWTs and cannot be revoked individually: revoking the refresh token ends the
  session and every token bound to it.
- The landing page runs React 18, so documentation `.mdx` files are rendered as Markdown (no JSX) until the
  app moves to React 19.

## ID generation

OAuth / OIDC tables (`oauth_*`, `device_code`) use **UUID v7** as their primary key, stored as
`BINARY(16)` (16 raw bytes), generated server-side in `apps/server/src/utils/uuid-v7.ts`.

UUID v7 is time-ordered (first 48 bits are the Unix timestamp in ms), which keeps MySQL B-tree
indexes compact — avoiding the random-write performance degradation of UUID v4 — while still
providing unpredictable identifiers that strengthen `private_key_jwt` replay protection and
similar security properties.

Storing as `BINARY(16)` rather than a 36-character hex string (`VARCHAR(36)`):
- **48 % less storage** — 16 bytes vs ~36 bytes per row
- **Denser indexes** — fewer B-tree pages to scan, more rows per page
- **No collation overhead** — binary comparison is faster than string collation

The core application tables (`users`, `session`, `account`, `verification`, etc.) keep their
existing `Int` auto-increment primary keys for backward compatibility.

The Better Auth `generateId` callback in `apps/server/src/utils/auth.ts` dispatches based on the
model name: OAuth models get a UUID v7 `Buffer`, all others return `false` to let the database
handle generation.
