# OneLink

New pure React implementation of OneLink.

## Project Architecture

This project is structured as a monorepo using [Turborepo](https://turbo.build/repo) for efficient build and dependency management. The monorepo structure enables better code sharing, consistent tooling, and parallel task execution.

### Repository Structure

```
amped-bio-new/
├── apps/
│   ├── client/         # React frontend application
│   │   ├── src/        # Frontend source code
│   │   ├── scripts/    # Client-specific scripts
│   │   └── ...
│   │
│   └── server/         # Express backend API
│       ├── src/        # Server source code
│       ├── prisma/     # Database schema and migrations
│       └── ...
│
├── pnpm-workspace.yaml # pnpm workspace configuration
├── turbo.json          # Turborepo configuration
└── package.json        # Root package.json for workspace management
```

### Client Architecture

The client app (`apps/client`) is a React application built with:

- **Vite** - Fast and optimized frontend tooling
- **TypeScript** - Type safety across the codebase
- **React Router** - Client-side routing
- **Tailwind CSS** - Utility-first CSS framework for styling
- **Zustand** - State management
- **React Query** - Data fetching and caching

Key directories:
- `src/components/` - Reusable UI components
- `src/pages/` - Page components and routes
- `src/store/` - State management and stores
- `src/api/` - API client and type definitions
- `src/hooks/` - Custom React hooks

### Server Architecture

The server app (`apps/server`) is a Node.js application built with:

- **Express** - Web framework for handling HTTP requests
- **TypeScript** - Type safety across the codebase
- **Prisma** - ORM for database access
- **Zod** - Schema validation for requests and responses

Key directories:
- `src/controllers/` - Request handlers for different resources
- `src/routes/` - API route definitions
- `src/middleware/` - Express middleware for auth, validation, etc.
- `src/schemas/` - Zod schemas for validation
- `src/services/` - Business logic and data access
- `src/utils/` - Utility functions

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Make sure you have the following installed:
- [Node.js](https://nodejs.org/) (version 22.9.0 or later)
- [pnpm](https://pnpm.io/) (version 8.15.4 or later)

### Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/yourusername/OneLink-new.git
    ```
2. Navigate to the project directory:
    ```sh
    cd OneLink-new
    ```
3. Install dependencies for all workspaces:
    ```sh
    pnpm install
    ```

### Development Workflow

Run all applications in development mode:
```sh
pnpm dev
```

Run only the client:
```sh
pnpm --filter client dev
```

Run only the server:
```sh
pnpm --filter server dev
```

Build all applications:
```sh
pnpm build
```

The client will be available at `http://localhost:5173`.
The server API will be available at `http://localhost:43000`.

## Database Management with Prisma

The project uses [Prisma](https://www.prisma.io/) as an ORM for database access and migration management. All database schema changes should be made through Prisma migrations to ensure consistency across environments.

### Setting Up the Database

1. Make sure you have a PostgreSQL database running. You can use the included Docker Compose file:
   ```sh
   docker-compose up -d db
   ```

2. Set up your environment variables in `apps/server/.env`:
   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/onelink?schema=public"
   ```

### Running Migrations

To apply existing migrations to your database:

```sh
pnpm --filter server run prisma:migrate
```

### Creating New Migrations

When you need to update the database schema:

1. Update the schema in `apps/server/prisma/schema.prisma`
2. Generate a migration with a descriptive name:
   ```sh
   pnpm --filter server run prisma:migrate:dev -- --name descriptive_migration_name
   ```
   This command will:
   - Generate SQL migration files based on schema changes
   - Apply the migration to your database
   - Generate an updated Prisma client

### Prisma Studio

To explore and edit your database with a visual interface:

```sh
pnpm --filter server run prisma:studio
```

This will open Prisma Studio in your browser at `http://localhost:5555`.

### Resetting the Database

During development, you may need to reset your database:

```sh
pnpm --filter server npx prisma migrate reset
```

This command will:
- Drop the database
- Create a new database
- Apply all migrations
- Run seed scripts (if configured)

> ⚠️ **Warning**: Never use `prisma migrate reset` in production as it deletes all data.

## Turborepo Features

- **Caching** - Intelligent build caching avoids redundant work
- **Parallelization** - Tasks run in parallel when possible
- **Task Dependencies** - Proper order of execution based on task dependencies
- **Remote Caching** - Optional remote caching for CI/CD environments

## Local GitHub Actions Testing

You can test GitHub Actions workflows locally using [Act](https://github.com/nektos/act), which simulates the GitHub Actions environment on your local machine.

### Prerequisites

1. Install Act:
   ```sh
   # macOS
   brew install act
   
   # Linux
   curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
   ```

2. Make sure Docker is installed and running on your machine.

### Running Actions Locally

To run all GitHub Actions workflows:
```sh
act
```

To run a specific workflow (e.g., client tests):
```sh
act -j auth-tests
```

To run a workflow with a specific event:
```sh
act push
```

To see what would be run without actually running it:
```sh
act -n
```

To run with specific workflow file:
```sh
act -W .github/workflows/client-tests.yml
```

### Environment Variables

If your workflows require environment variables, you can provide them using a `.env` file or directly in the command:
```sh
act -s MY_SECRET=value
```

For more options and information, check the [Act documentation](https://github.com/nektos/act#usage).
