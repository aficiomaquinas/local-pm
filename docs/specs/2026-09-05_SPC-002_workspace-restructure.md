# Spec — Workspace restructure (mcp-server as first-class package)

| | |
|---|---|
| **Repo** | `local-pm` (fork local: `aficiomaquinas/local-pm`) |
| **ID** | SPC-002 |
| **Date** | 2026-09-05 |
| **Status** | APPROVED (2026-09-05). Execution authorized — resolves D-R3; branch `feat/workspace-restructure`. |
| **Type** | Spec (how it is implemented; the what lives in REQ-003) |
| **Resolves** | [REQ-003 — Repository restructure per best practices (no monkey patching)](../requirements/2026-09-05_REQ-003_workspace-restructure.md) |
| **Related** | [SPC-001 — Audit trail & restore](../specs/2026-09-05_SPC-001_audit-trail-restore.md) · PR anaskasmi/local-pm#1 and commit `99fad97` (current stopgap, retired by this spec) |
| **Scope driver** | Operator instruction (2026-09-05, TODO track): restructure spec based on real research — in-house benchmark `mcp-baserow-schema`, official reference `modelcontextprotocol/servers`, authoritative MCP docs. |

---

## 1. Objective

Define the restructuring of `local-pm` as a JS/TS workspace following monorepo
best practices, with `mcp-server/` converted into a first-class package:

- explicit package boundaries (each package with its own `package.json` and
  `tsconfig`, recognized by the workspace manager);
- per-package type-check and build, isolated; the app build stops dragging in
  MCP server code;
- end of monkey-patching: the `"mcp-server"` exclude in the root tsconfig
  (stopgap from `99fad97`) disappears because it no longer has a purpose —
  the root's `**/*.ts` glob include disappears with it.

This spec implements nothing: it is the execution plan for when the operator
resolves D-R3 (execution timing).

## 2. Current-state evidence (verified in the repo, 2026-09-05)

