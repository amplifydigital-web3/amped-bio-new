# Multi-stage build for Next.js landing page
# Stage 1: Build the application
FROM node:24-alpine AS builder

ENV NODE_OPTIONS=--max-old-space-size=4096

RUN apk add --no-cache python3 make g++

RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

COPY packages ./packages

COPY apps/landingpage ./apps/landingpage

RUN pnpm install --frozen-lockfile --filter=@repo/landingpage...

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

# Stage 2: Production runtime
FROM node:24-alpine AS runner

RUN corepack enable pnpm

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/turbo.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/landingpage ./apps/landingpage
COPY --from=builder /app/node_modules ./node_modules

WORKDIR /app/apps/landingpage

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as non-root user to reduce the impact of a container compromise
RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

CMD ["pnpm", "start"]
