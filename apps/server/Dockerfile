# Use the official Node.js 24 image as the base image
FROM node:24-alpine

# Install Python, build tools and Python build dependencies
RUN apk add --no-cache python3 make g++ py3-pip py3-setuptools

# Keep the corepack-managed pnpm in a shared location. By default corepack caches
# it under $HOME/.cache, i.e. /root during the build, which the non-root user
# below cannot read: every container start would then try to download pnpm from
# the registry, and fail when the container has no network at runtime.
ENV COREPACK_HOME=/usr/local/share/corepack

# Install pnpm via corepack (pinned by packageManager), like the other apps
RUN corepack enable pnpm

ENV NODE_OPTIONS=--max-old-space-size=4096

# Set the working directory inside the container
WORKDIR /app

# Copy the root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy the packages directories
COPY packages ./packages

# Copy the server app
COPY apps/server ./apps/server

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile --filter=@ampedbio/server...

# Change to the server app directory for building
WORKDIR /app/apps/server

# Build the server app
RUN pnpm run build

# Run as non-root user to reduce the impact of a container compromise
RUN chown -R node:node /app
USER node

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
CMD ["pnpm", "start"]
