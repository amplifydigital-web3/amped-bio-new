# Use the official Node.js 24 image as the base image
FROM node:24-alpine

# Install Python, build tools and Python build dependencies
RUN apk add --no-cache python3 make g++ py3-pip py3-setuptools

# Install pnpm via corepack (pinned by packageManager), like the other apps
RUN corepack enable pnpm

ENV NODE_OPTIONS=--max-old-space-size=4096

# Set the working directory inside the container
WORKDIR /app

# ---------------------------------------------------------------------------
# Dependency layer — kept stable so `pnpm install` is cached between builds.
# Only the files needed to resolve the workspace and run the install-time
# lifecycle scripts are copied before installing:
#   - the workspace packages' sources (their `prepare` builds them via tsup)
#   - the server manifest (defines `postinstall`)
#   - the Prisma schema (used by `postinstall` -> `prisma generate`)
# App source changes therefore never invalidate this layer.
# ---------------------------------------------------------------------------
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/server/package.json ./apps/server/package.json
COPY apps/server/prisma ./apps/server/prisma

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile --filter=@ampedbio/server...

# ---------------------------------------------------------------------------
# Source + build layer — invalidated on every app source change
# ---------------------------------------------------------------------------
COPY apps/server ./apps/server

# Change to the server app directory for building
WORKDIR /app/apps/server

# Build the server app
RUN pnpm run build

# Run as non-root user to reduce the impact of a container compromise
RUN chown -R node:node /app
USER node

# Expose port 3000 (or whatever port your server uses)
EXPOSE 3000

# Start the server. Running node directly (instead of `pnpm start`) avoids a
# corepack download from the registry on every container start.
CMD ["node", "dist/local.js"]
