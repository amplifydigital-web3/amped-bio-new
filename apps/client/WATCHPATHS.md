# Coolify WATCHPATHS — files that trigger a redeploy for the web app (Vite)
# Patterns are regex matched against file paths relative to the repo root.
# Lines starting with ! are excluded from monitoring.

# Application source
apps/client/src/.*
apps/client/public/.*
apps/client/index\.html

# Application configuration
apps/client/package\.json
apps/client/vite\.config\..*
apps/client/tailwind\.config\..*
apps/client/postcss\.config\..*
apps/client/tsconfig.*\.json
apps/client/components\.json
apps/client/Dockerfile
apps/client/lighttpd\.conf

# Shared packages the client depends on
packages/ui/src/.*
packages/ui/package\.json
packages/ui/tsconfig\.json
packages/constants/src/.*
packages/constants/package\.json
packages/web3/src/.*
packages/web3/package\.json

# Root workspace configuration (affects all apps)
^package\.json
^pnpm-lock\.yaml
^pnpm-workspace\.yaml
^turbo\.json
^tsconfig\.json

# Exclude build artifacts and noise
!apps/client/dist/.*
!apps/client/node_modules/.*
!apps/client/\.turbo/.*
!apps/client/cypress/.*
!.*\.md
!\.git/.*
!\.github/.*
!\.vscode/.*
!\.idea/.*
!\.env\.local
!\.env\.development
