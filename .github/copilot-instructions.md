# Project: Amped Bio

# Project: Amped Bio

# Core Mandates

*   **Adherence to Conventions**: Always prioritize and strictly adhere to existing project conventions (naming, formatting, structure, architectural patterns). Analyze surrounding code, tests, and configuration first to ensure consistency.
*   **Language**: All new code (including variable, function, class names), comments, and UI texts must be written exclusively in English.
*   **Focus & Scope**: Directly address the user's explicit request. Avoid creating temporary test scripts or performing actions beyond the clear scope of the request without prior confirmation.
*   **Clarity & Planning**: If a request is ambiguous, complex, or requires significant changes, first explain your proposed plan of action clearly and concisely before proceeding with implementation.

# Tooling and Libraries

*   **Package Management**: Utilize `pnpm` for all package management operations.
*   **Monorepo Management**: The project leverages `Turborepo` and `pnpm-workspace` for efficient monorepo management.
*   **Styling**: Use Tailwind CSS exclusively for all styling. Do not create or modify separate CSS files.
*   **Icons**: Prefer `lucide-react` for icons. Only use `react-icons` as a fallback if the specific icon is unavailable in `lucide-react`.
*   **Schema Validation**: Implement `zod` for all schema definitions and data validations.
*   **Alerts & Warnings**: When implementing alerts or warnings, style them using Tailwind CSS classes and include an appropriate icon from `lucide-react`.

# Project Specifics

*   **Shared Code**: Place all code intended for use by both the server and client in the `packages/constants` directory.
*   **Backend API**: The server utilizes `tRPC` for type-safe API development, replacing traditional Express REST APIs.
*   **Prisma Migrations**: After changing the Prisma schema and creating a new migration, run `pnpm --filter server run prisma:generate`.
*   **Client Package Installation**: When installing packages or running commands specific to the client application (e.g., `shadcn`, `tailwind`, `magicui`), always filter by the client package (e.g., `pnpm --filter client add <package-name>` or `npx --filter client <command>`).

# General Best Practices (for LLM)

*   **Code Quality**: Strive for clean, readable, and maintainable code. Adhere to linting rules and formatting standards.
*   **Testing**: Before making changes, check for existing tests. If applicable, write new tests or update existing ones to cover your changes.
*   **Error Handling**: Implement robust error handling mechanisms where appropriate.
*   **Modularity**: Design solutions with modularity in mind, promoting reusability and easier maintenance.
*   **Security**: Always consider security implications and follow best practices to prevent vulnerabilities.