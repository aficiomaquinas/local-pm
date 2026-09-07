# Spec — Testing strategy (unit-first, mocked API contract, build-integrated)

| | |
|---|---|
| **Repo** | `local-pm` (fork local: `aficiomaquinas/local-pm`) |
| **ID** | SPC-003 |
| **Date** | 2026-09-06 |
| **Status** | APPROVED (2026-09-06) — **Option B** (Unit + mocked API-contract). Implementation authorized: branch `feat/testing`, sequenced after wave-1 stabilization (§5.3 build integration included). |
| **Type** | Spec (how it is implemented; scope-of-testing decisions proposed as alternatives in §6) |
| **Resolves** | — (no parent REQ; this spec originates a scope, it does not resolve one) |
| **Related** | [SPC-002 — Workspace restructure](../specs/2026-09-05_SPC-002_workspace-restructure.md) (the pnpm workspace this strategy plugs into) · [SPC-001 — Audit trail & restore](../specs/2026-09-05_SPC-001_audit-trail-restore.md) (consumer of the future integration tier) |
| **Scope driver** | Operator instruction (2026-09-06, TODO track): unit testing YES; integration probably NOT for now; E2E NOT in scope but API usage must be covered, possibly with mocks; tests must run as part of the same build. Goal: increase certainty and correctness per professional best practices. |

> **Note on the docs index:** `docs/README.md` requires adding a new document to
> its index "in the same commit". The write scope of this research phase
> (exactly one file) forbids touching `docs/README.md`; the pending index row
> is recorded in §8 and is to be applied in the implementation commit.

---

## 1. Objective

Define the testing strategy for `local-pm` — which test types are in scope,
which are explicitly deferred and where the boundary lies, which specific tests
are proposed per package, and how tests hook into the same build that produces
the artifacts — with the goal of increasing certainty and correctness per
professional best practices.

This spec implements nothing: no test code, no configs, no `package.json`
entries, no CI files. It is the decision document; §8 states the acceptance
criteria the future implementation must satisfy.

Non-negotiable operator constraints carried into this spec:

1. **Unit testing: in scope.**
2. **Integration testing: deferred** ("probably not for now") — but the
   boundary of what counts as integration must be defined here (§4.3).
3. **E2E browser testing: out of scope** — but API usage must be covered,
   possibly with mocks (§4.2: the mocked API-contract tier is the answer).
4. **Tests run as part of the same build** (§5 defines how, spec-level only).
5. The spec must propose **scope alternatives** for the operator to choose
   (§6: Options A/B/C with trade-offs).

## 2. Current-state evidence (verified in the repo, 2026-09-06)

Branch `feat/workspace-restructure`, clean, HEAD `a3161cb`. All rows below
verified by direct local read (no web citation needed).

