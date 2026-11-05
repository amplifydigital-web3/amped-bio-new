# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Build stage. The app source is copied only after `pnpm install`, so a landing
# page change no longer reinstalls the workspace. The pnpm store sits in a
# BuildKit cache mount: it is not downloaded again and is not baked into the
# image.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder

ENV NODE_OPTIONS=--max-old-space-size=4096
ENV NEXT_TELEMETRY_DISABLED=1

# bufferutil and utf-8-validate compile with node-gyp during install
RUN apk add --no-cache python3 make g++

RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# The workspace packages build during install (`prepare`), so their sources come
# first; only the landing manifest is needed to resolve its dependencies
COPY packages ./packages
COPY apps/landingpage/package.json ./apps/landingpage/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir=/pnpm-store --filter=@repo/landingpage...

COPY apps/landingpage ./apps/landingpage

WORKDIR /app/apps/landingpage

# Next.js has no Vite-like --mode: a production build only loads .env.production,
# so the selected committed env file is exported into the environment instead
# (NEXT_PUBLIC_* are inlined from process.env at build time). Like the client's
# VITE_MODE, the default is staging: build with --build-arg APP_ENV=production
# for another environment.
ARG APP_ENV=staging

# Local env overrides are gitignored but still land in the build context, and a
# real environment variable wins over the env files loaded by Next.js, so drop
# them before building
RUN rm -f .env.local .env.*.local

RUN set -a && . ./.env.${APP_ENV} && set +a && pnpm run build

# ---------------------------------------------------------------------------
# Runtime stage. Next traces the files the standalone server reads, so the image
# carries that output instead of the whole node_modules tree.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The standalone server binds to $HOSTNAME, which Docker sets to the container
# id, so it would not answer on 127.0.0.1 and the HEALTHCHECK below would fail.
# Listen on every interface instead.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder --chown=node:node /app/apps/landingpage/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/landingpage/.next/static ./apps/landingpage/.next/static
COPY --from=builder --chown=node:node /app/apps/landingpage/public ./apps/landingpage/public

# Run as non-root user to reduce the impact of a container compromise
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

# The standalone server keeps the monorepo layout: it lives under apps/landingpage
CMD ["node", "apps/landingpage/server.js"]
