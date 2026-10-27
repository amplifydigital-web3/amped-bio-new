# OAuth 2.1 / OIDC server ("Sign in with Amped.bio")

Amped.bio is an OAuth 2.1 authorization server with OpenID Connect, built on
[Better Auth](https://better-auth.com) and exposed through the `mcp()` provider plugin
(`apps/auth-server/src/utils/auth.ts`). The auth server runs as a **dedicated subdomain**
(`auth.amped.bio`) separate from the API server (`api.amped.bio`).

Public documentation for integrators lives in `apps/landingpage/src/content/docs`.

## Issuer and endpoints

| Thing | Value |
| --- | --- |
| Issuer | `BETTER_AUTH_URL` (production `https://auth.amped.bio`) |
| OIDC discovery | `<issuer>/.well-known/openid-configuration` |
| OAuth AS metadata | `<issuer>/.well-known/oauth-authorization-server` |
| Protected resource metadata (MCP) | `https://api.amped.bio/.well-known/oauth-protected-resource/mcp` |
| JWKS | `https://auth.amped.bio/.well-known/jwks.json` |

The issuer is on its own subdomain (no path suffix), so RFC 8414 metadata is served directly
at `/.well-known/oauth-authorization-server` on `auth.amped.bio`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_URL` | Public origin of the auth subdomain, e.g. `https://auth.amped.bio`. |
| `MCP_RESOURCE_URL` | Canonical protected resource identifier of the MCP server (HTTPS, no query). |
| `OAUTH_TRUSTED_CLIENT_IDS` | Comma separated client ids that skip the consent screen. |

## Hosted pages

`loginPage`, `consentPage` and the device `verificationUri` are configured as paths, which Better Auth
resolves against the auth subdomain origin. `apps/auth-server/src/services/API.ts` redirects those three
paths to the landing page, preserving the signed query string:

| Auth subdomain path | Landing page |
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
is configured to return `false` (database-managed) for most models; OAuth tables use **UUID v7** stored as
`BINARY(16)` (see [ID generation](#id-generation) below), while legacy core tables keep their existing
`Int` autoincrement primary keys.

Migration: `apps/server/prisma/migrations/20260918120000_add_oauth_provider`.

## Verifying a deployment

```bash
# OIDC discovery
curl -sS "$BETTER_AUTH_URL/.well-known/openid-configuration" | jq '{issuer, authorization_endpoint, jwks_uri}'

# OAuth AS metadata (RFC 8414)
curl -sS "$BETTER_AUTH_URL/.well-known/oauth-authorization-server" | jq .issuer

# JWKS
curl -sS "$BETTER_AUTH_URL/.well-known/jwks.json" | jq '.keys[0] | {kty, alg, kid}'

# Protected resource metadata (MCP) - served from api subdomain
curl -sS "https://api.amped.bio/.well-known/oauth-protected-resource/mcp" | jq .

# MCP endpoint must answer a challenge when unauthenticated
curl -sSi -X POST "https://api.amped.bio/mcp" -H 'content-type: application/json' -d '{}' | grep -i www-authenticate
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

The Better Auth `generateId` callback in `apps/auth-server/src/utils/auth.ts` dispatches based on the
model name: OAuth models get a UUID v7 `Buffer`, all others return `false` to let the database
handle generation.