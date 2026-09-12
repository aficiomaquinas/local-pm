# MCP-first shared framework: contrast analysis and deferral triggers

Date: 2026-09-11
Status: INVESTIGATION — input to a future spec (REQ-001/SPEC-002 lane). This
document authorizes no implementation action.
Scope: `sporeharbor-manager`, `local-pm`, `ttamayocom/ttamayo-facultad`
Author: Hermes session 2026-09-11, operator-directed

## 1. Question

sporeharbor-manager and ttamayo-facultad are both Payload CMS apps with MCP
already connected. Options considered by the operator:

- (a) Extract a shared framework/package abstracting the common MCP stack, so
  the two apps stop maintaining duplicated surface.
- (b) Keep the repos separate and accept some duplication.

Sub-questions: one MCP endpoint per app vs per-consumer endpoints; how
credentials and distinguished operations map onto that choice; identity (OIDC
via local-pm); and how the dev/test story stays honest when the two apps'
auth paths differ (manager: OIDC strategy switch with fallback; local-pm:
initial credentials seed, still landing).

## 2. Verdict (operator decision, 2026-09-11)

**Defer the shared-framework optimization.** Wait for local-pm and
sporeharbor-manager to stabilize (days to a few weeks, depending on the pace
of OIDC and seed work), and keep sharpening the spec in the meantime.
Operator rationale: the decision space contracts geometrically as the product
solidifies along tests, prod/dev separation, and lifecycle — extracting an
abstraction now maximizes rework surface.

This doc records the contrast, the evidence, the testing pitfalls, and
**falsifiable revisit triggers**, so that when the triggers fire the
extraction decision is cheap and evidence-based rather than vibes-based.

## 3. Evidence base (all fetched/verified 2026-09-11 unless noted)

### 3.1 How established FOSS headless CMS ship MCP

| CMS | Model | Source (fetched) |
|---|---|---|
| Payload | Official plugin `@payloadcms/plugin-mcp` (npm latest `3.89.0`, monorepo `payloadcms/payload`; `4.0.0-canary.33` channel active). Streamable HTTP at `/api/mcp`; generic CRUD tools filtered by Payload access control; per-collection tool toggles; custom tools via `defineTool`; auth-strategy hook `overrideGetAuthorizedMCP`; dev-only `?overrideAccess=true` pattern | in-repo docs `docs/plugins/mcp.mdx`; npm registry |
| Strapi | Built-in (`mcp: { enabled: true }`), single `/mcp` endpoint, free tier. Admin-token-scoped: tool visibility, field filtering per action, locale narrowing, runtime enforcement per document, audit logs with `origin: "mcp"` | `docs.strapi.io/cms/features/strapi-mcp-server` |
| Directus | Official server as separate repo `directus/mcp` (83★, MIT, pushed 2026-02) — the only separate-repo model of the four, least mature of the set | GitHub API |
| WordPress | `Automattic/wordpress-mcp` being deprecated in favor of `WordPress/mcp-adapter` (canonical plugin/Composer package); Abilities API entering WordPress core 6.9; JWT + App Passwords, dual STDIO/Streamable | README (fetched) |

Pattern across all four: MCP ships **inside the CMS project** (plugin or
built-in), not as a parallel framework. Strapi demonstrates the
"one endpoint, credentials define the surface" model in production.

### 3.2 Ecosystem trends

- MCP registry on the order of ~10k server records; gateway cohort FOSS
  matured in 2026 (IBM ContextForge verified in-repo: federation of
  MCP/A2A/REST-gRPC behind one governed endpoint, virtual servers, user-scoped
  OAuth; MCPJungle/MCPX/Docker/Microsoft per 2026 comparisons — snippets,
  unverified). Implication: never build a gateway; adopt one if a fleet
  ever needs central governance.
- MCP authorization spec direction: OAuth 2.1 resource server + Protected
  Resource Metadata (`/.well-known/oauth-protected-resource`) — search
  snippets only, unverified against spec text.
- Consolidation toward core (WordPress deprecation path) reinforces the
  MCP-first thesis while punishing early abstractions on top of moving
  plugin APIs (Payload plugin has an active 4.0-canary flow).

### 3.3 Local state (this machine, 2026-09-11)

