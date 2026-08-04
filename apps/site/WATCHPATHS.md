# Coolify WATCHPATHS — files that trigger a redeploy for the public site (Next.js)
# Patterns are regex matched against file paths relative to the repo root.
# Lines starting with ! are excluded from monitoring.

# Application source
apps/site/src/.*
apps/site/public/.*

# Application configuration
apps/site/package\.json
apps/site/next\.config\..*
apps/site/tailwind\.config\..*
apps/site/postcss\.config\..*
apps/site/tsconfig\.json
apps/site/Dockerfile

# Shared packages the site depends on
packages/ui/src/.*
packages/ui/package\.json
packages/ui/tsconfig\.json
packages/constants/src/.*
packages/constants/package\.json

# Root workspace configuration (affects all apps)
^package\.json
^pnpm-lock\.yaml
^pnpm-workspace\.yaml
^turbo\.json
^tsconfig\.json

# Exclude build artifacts and noise
!apps/site/\.next/.*
!apps/site/node_modules/.*
!apps/site/\.turbo/.*
!apps/site/.*\.tsbuildinfo
!.*\.md
!\.git/.*
!\.github/.*
!\.vscode/.*
!\.idea/.*
!\.env\.local
!\.env\.development
