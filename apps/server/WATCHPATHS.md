# Coolify WATCHPATHS — files that trigger a redeploy for the API server
# Patterns are regex matched against file paths relative to the repo root.
# Lines starting with ! are excluded from monitoring.

# Application source
apps/server/src/.*
apps/server/prisma/.*

# Application configuration
apps/server/package\.json
apps/server/tsconfig\.json
apps/server/Dockerfile

# Shared packages the server depends on
packages/constants/src/.*
packages/constants/package\.json

# Root workspace configuration (affects all apps)
^package\.json
^pnpm-lock\.yaml
^pnpm-workspace\.yaml
^turbo\.json
^tsconfig\.json

# Exclude build artifacts and noise
!apps/server/dist/.*
!apps/server/node_modules/.*
!apps/server/\.turbo/.*
!apps/server/.*\.tsbuildinfo
!.*\.md
!\.git/.*
!\.github/.*
!\.vscode/.*
!\.idea/.*
!\.env\.local
!\.env\.development
!\.env\.example
