#!/bin/zsh

# Script to run client-only mode with minimal setup

echo "🚀 Starting client-only mode..."

# Check if dependencies are installed
if [ ! -d "./node_modules" ] || [ ! -d "./apps/client/node_modules" ]; then
  echo "📦 Installing dependencies for client-only mode..."
  pnpm client-only:install
fi

# Build required packages
echo "🔨 Building required packages..."
pnpm build:packages

# Run client in demo mode
echo "💻 Starting client..."
cd apps/client && pnpm dev:client-only
