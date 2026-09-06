# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace definition + manifests (cacheable per-manifest layers)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc* ./
COPY apps/web/package.json apps/web/
COPY packages/mcp-server/package.json packages/mcp-server/

RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app ./
COPY . .

# Build arguments for environment variables needed at build time
ARG DATABASE_URI
ARG PAYLOAD_SECRET
ARG NEXT_PUBLIC_SERVER_URL

ENV DATABASE_URI=$DATABASE_URI
ENV PAYLOAD_SECRET=$PAYLOAD_SECRET
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
ENV NODE_OPTIONS="--no-deprecation --max-old-space-size=8000"

# Create public directory if it doesn't exist (some Next.js apps may not have one)
RUN mkdir -p apps/web/public

# Boundary verification (SPC-002 §7.2): the MCP package compiles in
# isolation inside the image, before and independently of the app build
RUN pnpm --filter @local-pm/mcp-server build

# Build the application
RUN pnpm --filter local-pm-web build

# Prune to the app's production dependency tree (workspace-aware deploy)
FROM base AS deployer
WORKDIR /app
COPY --from=builder /app ./
RUN pnpm --filter local-pm-web deploy --prod /out

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS="--no-deprecation"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Deployed tree: app files + pruned production node_modules (self-contained)
COPY --from=deployer --chown=nextjs:nodejs /out ./apps/web
WORKDIR /app/apps/web

USER nextjs

EXPOSE 3010

ENV PORT=3010
ENV HOSTNAME="0.0.0.0"

CMD ["node", "node_modules/.bin/next", "start", "--port", "3010"]
