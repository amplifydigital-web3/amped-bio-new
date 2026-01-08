# Use the official Node.js 24 image as the base image
FROM node:24-alpine

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

# Copy the server app
COPY apps/server ./apps/server

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile --filter=@ampedbio/server...

# Change to the server app directory for building
WORKDIR /app/apps/server

# Build the server app
RUN pnpm run build

# Expose port 3000 (or whatever port your server uses)
EXPOSE 3000

# Start the server
CMD ["pnpm", "start"]