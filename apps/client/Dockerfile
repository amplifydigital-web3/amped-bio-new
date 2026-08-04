FROM node:24-alpine AS builder

ENV NODE_OPTIONS=--max-old-space-size=4096

RUN apk add --no-cache python3 make g++
RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/typescript-config ./packages/typescript-config
COPY packages/constants ./packages/constants
COPY packages/web3 ./packages/web3
COPY packages/ui ./packages/ui
COPY apps/client ./apps/client

RUN pnpm install --frozen-lockfile --filter=@ampedbio/client...

WORKDIR /app/apps/client
RUN pnpm exec vite build

FROM alpine:3.21

RUN apk add --no-cache lighttpd

COPY --from=builder /app/apps/client/dist /var/www/localhost/htdocs
COPY apps/client/lighttpd.conf /etc/lighttpd/lighttpd.conf

EXPOSE 80

CMD ["lighttpd", "-D", "-f", "/etc/lighttpd/lighttpd.conf"]
