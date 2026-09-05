# Multi-stage build for efficient client production image
# Stage 1: Build the client application
FROM node:24-alpine as builder

# Install Python, build tools and Python build dependencies
RUN apk add --no-cache python3 make g++ py3-pip py3-setuptools

# Install pnpm via corepack (pinned by packageManager), like the server
RUN corepack enable pnpm

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
RUN pnpm install --frozen-lockfile --filter=@ampedbio/client...

# ---------------------------------------------------------------------------
# Source + build layer — invalidated on every app source change
# ---------------------------------------------------------------------------
COPY apps/client ./apps/client

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