- `sporeharbor-manager` `packages/mcp/`: official plugin-mcp running inside
  the app + thin stdio bridge. Bearer auth against the plugin's
  `payload-mcp-api-keys` collection (NOT `users.apiKey`; verified against
  plugin-mcp 3.88.0 source). Key docs bind to a user; per-collection
  capability checkboxes default false; custom tool `publish_deployment` with
  `overrideAccess: false`. Non-interactive bootstrap via `SEED_ADMIN_API_KEY`.
  Smoke test: `scripts/mcp-smoke.sh`
  (health → handshake → tools/list → create/find/delete roundtrip).
- Plugin-mcp 3.88.0 quirks already paid for in commit history: `useAPIKey`
  must be enabled on users for MCP key auth; API keys are ignored on create —
  the seed mints via `update` (commits `292f261`, `1fefab0`); seed doc
  commit `6d69c28`.
- `local-pm`: dex + node-oidc-provider machine-to-machine MCP compose landed
  fork-side (4df5a86) with upstream PR #5 open; ADR-002 covers OIDC
  authentication; ADR-001 fixes loopback-first binding. Initial-credentials
  seed still in progress.

## 4. The contrast (what deferral preserves)

| Dimension | Per-repo (current) | Shared package (deferred) |
|---|---|---|
| Schema exposure config | duplicated per repo | one place |
| Custom business tools | per-repo by nature (`publish_deployment` vs faculty flows) | parameterizable or per-consumer anyway |
| Auth strategy | per-repo until OIDC lands in both | one contract, two consumers — only makes sense post-OIDC |
| Creds seed | manager landed; local-pm pending | one seed contract — premature before both exist |
| Smoke/e2e harness | manager has one; faculty TBD | shared contract tests possible |
| Version coupling | each repo pins plugin-mcp independently | one pin for all consumers (or peer ranges + matrix) |

Cost of extracting later: low-to-moderate — the official plugin already fixes
the hard contract (transport, tool naming, access filtering); the duplicated
mass is configuration, tools, and fixtures.

Cost of extracting now: churn coupling to a moving dependency (plugin-mcp
4.0-canary), to an unlanded OIDC story, and to a creds-seed flow that just
finished on one side only.

## 5. Deferral triggers (falsifiable revisit conditions)

Extract — or formally spec — the shared package when ANY of:

- **T1 — third consumer.** A fleet spore needs an MCP surface; three
  consumers justify the abstraction the way two do not.
- **T2 — plugin-mcp 4.0 stable** and both repos landed on it: the API surface
  the package would wrap is frozen.
- **T3 — divergence tax observed.** The same config/tool duplicated across
  repos drifts behaviorally (caught in review or by an incident).
- **T4 — OIDC contract stable.** local-pm OIDC lands and both repos adopt the
  same auth-strategy contract (`overrideGetAuthorizedMCP`); the single
  implementation point becomes obvious instead of speculative.

Cadence: check triggers at weekly review. If none fired two weeks out and
local-pm/spec progressed, re-assess anyway with fresh evidence.

## 6. Potential pitfalls (before anyone writes the tests)

### 6.1 Unit testing

- **Presence proves nothing; assert absence too.** Capability checkboxes
  default false: every positive-path test (key with capability → allowed)
  needs its negative twin (key without capability → tool denied, ideally
  tool *not listed*). This is the SPC-001 lesson applied to MCP.
- **Schema-level visibility ≠ runtime enforcement** (Strapi documents four
  distinct layers: tool visibility, field filtering, locale narrowing,
  per-document runtime checks). Unit tests that mock the access resolver can
  pass while the real chain differs — test against the real resolution chain
  or explicitly mark what is mocked.
- **`overrideAccess: false` custom tools** (`publish_deployment`) are the one
  place access bypass exists by design: unit-test the gate itself (key doc
  without the checkbox → denied), not just the happy path.
- **Seed is update-minted** (3.88.0 ignores keys on create) — pin the plugin
  version in tests. A silent plugin bump can break seeding in a new way; the
  regression class already happened once (`useAPIKey`).
- **Tested-version triple must be documented** (payload / plugin-mcp / next):
  lockfile alone does not communicate which triple the tests certify.

### 6.2 E2E

- **Two transports, one claimed surface.** HTTP is smoke-covered; the stdio
  bridge is glue code with no parity test. If the bridge stays, e2e must
  prove tool-parity across transports (same tools/list from both).
