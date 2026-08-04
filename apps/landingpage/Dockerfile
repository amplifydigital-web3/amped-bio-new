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

RUN pnpm run build

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

EXPOSE 3000

CMD ["pnpm", "start"]
