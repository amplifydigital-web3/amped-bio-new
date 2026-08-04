# Multi-stage build for Next.js public site
# Stage 1: Build the application
FROM node:24-alpine AS builder

RUN apk add --no-cache python3 make g++

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

COPY packages ./packages

COPY apps/site ./apps/site

RUN pnpm install --frozen-lockfile --filter=@ampedbio/site...

WORKDIR /app/apps/site

RUN pnpm run build

# Stage 2: Production runtime
FROM node:24-alpine AS runner

RUN npm install -g pnpm

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/turbo.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/site ./apps/site
COPY --from=builder /app/node_modules ./node_modules

WORKDIR /app/apps/site

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

CMD ["pnpm", "start"]
