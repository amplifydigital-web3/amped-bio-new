# Client-Only Mode

This document explains how to run the client application without requiring the server. This is useful for frontend development when you don't need or want to run the backend server.

## Getting Started with Client-Only Mode

### Installation

To install only the dependencies needed for client-only mode, run:

```bash
pnpm client-only:install
```

This will install only the dependencies required for the client and its dependencies.

### Running in Client-Only Mode

To run the client application in demo mode (without a server), use:

```bash
pnpm client-only
```

This command:

1. Builds the required packages
2. Runs the client with the demo mode enabled

### How Client-Only Mode Works

When running in client-only mode:

- The application uses mock data instead of real API calls
- All TRPC calls are intercepted and replaced with mock responses
- Authentication flows will work with demo accounts
- The client operates completely independently without any server requirements

## Development in Client-Only Mode

### Environment Configuration

Client-only mode uses a special environment configuration file at `apps/client/.env.client-only`. You can modify this file to change environment variables specific to client-only mode.

### Mock Data

Mock data is defined in:

- `apps/client/src/utils/trpc/links/mock/mock-data.ts`
- `apps/client/src/utils/trpc/links/mock/mock-link.ts`

If you need to extend or modify the mock behavior, update these files accordingly.

### Production Builds

You can create a production build of the client in demo mode by running:

```bash
pnpm build:packages && pnpm --filter @ampedbio/client build:client-only
```

This is useful for deploying a demo version that doesn't require a backend server.

## Switching Back to Full Stack Mode

To run the full application with both client and server, use the standard development command:

```bash
pnpm dev
```
