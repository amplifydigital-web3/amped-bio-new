# Multi-stage build for efficient client production image
# Stage 1: Build the client application
FROM node:24-alpine AS builder

ENV NODE_OPTIONS=--max-old-space-size=4096

# Install Python and build tools
RUN apk add --no-cache python3 make g++

# Install pnpm via corepack (pinned by packageManager), like the server
RUN corepack enable pnpm

# Skip the Cypress binary download: it is a test-only dependency and is not
# available for Alpine linux-arm64
ENV CYPRESS_INSTALL_BINARY=0

# Set the working directory inside the container
WORKDIR /app

# ---------------------------------------------------------------------------
# Dependency layer — kept stable so `pnpm install` is cached between builds.
# The workspace packages' sources are required here because their `prepare`
# script builds them during install. App source changes never invalidate
# this layer.
# ---------------------------------------------------------------------------
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/client/package.json ./apps/client/package.json

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile --filter=@repo/client...

# ---------------------------------------------------------------------------
# Source + build layer — invalidated on every app source change
# ---------------------------------------------------------------------------
COPY apps/client ./apps/client

# Change to the client app directory for building
WORKDIR /app/apps/client
RUN pnpm exec vite build

# Stage 2: Serve the client application using lighttpd
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

# Expose port 80
EXPOSE 80

# Health check: "/" serves the built index.html and always returns 200
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

# Mirror the errorlog to stdout so container logs stay visible
CMD ["sh", "-c", "tail -f /var/log/lighttpd/error.log & exec lighttpd -D -f /etc/lighttpd/lighttpd.conf"]
