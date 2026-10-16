# Multi-stage build for efficient admin production image
# Stage 1: Build the admin application
FROM node:24-alpine AS builder

# Install Python, build tools and Python build dependencies
RUN apk add --no-cache python3 make g++ py3-pip py3-setuptools

# Install pnpm via corepack (pinned by packageManager), like the other apps
RUN corepack enable pnpm

# Type-checking the admin pulls in the server router types through @repo/ui,
# which needs more heap than the default
ENV NODE_OPTIONS=--max-old-space-size=4096

# Set the working directory inside the container
WORKDIR /app

# Copy the root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy the packages directories
COPY packages ./packages

# Copy the admin app
COPY apps/admin ./apps/admin

# Copy the server app: the admin type-checks against the server's tRPC router
# and auth types (re-exported through @repo/ui), so its sources and dependencies
# are required at build time
COPY apps/server ./apps/server

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile --filter=@repo/admin... --filter=@repo/server...

# Change to the admin app directory for building
WORKDIR /app/apps/admin

# The admin build reads the committed env file for the selected mode
# (apps/admin/.env.<mode>), so the values inlined into the bundle always come
# from the repository. For another environment, commit its apps/admin/.env.<mode>
# file and build with --build-arg VITE_MODE=<mode>
ARG VITE_MODE=staging

# Local env overrides are gitignored but still land in the build context, and
# Vite gives them priority over the committed file, so drop them before building
RUN rm -f .env.local .env.*.local

# Build the admin app. NODE_ENV=production keeps the production React build even
# if the builder environment exports something else (the whole process.env is
# inlined by vite.config.ts); it does not select which env file is loaded, --mode does
RUN NODE_ENV=production pnpm run build --mode ${VITE_MODE}

# Stage 2: Serve the admin application using lighttpd
FROM alpine:3.21

RUN apk add --no-cache lighttpd

# Copy the built assets from the builder stage
COPY --from=builder /app/apps/admin/dist /var/www/localhost/htdocs

COPY apps/admin/lighttpd.conf /etc/lighttpd/lighttpd.conf

# lighttpd drops privileges to the lighttpd user before opening its errorlog,
# so give it a writable directory for the log and pid files
RUN mkdir -p /var/log/lighttpd && touch /var/log/lighttpd/error.log && \
    chown -R lighttpd:lighttpd /var/log/lighttpd

# Run lighttpd workers as the unprivileged lighttpd user
RUN chown -R lighttpd:lighttpd /var/www/localhost/htdocs

EXPOSE 80

# Health check: "/" serves the built index.html and always returns 200
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

# Mirror the errorlog to stdout so container logs stay visible
CMD ["sh", "-c", "tail -f /var/log/lighttpd/error.log & exec lighttpd -D -f /etc/lighttpd/lighttpd.conf"]