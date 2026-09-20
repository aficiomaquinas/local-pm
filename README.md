# Local PM — Production Fork

A lightweight, self-hosted project management tool with a built-in MCP (Model Context
Protocol) server that enables AI assistants to manage your projects, tickets, and teams
directly.

This repository is the **production fork** of
[anaskasmi/local-pm](https://github.com/anaskasmi/local-pm), extended with OIDC
authentication, audit history with actor attribution, and a full E2E testing stack.
Everything below marked **fork addition** is production-proven here and documented under
`docs/`.

## Features

- **Kanban Board** — Drag-and-drop ticket management with Todo, In Progress, and Done columns
- **Projects** — Organize work with customizable projects (icons, colors, prefixes)
- **Teams** — Assign tickets to teams for better organization
- **Tickets** — Full-featured tickets with priority levels, due dates, colored labels,
  subtasks, dependencies (blocked-by), and rich text descriptions
- **MCP Server** — AI-native project management via Model Context Protocol
- **Self-Hosted** — Your data stays on your machine
- **Docker Ready** — One command deployment

### Fork additions

| Feature | What it does | Docs |
|---|---|---|
| **OIDC authentication** (env-gated) | Dual-IdP: Dex (+PKCE) for humans, node-oidc-provider (`client_credentials`, RFC 8707 JWTs) for machines. Unset `OIDC_ISSUER` → local auth unchanged. Identity = `(iss, sub)` pair; Dex `groups` → superadmin mapping | [SPC-006](docs/specs/) |
| **Audit history** | `/history` page + `/api/history` endpoint; every mutation attributed to `user:<email>` or `agent:<client-id>` with `actorType` | [SPC-005](docs/specs/) |
| **Distinguished actors** | human / superadmin / agent actor types enforced end-to-end (UI, API, audit) | [REQ-002](docs/requirements/) |
| **Auth visibility UI** | Anonymous: read-only banner that nudges (soft alarm pulse) when a mutation fails. Authenticated: sidebar user block with Admin / Log out menu | [REQ-005](docs/requirements/), [SPC-007](docs/specs/) |
| **Hardened access control** | Soft-delete ACLs enforced on REST *and* server-rendered reads (`overrideAccess` parity) | [SPC-004](docs/specs/) |
| **E2E testing stack** | Dedicated compose project with dual-IdP; 12-check smoke + 6-check OIDC suites; deployment compose untouched | [INV-E2E-STACK](docs/investigations/) |
| **Reliability fixes** | Drag persistence under React concurrent; optimistic revert + explicit mutation errors (no silent failures) | [INV-AUTH-VIS](docs/investigations/) |

## Repository structure (pnpm workspace)

The repository is a [pnpm workspace](https://pnpm.io/workspaces) monorepo with
an orchestrator root and two independent, first-class packages:

```
local-pm/
├── package.json               # private orchestrator root (build/dev/seed scripts)
├── pnpm-workspace.yaml        # packages: apps/*, packages/*
├── pnpm-lock.yaml             # single lockfile for the whole repo
├── tsconfig.base.json         # shared compiler options
├── apps/
│   └── web/                   # the Next.js 15 + Payload 3.x application
├── packages/
│   └── mcp-server/            # @local-pm/mcp-server — MCP server package
├── Dockerfile                 # multi-stage build consuming the workspace
└── docs/                      # requirements, specs, investigations
```

The two packages declare **no dependency on each other** — the only interface
is HTTP (`LOCAL_PM_URL`). Each builds and type-checks in isolation:

```bash
pnpm install                          # installs everything from the root
pnpm --filter local-pm-web build      # build the app only
pnpm --filter @local-pm/mcp-server build   # build the MCP server only
pnpm mcp:build                        # same, via the root orchestrator script
```

## Installation

### Using Docker (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/aficiomaquinas/local-pm.git
cd local-pm
```

2. Start the containers:
```bash
docker compose up -d --build
```

3. Access the app at http://localhost:3010

### Manual Installation

1. Clone the repository and install dependencies (from the repo root):
```bash
git clone https://github.com/aficiomaquinas/local-pm.git
cd local-pm
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your MongoDB connection string
# Optional OIDC: OIDC_ISSUER, OIDC_AUDIENCE, OIDC_AGENT_CLIENT_IDS, OIDC_SCOPE
```

3. Run the development server:
```bash
pnpm dev
```

## MCP Server

The MCP server exposes 18 tools for complete project management (projects, teams,
tickets, board, subtasks — full table in the
[upstream README](https://github.com/anaskasmi/local-pm#mcp-tools-reference)). With the
fork's OIDC machine leg, agent mutations land in the audit history as first-class
`agent` actors.

### Building

```bash
pnpm install
pnpm mcp:build
# → packages/mcp-server/dist/index.js
```

### Adding to Claude Code (Global)

```bash
claude mcp add --scope user local-pm node "/path/to/local-pm/packages/mcp-server/dist/index.js"
```

### Adding to Claude Desktop

Add to your Claude Desktop config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "local-pm": {
      "command": "node",
      "args": ["/path/to/local-pm/packages/mcp-server/dist/index.js"],
      "env": {
        "LOCAL_PM_URL": "http://localhost:3010"
      }
    }
  }
}
```

## E2E Testing

A dedicated compose **project** (`-p local-pm-e2e`) spins up an isolated stack via an
overlay chain — the deployment `docker-compose.yml` stays untouched:

```bash
make e2e-up      # app (human leg :3012) + app-mcp (machine leg :3013) + dex-e2e (:5557) + oidc-dev (:5558) + mongo
make e2e-test    # 12-check smoke suite + 6-check OIDC suite
make e2e-down    # ⚠️ destructive: removes volumes (disposable DB by design)
make e2e-logs    # tail the stack
```

The OIDC suite validates discovery/JWKS for both issuers, the full PKCE login flow,
`client_credentials` for the machine leg, and a real 403 for unauthenticated history
access.

## Documentation conventions

Requirements and specifications are first-class documents, kept separate:

| Directory | Contents | Naming |
|---|---|---|
| `docs/requirements/` | Product requirements (what must be fulfilled) | `YYYY-MM-DD_REQ-NNN_slug.md` |
| `docs/specs/` | Implementation specs (how it is fulfilled) | `YYYY-MM-DD_SPC-NNN_slug.md` |
| `docs/investigations/` | Triage/root-cause reports with evidence | `YYYY-MM-DD_INV_slug.md` |

Traceability chain: **REQ → SPC → code → investigation**, cross-linked.

## Relationship with upstream

- **Merged upstream**: PR [#1](https://github.com/anaskasmi/local-pm/pull/1)
  (tsconfig build fix), PR [#5](https://github.com/anaskasmi/local-pm/pull/5)
  (keyboard drag a11y).
- **Open upstream**: PR [#12](https://github.com/anaskasmi/local-pm/pull/12) (missing
  `(payload)/layout.tsx`), PR [#13](https://github.com/anaskasmi/local-pm/pull/13)
  (read-ACL parity in RSC), RFC
  [#15](https://github.com/anaskasmi/local-pm/issues/15) — fleet-level enhancements:
  audit history (flagship), identity actors, OIDC + E2E stack (one package), MCP server.
- **Sync policy**: upstream uses root `src/` + npm; this fork is a pnpm workspace. The
  trees cannot be merged, so changes are **ported commit-wise** with full gates
  (`pnpm verify` + browser verification) on both sides.
- **Pending**: distinguished-actors feature PR sequenced after upstream PR #14
  (assignees/people model) merges.

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **Backend**: Payload CMS 3.x
- **Database**: MongoDB
- **Auth**: Payload local auth + OIDC (Dex, node-oidc-provider)
- **MCP Server**: TypeScript, @modelcontextprotocol/sdk
- **E2E**: Docker Compose overlay project + bash test suites

## Special Thanks

Built with [Payload CMS](https://payloadcms.com/) — upstream project by
[anaskasmi](https://github.com/anaskasmi/local-pm).