| Fact | Evidence |
|---|---|
| Zero test dependencies anywhere | ripgrep over all `package.json`/`pnpm-lock.yaml` for `vitest\|jest\|playwright\|mocha\|msw\|nock\|supertest\|testing-library` matches only the lockfile hash lines — no devDependency, no transitive test runner in either package |
| No test scripts, no test files | root `package.json` scripts: build/dev/mcp:build/mcp:dev/seed/start/payload/generate:types/generate:importmap — no `test`; same for `apps/web` and `packages/mcp-server`; no `*.test.*`/`*.spec.*` files exist |
| Package 1: web app | `apps/web` (`local-pm-web`): Next.js `^15.4.10`, Payload `^3.68.4`, `@payloadcms/db-mongodb` (MongoDB), React `^19.2.1`, GraphQL `^16.12.0`, Tailwind 4, `tsx ^4.21.0` for seed scripts; `"type": "module"`; build = `cross-env … next build` |
| Package 2: MCP server | `packages/mcp-server` (`@local-pm/mcp-server`): `@modelcontextprotocol/sdk ^1.12.1`, `"type": "module"`, `build = tsc && chmod 755 dist/index.js`, bin `local-pm-mcp`, isolated tsconfig (NodeNext, outDir dist, rootDir src, include `src/**/*`) |
| Package boundary: HTTP only | the two manifests declare NO dependency on each other; the only interface is `LOCAL_PM_URL` (default `http://localhost:3010`) over Payload REST — set in `packages/mcp-server/src/index.ts` (`BASE_URL`) |
| MCP surface | a single `src/index.ts` (1084 lines), low-level SDK `Server` API, `server.setRequestHandler(ListToolsRequestSchema/CallToolRequestSchema, …)`, plain `fetch` to the REST API; **19 tools**: `list_projects`, `get_project`, `create_project`, `update_project`, `delete_project`, `list_teams`, `get_team`, `create_team`, `update_team`, `delete_team`, `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `move_ticket`, `delete_ticket`, `get_board`, `toggle_subtask`, `add_subtask`; status mapping Payload-UPPER → MCP-lowercase; a central `response.ok` check throws on HTTP errors |
| Web source surface | `src/` = `app/`, `collections/` (Projects, Teams, Tickets), `components/`, `hooks/`, `types/`, `payload.config.ts`, `payload-types.ts`, `seeds/` |
| Build orchestration (from SPC-002) | root is a private pnpm orchestrator: `"build": "pnpm -r build"` (topological); `pnpm-lock.yaml` is the single lockfile; engines `node>=20.9.0`, `pnpm>=10` |

**Conclusion:** greenfield testing setup — every decision (runner, layout,
scope) is open, and nothing existing needs to be migrated or un-broken.

## 3. Research findings

Methodology (operator mandate): semantic web search first (donsetch); fetch
only of URLs that appeared in search results or of official docs referenced
from those results. Every external claim carries a citation in §10.

### 3.1 The reference model: the test pyramid

- The Test Pyramid (Mike Cohn, popularized by Fowler) groups tests into
  buckets of different granularity — many small fast unit tests at the base,
  fewer coarse-grained tests in the middle, very few end-to-end tests on top;
  the two rules to remember: *write tests with different granularity* and *the
  more high-level you get, the fewer tests you should have* [7].
- Unit tests should run very fast and avoid hitting databases, the filesystem
  or firing HTTP queries — those collaborators get replaced with mocks/stubs;
  a *solitary* unit test stubs all collaborators, a *sociable* one lets real
  in-process collaborators run; both are legitimate unit tests [7].
- Automated tests only deliver certainty when they run automatically in a
  build pipeline: continuous delivery means a build pipeline automatically
  tests the software, so "is it broken?" is answered in minutes, not weeks [7].

**Reading for local-pm:** the pyramid supports exactly the operator's
instinct — a broad base of fast unit tests now; service/integration tests
deferred; the top (E2E) empty for the time being. And "part of the same build"
is not an extra — it is the definition of the pipeline model itself [7].

### 3.2 Payload 3.x: how its ecosystem tests collections/hooks/REST

- **There is no dedicated "Testing" page in the official Payload 3.x docs** as
  of 2026-09-06: the full docs index served at `payloadcms.com/llms.txt` —
  Basics, Configuration, Database, Fields, Access Control, Hooks, Local API,
  REST, GraphQL, Queries, Features, TypeScript, Ecosystem, Deployment —
  contains no Testing entry [9]. This is consistent with a Payload maintainer
  statement (r/PayloadCMS, Sep 2025): docs in this area were still pending,
  and until then the recommended path was the **blank template's setup:
  integration tests with Vitest and E2E with Playwright**, configs at the
  template top level [2].
- The official Payload community-help archive (answer by a Payload team
  member) documents the canonical in-process pattern for testing Payload code:
  call **`payload.init` inside the test suite** (`beforeAll`) before any Local
  API call; seeding via the test itself or the config's `onInit`; and — key
  for this spec — *Payload will automatically attempt to use
  **mongodb-memory-server** if it is locally installed **and** `NODE_ENV` is
  `test`* [1]. (This answer predates Payload 3 — see §10 caveat.)
- What Local API is, mechanically: it executes *the same operations that are
  available through REST and GraphQL within Node, directly on your server* —
  initialized via `getPayload({ config })`; by default Local API operations
  run with access-control checks **disabled** (`overrideAccess: true`) unless
  re-enabled with an explicit user [10].
- Payload's own repository runs its test suite on **Vitest** (root
  `vitest.config.ts`; observed in this research's search results — not
  fetched; **unverified**).

**Classification reading:** a test that boots the real Payload config against
a (in-memory) MongoDB and drives operations — whether via Local API or via the
HTTP server — exercises the DB adapter, hooks and the request pipeline; by the
pyramid's granularity criterion [7] it is **integration**, not unit. The
in-memory Mongo harness changes the *cost*, not the *category*. Therefore the
operator's "integration not for now" excludes exactly this tier from the
initial scope (§4.3, §6).

### 3.3 Next.js 15: what is unit-testable and what is not

- Next.js's official unit-testing guide is written for **Vitest + React
  Testing Library**, with an official `with-vitest` example; setup is a
  `vitest.config.mts` and a `test: "vitest"` script [3].
- The decisive scope caveat, verbatim from the official guide: *"Since `async`
  Server Components are new to the React ecosystem, Vitest currently does not
  support them. While you can still run unit tests for synchronous Server and
  Client Components, we recommend using **E2E tests** for `async`
  components."* [3].

**Reading for local-pm:** the app's pages are async server components (they
fetch via Local API/REST) — per Next.js itself they are E2E territory, which
the operator already excluded. So the web app's honest unit scope is:
synchronous components, pure utilities/validators, and pure access-control
predicate functions — nothing that requires a booted Payload runtime (that is
integration, deferred).

### 3.4 MCP servers: the official testing pattern

- The MCP Python SDK's official Testing page prescribes the pattern for MCP
  tool tests: create a **connected server-and-client session over an
  in-memory transport** and call tools through a real `ClientSession`
  (`client_session.call_tool("add", {...})`) — i.e. exercise the server
  through the MCP protocol itself, in-process, without network [4].
- The TypeScript SDK equivalent: v1.x (the line local-pm uses, `^1.12.1`) is
  the stable-maintenance line with its docs at `ts.sdk.modelcontextprotocol.io`
  and its source/examples in the official monorepo [5]; servers connect to
  transports such as stdio or Streamable HTTP [11]. The v1 SDK ships
  in-memory transports usable for the same client-session pattern, but the
  exact v1 import path is **unverified** in this research (the fetched v1 docs
  do not document it; see §10).
- Third-party guides (e.g. signadot) describe a four-level ladder for MCP
  testing — unit, in-memory protocol tests, integration against real deps,
  Inspector/manual — consistent with the official in-memory pattern [search
  result only, not fetched; **unverified**].

**Reading for local-pm:** mcp-server tool handlers can be tested at two
granularities that are BOTH non-integration:
(a) **handler-level with mocked `fetch`** — the handler is the unit; the REST
API is an external collaborator and gets a test double, exactly as the pyramid
prescribes [7];
(b) **protocol-level with in-memory transport** — ListTools/CallTool
round-trips through a real MCP client session in-process [4], with HTTP still
mocked. Both run in milliseconds with zero infrastructure.

### 3.5 Test runner: Vitest vs Jest for this monorepo

| Dimension | Vitest | Jest |
|---|---|---|
| Next.js official guidance | the current official unit-testing guide is written for Vitest (+RTL), with an official example [3] | a Jest guide exists (legacy path, `15/app/guides/testing/jest` [3] index), but the Vitest one is the featured setup |
| Payload ecosystem | Payload's own repo tests on Vitest; maintainer-recommended blank template uses Vitest for int + Playwright for e2e [2] (repo's own use of Vitest: search-result observation, **unverified**) | the historical Payload testing material (blog tutorial behind the official community answer [1]) is Jest-era |
| Monorepo support | native **Test Projects**: multiple project configurations in a single Vitest process, "particularly useful for monorepo setups"; the former `workspace` option is deprecated since 3.2 and replaced by `projects` (functionally the same); `--project` CLI filter selects suites; root config is not itself a project (only global options like reporters/coverage) [6] | no first-party equivalent; multi-package setups need third-party stitching (e.g. Jest projects in each package + a root runner script) |
| ESM/TS fit here | Vite-native transform; both packages are `"type": "module"` and the repo leans TSX/tsconfig-paths — Vitest consumes TS/ESM directly | ESM support remains config-heavy (transform/instrumentation quirks), a known friction area (general knowledge; **unverified** here) |
| Current stable | 5.0.0 (local check: `npm view vitest version`, 2026-09-06 — terminal verification, not a web citation) | 30.x (not checked) |

**Decision D-SPC3-1 — Vitest.** The decisive authoritative fact: **Next.js's
official unit-testing guide is written for Vitest and ships an official
example [3]** — that alone settles it for a Next.js 15 app — reinforced by
Vitest's first-party monorepo feature (`test.projects`, one process, per-suite
configs, `--project` filtering [6]) which no other candidate offers natively.

**Evaluated alternative:** Jest. Mature, and the historical Payload testing
material was Jest-based [1]. Rejected as primary because it loses on all three
decisive rows above (Next.js featured guidance, monorepo projects, ESM fit);
it remains the fallback if a Vitest/Next.js edge case ever blocks the web
package (e.g. a plugin conflict) — the per-package script layout of §5.2 makes
swapping one package's runner cheap.

### 3.6 Tests as part of the build: the canonical order

- GitHub's official Node.js CI guide fixes the canonical pipeline order:
  install dependencies (`npm ci`) → `npm run build --if-present` → `npm test`
  — build first, then tests, in one job; a failing step fails the workflow
  [8].
- The pipeline model is what turns tests into certainty: a build pipeline
  automatically tests every change so breakage is known in minutes [7].

**Reading for local-pm:** "tests as part of the same build" maps to: one
composed command chain (build → test) at the root, executed identically by
Docker's builder stage today and by CI when it exists (§5.3). Tests do not go
inside the `build` script itself (that would tax every routine build) — they
ride the same pipeline stage that gates the artifact.

## 4. Proposed testing architecture: types, boundaries, what each covers

Four test types are defined HERE, precisely, for these two packages. Every
proposed test in §7 is labeled with one of these labels. This vocabulary is
normative for the repo.

### 4.1 T1 — Unit (IN SCOPE from day one)

**Definition (local-pm):** a test that exercises one module/function/class in
isolation, with **no MongoDB, no network, no filesystem, no booted Payload
runtime**; slow or side-effectful collaborators (HTTP, DB) are replaced with
test doubles [7]. Sub-ms to ms each; the suite must pass offline.

- **web:** pure utilities and validators under `src/` (formatters, status
  color maps, sorting/filtering helpers), synchronous React components (RTL,
  per Next.js official guidance [3]), pure access-control predicate functions
  (functions of `(req, user)` that don't query).
- **mcp-server:** pure helpers — Payload-UPPER→MCP-lowercase status mapping,
  REST URL/query-string builders, error-shape mapping, tool-argument
  validation logic.
- **Explicitly NOT unit** here: anything importing `payload.config.ts` and
  calling `getPayload`/`payload.init` (→ T3); async server-component pages
  (→ not testable as unit per Next.js [3]; → T4 territory).

### 4.2 T2 — Mocked API-contract unit (IN SCOPE from day one; answers "API usage must be covered")

**Definition (local-pm):** still a unit test by granularity [7] — the subject
is one package's boundary code — but with the external HTTP collaborator
replaced by a **canned, checked-in double that encodes the counterpart's real
response shapes** (success, error, and malformed variants). No network. This
is how mcp-server's usage of the Payload REST API is covered without
integration tests, per the operator's "possibly with mocks".

- **mcp-server:** every tool handler called with mocked global `fetch`
  returning canonical Payload REST JSON (`docs`/`totalDocs` envelopes, Payload
  error bodies); asserts the handler's request (URL, method, query, body) and
  its MCP response (`content`, status mapping, error propagation).
- **web:** `fetch`-consuming client helpers (if any) in server components /
  route handlers, same technique — when the operator later enables T3, these
  doubles are recycled as the contract oracle.
- **Boundary to T3:** T2 verifies that mcp-server speaks the REST dialect the
  app speaks *as recorded*; only T3 can catch the app changing underneath the
  recordings. That residual risk is accepted while T3 is deferred (§4.3) and
  is the main argument of Option C (§6).
- **Recommended mechanism:** Vitest's built-in module/global mocking
  (`vi.stubGlobal('fetch', …)` / `vi.mock`) — zero extra dependencies.
  Alternatives (dedicated HTTP-mock libraries such as MSW, or undici
  MockAgent) exist but were not researched here (**unverified**); they can be
  adopted later without changing the T2 definition.

### 4.3 T3 — Integration (DEFINED but DEFERRED — operator: "probably not for now")

**Definition (local-pm):** a test that boots the **real Payload runtime**
(`getPayload({ config })` [10]) against a **real (in-memory) MongoDB**
(mongodb-memory-server per the Payload-canonical setup [1]) and exercises
collections, hooks, access control, versions and/or the actual REST endpoint
through real HTTP. It is distinguished from T2 by exactly one property: **the
collaborator under the boundary is real, not a double.**

- What it would add: hook execution order, MongoDB adapter behavior (queries,
  sort, pagination), versions pipeline (SPC-001 surface), real access-control
  enforcement, REST responses drifting from T2's recordings.
- Canonical pattern (for later implementation): `payload.init`/`getPayload` in
  `beforeAll`, seeding via test or config `onInit`, `NODE_ENV=test` +
  locally-installed mongodb-memory-server triggers the in-memory DB [1]
  (caveat: that guidance is Payload 2-era — re-verify at implementation).
- Why deferred: infrastructure + runtime cost (in-memory Mongo download,
  slower suites, flake surface — Payload's own repo retries flaky integration
  tests in CI, a search-result snippet [**unverified**]); and current
  unit+contract coverage yields the best certainty-per-minute first (§6).
- **This spec still requires:** the T1/T2 test layout must not preclude T3 —
  §5.1 reserves the `tests/` convention per package, and §7 marks the hooks
  that are waiting for this tier.

### 4.4 T4 — End-to-end browser (OUT OF SCOPE; defined for the boundary only)

**Definition (local-pm):** a test that drives a real browser against the
running app (Playwright-class). Out of scope now, per operator. Boundary
consequences, per Next.js's own guidance [3]:

- async Server Components pages (the whole `(frontend)` surface) are the
  canonical E2E subjects — they are NOT unit-testable [3]; until T4 exists,
  their logic lives in tested pure helpers (T1) and their data layer in T2/T3.
- The MCP server's real-transport path (stdio handshake against a booted app)
  is likewise a broad-stack test (T4-class) and stays out; the in-memory
  protocol round-trip of T2 covers the protocol logic.

## 5. Runner + monorepo config proposal (definition only — no implementation)

### 5.1 Runner and layout (D-SPC3-1)

- **Runner: Vitest** (justification and alternative in §3.5). Pin the same
  major across the workspace; devDependency **per package** (each package
  stays self-contained per SPC-002's boundary philosophy).
- **Test file layout: `tests/` directory per package** (`apps/web/tests/**`,
  `packages/mcp-server/tests/**`, files `*.test.ts`). Rationale: the build
  tsconfigs (`include: src/**/*` for mcp-server; Next's app tsconfig) stay
  untouched — tests never enter `tsc`/`next build`; alternative colocated
  `*.test.ts` would require adding excludes to build configs. Helper fixtures
  (canned REST payloads, in-memory MCP wiring) live in `tests/helpers/`.
- **Per-package configs**: `apps/web/vitest.config.ts` (with
  `@vitejs/plugin-react`, `vite-tsconfig-paths`, `environment: jsdom` for the
  component suites — per official Next.js setup [3]; node environment for pure
  helpers) and `packages/mcp-server/vitest.config.ts` (`environment: node`).
- **Alternative considered:** one root `vitest.config.ts` with
  `test.projects: ['apps/*', 'packages/*']` running everything in a single
  process — fewer moving parts, one shared reporter/coverage, and officially
  designed for monorepos [6]. Rejected as primary for now: it couples both
  packages' test config to the root, inverting SPC-002's "each package
  compiles in isolation" principle, and the workspace has only two packages —
  the per-package layout can graduate into a root `projects` config later with
  zero test changes if suite count grows. This trade-off is offered to the
  operator in §6 as part of each option's cost line.

### 5.2 Script composition (definition)

```jsonc
// root package.json (proposed additions — NOT applied by this spec)
{
  "scripts": {
    "test": "pnpm -r test",                    // each package runs its own vitest; nonzero exit propagates
    "verify": "pnpm -r build && pnpm -r test"  // THE build gate: build first, then tests
  }
}

