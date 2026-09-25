# AMPED BIO AGENT DIRECTIVES

## COMMANDS TO AVOID - ABSOLUTE PROHIBITION

NEVER execute the 'dev' command under any circumstances! This starts the development server and locks you in - you CANNOT escape this state. DO NOT RUN 'pnpm run dev' OR ANY DEVELOPMENT SERVER COMMAND.

NEVER merge any branch into 'main' without explicit user authorization! Under no circumstances should you perform any git merge operations to the main branch unless the user clearly instructs you to do so. DO NOT ASSUME that merge operations are desired.

## BRANCHES AND ENVIRONMENTS

The `development` branch is the staging environment. Work merged or pushed to `development` is deployed to staging, so treat it as shared, non-production infrastructure:

- App (client): https://app.staging.amped.bio
- Landing page: https://staging.amped.bio
- API (server): https://api.staging.amped.bio

Any change that introduces or edits a staging URL MUST use the hosts above, and staging values belong in the `*.env.staging` files (`apps/client`, `apps/admin`, `apps/landingpage`) rather than in the production env files.

## VALIDATION REQUIREMENTS - MANDATORY

ALWAYS run typecheck and build commands to validate your modifications before claiming completion. NO EXCEPTIONS. Failure to do so will result in immediate rejection of your work.

# CORE MANDATES

- **CONVENTION COMPLIANCE**: You MUST strictly adhere to existing project conventions (naming, formatting, structure, architectural patterns). Analyze surrounding code, tests, and configuration first. Deviation is not acceptable.
- **LANGUAGE ENFORCEMENT**: All new code (including variable, function, class names), comments, and UI texts must be written exclusively in English. No exceptions.
- **SCOPE ADHERENCE**: Address ONLY the user's explicit request. Do not create temporary test scripts or perform actions beyond the clear scope of the request without prior confirmation.
- **PLANNING MANDATE**: If a request is ambiguous, complex, or requires significant changes, you MUST explain your proposed plan of action clearly and concisely before proceeding with implementation.

# TOOLING AND LIBRARIES - ENFORCEMENT

- **Package Management**: Use `pnpm run` exclusively for all package management operations. No alternatives.
- **Monorepo Management**: The project leverages `Turborepo` and `pnpm workspaces` for efficient monorepo management. Respect this architecture.
- **Styling**: Use Tailwind CSS exclusively for all styling. Creating or modifying separate CSS files is prohibited.
- **Icons**: Prefer `lucide-react` for icons. Only use `react-icons` as a fallback if the specific icon is unavailable in `lucide-react`.
- **Schema Validation**: Implement `zod` for all schema definitions and data validations. No other validation libraries.
- **Alerts & Warnings**: When implementing alerts or warnings, style them using Tailwind CSS classes and include an appropriate icon from `lucide-react`.
- **Browser Automation**: When viewing or interacting with websites in the browser, use the `agent-browser` MCP exclusively. Do NOT use `playwright` or any other browser automation tool.

# CONTAINERIZATION - APPLE NATIVE PRIORITY

- **Apple Silicon Native Priority**: On Apple Silicon macOS 26+, you MUST prioritize Apple's native container runtime over Docker Desktop.
- **Mocker (Transparent Docker Replacement)**: All `docker` CLI commands MUST be rewritten to `mocker` automatically. Mocker is a drop-in Docker-compatible CLI built on Apple's native Containerization framework — same commands, same flags, same output, zero VM overhead. Use the `mocker` skill to enforce this rewrite.
- **Apple Container CLI (Native Management)**: For direct container lifecycle operations (`container run`, `container build`, `container system start/stop`, `container image`, `container volume`, `container network`), use the `apple-container-skill`. This is Apple's native CLI (`container`), not Docker.
- **Detection**: Verify architecture (`uname -m` = arm64) and macOS version (`sw_vers -productVersion` ≥ 26.0) before activating native container tools.
- **Fallback**: Only use Docker Desktop if the user explicitly requests it or if native containers are unavailable on the target system.

# PROJECT STRUCTURE - ABSOLUTE LOCATIONS

- **Client Application**: Located in `apps/client` - know this location.
- **Server Application**: Located in `apps/server` - know this location.
- **Shared Code**: Place all code intended for use by both the server and client in the `packages/constants` directory. This is mandatory.
- **Backend API**: The server utilizes `tRPC` for type-safe API development, replacing traditional Express REST APIs.
- **Prisma Migrations**: After changing the Prisma schema and creating a new migration, you MUST run `pnpm run --filter server run prisma:generate`.
- **Client Package Installation**: When installing packages or running commands specific to the client application (e.g., `shadcn`, `tailwind`, `magicui`), you MUST always filter by the client package (e.g., `pnpm run --filter client add <package-name>` or `pnpm dlx --filter client <command>`).

