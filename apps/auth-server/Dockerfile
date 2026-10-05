# Use the official Node.js 24 image as the base image
FROM node:24-alpine

# Install Python, build tools and Python build dependencies
RUN apk add --no-cache python3 make g++ py3-pip py3-setuptools

# Install pnpm via corepack (pinned by packageManager), like the other apps
RUN corepack enable pnpm

# Keep corepack's cache inside /app so the unprivileged node user can read it
# at runtime (the default under root's $HOME would be root-owned)
ENV COREPACK_HOME=/app/.corepack

ENV NODE_OPTIONS=--max-old-space-size=4096

# Set the working directory inside the container
WORKDIR /app

# ---------------------------------------------------------------------------
# Dependency layer — kept stable so `pnpm install` is cached between builds.
# Only the files needed to resolve the workspace and run the install-time
# lifecycle scripts are copied before installing:
#   - the workspace packages' sources, including `@repo/database` (its sources,
#     its Prisma schema and its `postinstall` -> `prisma generate`)
#   - the auth server manifest
# App source changes therefore never invalidate this layer.
# ---------------------------------------------------------------------------
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/auth-server/package.json ./apps/auth-server/package.json

# Pre-download the pnpm version pinned in package.json (pnpm@9.15.1) so the
# runtime CMD ["pnpm", "start"] never triggers a network fetch. Keep this in
# sync with the packageManager field in /app/package.json.
RUN corepack prepare pnpm@9.15.1 --activate

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile --filter=@repo/auth-server...

# ---------------------------------------------------------------------------
# Source + build layer — invalidated on every app source change
# ---------------------------------------------------------------------------
COPY apps/auth-server ./apps/auth-server

# Change to the auth server app directory for building
WORKDIR /app/apps/auth-server

# Build the auth server app
RUN pnpm run build

# Run as non-root user to reduce the impact of a container compromise
RUN chown -R node:node /app
USER node

# The image bakes no port in: the app listens on PORT from the environment. The
# committed apps/auth-server/.env.example sets 44000; when PORT is unset env.ts
# falls back to 44000, which the HEALTHCHECK below mirrors.
# EXPOSE is metadata only, so publish whichever port you configure.
EXPOSE 44000

# Report container health from inside the image so any orchestrator can act on it.
# The probe hits the dependency-free /health liveness route, so a failure always
# means the HTTP server itself is no longer serving requests. PORT is expanded by
# the shell at runtime and defaults to the value env.ts uses when PORT is not set.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-44000}/health" || exit 1

# Start the auth server
CMD ["pnpm", "start"]
