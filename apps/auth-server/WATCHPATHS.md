# Coolify WATCHPATHS — files that trigger a redeploy for the auth server (OAuth/OIDC)
# Patterns are regex matched against file paths relative to the repo root.
# Lines starting with ! are excluded from monitoring.

# Application source
apps/auth-server/src/.*

# Application configuration
apps/auth-server/package\.json
apps/auth-server/tsconfig\.json
apps/auth-server/Dockerfile

# Shared packages the auth server depends on
packages/constants/src/.*
packages/constants/package\.json
packages/database/src/.*
packages/database/prisma/.*
packages/database/package\.json

# Root workspace configuration (affects all apps)
^package\.json
^pnpm-lock\.yaml
^pnpm-workspace\.yaml
^turbo\.json
^tsconfig\.json

# Exclude build artifacts and noise
!apps/auth-server/dist/.*
!apps/auth-server/node_modules/.*
!apps/auth-server/\.turbo/.*
!apps/auth-server/.*\.tsbuildinfo
!.*\.md
!\.git/.*
!\.github/.*
!\.vscode/.*
!\.idea/.*
!\.env\.local
!\.env\.development
!\.env\.example
