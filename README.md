# Amped Bio (amped.bio)

New pure React implementation of Amped Bio (formerly known as OneLink).

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
├── docs/               # Documentation files
│   └── CLIENT_ONLY.md  # Guide for client-only mode
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

## Important Terminology Update

**Amped Bio (amped.bio)** is the new name for what was previously known as OneLink. This project represents a complete rebranding and modernization of the platform.

### Key Terminology Changes:

- **OneLink → Amped Bio (amped.bio)**: The platform has been rebranded from OneLink to Amped Bio
- **onelink → handle**: User identifiers are now called "handles" instead of "onelinks"
- **littlelink → handle**: The database field and API responses now consistently use "handle"

### What This Means:

- All user profile URLs now use the handle terminology (e.g., `amped.bio/username`)
- API responses return `handle` instead of `onelink` or `littlelink`
- Database queries use the `handle` field
- User interface elements refer to "handles" instead of "onelinks"

The functionality remains the same, but the terminology has been updated to be more intuitive and consistent with modern social platform conventions.

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (version 22.9.0 or later)
- [pnpm](https://pnpm.io/) (version 8.15.4 or later)

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/yourusername/amped-bio-new.git
   ```
2. Navigate to the project directory:
   ```sh
   cd amped-bio-new
   ```
3. Install dependencies for all workspaces:
   ```sh
   pnpm install
   ```

## Development

### Full Stack Development

To run the full development environment (client + server):

```bash
# Install dependencies
pnpm install

# Start full development environment (client + server)
pnpm dev:full
```

### Client-Only Development

To run only the client application without needing the server:

```bash
# Install only client-related dependencies
pnpm client-only:install

# Run client in demo mode (no server required)
pnpm client-only
```

For more details on client-only mode, see [CLIENT_ONLY.md](docs/CLIENT_ONLY.md).

### Development Workflow

Run client-only development (default):

```sh
pnpm dev
```

Run full stack development (client + server):

```sh
pnpm dev:full
```

Run only the client explicitly:

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
   DATABASE_URL="postgresql://username:password@localhost:5432/amped_bio?schema=public"
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

### Generating Prisma Client

To regenerate the Prisma client after schema changes:

```sh
pnpm --filter server run prisma:generate
```

This command regenerates the Prisma client with the latest schema definitions.

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

## Environment Variables

The server application uses several environment variables for configuration, including limits for file uploads. These variables are typically set in an `.env` file in the `apps/server` directory.

### Upload Limits

The following environment variables control the maximum file size for different types of uploads, specified in megabytes (MB):

- `UPLOAD_LIMIT_BACKGROUND_MB`: Maximum file size for general background image uploads.
- `UPLOAD_LIMIT_PROFILE_PHOTO_MB`: Maximum file size for user profile photo uploads.
- `UPLOAD_LIMIT_COLLECTION_THUMBNAIL_MB`: Maximum file size for collection thumbnail uploads.

Example `.env` configuration for upload limits:

```
UPLOAD_LIMIT_BACKGROUND_MB=10
UPLOAD_LIMIT_PROFILE_PHOTO_MB=2
UPLOAD_LIMIT_COLLECTION_THUMBNAIL_MB=3
```

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

## Using Bolt for Development

[Bolt](https://boltjs.com/) is an development tool that can be used with this project to automatically run `pnpm install` and `pnpm dev` commands. The project is configured so that when using Bolt:

1. Only the client application will be started (not the server)
2. Required packages will be pre-built before starting the client

This setup provides a faster development experience when you're focused on frontend work. To use Bolt with this project:

1. Install Bolt if you haven't already
2. Open the project in Bolt
3. Bolt will automatically run the optimized client-only development setup

If you need to run both client and server while using Bolt, you can manually run:

```sh
pnpm dev:full
```

## Docker Configuration

This project includes Dockerfiles for both the server and client applications, allowing you to containerize and deploy the applications easily.

### Dockerfiles

- `apps/server/Dockerfile` - Builds the server application
- `apps/client/Dockerfile` - Builds the client application (multi-stage build with nginx)

### Prerequisites

Before building the Docker images, ensure you have:

- Docker installed
- Sufficient disk space (the build process requires multiple dependencies)

### Building the Images

#### Server Image

To build the server Docker image, run from the project root:

```bash
docker build -f apps/server/Dockerfile -t amped-bio-server .
```

#### Client Image

To build the client Docker image, run from the project root:

```bash
docker build -f apps/client/Dockerfile -t amped-bio-client .
```

### Running the Containers

#### Server Container

To run the server container:

```bash
docker run -p 3000:3000 --env-file ./apps/server/.env amped-bio-server
```

#### Client Container

To run the client container:

```bash
docker run -p 80:80 amped-bio-client
```