# PRIMARY KEY STRATEGY — UUID v7 BINARY(16)

All new database entities MUST use UUID v7 (RFC 9562) as their primary key, stored as
`BINARY(16)` in MySQL and `Bytes @id @db.Binary(16)` in the Prisma schema.

**Rationale:**
- **Security**: Unpredictable IDs prevent enumeration attacks and strengthen
  `private_key_jwt` replay protection.
- **Performance**: Time-ordering keeps B-tree indexes compact — unlike UUID v4,
  new inserts append near the end of the index rather than scattering randomly.
- **Storage**: `BINARY(16)` is 55% smaller than `VARCHAR(36)` (16 vs ~36 bytes),
  producing denser indexes and fewer B-tree pages to scan.

**How to implement:**

1. In the Prisma schema, define the id as:
   ```prisma
   model NewEntity {
     id  Bytes  @id @db.Binary(16)
     ...
   }
   ```
2. In the Better Auth `generateId` callback (`apps/server/src/utils/auth.ts`),
   add the model name to the `oauthModels` list if it is managed by Better Auth.
   Otherwise, generate the ID server-side with:
   ```ts
   import { uuidv7 } from "../utils/uuid-v7";
   // ...
   const id = uuidv7(); // returns Buffer (16 bytes)
   ```
3. Never use `@default(autoincrement())` or `Int` for new entities.

Existing core tables (`users`, `session`, `account`, `verification`, `jwks`,
`two_factor`, and all business tables) retain their `Int` auto-increment PKs for
backward compatibility. Only **new** entities follow this rule.

# TESTING — OAUTH E SERVER

Tests live in `apps/server/src/__tests__/` and use **Vitest**. There are three categories:

## 1. Unit tests (no external dependencies)

```bash
cd apps/server && pnpm test
```

Runs all `*.test.ts` files. Covers UUID v7 generation, OAuth scope constants,
TRPC utility functions (`parseRedirectUris`), and scope descriptions.

## 2. Integration tests (against a live API)

```bash
TEST_API_URL=https://api.staging.amped.bio pnpm test -- src/__tests__/oauth-endpoints.test.ts
```

Tests well-known metadata (OIDC discovery, JWKS, AS metadata, MCP protected resource),
CORS headers, and login/consent/device page redirects. Defaults to staging if
`TEST_API_URL` is not set.

## 3. E2E tests (full OAuth flows — requires registered client)

```bash
TEST_CLIENT_ID=<client_id>                   \
TEST_CLIENT_SECRET=<client_secret>           \
TEST_USER_EMAIL=<email>                      \
TEST_USER_PASSWORD=<password>                \
TEST_API_URL=https://api.staging.amped.bio   \
pnpm test:e2e
```

Tests authorization_code + PKCE, token exchange, userinfo, introspection, revocation,
device authorization grant, and dynamic client registration. Tests that require
a client_id are skipped with a warning when `TEST_CLIENT_ID` is not set.

## Test files

| File | Type | What it covers |
|------|------|---------------|
| `uuid-v7.test.ts` | Unit | Buffer size, version, variant, ordering, uniqueness |
| `oauth-scopes.test.ts` | Unit | Server constants (scopes, issuer, TTL) |
| `oauth-scope-descriptions.test.ts` | Unit | Consent screen descriptions |
| `oauth-trpc.test.ts` | Unit | `parseRedirectUris` — JSON parsing edge cases |
| `oauth-endpoints.test.ts` | Integration | Metadata, JWKS, CORS, redirects |
| `oauth-e2e.test.ts` | E2E | Full OAuth 2.1 / OIDC flows |

# CODE QUALITY STANDARDS - NON-NEGOTIABLE

- **Code Quality**: You must produce clean, readable, and maintainable code. Adhere to linting rules and formatting standards without exception.
- **Testing Protocol**: Before making changes, you must check for existing tests. If applicable, write new tests or update existing ones to cover your changes.
- **Error Handling**: Implement robust error handling mechanisms where appropriate. No exceptions.
- **Modularity Requirement**: Design solutions with modularity in mind, promoting reusability and easier maintenance.
- **Security First**: You must always consider security implications and follow best practices to prevent vulnerabilities.

# OAUTH E2E TEST REQUIREMENTS

Before running E2E tests (`oauth-e2e.test.ts`), ensure:

1. A client is registered in the target environment (admin panel or TRPC).
2. A test user exists with known email/password.
3. The OAuth server is reachable at the configured `TEST_API_URL`.
4. The environment variables are set as shown above.

Test configuration is documented in `apps/server/src/__tests__/test-setup.ts`.
