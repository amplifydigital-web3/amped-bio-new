# AMPED BIO AGENT DIRECTIVES

## COMMANDS TO AVOID - ABSOLUTE PROHIBITION

NEVER execute the 'dev' command under any circumstances! This starts the development server and locks you in - you CANNOT escape this state. DO NOT RUN 'pnpm run dev' OR ANY DEVELOPMENT SERVER COMMAND.

## VALIDATION REQUIREMENTS - MANDATORY

ALWAYS run typecheck and build commands to validate your modifications before claiming completion. NO EXCEPTIONS. Failure to do so will result in immediate rejection of your work.

# CORE MANDATES

- **CONVENTION COMPLIANCE**: You MUST strictly adhere to existing project conventions (naming, formatting, structure, architectural patterns). Analyze surrounding code, tests, and configuration first. Deviation is not acceptable.
- **LANGUAGE ENFORCEMENT**: All new code (including variable, function, class names), comments, and UI texts must be written exclusively in English. No exceptions.
- **SCOPE ADHERENCE**: Address ONLY the user's explicit request. Do not create temporary test scripts or perform actions beyond the clear scope of the request without prior confirmation.
- **PLANNING MANDATE**: If a request is ambiguous, complex, or requires significant changes, you MUST explain your proposed plan of action clearly and concisely before proceeding with implementation.

# TOOLING AND LIBRARIES - ENFORCEMENT

- **Package Management**: Use `pnpm` exclusively for all package management operations. No alternatives.
- **Monorepo Management**: The project leverages `Turborepo` and `pnpm-workspace` for efficient monorepo management. Respect this architecture.
- **Styling**: Use Tailwind CSS exclusively for all styling. Creating or modifying separate CSS files is prohibited.
- **Icons**: Prefer `lucide-react` for icons. Only use `react-icons` as a fallback if the specific icon is unavailable in `lucide-react`.
- **Schema Validation**: Implement `zod` for all schema definitions and data validations. No other validation libraries.
- **Alerts & Warnings**: When implementing alerts or warnings, style them using Tailwind CSS classes and include an appropriate icon from `lucide-react`.

# PROJECT STRUCTURE - ABSOLUTE LOCATIONS

- **Client Application**: Located in `apps/client` - know this location.
- **Server Application**: Located in `apps/server` - know this location.
- **Shared Code**: Place all code intended for use by both the server and client in the `packages/constants` directory. This is mandatory.
- **Backend API**: The server utilizes `tRPC` for type-safe API development, replacing traditional Express REST APIs.
- **Prisma Migrations**: After changing the Prisma schema and creating a new migration, you MUST run `pnpm --filter server run prisma:generate`.
- **Client Package Installation**: When installing packages or running commands specific to the client application (e.g., `shadcn`, `tailwind`, `magicui`), you MUST always filter by the client package (e.g., `pnpm --filter client add <package-name>` or `npx --filter client <command>`).

# CODE QUALITY STANDARDS - NON-NEGOTIABLE

- **Code Quality**: You must produce clean, readable, and maintainable code. Adhere to linting rules and formatting standards without exception.
- **Testing Protocol**: Before making changes, you must check for existing tests. If applicable, write new tests or update existing ones to cover your changes.
- **Error Handling**: Implement robust error handling mechanisms where appropriate. No exceptions.
- **Modularity Requirement**: Design solutions with modularity in mind, promoting reusability and easier maintenance.
- **Security First**: You must always consider security implications and follow best practices to prevent vulnerabilities.