// apps/web/package.json        → "test": "vitest run"
// packages/mcp-server/…        → "test": "vitest run"
```

- `vitest run` (not watch) in scripts: CI/build semantics; developers use
  `pnpm --filter <pkg> exec vitest` for watch mode.
- `pnpm -r test` skips packages without a `test` script automatically, so
  adding tests incrementally never breaks the root command.

### 5.3 How tests ride the same build (CI-order proposal — definition only)

Three execution surfaces, one order, per the canonical Node CI sequence
install → build → test [8]:

1. **Docker builder stage (today's real "build"):** inside the existing
   multi-stage `Dockerfile` (SPC-002 §4.5), after `pnpm install
   --frozen-lockfile` and the mcp-server build, insert
   `RUN pnpm -r test` before the final web build (or, equivalently, replace
   the web `RUN pnpm --filter local-pm-web build` with
   `RUN pnpm verify`). A red suite breaks `docker compose up -d --build` —
   tests are literally part of the same build that produces the image.
2. **Local gate (developer):** `pnpm verify` before pushing; convention
   documented in the fork README at implementation time.
3. **CI (future — NOT implemented by this spec):** when a workflow exists
   (GitHub Actions), it follows the official Node.js order [8]:
   checkout → `pnpm install --frozen-lockfile` (pnpm via corepack; official
   docs show `npm ci → npm run build --if-present → npm test` for the
   npm case [8]) → `pnpm -r build` → `pnpm -r test`. No workflow file is
   authorized by this spec.

**Anti-pattern explicitly rejected:** hooking tests into `prebuild`/inside the
`build` script itself — it would tax every incremental build (Next builds are
the repo's slowest operation, ~minutes) and train developers to skip builds.

## 6. Scope ALTERNATIVES (operator chooses)

Three tiers. Each includes the previous one. All options implement §5's runner
and build integration — the options differ in **what is tested**, not how.

| | **Option A — Unit-only minimal** | **Option B — Unit + mocked API-contract** | **Option C — Full incl. integration** |
|---|---|---|---|
| T1 unit | both packages (§7 items labeled T1) | same | same |
| T2 mocked API-contract | — | **all 19 MCP tools** + protocol round-trip + web fetch-helpers (§7 T2 items) | same |
| T3 integration (Payload + in-memory Mongo) | — | — | hooks, access control, versions pipeline, REST round-trip [1] |
| T4 e2e browser | — | — | — (still out per operator) |
| New devDependencies (approx.) | vitest (+ react plugin, RTL, jsdom, vite-tsconfig-paths for web) | same as A (mocking via Vitest built-ins) | A + `mongodb-memory-server` (+ its Mongo binary download) |
| Suite runtime | seconds | seconds (still no I/O) | tens of seconds–minutes; flake surface (retries) |
| Risk reduction | catches pure-logic regressions (status maps, builders, validators, sync components) | + catches every mcp-server↔REST contract drift as *recorded*; the entire MCP tool surface becomes regression-safe; highest certainty-per-cost | + catches DB-adapter/hook/access-control reality drift — including T2 recordings going stale |
| Residual risk | REST contract untested — mcp-server breakage ships silently | real app drifting from the recorded shapes (mitigated: recordings checked into `tests/helpers/` are reviewed in PRs; T3 later absorbs them) | cost + maintenance; needs the deferred Payload 3-era harness verification (§4.3) |
| Operator intent fit | partial (unit yes, but API usage uncovered) | **full fit** (unit ✓, integration deferred ✓, API usage covered with mocks ✓) | exceeds current intent (integration now) |

**RECOMMENDATION (labeled as such — the operator decides): Option B.**

Rationale: it satisfies every stated operator constraint exactly — unit in,
integration deferred with its boundary defined (§4.3), e2e out while API usage
is covered via mocks (§4.2), tests in the same build (§5.3) — and it converts
the repo's two real risk surfaces (the 19-tool MCP↔REST contract and the
app's pure logic) into regression-safe ground for a few seconds of suite time.
Option A leaves the MCP surface (the repo's most mutation-prone boundary, a
single 1084-line file speaking raw REST) unguarded; Option C buys real but
currently redundant certainty at the highest cost and can be adopted later
without rework — B is designed as C's prefix.

## 7. Specific test inventory proposal (each item labeled with its type)

Conventions: paths under each package's `tests/`; names are proposed test
subjects (implementation may split/merge cases); every item cites its type
per §4. The mcp-server items cover the package boundary the operator explicitly
wants covered ("API usage … possibly with mocks").

### 7.1 `packages/mcp-server` (the priority package — 100% of its tool surface)

| # | Test subject | Type | Key assertions |
|---|---|---|---|
| M1 | Status mapping (Payload `UPPER` → MCP lowercase; unknown values) | T1 | pure map correctness; fallback for unmapped status |
| M2 | REST URL + query-string builders per endpoint (collection, `where` filters, `sort`, `limit`/`page`) | T1 | exact URL/encoding for representative filters; default `BASE_URL` from `LOCAL_PM_URL` |
| M3 | HTTP error mapping: `fetch` → `!response.ok` branch (401/404/500 bodies) | T2 | MCP error content shape; no throw-escape; message contains status |
| M4 | Malformed response handling (non-JSON body, missing `docs`) | T2 | graceful MCP error, not a crash |
| M5 | `list_projects` / `get_project` handlers | T2 | request (method/path/query/body) asserted against mock; Payload envelope → MCP `content` |
| M6 | `create_project` / `update_project` / `delete_project` handlers | T2 | body mapping (fields → REST payload); success + error paths |
| M7 | `list_teams` / `get_team` / `create_team` / `update_team` / `delete_team` | T2 | as M5–M6, team fields |
| M8 | `list_tickets` (filters: status/team/project/pagination) | T2 | `where` composition asserted |
| M9 | `get_ticket` / `create_ticket` / `update_ticket` / `delete_ticket` | T2 | as M5–M6, ticket fields (incl. subtasks array) |
| M10 | `move_ticket` (status transition + board ordering payload) | T2 | transition request shape; invalid-move error path |
| M11 | `get_board` (aggregate response → board content) | T2 | multi-document envelope mapping |
| M12 | `toggle_subtask` / `add_subtask` (nested array update semantics) | T2 | PUT/PATCH body construction; not-found path |
| M13 | Protocol round-trip: `ListToolsRequest` → 19 tools, names/schemas well-formed | T2 (in-memory MCP client session [4]; transport path in v1 SDK **unverified** — §10) | tool list stable; input schemas parse |
| M14 | Protocol round-trip: `CallToolRequest` dispatch (known tool → handler; unknown name → MCP error) | T2 | routing correctness through real SDK plumbing, HTTP mocked |

### 7.2 `apps/web` (unit only while T3 is deferred)

| # | Test subject | Type | Key assertions |
|---|---|---|---|
| W1 | Pure utilities in `src/` (formatters, sorters, filter helpers — inventory at implementation) | T1 | input→output tables; edge cases (empty, undefined) |
| W2 | Status/color maps used by board rendering | T1 | every collection status has a rendering |
| W3 | Pure access-control predicates (current `() => true` set — trivial now, valuable the day REQ-002 lands) | T1 | predicate truth-table per user shape |
| W4 | Synchronous client components (pure presentational; via RTL + jsdom per official Next.js setup [3]) | T1 | render given props; no server dependencies |
| W5 | Collection hooks (`beforeChange`/`afterChange` in Projects/Teams/Tickets) | **T3 — deferred** (boots real Payload [1][10]; listed so the deferral is explicit) | hook effects on documents |
| W6 | `/api/history` route handler (SPC-001 aggregation) | **T3 — deferred** (needs payload runtime; alternatively a thin pure merge/sort helper can be extracted and tested as T1 now) | merge + pagination of 3 version streams |
| W7 | Async server-component pages | **T4 — out of scope** per Next.js guidance [3]; logic extracted to W1-style helpers instead | — |

## 8. Acceptance criteria for FUTURE implementation (verifiable)

Implementation is NOT authorized by this spec. When it is, and follows the
option the operator picks, these must all hold:

1. `pnpm test` at the root executes every package suite and **exits nonzero
   on any failure** (and on any package with zero tests, once scripts exist).
2. `pnpm verify` = `pnpm -r build && pnpm -r test`, in that order, is green;
   the Docker builder stage runs it — a deliberately broken test makes
   `docker compose up -d --build` fail (the "same build" requirement).
3. **Offline determinism of T1/T2:** the full suite passes with no MongoDB
   reachable and no network; grep-provable: no test file references
   `localhost:3010` as a live target (mocks only).
4. (Option B/C) Every one of the **19 tools** of `packages/mcp-server` has at
   least one T2 test asserting BOTH the outgoing REST request (method, path,
   query, body) and the MCP response shape (M5–M14).
5. Test files live under `packages/*/tests/**` and are excluded from build
   artifacts: `pnpm -r build` output (`apps/web/.next`, `packages/mcp-server/dist`)
   contains no test code; the mcp-server `tsconfig` `include` is unchanged.
6. No production data risk: tests never point at a real `DATABASE_URI`/running
   app (T1/T2 make this structural; T3 later uses in-memory Mongo [1]).
7. The chosen §6 option is recorded in this document's Status line
   (DRAFT → APPROVED with the option noted), and `docs/README.md`'s index
   gains the row: `SPC-003 | Testing strategy | DRAFT/APPROVED` (pending row —
   deliberately not added during this research phase).
8. Nothing else changes: tool behavior, public interfaces and build outputs
   are identical before/after (tests are additive; conventional commits,
   e.g. `test(mcp): contract tests for ticket tools`).

## 9. Explicit non-goals

- **No E2E / browser automation** — no Playwright/Cypress, now or in this
  spec's scope; async Server Components stay untested-as-components [3].
- **No integration tests for now** — T3 is defined (§4.3) but not built; no
  mongodb-memory-server dependency lands under Options A/B.
- **No CI implementation** — no workflow files; §5.3 item 3 is a definition
  for a future spec/implementation.
- **No production-code changes** — no refactor of the 1084-line
  `mcp-server/src/index.ts`, no new abstractions "for testability" (extract
  pure helpers only if a test needs one, and that is implementation-time
  judgment).
- **No coverage thresholds / mutation testing** — metrics without a baseline
  first; revisit once suites exist.
- **No runner per package experimentation** — one runner (Vitest) workspace-
  wide; Jest stays the documented fallback (§3.5), not a parallel setup.

## 10. References

Research 2026-09-06 — methodology: web search (donsetch) first; fetch only of
URLs returned by those searches or official docs referenced from them. Local
facts (§2) are direct repo reads and carry no web citation. Terminal
verification: `npm view vitest version` → 5.0.0 (2026-09-06).

1. https://payloadcms.com/community-help/github/run-test-on-local-api —
   *Run test on local api | Community Help* (official Payload community-help
   archive; answer by Payload team member denolfe). Contributed: the
   canonical in-process test pattern — `payload.init` inside the suite's
   `beforeAll`, seeding via test or config `onInit`, and automatic
   mongodb-memory-server use when installed locally with `NODE_ENV=test`.
   Caveat: the thread predates Payload 3; the auto-use condition is
   **unverified for 3.68.x** and must be re-verified at any T3 implementation.
2. https://www.reddit.com/r/PayloadCMS/comments/1necfs6/how_do_i_properly_test_a_payload_application —
   *How do I properly test a Payload application? (r/PayloadCMS, 2025)*.
   Contributed: maintainer acknowledgment that official testing docs were
   still pending for v3, and the interim recommendation — the blank template's
   integration tests with **Vitest** and e2e with Playwright.
3. https://nextjs.org/docs/app/guides/testing/vitest.md — *How to set up
   Vitest with Next.js* (official Next.js guide; fetched via the `.md` variant
   surfaced in search results). Contributed: Vitest + React Testing Library as
   the official unit-testing setup; the verbatim caveat that **Vitest does not
   support async Server Components** (E2E recommended there) — the basis of
   §4.4 and W7; config and script shape for §5.1.
4. https://py.sdk.modelcontextprotocol.io/v1/testing/ — *Testing MCP Servers*
   (official MCP Python SDK docs). Contributed: the official in-memory
   server+client session testing pattern for MCP tools (protocol-level tests
   without network) — the model for M13/M14.
5. https://github.com/modelcontextprotocol/typescript-sdk — *MCP TypeScript
   SDK (official repo README)*. Contributed: v1.x is the maintenance line with
   docs at ts.sdk.modelcontextprotocol.io; v2 is the new stable line — context
   for testing against SDK `^1.12.1` without migrating.
6. https://vitest.dev/guide/projects — *Test Projects | Vitest Guide* (current
   official docs, 2026-08-18). Contributed: `test.projects` (the
   `workspace` option deprecated since 3.2) — multiple project configurations
   in one Vitest process, designed for monorepos; `--project` filtering; root
   config holds only global options. Basis of §3.5's runner decision and
   §5.1's alternative.
7. https://martinfowler.com/articles/practical-test-pyramid.html — *The
   Practical Test Pyramid* (Fowler). Contributed: granularity buckets and
   ratios (many unit, few high-level); unit tests avoid DB/filesystem/HTTP
   with doubles for slow collaborators (solitary vs sociable); automated
   tests + build pipeline as the definition of delivery certainty. The model
   behind §4's tier definitions and §6's shape.
8. https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs —
   *Building and testing Node.js* (official GitHub Actions docs). Contributed:
   the canonical CI order install → `npm run build --if-present` → `npm test`
   — the authority for §5.3's build-then-test composition.
9. https://payloadcms.com/llms.txt — *Payload docs index (llms.txt)*, fetched
   in full. Contributed: negative finding — the official Payload 3.x docs
   contain **no Testing page** (index verified end to end), which is why this
   spec's Payload testing claims rest on the community archive [1], maintainer
   statements [2] and the Local API reference [10].
10. https://payloadcms.com/docs/local-api/overview — *Local API | Payload
    Documentation* (search result → fetched). Contributed: Local API executes
    the same operations as REST/GraphQL in-process via
    `getPayload({ config })`; access control is bypassed by default
    (`overrideAccess: true`) — both facts shape the T3 definition (§4.3) and
    the W3/W5 classification.
11. https://ts.sdk.modelcontextprotocol.io/ — *MCP TypeScript SDK (v1) docs*.
    Contributed: v1 transport surface (stdio / Streamable HTTP / SSE) —
    confirms the server-under-test connects via transports, which in-memory
    testing replaces.

**Explicitly unverified items** (labeled where used, collected here):

- mongodb-memory-server auto-use conditions (`NODE_ENV=test` + local install)
  come from a Payload 2-era answer [1]; unverified for Payload 3.68.x.
- Payload's own monorepo runs Vitest with CI retries for flaky integration
  tests: search-result snippet of `payloadcms/payload`'s `vitest.config.ts`,
  not fetched.
- The exact import path for in-memory transports in `@modelcontextprotocol/sdk`
  **v1.x** (for M13/M14): the fetched v1 docs do not document it [11]; the
  pattern is officially documented for the Python SDK [4].
- Jest ESM friction as the stated secondary runner argument: general
  knowledge, not sourced here.
- Third-party MCP testing ladders (e.g. signadot's four levels): search result
  only, not fetched, not relied upon.

**Local (direct inspection, no URL):** repo @ `a3161cb` (§2): root/
`apps/web`/`packages/mcp-server` manifests, `packages/mcp-server/src/index.ts`
(19 tools, fetch/LOCAL_PM_URL/handlers), `apps/web/src` tree;
`npm view vitest version` → 5.0.0.
