FROM node:24-alpine AS base

ENV NODE_ENV=production
ENV TURBO_TELEMETRY_DISABLED=1
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"
ENV CI=1
ARG APP_NAME=@ampedbio/client

WORKDIR /app

# =========================================================================== #

FROM base AS builder-base

RUN corepack enable pnpm

# =========================================================================== #

FROM builder-base AS pruner

RUN pnpm install --global turbo@^2

COPY . .
COPY .turbo/config.json ./

RUN turbo prune ${APP_NAME} --docker

# =========================================================================== #

FROM builder-base AS builder

COPY --from=pruner /app/out/json/ ./
RUN pnpm ci

COPY --from=pruner /app/out/full/ ./
COPY tsconfig.json ./
COPY --from=pruner /app/.turbo/config.json ./.turbo/config.json
RUN pnpm build

# =========================================================================== #

FROM alpine:3.21

RUN apk add --no-cache lighttpd

COPY --from=builder /app/apps/client/dist /var/www/localhost/htdocs
COPY apps/client/lighttpd.conf /etc/lighttpd/lighttpd.conf

EXPOSE 80

CMD ["lighttpd", "-D", "-f", "/etc/lighttpd/lighttpd.conf"]