| Hecho | Evidencia |
|---|---|
| Root tsconfig includes the whole tree by glob | `tsconfig.json`: `"include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]` |
| Current stopgap | same file: `"exclude": ["node_modules", "mcp-server"]` (commit `99fad97`, PR anaskasmi/local-pm#1) |
| Nested package, not integrated | `mcp-server/package.json` (`@local-pm/mcp-server`) and `mcp-server/tsconfig.json` of its own, with an **orphan lockfile** (`mcp-server/package-lock.json`) foreign to the root |
| No workspace | root `package.json` declares no `workspaces`; there is no `pnpm-workspace.yaml`; the current manager is npm (root `package-lock.json`) |
| No leakage today, by patch | the Docker build (`99fad97`) passes because the exclude removes `mcp-server` from the type-check; before the patch, build exit 1 (`9848720`) |
| Docker ignores the subpackage | the `Dockerfile` copies only the root `package.json` and runs `npm ci`; `mcp-server` enters the image via `COPY . .` with no build and no use |
| MCP package quality | a single `src/index.ts` file (1084 lines), low-level SDK `Server` API, `@modelcontextprotocol/sdk ^1.0.0`, no `files`/`exports`/`engines` in the manifest |

The root cause (REQ-003) is not the exclude: it is that the repo is **two
packages disguised as one** — the root glob was the only "boundary", and it
was a false one.

## 3. Research findings

Methodology: semantic web search first (donsetch), fetch only of URLs resulting
from those searches. Every external claim carries a citation in §8.

### 3.1 How the official MCP reference servers structure their monorepo

- The `modelcontextprotocol/servers` repo is an **npm workspaces** monorepo: the
  root `package.json` declares `"workspaces": ["src/*"]` (each server is a
  directory under `src/`), the root is `"private": true` and acts only as an
  orchestrator — it is never published. There is ONE unified lockfile
  (`package-lock.json`) for the whole repo ([2], [3]).
- Each server is both a workspace member and a self-contained distributable
  package: its own manifest with `"type": "module"`, `bin`, `files`, a `prepare`
  hook, and its explicit SDK dependency (`@modelcontextprotocol/sdk`). The TS
  servers are published as `@modelcontextprotocol/server-*` and run with
  `npx -y @modelcontextprotocol/server-memory`; the Python ones go to PyPI and
  run with `uvx` ([2], [3]).
- Build orchestration from the root with `npm run build --workspaces`: the
  command runs each workspace member's `build`; the root also pins `overrides`
  for shared transitive dependencies ([2]).
- The README itself warns that these servers are **educational reference
  implementations, not production-ready**: they are examples of structure, not
  of hardening ([3]).
- The official TypeScript SDK repo (`modelcontextprotocol/typescript-sdk`) is
  also a monorepo, but managed with **pnpm** (`pnpm-workspace.yaml`,
  `pnpm-lock.yaml`), with packages under `packages/` and examples under
  `examples/`; it publishes separate packages (`@modelcontextprotocol/server`
  and `.../client`, v2 line, MCP spec 2026-07-28) ([4]).

**Reading for local-pm:** the canonical MCP pattern is "private orchestrator
root + a packages directory + one package per server with a complete manifest +
run via `npx`". Both reference repos agree on the shape; they differ only in
the manager (npm in servers, pnpm in the SDK).

### 3.2 What carries over well from `mcp-baserow-schema` (in-house benchmark) and what the current package lacks

`mcp-baserow-schema` (v2.0.2, published to npm with CI) is a conventional
self-contained MCP package (direct inspection, local repo, read-only):

| Benchmark convention | State in local-pm's `mcp-server/` | Convention source |
|---|---|---|
| `bin` pointing at `dist/index.js` with shebang `#!/usr/bin/env node` | ✓ present (bin `local-pm-mcp`) | [5] (MCP docs: bin + build with `chmod 755`) |
| `files: ["dist", …]` — only the compiled output is published | ✗ missing | [2], [5] |
| `engines: { node: ">=20" }` | ✗ missing (the app root does have engines) | [5] (Node 20+ requirement of the MCP TS docs) |
| Isolated `tsconfig`: `NodeNext`/`NodeNext`, `outDir dist`, `rootDir src`, `include: ["src/**/*"]` | ✓ present and identical in substance | [2], [5] |
| Modular `src/` (index/api/auth/spec/totp) | partial: a single 1084-line file | general benchmark practice |
| Up-to-date SDK (`^1.12.1`) and high-level `McpServer` API | `^1.0.0` and low-level `Server` API | [4] (SDK v2 published; 1.x in maintenance) |
| Automated release: release-it + Conventional Commits, OIDC trusted publishing, `server.json` (`mcpName`) for the MCP Registry, `docs/RELEASING.md` | nonexistent (not published) | local benchmark; pattern also documented in [3] (the official repo's RELEASING.md) |

**Conclusion 3.2:** the local package's isolated tsconfig is already correct;
what is missing is the **workspace boundary** (nobody includes it by accident)
and the manifest fields that would make it installable/runnable as a package
(`files`, `engines`, `exports`, bin execute permission).

### 3.3 Workspace manager: npm vs pnpm

Comparison contrasted against §8 sources ([6], [7]):

| Dimension | npm workspaces | pnpm workspaces |
|---|---|---|
| Definition | `workspaces` field in root `package.json` | `pnpm-workspace.yaml` |
| Install model | traditional `node_modules`, **hoisted by default** — permissive hoisting can hide undeclared dependencies ("phantom dependencies") | `node_modules` symlinked over a content-addressable store; **strict by default**: a package sees only what it declares |
| Lockfile | `package-lock.json` | single root `pnpm-lock.yaml` (`sharedWorkspaceLockfile`: every dependency is a singleton, faster installs) |
| Task filtering | `--workspace`/`--workspaces`, simple model | graph-aware `--filter` (by name, dependents, etc.) |
| Stated positioning | "optimizes compatibility and low process change" | "optimizes correctness, efficiency, and monorepo operations at scale" ([6]) |
| MCP precedent | the `servers` repo ([2]) | the `typescript-sdk` repo ([4]) |

**Decision D-SPC2-1 — pnpm workspaces.** Rationale:

1. The hard requirement of REQ-003.2 is explicit boundaries and zero implicit
   cross-dependencies. The failure mode that broke the build (`9848720`) is
   exactly the phantom dependency / leakage that npm's hoisting tolerates and
   pnpm makes structurally impossible ([6]): with pnpm, the app cannot "see"
   `packages/mcp-server` code unless it declares a dependency — and this spec
   mandates that it NOT declare one (see D-SPC2-3).
2. The toolchain is already on the machine: pnpm 11.x is the operator
   environment's global manager (ASDF-managed) — zero new installs.
3. Precedent in the MCP ecosystem: the official TypeScript SDK uses pnpm ([4]).
4. Honest cost: lockfile migration (npm→pnpm, §5 step 5) and Dockerfile
   adjustment (corepack). The npm-workspaces alternative was evaluated and
   discarded: less immediate churn, but it re-introduces the permissive model
   that made the original bug possible, and its filtering/strictness is weaker
   for the declared REQ objective ([6], [7]).

### 3.4 TypeScript: why project references are NOT needed here

- A root tsconfig with glob + `paths` treats the whole monorepo as **one
  unit** with no real boundaries; `references` + `composite` + `tsc -b` is the
  TS mechanism to turn it into orchestrated "islands" ([8]).
- In this repo the two packages **share no types**: the app ↔ MCP interface is
  the REST/HTTP contract (`LOCAL_PM_URL`), not an import. With no cross
  `references` there is nothing to orchestrate with `composite`; each package
  compiles with its own `tsc` and the app (Next.js) handles its own build.
- Documented for the record: if a shared package (e.g. API contract types) is
  ever extracted, that package would carry `composite: true` and be
  `referenced` by its consumers ([8]).

## 4. Proposed design

### 4.1 Target directory structure

```
local-pm/
├── package.json               # root: private, SIN deps de app; scripts orquestadores
├── pnpm-workspace.yaml        # packages: ["apps/*", "packages/*"]
├── pnpm-lock.yaml             # ÚNICA lockfile del repo
├── .npmrc                     # (si hace falta) public-hoist-pattern para tooling Next que asuma flat node_modules
├── tsconfig.base.json         # opciones comunes (strict, ES2022, skipLibCheck, …)
├── apps/
│   └── web/                   # the Next.js 15 + Payload 3.x app (ex-root: src/, next.config.ts, …)
│       ├── package.json       # name "web" (or @local-pm/web), current root deps
│       └── tsconfig.json      # includes ONLY its own tree; no ad-hoc excludes
├── packages/
│   └── mcp-server/            # @local-pm/mcp-server — paquete de primera clase
│       ├── package.json       # complete (§4.4)
│       ├── tsconfig.json      # isolated NodeNext (current one, extending base)
│       └── src/index.ts       # (no code changes in this spec)
├── Dockerfile                 # multi-stage consuming the workspace (§4.5)
├── docker-compose.yml         # unchanged in shape (build context remains the root)
└── docs/                      # this convention; the fork README documents the workspace
```

The root remains a private orchestrator — the same role as the official
`servers` repo root ([2]) and the SDK's ([4]).

### 4.2 Workspace configuration (pnpm)

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

```jsonc
// root package.json (orchestrator; "private": true)
{
  "name": "local-pm-monorepo",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",                    // topological order; app and mcp are independent today
    "dev": "pnpm --filter local-pm-web dev",
    "mcp:build": "pnpm --filter @local-pm/mcp-server build",
    "mcp:dev": "pnpm --filter @local-pm/mcp-server dev",
    "seed": "pnpm --filter local-pm-web seed",
    "start": "pnpm --filter local-pm-web start"
  },
  "engines": { "node": ">=20.9.0", "pnpm": ">=10" }
}
```

### 4.3 Per-package tsconfig + shared base

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- `apps/web/tsconfig.json`: `extends` the base; keeps `jsx: preserve`,
  `module: esnext`, `moduleResolution: bundler`, Next plugins, `paths`
  (`@/*`, `@payload-config`) — but the `include` becomes the app's own tree
  (`include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`
  **within `apps/web/`**). The `exclude: ["mcp-server"]` is REMOVED: no glob
  can reach `packages/` anymore.
- `packages/mcp-server/tsconfig.json`: the current one (NodeNext/NodeNext,
  outDir dist, rootDir src) extending the base for common options. No
  `composite` (§3.4).

### 4.4 The `@local-pm/mcp-server` package (first-class manifest)

```jsonc
{
  "name": "@local-pm/mcp-server",
  "version": "1.0.0",
  "description": "MCP server for Local PM - Project Management System",
  "type": "module",
  "private": true,                          // until publishing is decided (§4.6)
  "main": "dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "bin": { "local-pm-mcp": "dist/index.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc && chmod 755 dist/index.js",   // patrón docs MCP oficiales [5]
    "dev": "tsc --watch",
    "start": "node dist/index.js"
  },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.12.1" },
  "devDependencies": { "@types/node": "^22", "typescript": "^5.9" },
  "engines": { "node": ">=20.0.0" }
}
```

Notes: `files`/`exports`/`engines` and the bin `chmod` follow the official
MCP TS docs ([5]) and the in-house benchmark (§3.2). The SDK bump from `^1.0.0`
to `^1.12.1` is 1.x-compatible; the migration to the SDK v2 line
(`@modelcontextprotocol/server`, spec 2026-07-28, [4]) and refactoring the
single file into a modular `src/` are EXPLICITLY out of scope for this spec
(they are not restructuring).

**App ↔ MCP boundary (D-SPC2-3):** the two packages declare NO dependency on
each other (no `"workspace:"` between them). The only interface is HTTP
(`LOCAL_PM_URL`, default `http://localhost:3010`). Build independence is thus
structural, not conventional.

### 4.5 Multi-stage Dockerfile consuming the workspace

Same layering strategy as today, adapted to pnpm:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/web/package.json apps/web/
COPY packages/mcp-server/package.json packages/mcp-server/
RUN pnpm install --frozen-lockfile          # cacheable layers per manifest

FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY . .
ARG DATABASE_URI
ARG PAYLOAD_SECRET
ARG NEXT_PUBLIC_SERVER_URL
ENV DATABASE_URI=$DATABASE_URI PAYLOAD_SECRET=$PAYLOAD_SECRET \
    NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL \
    NODE_OPTIONS="--no-deprecation --max-old-space-size=8000"
RUN pnpm --filter @local-pm/mcp-server build   # mcp compiles in isolation (in-image verification)
RUN pnpm --filter local-pm-web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NODE_OPTIONS="--no-deprecation"
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
RUN pnpm --filter local-pm-web deploy --prod /out    # workspace-pruned dep tree
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next /out/apps/web/.next
# …(fine-tuning of .next/public paths per deploy layout)…
USER nextjs
EXPOSE 3010
ENV PORT=3010 HOSTNAME="0.0.0.0"
CMD ["node", "apps/web/node_modules/.bin/next", "start", "--port", "3010"]
```

(The `runner` fine detail — `pnpm deploy` vs copying `.next` + a pruned
`node_modules` — is fixed at implementation time; the design requirements are:
per-manifest cacheable installs, `--frozen-lockfile`, and the build stage
compiling the MCP package separately as a boundary verification. An optional
`mcp` stage can produce a second runnable image `local-pm-mcp` to run the
server in-container; with `network_mode` pointing at the app over the compose
internal network.)

### 4.6 Versioning and publishing (optional, non-blocking)

The package is `private` today. If the operator decides to publish it, the
template is `mcp-baserow-schema` itself: `files`/`engines`/`repository` are
already in the manifest (§4.4); it would add release-it + Conventional Commits,
npm trusted publishing (OIDC) and a `server.json` with `mcpName` for the MCP
Registry, plus its `docs/RELEASING.md` — no additional structural changes
(§3.2). Note: the `@local-pm` scope requires owning the npm scope, or renaming
to a non-scoped name. Deferred decision; not part of the acceptance criteria.

## 5. Migration plan (step by step — DO NOT execute; requires D-R3)

1. **Prerequisite:** the operator's D-R3 decision (timing vs PR #1 merge and
   SPC-001). This spec is not executed without it (REQ-003.4).
2. `git mv` the app to `apps/web/` (src/, next.config.ts, postcss, seeds,
   public) and `mcp-server/` to `packages/mcp-server/`. Separate commits,
   each with a green build.
3. Create `pnpm-workspace.yaml`; rewrite the root `package.json` as
   orchestrator (§4.2); move the app deps into the `apps/web` manifest.
4. Create `tsconfig.base.json`; adjust `apps/web/tsconfig.json` (own include,
   NO mcp-server exclude) and `packages/mcp-server/tsconfig.json` (extends base).
5. Lockfile migration: `pnpm import` from the two `package-lock.json` files
   (root and `mcp-server/`) → generate the single `pnpm-lock.yaml` → delete
   both `package-lock.json` → full `pnpm install` and boot audit.
6. Update the `packages/mcp-server` manifest (§4.4) and verify
   `pnpm --filter @local-pm/mcp-server build` + bin startup.
7. Rewrite the `Dockerfile` (§4.5); validate `docker compose up -d --build`.
8. Document the workspace in the fork README (REQ-003 Verification) and
   update `docs/` if any code-path xref changed.
9. Run the full §7; mark REQ-003 `IMPLEMENTED` only with everything green.

Rollback: the migration is a set of revertible commits; until step 4 executes,
the current stopgap (`99fad97`) remains the accepted mitigation (REQ-003.3).

## 6. Impacts and risks

| Impact / risk | Mitigation |
|---|---|
| Manager change npm→pnpm for humans and CI | pnpm is already in the operator toolchain (ASDF); `pnpm import` seeds the lockfile; CI: `pnpm install --frozen-lockfile` |
| Docker image now needs pnpm (corepack) | `corepack enable` in the base stage (§4.5); base image unchanged (node:20-alpine) |
| Next.js/pnpm: tooling assuming flat `node_modules` may fail | `.npmrc` with selective `public-hoist-pattern[]` — surgical hoisting, not npm's permissive default |
| Lockfile migration not 1:1 | step 5 with `pnpm import` + full install + smoke test before proceeding |
| Rebase friction on live branches (moved paths) | execute D-R3 in a window with no active branches; separate atomic restructure commits |
| The MCP package today is a mono-file on an old SDK | out of scope on purpose (§4.4); the restructure does not worsen it and leaves the door ready |
| `pnpm deploy` in the runner has fine path detail | detail fixable at implementation; design requirement explicit in §4.5 |

## 7. Acceptance criteria (aligned with REQ-003 Verification)

1. `docker compose up -d --build` green, and the app tsconfig **contains no
   `mcp-server` exclude at all** (the field disappears, it is not relaxed).
2. `pnpm --filter @local-pm/mcp-server build` compiles the package in
   isolation; `node packages/mcp-server/dist/index.js` starts and completes the
   MCP handshake (initialize) against the local app.
3. Demonstrable structural isolation: `apps/web/tsconfig.json`'s `include`
   cannot reach `packages/` (no repo-wide glob); `grep -r mcp-server apps/web`
   yields no build/type-check references.
4. Zero implicit cross-dependencies: no `workspace:` between app and mcp in
   the manifests; the only declared coupling is `LOCAL_PM_URL` (HTTP).
5. A single lockfile in the repo (`pnpm-lock.yaml` at root); no nested
   `package-lock.json` exists.
6. The bin is executable as a package: shebang present, 755 permission
   post-build, `pnpm --filter @local-pm/mcp-server exec local-pm-mcp --help`
   (or direct startup) works — the `npx`-readiness requirement of the canonical
   MCP shape ([3]).
7. The fork README documents the workspace structure (third item of REQ-003
   Verification).
8. No functional regression: board/projects/teams and the MCP server operate
   identically (tools unchanged; only the repo wrapping changes).

## 8. References

Research 2026-09-05 — methodology: web search (donsetch) first, fetch only of
search-result URLs. Local benchmark inspected read-only.

External (URL + title):

1. https://github.com/modelcontextprotocol/servers — *Model Context Protocol
   servers* (official README: educational reference implementations, `npx` for
   TS servers / `uvx` for Python, per-language SDKs, OIDC RELEASING.md).
2. https://deepwiki.com/modelcontextprotocol/servers/1.2-server-types-and-capabilities
   — *Repository Structure and Package Management (modelcontextprotocol/servers)*
   (npm workspaces `src/*`, private root, unified lockfile, per-server manifests
      with `bin`/`files`/`prepare`, `npm run build --workspaces`,
   `@modelcontextprotocol/server-*`, `mcpName`).
3. https://github.com/modelcontextprotocol/servers — same as [1] (direct README
   fetch: "not production-ready" warning, reference server table).
4. http://github.com/modelcontextprotocol/typescript-sdk — *MCP TypeScript SDK*
   (pnpm monorepo: `pnpm-workspace.yaml`/`pnpm-lock.yaml`, packages under
   `packages/`, v2 split packages `@modelcontextprotocol/server`/`client`,
   spec 2026-07-28, v1.x in maintenance).
5. https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server —
   *Build an MCP server — Model Context Protocol* (Node 20+ requirements,
   `package.json` with `type: module`/`bin`/`files`, `build: tsc && chmod 755`,
   strict Node16 tsconfig, never write to stdout in STDIO servers).
6. https://stevekinney.com/courses/enterprise-ui/workspace-package-managers —
   *npm vs pnpm vs Bun: Workspace Package Managers* (npm = compatibility/low
   process change and permissive hoisting with phantom deps; pnpm = correctness,
   content-addressable store, strictness, `--filter`; comparison table and
   failure modes).
7. https://pnpm.io/workspaces — *Workspace | pnpm* (`pnpm-workspace.yaml`,
   `workspace:` protocol, `sharedWorkspaceLockfile` — singleton dependencies
   with strictness preserved, `linkWorkspacePackages`).
8. https://nx.dev/blog/typescript-project-references — *Everything You Need to
   Know About TypeScript Project References* (root glob + `paths` = one unit
   with no boundaries; `references` + `composite` + `tsc -b` = orchestrated
   islands).

Local (direct inspection, no URL):

- `~/Documents/DevelopmentV2/mcp-baserow-schema` @ 2.0.2 (read-only):
  `package.json` (bin/files/engines/repository), `tsconfig.json` NodeNext
  aislado, `src/` modular, release-it + `.release-it.json`,
  `.github/workflows/publish-mcp.yml` (OIDC trusted publishing + MCP
  Registry), `server.json` (`mcpName`), `docs/RELEASING.md`.
- `local-pm` (§2 evidence): `package.json`, `tsconfig.json`,
  `mcp-server/{package.json,tsconfig.json,src/index.ts,README.md}`,
  `Dockerfile`, commits `9848720`/`99fad97`/`05dab27`.
