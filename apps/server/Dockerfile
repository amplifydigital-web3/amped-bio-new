# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Build stage. The Alpine toolchain (bcrypt is the only native module) and the
# dev dependencies stay here, so the runtime image ships neither.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder

RUN apk add --no-cache python3 make g++ py3-setuptools

# Install pnpm via corepack (pinned by packageManager), like the other apps
RUN corepack enable pnpm

# Keep corepack's cache inside /app so the unprivileged node user can read it
ENV COREPACK_HOME=/app/.corepack

ENV NODE_OPTIONS=--max-old-space-size=4096

WORKDIR /app

# ---------------------------------------------------------------------------
# Dependency layer — kept stable so `pnpm install` is cached between builds.
# Only the files needed to resolve the workspace and run the install-time
# lifecycle scripts are copied before installing:
#   - the workspace packages' sources, including `@repo/database` (its sources,
#     its Prisma schema and its `postinstall` -> `prisma generate`)
#   - the server manifest
# App source changes therefore never invalidate this layer. The pnpm store sits
# in a BuildKit cache mount: it is not downloaded again and is not baked into
# the image.
# ---------------------------------------------------------------------------
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/server/package.json ./apps/server/package.json

# Pre-download the pnpm version pinned in package.json (pnpm@9.15.1) so the
# runtime never triggers a network fetch. Keep this in sync with the
# packageManager field in /app/package.json.
RUN corepack prepare pnpm@9.15.1 --activate

# Install dependencies using pnpm
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir=/pnpm-store --filter=@repo/server...

# ---------------------------------------------------------------------------
# Source + build layer — invalidated on every app source change
# ---------------------------------------------------------------------------
COPY apps/server ./apps/server

# Change to the server app directory for building
WORKDIR /app/apps/server

# Build the server app
RUN pnpm run build

# Drop the dev dependencies before the runtime stage copies node_modules. The
# scripts already ran during the build, so they are skipped here. CI answers the
# "modules will be reinstalled" prompt so the step stays non-interactive.
ENV CI=true
WORKDIR /app
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --prod --frozen-lockfile --ignore-scripts \
    --store-dir=/pnpm-store --filter=@repo/server...

# ---------------------------------------------------------------------------
# Runtime stage — no toolchain, no dev dependencies, non-root.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

# Copy the tree built above; --chown avoids a recursive chown over node_modules
COPY --from=builder --chown=node:node /app ./

# Run as non-root user to reduce the impact of a container compromise
USER node

WORKDIR /app/apps/server

# The image bakes no port in: the app listens on PORT from the environment. The
# committed apps/server/.env.example sets 24300 (what the README publishes); when
# PORT is unset env.ts falls back to 43000, which the HEALTHCHECK below mirrors.
# EXPOSE is metadata only, so publish whichever port you configure.
EXPOSE 24300

# Report container health from inside the image so any orchestrator can act on it.
# The probe hits the dependency-free /health liveness route, so a failure always
# means the HTTP server itself is no longer serving requests. PORT is expanded by
# the shell at runtime and defaults to the value env.ts uses when PORT is not set.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-43000}/health" || exit 1

# Start the server
CMD ["node", "dist/app.js"]
