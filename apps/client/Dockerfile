# Multi-stage build for efficient client production image
# Stage 1: Build the client application
FROM node:24-alpine as builder

# Install Python, build tools and Python build dependencies
RUN apk add --no-cache python3 make g++ py3-pip py3-setuptools

# Install pnpm globally
RUN npm install -g pnpm

# Set the working directory inside the container
WORKDIR /app

# Copy the root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy the packages directories
COPY packages ./packages

# Copy the client app
COPY apps/client ./apps/client

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile --filter=@ampedbio/client...

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