- **Wrong-key trap.** Bearer against `payload-mcp-api-keys` ≠ `users.apiKey`
  (verified at 3.88.0). An e2e that goes green using the user key is testing
  the wrong auth path and will pass while the real path is broken.
- **Ephemeral boot for e2e**: boot with `SEED_ADMIN_API_KEY`, run smoke,
  tear down. Never run e2e against the dev instance's privileged key.
- **Dev-only override must not leak.** The plugin's `?overrideAccess=true`
  dev URL pattern must never appear in e2e/prod config — cheap config-lint
  assertion.

### 6.3 Identity / IdP (the local-pm seam)

- **`overrideGetAuthorizedMCP` is the extension point** for the OIDC
  strategy-with-fallback the manager needs (dev/test: OIDC off, fallback to
  Payload auth; prod: OIDC on). Hypothesis, not yet exercised locally — PoC
  before the spec commits to it.
- **m2m ≠ user delegation.** The landed local-pm compose (dex +
  node-oidc-provider) serves machine credentials; the MCP authorization spec
  direction is OAuth 2.1 with PKCE and user-delegation flows. One does not
  cover the other; the spec must name which flows are in scope.
- **Dual identity domains must be reconciled explicitly.** Today an MCP key
  doc binds to a Payload user. When OIDC lands, decide whether MCP clients
  act as *delegated users* (authorization-code flow, audit shows the human)
  or as *machine principals* mapped to a service user. Audit-log attribution
  (`origin: mcp` semantics) changes meaning under each choice.
- **Bootstrap circularity.** The manager's seed path must keep working at
  first boot with no IdP present (loopback-first, ADR-001); local-pm still
  owes its own seed. If IdP-backed auth ever becomes mandatory for MCP, the
  offline bootstrap story needs its own design, not an afterthought.
- **Token lifetime mismatch.** Plugin key docs are long-lived; OIDC tokens
  are short. Mixing the models (exchange, refresh, re-issue) is a design
  decision with revocation implications — list it in the spec, do not
  discover it in production.

### 6.4 Sharing a package across repos

- **Config, not framework.** Keep the shared artifact as config + custom
  tools + test fixtures. The moment it grows lifecycle hooks of its own it
  becomes the premature abstraction the operator flagged.
- **Version skew between consumers.** Two repos on different plugin-mcp
  versions silently invalidate shared fixtures. The package must declare
  peer ranges and a test matrix — or accept per-consumer fixtures and share
  only contract tests (tools/list shape + negative auth cases).
- **Business-tool leakage.** `publish_deployment` is manager-specific;
  faculty flows differ (and D1 — dataset scope — is still open). A shared
  package that hard-codes one app's business tools is worse than duplication.
- **Distribution decision before T1.** Internal scope (`@sporeharbor/…`)
  implies choosing private registry vs git dependency before a third consumer
  exists, not after.
- **CI coupling.** Shared fixtures mean shared CI cadence. Prefer thin
  contract tests over shared unit suites to keep the repos' test lives
  independent.

## 7. Where this feeds

- **REQ-001/SPEC-002 (traffic-agente spec, MCP-first chapter):** endpoint
  decision matrix (same endpoint / distinct creds is the Strapi-validated
  default; distinct endpoints only on risk/audience divergence; gateway only
  at fleet scale via existing FOSS), identity section = §6.3, open decisions
  D1–D4 unaffected.
- **local-pm:** §6.3 is the integration brief for MCP×OIDC after PR #5.
- **Revisit entry point:** §5 triggers at weekly review.

## Sources (fetched 2026-09-11)

- https://docs.strapi.io/cms/features/strapi-mcp-server
- https://raw.githubusercontent.com/payloadcms/payload/main/docs/plugins/mcp.mdx
- https://registry.npmjs.org/@payloadcms/plugin-mcp
- https://github.com/payloadcms/payload/tree/main/packages/plugin-mcp
- https://github.com/Automattic/wordpress-mcp
- https://github.com/IBM/mcp-context-forge
- https://api.github.com/repos/directus/mcp (+ GitHub search API for strapi/directus MCP repos)
- Local: `sporeharbor-manager/packages/mcp/README.md`; commits `292f261`,
  `1fefab0`, `6d69c28`; `local-pm/docs/adr/002`, `docs/adr/001`
- Trend figures (registry size, SDK downloads) and OAuth-spec details come
  from search snippets of the same date — reported, not verified against
  primary sources; marked where load-bearing.
