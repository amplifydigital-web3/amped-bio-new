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

# Vite inlines these variables into the bundle, so they must be supplied as build arguments
ARG VITE_API_URL
ARG VITE_AUTHBASE_URL
ARG VITE_AUTH_MODE
ARG VITE_CAPTCHA_SITE_KEY
ARG VITE_DEFAULT_NETWORK_ID_HEX
ARG VITE_DEMO_MODE
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_NDAU_SOCKET_URL
ARG VITE_REWARD_URL
ARG VITE_RNS_API_URL
ARG VITE_RNS_URL
ARG VITE_SHOW_CREATOR_POOL
ARG VITE_SHOW_GALLERY
ARG VITE_SHOW_REWARD
ARG VITE_SHOW_RNS
ARG VITE_SHOW_WALLET
ARG VITE_TWITTER_BEARER_TOKEN
ARG VITE_WEB3AUTH_AUTH_CONNECTION_ID
ARG VITE_WEB3AUTH_CLIENT_ID
ARG VITE_WEB3AUTH_NETWORK
ENV VITE_API_URL=$VITE_API_URL \
    VITE_AUTHBASE_URL=$VITE_AUTHBASE_URL \
    VITE_AUTH_MODE=$VITE_AUTH_MODE \
    VITE_CAPTCHA_SITE_KEY=$VITE_CAPTCHA_SITE_KEY \
    VITE_DEFAULT_NETWORK_ID_HEX=$VITE_DEFAULT_NETWORK_ID_HEX \
    VITE_DEMO_MODE=$VITE_DEMO_MODE \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_NDAU_SOCKET_URL=$VITE_NDAU_SOCKET_URL \
    VITE_REWARD_URL=$VITE_REWARD_URL \
    VITE_RNS_API_URL=$VITE_RNS_API_URL \
    VITE_RNS_URL=$VITE_RNS_URL \
    VITE_SHOW_CREATOR_POOL=$VITE_SHOW_CREATOR_POOL \
    VITE_SHOW_GALLERY=$VITE_SHOW_GALLERY \
    VITE_SHOW_REWARD=$VITE_SHOW_REWARD \
    VITE_SHOW_RNS=$VITE_SHOW_RNS \
    VITE_SHOW_WALLET=$VITE_SHOW_WALLET \
    VITE_TWITTER_BEARER_TOKEN=$VITE_TWITTER_BEARER_TOKEN \
    VITE_WEB3AUTH_AUTH_CONNECTION_ID=$VITE_WEB3AUTH_AUTH_CONNECTION_ID \
    VITE_WEB3AUTH_CLIENT_ID=$VITE_WEB3AUTH_CLIENT_ID \
    VITE_WEB3AUTH_NETWORK=$VITE_WEB3AUTH_NETWORK

# Build the client app
RUN pnpm run build

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

# Start lighttpd on the port provided through the PORT environment variable
CMD ["sh", "-c", "sed -i \"s/^server.port.*/server.port = ${PORT:-80}/\" /etc/lighttpd/lighttpd.conf && exec lighttpd -D -f /etc/lighttpd/lighttpd.conf"]