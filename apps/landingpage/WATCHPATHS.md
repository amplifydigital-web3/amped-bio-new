# Coolify WATCHPATHS — files that trigger a redeploy for the public site (Next.js)
# Patterns are regex matched against file paths relative to the repo root.
# Lines starting with ! are excluded from monitoring.

# Application source
apps/landingpage/src/.*
apps/landingpage/public/.*

# Application configuration
apps/landingpage/package\.json
apps/landingpage/next\.config\..*
apps/landingpage/tailwind\.config\..*
apps/landingpage/postcss\.config\..*
apps/landingpage/tsconfig\.json
apps/landingpage/Dockerfile

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
!apps/landingpage/\.next/.*
!apps/landingpage/node_modules/.*
!apps/landingpage/\.turbo/.*
!apps/landingpage/.*\.tsbuildinfo
!.*\.md
!\.git/.*
!\.github/.*
!\.vscode/.*
!\.idea/.*
!\.env\.local
!\.env\.development
