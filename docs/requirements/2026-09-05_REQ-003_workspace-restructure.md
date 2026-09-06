# REQ-003 — Repository restructure per best practices (no monkey patching)

| | |
|---|---|
| **ID** | REQ-003 |
| **Date** | 2026-09-05 |
| **Status** | IMPLEMENTED (2026-09-06) — executed via [SPC-002](../specs/2026-09-05_SPC-002_workspace-restructure.md) on branch `feat/workspace-restructure`; Verification items all green. |
| **Type** | Requirement |
| **Related** | PR anaskasmi/local-pm#1 (stopgap vigente) · `mcp-server/` · `tsconfig.json` |

---

## Current state (evidence, 2026-09-05)

- `mcp-server/` lives as a package nested inside the Next.js app repo, with its own `package.json`/`tsconfig.json` not integrated into a workspace.
- Documented real collision: the root tsconfig's `**/*.ts` dragged `mcp-server/src` into the build's type-check (proof: Docker build exit 1 at `9848720`; fix in PR #1).
- PR anaskasmi/local-pm#1 (`fix: exclude mcp-server from Next.js type-check`) is correct as a PATCH and accepted as a stopgap, but it attacks the symptom, not the structure: the root cause is the poorly defined package boundary.
- The subpackage's dependencies do not resolve reliably in the app build's context (evidence: the build error itself).

## Requirement

- **REQ-003.1:** Restructure the repository per JS/TS monorepo best practices (workspace manager — npm/pnpm workspaces —, explicit package boundaries, per-package type-check and build, shared tooling where applicable), researching as needed before executing.
- **REQ-003.2:** The MCP server must be a first-class package: reproducible independent build, no leakage into the app's type-check/build, no implicit cross-dependencies.
- **REQ-003.3:** Monkey patching is forbidden as the final solution: the PR #1 patch remains the temporary mitigation in force until REQ-003 is implemented.
- **REQ-003.4:** This rework remains REQUIREMENT ONLY as of today — no execution schedule until the user decides (see D-R3).

## Verification

- `docker compose up -d --build` green with no ad-hoc exclude in the root tsconfig.
- The MCP server build runnable in isolation from its package.
- Workspace structure documented in the fork README.

## Pending user decision

| ID | Decision |
|---|---|
| D-R3 | REQ-003 execution timing (post-merge of PR #1 and the audit trail module, or a different order) |
