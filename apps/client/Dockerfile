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

# Build the client app
RUN pnpm run build

# Stage 2: Serve the client application using nginx
FROM nginx:alpine

# Copy the built assets from the builder stage
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY apps/client/nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]