# DrillIQ API — multi-stage build.
# Build context is the repo root (see docker-compose.yml: context: .).
# COPY paths are therefore relative to the repo root.

# ---- Build stage ----
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /repo

# Workspace manifests first for better layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY api/package.json ./api/

# Install all deps (workspace-aware) for the api package.
RUN pnpm install --filter @drilliq/api... --frozen-lockfile || pnpm install --filter @drilliq/api...

# Copy sources and build.
COPY api ./api
RUN pnpm --filter @drilliq/api build

# Prune to production dependencies only.
RUN pnpm --filter @drilliq/api install --prod --frozen-lockfile || pnpm --filter @drilliq/api install --prod

# ---- Runtime stage ----
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /repo/api/dist ./dist
COPY --from=builder /repo/api/package.json ./package.json
COPY --from=builder /repo/api/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/main.js"]
