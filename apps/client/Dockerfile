FROM node:24-alpine AS builder

ENV NODE_OPTIONS=--max-old-space-size=4096

RUN apk add --no-cache python3 make g++
RUN corepack enable pnpm

# Skip the Cypress binary download: it is a test-only dependency and is not
# available for Alpine linux-arm64
ENV CYPRESS_INSTALL_BINARY=0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/typescript-config ./packages/typescript-config
COPY packages/constants ./packages/constants
COPY packages/web3 ./packages/web3
COPY packages/ui ./packages/ui
COPY apps/client ./apps/client

RUN pnpm install --frozen-lockfile --filter=@repo/client...

WORKDIR /app/apps/client
RUN pnpm exec vite build

FROM alpine:3.21

RUN apk add --no-cache lighttpd

COPY --from=builder /app/apps/client/dist /var/www/localhost/htdocs
COPY apps/client/lighttpd.conf /etc/lighttpd/lighttpd.conf

# lighttpd drops privileges to the lighttpd user before opening its errorlog,
# so give it a writable directory for the log and pid files
RUN mkdir -p /var/log/lighttpd && touch /var/log/lighttpd/error.log && \
    chown -R lighttpd:lighttpd /var/log/lighttpd

# Run lighttpd workers as the unprivileged lighttpd user
RUN chown -R lighttpd:lighttpd /var/www/localhost/htdocs

EXPOSE 80

# Mirror the errorlog to stdout so container logs stay visible
CMD ["sh", "-c", "tail -f /var/log/lighttpd/error.log & exec lighttpd -D -f /etc/lighttpd/lighttpd.conf"]
