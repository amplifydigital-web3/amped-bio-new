FROM node:24-alpine AS builder

ENV NODE_OPTIONS=--max-old-space-size=4096

RUN apk add --no-cache python3 make g++
RUN corepack enable pnpm

WORKDIR /app

# Vite mode selects the env file baked into the build: production (.env.production)
# is the default, pass --build-arg VITE_BUILD_MODE=staging for staging builds
ARG VITE_BUILD_MODE=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/typescript-config ./packages/typescript-config
COPY packages/constants ./packages/constants
COPY packages/web3 ./packages/web3
COPY packages/ui ./packages/ui
COPY apps/admin ./apps/admin

RUN pnpm install --frozen-lockfile --filter=@repo/admin...

WORKDIR /app/apps/admin
RUN pnpm exec vite build --mode $VITE_BUILD_MODE

FROM alpine:3.21

RUN apk add --no-cache lighttpd

COPY --from=builder /app/apps/admin/dist /var/www/localhost/htdocs
COPY apps/admin/lighttpd.conf /etc/lighttpd/lighttpd.conf

# lighttpd drops privileges to the lighttpd user before opening its errorlog,
# so give it a writable directory for the log and pid files
RUN mkdir -p /var/log/lighttpd && touch /var/log/lighttpd/error.log && \
    chown -R lighttpd:lighttpd /var/log/lighttpd

# Run lighttpd workers as the unprivileged lighttpd user
RUN chown -R lighttpd:lighttpd /var/www/localhost/htdocs

EXPOSE 80

# Mirror the errorlog to stdout so container logs stay visible
CMD ["sh", "-c", "tail -f /var/log/lighttpd/error.log & exec lighttpd -D -f /etc/lighttpd/lighttpd.conf"]
