# OAuth 2.1 Provider Implementation

This project now has an OAuth 2.1 Provider implemented using the `@better-auth/oauth-provider` plugin.

## Configuration

### Auth Configuration (`src/utils/auth.ts`)

The OAuth provider plugin is configured with:

- **Scopes**: `openid`, `profile`, `email`, `offline_access`
- **Login Page**: `/sign-in` (redirected when user is not authenticated)
- **Consent Page**: `/consent` (redirected for user authorization)
- **Custom Claims**: User data (name, handle, role, image) included in id_token and access_token

### Well-Known Endpoints

The following OpenID Connect and OAuth 2.1 discovery endpoints are available:

- **OpenID Configuration**: `/.well-known/openid-configuration` or `/auth/.well-known/openid-configuration`
- **OAuth Authorization Server**: `/.well-known/oauth-authorization-server` or `/auth/.well-known/oauth-authorization-server`
- **JWKS**: `/.well-known/jwks.json`

### OAuth Endpoints

All OAuth endpoints are available under `/auth`:

- `/auth/oauth2/authorize` - Authorization endpoint
- `/auth/oauth2/token` - Token endpoint
- `/auth/oauth2/userinfo` - UserInfo endpoint
- `/auth/oauth2/introspect` - Token introspection
- `/auth/oauth2/revoke` - Token revocation
- `/auth/oauth2/end-session` - Session logout (OIDC RP-initiated logout)
- `/auth/oauth2/register` - Dynamic client registration
- `/auth/oauth2/consent` - Consent endpoint

## Database Migration

The database schema has been updated with the following new tables:

- `oauthClient` - OAuth client applications
- `oauthRefreshToken` - Refresh tokens
- `oauthAccessToken` - Access tokens
- `oauthConsent` - User consent records

To apply the migrations, run:

```bash
cd apps/server
pnpm run prisma:migrate:dev --name add_oauth_tables
```

Make sure your database server is running before running migrations.

## Creating an OAuth Client

### Using the Provided Script

A convenience script is available to create an OAuth client:

```bash
cd apps/server
tsx src/scripts/create-oauth-client.ts
```

### Programmatically

```ts
import { auth } from "../utils/auth";

const client = await auth.api.createOAuthClient({
  headers: headers,
  body: {
    redirect_uris: ["https://your-app.com/callback"],
    client_name: "My App",
    token_endpoint_auth_method: "client_secret_post",
  },
});

console.log("Client ID:", client.clientId);
console.log("Client Secret:", client.clientSecret);
```

### Trusted Clients

For first-party applications, you can create trusted clients with `skip_consent`:

```ts
await auth.api.adminCreateOAuthClient({
  headers,
  body: {
    redirect_uris: [redirectUri],
    skip_consent: true,
    enable_end_session: true,
  },
});
```

## OAuth Flow Example

### Authorization Code Flow with PKCE

1. **Authorization Request**:

   ```
   GET /auth/oauth2/authorize?
     response_type=code&
     client_id=YOUR_CLIENT_ID&
     redirect_uri=YOUR_REDIRECT_URI&
     scope=openid%20profile%20email&
     code_challenge=CODE_CHALLENGE&
     code_challenge_method=S256&
     state=RANDOM_STATE
   ```

2. **Token Exchange**:

   ```ts
   const response = await fetch(`${BASE_URL}/auth/oauth2/token`, {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({
       grant_type: "authorization_code",
       code: AUTHORIZATION_CODE,
       redirect_uri: REDIRECT_URI,
       client_id: CLIENT_ID,
       client_secret: CLIENT_SECRET,
       code_verifier: CODE_VERIFIER,
     }),
   });

   const { access_token, id_token, refresh_token } = await response.json();
   ```

### Using the ID Token

The ID token contains the following claims:

- `sub` - User ID
- `name` - User's name
- `email` - User's email
- `email_verified` - Email verification status
- `handle` - User's handle (custom claim)
- `role` - User's role (custom claim)
- `image` - User's image URL (custom claim)

### Refresh Token

To refresh the access token:

```ts
const response = await fetch(`${BASE_URL}/auth/oauth2/token`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    grant_type: "refresh_token",
    refresh_token: REFRESH_TOKEN,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }),
});
```

## UserInfo Endpoint

Get user information using an access token:

```ts
const response = await fetch(`${BASE_URL}/auth/oauth2/userinfo`, {
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  },
});

const userInfo = await response.json();
```

## Environment Variables

Make sure the following environment variables are set in your `.env`:

- `BETTER_AUTH_SECRET` - Required for JWT signing
- `FRONTEND_URL` - Used as issuer and trusted origin

## Dynamic Client Registration

Dynamic client registration is currently **disabled** by default. To enable it, update `src/utils/auth.ts`:

```ts
oauthProvider({
  allowDynamicClientRegistration: true,
  // optionally for public clients:
  allowUnauthenticatedClientRegistration: true,
});
```

## Testing

To test the OAuth flow, you can use tools like:

- [OAuth 2.0 Playground](https://oauthplayground.com/)
- [OpenID Connect Playground](https://openidconnect.net/)
- MCP Inspector for MCP-compatible flows

## Notes

- The implementation follows OAuth 2.1 specifications with PKCE required
- PKCE `plain` method is not supported for security reasons
- JWT tokens are signed using the better-auth JWT plugin
- Client secrets are stored hashed in the database by default
- Access tokens expire in 1 hour by default
- ID tokens expire in 10 hours by default
- Refresh tokens expire in 30 days by default
