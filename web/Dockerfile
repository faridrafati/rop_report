# syntax=docker/dockerfile:1
# Build context is the monorepo root (rop_report/).

# --- Build stage ---
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo

# Workspace + root manifests for dependency resolution.
COPY pnpm-workspace.yaml package.json ./
COPY web/package.json ./web/

RUN pnpm install --filter @drilliq/web... --frozen-lockfile || \
    pnpm install --filter @drilliq/web...

# App source.
COPY web/ ./web/

RUN pnpm --filter @drilliq/web build

# --- Serve stage ---
FROM nginx:alpine AS serve
COPY --from=build /repo/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
