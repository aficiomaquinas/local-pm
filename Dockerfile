# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
# pnpm 11 (host version — keeps the lockfile's patchedDependencies section
# byte-compatible with `pnpm install --frozen-lockfile`). pnpm 11 needs
# node:sqlite, a Node 22+ builtin — hence the node:22 base. Engines floor
# stays >=20.9 (package.json); 22 is the host standard (AGENTS.md).
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
# Mirror the host's pnpm build-scripts allowance (AGENTS.md): pnpm 11 hard-
# errors on ignored native builds (esbuild/sharp) in non-interactive envs.
# Set in BASE so deps AND deploy stages inherit it.
RUN pnpm config set dangerouslyAllowAllBuilds true --location global

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace definition + manifests (cacheable per-manifest layers)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc* ./
# Vendored dependency patches (payload#17095 workaround) — required by
# `pnpm install --frozen-lockfile` (patchedDependencies in package.json).
COPY patches/ patches/
COPY apps/web/package.json apps/web/
COPY packages/mcp-server/package.json packages/mcp-server/

RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app ./
COPY . .

# Public build-time value (inlined into client bundles by Next.js). Deliberately
# the ONLY build arg: secrets and the database URI are injected at RUNTIME via
# docker-compose `environment:` — they never enter the builder stage. The
# builder has no route to mongodb, so a DATABASE_URI here would push the
# test-stage mongoose connects (getPayload) into their default 30s server
# selection retry loop and blow past the 5s vitest testTimeout (SPC-003 §5.3).
# With no URI, the adapter fails immediately — same fast-fail as the host.
ARG NEXT_PUBLIC_SERVER_URL

ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
ENV NODE_OPTIONS="--no-deprecation --max-old-space-size=8000"

# Create public directory if it doesn't exist (some Next.js apps may not have one)
RUN mkdir -p apps/web/public

# Boundary verification (SPC-002 §7.2): the MCP package compiles in
# isolation inside the image, before and independently of the app build
RUN pnpm --filter @local-pm/mcp-server build

# SPC-003 §5.3: tests ride the same build that produces the artifact —
# canonical install → build → test order. A red suite fails this RUN and
# breaks `docker compose build`; tests are additive and never enter the
# build outputs (they live in tests/, outside both packages' build
# tsconfigs). The suites are hermetic: fetch is mocked, no MongoDB and no
# network are reachable from the builder stage.
#
# The test stage is hermetic — no DB, no network; runtime env comes from
# compose at run time. DATABASE_URI must NOT be ambient here: compose passes
# it as a build-arg, and a valid-format-but-unreachable URL makes the OIDC
# handler tests hang in mongoose's 30s serverSelection retry loop (vitest
# testTimeout is 5s). The suites pin their own deterministic fail-fast
# DATABASE_URI where getPayload() is reachable (o2 test, beforeEach), and
# the line below pins the stage to the same contract. See
# docs/investigations/2026-09-10_docker-builder-tests-mongoose-timeout.md.
# (Scoped per-RUN override, not a stage ENV: compose build-args keep feeding
# the stage-level DATABASE_URI for `next build` below, so the deploy path is
# untouched — verified that next build completes even with the value empty.)
RUN DATABASE_URI="" pnpm -r --no-bail test

# Build the application
RUN pnpm --filter local-pm-web build

# Prune to the app's production dependency tree (workspace-aware deploy).
FROM base AS deployer
WORKDIR /app
COPY --from=builder /app ./
# --legacy: pnpm 10 gates deploy behind inject-workspace-packages, which
# does not apply here — the packages are intentionally independent
# (D-SPC2-3, no workspace deps to inject).
RUN pnpm --filter local-pm-web deploy --prod --legacy /out

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

# Upstream bfc8b57 port (PR #20 attachments): comment-attachment uploads write
# here; docker-compose mounts the local-pm-uploads volume at this exact path.
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads
ENV LOCAL_PM_UPLOADS_DIR=/app/uploads

USER nextjs

EXPOSE 3010

ENV PORT=3010
ENV HOSTNAME="0.0.0.0"

CMD ["node", "node_modules/next/dist/bin/next", "start", "--port", "3010"]
