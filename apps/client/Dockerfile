# Multi-stage build for efficient client production image
# Stage 1: Build the client application
FROM node:24-alpine AS builder

# Install Python, build tools and Python build dependencies
RUN apk add --no-cache python3 make g++ py3-pip py3-setuptools

# Install pnpm via corepack (pinned by packageManager), like the other apps
RUN corepack enable pnpm

# Type-checking the client pulls in the server router types, which needs more heap than the default
ENV NODE_OPTIONS=--max-old-space-size=4096

# Set the working directory inside the container
WORKDIR /app

# Copy the root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy the packages directories
COPY packages ./packages

# Copy the client app
COPY apps/client ./apps/client

# Copy the server app: the client type-checks against the server's
# tRPC router and auth types, so its sources and dependencies are required at build time
COPY apps/server ./apps/server

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile --filter=@ampedbio/client... --filter=@ampedbio/server...

# Change to the client app directory for building
WORKDIR /app/apps/client

# The client build reads the committed env file for the selected mode
# (apps/client/.env.<mode>), so the values inlined into the bundle always come
# from the repository. For another environment, commit its apps/client/.env.<mode>
# file and build with --build-arg VITE_MODE=<mode>
ARG VITE_MODE=staging

# Local env overrides are gitignored but still land in the build context, and
# Vite gives them priority over the committed file, so drop them before building
RUN rm -f .env.local .env.*.local

# Build the client app. NODE_ENV=production keeps the production React build even
# if the builder environment exports something else (the whole process.env is
# inlined by vite.config.ts); it does not select which env file is loaded, --mode does
RUN NODE_ENV=production pnpm run build --mode ${VITE_MODE}

# Stage 2: Serve the client application using lighttpd
FROM alpine:3.21

RUN apk add --no-cache lighttpd

# Copy the built assets from the builder stage
COPY --from=builder /app/apps/client/dist /var/www/localhost/htdocs

COPY apps/client/lighttpd.conf /etc/lighttpd/lighttpd.conf

# Default listening port, overridable at runtime with -e PORT=<port>
ENV PORT=80

# Expose the default port (metadata only, use PORT to change it)
EXPOSE 80

# Report container health from inside the image so any orchestrator can act on it.
# lighttpd serves index.html for every path (url.rewrite-if-not-file), so a request
# to / is enough to prove the web server is accepting traffic. PORT is expanded by
# the shell at runtime, keeping the check aligned with -e PORT=<port>.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-80}/" || exit 1

# Start lighttpd on the port provided through the PORT environment variable
CMD ["sh", "-c", "sed -i \"s/^server.port.*/server.port = ${PORT:-80}/\" /etc/lighttpd/lighttpd.conf && exec lighttpd -D -f /etc/lighttpd/lighttpd.conf"]