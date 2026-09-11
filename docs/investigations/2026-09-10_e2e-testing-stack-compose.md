# Investigation — E2E/integration testing stack for local-pm: compose topology, IdP provisioning, smoke-script patterns

| | |
|---|---|
| **ID** | INV-E2E-STACK (SPC-006 T3 follow-up; reviews the "single compose file" convention) |
| **Date** | 2026-09-10 |
| **Repo state** | fork `aficiomaquinas/local-pm`, branch `feat/e2e-testing-stack-research` from master `4df5a86` |
| **Status** | COMPLETE — recommendation: **keep `docker-compose.yml` as operator surface; formalize the E2E stack as a dedicated compose project (`-p local-pm-e2e`) via an `e2e` overlay on the existing base+test-overlay chain; keep dex for the PKCE leg + `node-oidc-provider` (or `oidc-server-mock` as prebuilt alternative) for the client_credentials leg; keep `e2e-smoke.sh`'s "point at a running stack" contract and add an OIDC smoke script behind a Makefile/`pnpm` target.** |
| **Related** | [INV-IDP-ALT — dex alternatives as dev/E2E IdP](2026-09-10_idp-alternatives-dex.md) · [SPC-003 — testing strategy](../specs/2026-09-06_SPC-003_testing-strategy.md) · [SPC-006 — OIDC wiring](../specs/2026-09-08_SPC-006_oidc-authentication-wiring.md) |

Research contract: every external claim is cited `[n]` to the Sources block (ledger-generated); each
source was surfaced by donsetch `web_search`/GitHub API and then **fetched** (raw file, API
listing, or docs page) unless explicitly marked *snippet-level*. Repo-internal claims cite
file paths and are marked **[verified]** (inspected this session at `4df5a86`). Judgments
about fit are confined to §5–6 and are labeled as such.

---

## 1. Problem statement

The operator asked whether local-pm's testing stack should keep the current
"one `docker-compose.yml` with profiles" convention, or follow what comparable
self-hosted/dev projects do. Three sub-questions:

1. **Compose topology for tests**: single file + profiles vs. a dedicated test/E2E
   compose file vs. overlays vs. testcontainers.
2. **IdP provisioning in E2E**: how do comparable projects provide an OIDC issuer
   in their test stacks (real Keycloak/dex container, purpose-built mock like
   `oidc-provider-mock`/`oidc-server-mock`, embedded/in-process fake, or none)?
3. **Smoke/E2E script structure**: who starts the stack, how are checks organized,
   what is the exit contract?

The operator's prior (stated in the delegation) is that "one compose file" is the
doubtful convention and that a dedicated test compose is community best practice.
This report evaluates that with evidence rather than defending the status quo.

---

## 2. What local-pm has today (repo-internal, [verified])

### 2.1 `docker-compose.yml` — operator surface, profiles `default` | `oidc`

- Default shape: `app` + `mongodb` (mongo:7.0, healthcheck-gated, no host port).
- `COMPOSE_PROFILES=oidc` adds `app-oidc` + `dex` (ghcr.io/dexidp/dex:v2.45.1,
  loopback-only `127.0.0.1:5556`, config bind-mounted from `config/dex/config.yml`,
  in-memory storage). `app` and `app-oidc` share `127.0.0.1:3010`; profile selection
  is exclusive and a forced double-activation fails fast on the port collision.
- File header documents the dex v2.45.1 limitation: no release carries PR #4583
  (client_credentials), so the MCP m2m leg 400s until a release ships it
  (full analysis in INV-IDP-ALT).

### 2.2 `docker-compose.test.yml` — an overlay, not a test runner

Despite the name, this is **not** a standalone test stack. It is a compose **overlay**
applied as `-f docker-compose.yml -f docker-compose.test.yml` with a dedicated project
(`-p local-pm-audit2`) for the SPC-004/SPC-005 verification stack:

- overrides `container_name` for `app`/`mongodb` (the base file pins them; `-p` alone
  does not lift that),
- replaces the port list with `!override` (`127.0.0.1:3012 -> 3010`, loopback-only,
  E2E evidence from the host),
- its comment states the builder stage runs the full test suite (SPC-003 §5.3) so a
  red suite breaks `--build`.

So local-pm **already uses the overlay pattern** for one kind of testing (manual
audit-stack verification) — the pattern is proven in-repo; what's missing is an
E2E-grade stack (IdP included) and an automated harness around it.

### 2.3 `scripts/e2e-smoke.sh` — T2 smoke, "never starts a stack"

- bash + curl, no deps beyond jq-or-python3 fallback for JSON path extraction.
- Points at an **already-running** stack (`BASE_URL`, default `http://127.0.0.1:3010`);
  fails fast if nothing answers ("never start one ourselves").
- Checks 1..8b: board 200 → login/first-register → `/api/users/me` → anonymous
  401/403 → CRUD (project/team/tickets) → drag-equivalent PATCH → history feed actor →
  soft-delete + version trail → denyAgents regression guard. Check 8b (real agent-403
  with an IdP token) is a **SKIP placeholder** reserved for T3.
- Counters PASS/FAIL/SKIP; **exit code = number of failing checks**; never purges data
  (documented smoke-residue tradeoff).

### 2.4 Gaps vs. the SPC-006 contract

- No T3/OIDC E2E: no IdP leg in any automated check (8b skips).
- No client_credentials issuer available at all until dex releases #4583
  (INV-IDP-ALT §2).
- Nothing orchestrates "start a disposable stack → run smoke → tear down"; the audit
  overlay is invoked manually.

---

## 3. Evidence: how comparable projects structure it

### 3.1 oauth2-proxy — dedicated `contrib/local-environment/` compose files, one per IdP variant

The repo ships a **separate directory** [3] with non-production compose files for manual
testing/exploration: the default `docker-compose.yaml` runs oauth2-proxy + **dex**
(v2.45.1 — the same tag local-pm pins) + httpbin, with the comment "can be used to
bring up an example instance … for manual testing and exploration of features" and
`make up` / `make down` targets [4]. A **variant file** `docker-compose-keycloak.yaml`
swaps dex for Keycloak 26.7 (`start-dev --import-realm`, realm import bind-mounted)
with `make keycloak-up/keycloak-down` targets [5]. Key structural facts:

- IdP variants are **separate compose files** (not profiles) — each is self-contained,
  with its own network aliases (`dex.localtest.me`, `keycloak.localtest.me`) so the
  browser leg resolves without /etc/hosts edits.
- This is explicitly a *local environment* fixture, decoupled from anything users
  deploy in production.

### 3.2 Immich — a dedicated `e2e/` workspace with its OWN compose project

Immich (comparable scale: self-hosted media app, pnpm monorepo, vitest+playwright)
keeps E2E in a top-level `e2e/` directory containing `docker-compose.yml`,
`docker-compose.dev.yml`, `vitest.config.ts`, `package.json`, `playwright.config.ts`
and `src/` specs [8]. Its compose file declares `name: immich-e2e` (dedicated compose
project) and every container has a dedicated name (`immich-e2e-server`,
`immich-e2e-postgres`, `immich-e2e-redis`), an `e2e-auth-server` service built from a
workspace package, and pinned image digests [6]. The vitest config wires a
**globalSetup that starts `docker compose` only if the server is not already
answering** (`fetch('http://127.0.0.1:2285/api/server/ping')` first, skip via
`VITEST_DISABLE_DOCKER_SETUP`), with `maxWorkers: 1`, `retry: 4` in CI, and a 15 s
test timeout [7]. Browser E2E is Playwright; API E2E is vitest+supertest against the
same stack [6][8].

This is the strongest data point **for the operator's suspicion**: a large, active
self-hosted project separates its E2E stack into its own compose project with its own
names/ports, and automates "start if not running, leave if it is".

### 3.3 Grafana — in-process integration harness + scripted real Keycloak for E2E

Grafana's integration tests live under `pkg/tests/apis/` (e.g. `iam/iam_test.go` for
identity/access-management APIs), i.e. a code-level harness spun up by the test
framework, not by compose [15]. Its frontend/browser E2E setups have historically
provisioned Keycloak via scripts (setup container patterns) [unverified — the exact
current script layout was not confirmed this session]. The relevant signal: **two
distinct layers** — in-process integration tests for API/ACL logic, and a real IdP
provisioned programmatically only for full-flow tests.

### 3.4 Outline — dev-deps compose + Makefile; CI uses service containers; no IdP in tests

Outline's Makefile starts only `postgres`/`redis` from the root compose for tests
(`docker compose up -d postgres` then drop/create/migrate) [14]; CI runs server tests
against a GitHub Actions **service container** (postgres with healthcheck) [13]. No
OIDC issuer is provisioned for unit/integration tests — auth providers are mocked at
the unit level. Signal: the compose file's test role is *dependencies only*; the app
itself runs on the host/test runner.

### 3.5 Payload (local-pm's own framework) — `test:int` and `test:e2e` as separate first-class scripts

The official blank template ships `test:int` (vitest) and `test:e2e` (playwright) as
distinct package scripts [12]; payloadcms' own CI runs separate E2E/Int job matrices
(observed in its public workflow run listing: "Setup E2E Matrix", "Setup Int Matrix",
tests-unit, tests-types — snippet-level). Signal: for Payload-based apps the
convention is **separate int and e2e lanes**, which local-pm's T1/T2/T3 layering
already mirrors conceptually (SPC-003) but only implements as T1/T2 + a manual shell
script.

### 3.6 Docker Compose official guidance — profiles for optional services; multiple files for environment customization

- Profiles: services without `profiles` always start; profile-assigned services start
  only when activated; the docs' own tip: "The core services of your application
  shouldn't be assigned profiles so they are always enabled and automatically
  started" [1]. Profiles are the tool for *optional components of one application*.
- Multiple files: `-f` merging is "the simplest way … works well for straightforward
  overrides", while `extends`/`include` manage growing complexity [2][17]. Overriding
  `container_name`/ports via an overlay to isolate a second copy of a stack is exactly
  the documented merge-override use case.

### 3.7 IdP provisioning patterns in tests (the survey)

| Pattern | Examples | Evidence |
|---|---|---|
| **Real IdP container, pinned tag, config-as-code** | oauth2-proxy local env: dex v2.45.1 compose [4], Keycloak variant with `--import-realm` [5]; testcontainers-keycloak: "Spin up a real Keycloak … in your Java integration tests — no mocks, no manual setup", realm import + client_credentials token helpers built in [9] | Real-idp-in-a-container is the dominant integration/E2E pattern for OIDC consumers |
| **Purpose-built mock IdP container** | Soluto/oidc-server-mock (Apache-2.0; ghcr image; **client_credentials first-class** in its sample client config with per-client custom claims; env/JSON-configured; used by Tweek blackbox tests and Stitch e2e) [10]; navikt/mock-oauth2-server (JVM-focused; "issues signed JWTs … without disabling security" — snippet-level) [11] | Mock IdPs exist precisely so apps can test the *real* OIDC flow (discovery → JWKS → token) with scriptable claims/grants, minus IdP weight |
| **In-process/embedded fake** | Grafana's in-repo harness style [15]; local-pm's own vitest approach (jose `generateKeyPair('RS256')` + stubbed JWKS fetch, see `apps/web/tests/o1.oidc-core.test.ts` [verified]) | Cheap, hermetic, no Docker; doesn't exercise the network path |
| **Testcontainers (generic)** | testcontainers.com: "throwaway, lightweight instances … created and then deleted", Node.js support via `GenericContainer` [20] | Library-driven container lifecycle inside the test process; strongest in JVM ecosystems [9] |
| **No IdP at all** | Outline [13][14] | Fine when auth isn't the system under test |

### 3.8 Smoke-script structure in the wild

- **Test-runner-orchestrated** (Immich): the suite's globalSetup runs
  `docker compose up` if the stack isn't answering, specs hit real HTTP endpoints,
  CI adds retries [7].
- **Makefile-orchestrated** (oauth2-proxy): `make up` brings the fixture stack;
  humans curl the flow [4][5]; (Outline): `make test` composes "start deps →
  migrate → run" [14].
- **Framework-native E2E** (Payload template / Immich web): Playwright configs as the
  entrypoint [12][8].
- local-pm's `e2e-smoke.sh` ("point me at a running stack, exit = fail count,
  numbered checks") is a deliberate variant of the orchestrator-less pattern; its
  contract is sound and matches how the audit overlay is used manually. What's
  missing is the thin orchestration wrapper, not a rewrite.

---

## 4. Synthesis: what the community actually does

1. **Production/dev compose and test stacks are separate artifacts.** Every surveyed
   project keeps its user-facing compose (or none at all) apart from its test
   fixtures: oauth2-proxy (contrib dir, per-IdP files [4][5]), Immich (own `e2e/`
   compose project [6][8]), Outline (compose = deps only, CI service containers
   [13][14]), Grafana (harness code, not compose [15]). None grows its test IdP
   into the deployment compose file.
2. **Isolation is achieved by compose project name + container names + ports** —
   exactly the triple local-pm's `docker-compose.test.yml` overlay already implements
   [verified §2.2]; Immich's `name: immich-e2e` + `immich-e2e-*` containers are the
   same idea as a native `name:` field [6].
3. **Profiles are not the community's tool for test stacks.** Official docs position
   profiles for optional services of one application (debug tools, extra backends)
   [1]; the surveyed projects don't put test runners or test IdPs behind profiles.
   Profiles remain the right tool for local-pm's *operator* variants (plain vs. oidc)
   — that's a different axis from operator vs. test.
4. **IdP in E2E: real-but-light wins for the human leg; purpose-built mocks cover
   grant types real IdPs make hard.** dex-in-compose is a proven pattern [4];
   Keycloak containers are the heavyweight alternative (1.5 GB idle, per
   INV-IDP-ALT §5) used where full IdP fidelity is required [5][9]; mock IdPs like
   oidc-server-mock exist to script grants/claims — notably **client_credentials with
   custom claims is a headline feature there** [10], which is precisely local-pm's
   MCP gap while dex v2.45.1 lacks the grant (INV-IDP-ALT §2).
5. **The smoke script should stay subordinate to a one-command harness.** Immich's
   "start if not answering" globalSetup [7] and Outline's Makefile composition [14]
   both reduce E2E to one entrypoint; the checks themselves are plain HTTP calls —
   local-pm's bash/curl shape is not unusual, only un-orchestrated.

---

## 5. Recommendation for local-pm

### R1 — Keep `docker-compose.yml` as the operator surface, with profiles

The file's job (byte-stable default deployment + opt-in OIDC shape) is correct and
matches the official profile guidance ("core services shouldn't be assigned profiles"
— here the *variant* app is what's profiled, which is the intended use) [1]. Do not
add test-runner or E2E-IdP services to it. No evidence supports migrating away; no
surveyed project co-locates its test stack with its deployment compose.

### R2 — Make the E2E stack a dedicated compose PROJECT via a new `docker-compose.e2e.yml` overlay (the operator's instinct is right, and the repo already has the primitive)

Formalize what `docker-compose.test.yml` started. Concretely:

```
# E2E stack: base + audit/test overlay + e2e overlay, one disposable project
docker compose -p local-pm-e2e \
  -f docker-compose.yml -f docker-compose.test.yml -f docker-compose.e2e.yml \
  up -d --build
```

`docker-compose.e2e.yml` adds the pieces the audit overlay doesn't have:

- `dex` (same config as the `oidc` profile) and `oidc-dev` (see R3), rebound to
  **5557/5558** loopback so they never collide with an operator stack's 5556;
- the app service's OIDC_* env pointing at those, via `environment:` merge
  (documented merge rules [2]) — and `OIDC_AGENT_CLIENT_IDS=["local-pm-mcp"]`
  pre-set so T3's agent-denial check works without operator env;
- dedicated `container_name`s continue coming from the test overlay; the `!override`
  port stays 3012.

Why overlay and not a fully standalone file (Immich style): the base file already
encodes build args, healthchecks, and volumes the E2E stack must replicate; duplicating
them would drift (Immich pays that cost with dedicated CI). Why not profiles-inside-
the-operator-file: it would couple test lifecycle (`up -d … && script && down`) to the
operator file and risk the byte-stable default shape. The overlay keeps three facts
true at once: operator file untouched, isolation triple (project/names/ports), and
DRY with the existing audit stack.

### R3 — IdP provisioning: dex for the PKCE leg + node-oidc-provider for client_credentials; oidc-server-mock documented as the prebuilt alternative; no Keycloak, no testcontainers for the shell suite

- **Human leg (PKCE): keep dex** [19]. Verified live 2026-09-10 serving
  authorization_code+PKCE end-to-end with the pinned config (INV-IDP-ALT §4); it's
  the same pattern oauth2-proxy ships [4].
- **MCP leg (client_credentials): add `oidc-dev` running panva/node-oidc-provider** [21]
  (per INV-IDP-ALT's recommendation: in-repo service, MIT, OpenID Certified, full
  grant coverage, azp mapping matches SPC-006 §6). **New evidence this survey:**
  `Soluto/oidc-server-mock` is a maintained (pushed 2026-05) Apache-2.0 prebuilt image
  whose documented sample config includes a **client_credentials client with custom
  claims**, env/JSON-configured in one compose service, and is already used for
  blackbox/e2e tests by other projects [10]. Tradeoff: prebuilt = zero code but C#
  IdentityServer-based (Duende license caveat is explicitly dev/test-only [10]) and
  claim shapes are config-driven; node-oidc-provider = ~100 lines in-repo but exact
  control over token claims. Either satisfies T3; **default to node-oidc-provider**
  for consistency with INV-IDP-ALT, and keep oidc-server-mock as the fallback if the
  in-repo service grows past ~150 lines.
- **Keycloak in E2E: no.** Its testcontainer ecosystem is JVM-bound [9] and the
  container is overprovisioned for loopback dev (INV-IDP-ALT §5); oauth2-proxy needed
  a whole second compose file to accommodate it [5].
- **Testcontainers: not for this suite.** The smoke suite is bash+curl against a
  running stack by design; testcontainers' lifecycle-in-test-process model [20]
  would tie that to a Node/Go test runner for no gain. Where testcontainers-style
  thinking already exists in-repo is at the vitest layer (disposable in-memory Mongo,
  stubbed JWKS) — the right layer for it. Re-evaluate only if a Go/Node native
  harness (Grafana-style [15]) ever replaces the bash suite.

### R4 — Smoke scripts: keep `e2e-smoke.sh`'s contract; add `scripts/e2e-oidc.sh` (T3); wrap both in one `Makefile`/`pnpm` target

- `e2e-smoke.sh` (T2) stays as-is: its "never start a stack, exit = fail count,
  numbered PASS/FAIL/SKIP" contract is a good one and needs no rewrite.
- New `scripts/e2e-oidc.sh` for the E2E stack, same utilities and reporting shape,
  checks 9..12:
  - **9** discovery+JWKS reachable for both issuers (dex on 5557, oidc-dev on 5558);
  - **10** PKCE leg: browser-equivalent flow via curl cookie jar against dex
    (authorize → login → consent → code → token) → `/api/users/me` with the session
    cookie; mirror user exists;
  - **11** client_credentials leg: POST token at oidc-dev → call an authenticated
    endpoint as the agent (mirror `actorType=agent`);
  - **12** the real **T3 agent-denial**: agent token on `/api/history` → **403**
    (retires the 8b SKIP); superadmin group mapping via `OIDC_SUPERADMIN_GROUP`.
- New `Makefile` targets (Outline-style composition [14], Immich's
  start-if-not-answering guard [7]):
  `e2e-up` (`compose -p local-pm-e2e up -d --build` + `--wait`), `e2e-test`
  (`e2e-up` → `e2e-smoke.sh` → `e2e-oidc.sh`, propagating exit codes),
  `e2e-down` (`down --volumes` — disposable by design; no operator data involved).
  Optionally a `pnpm test:e2e` alias to match the Payload template convention [12].

### R5 — Explicit non-goals

- Don't gate the Docker builder stage on OIDC E2E (the builder stays hermetic per the
  mongoose-timeout investigation; E2E needs live services by definition).
- Don't chase dex releases for the smoke gate: T3 must pass with oidc-dev regardless;
  re-pin dex only for operator-profile fidelity (INV-IDP-ALT §6).
- Don't rename `docker-compose.test.yml`; it already means "audit overlay" in
  operator muscle memory — the new file is additive (`docker-compose.e2e.yml`).

---

## 6. Option matrix (the four candidates, judged)

| Option | Verdict | Why |
|---|---|---|
| Single compose + profiles for tests | **Reject for tests; keep for operator variants** | Profiles are for optional services of one app [1]; coupling test lifecycle to the operator file breaks its byte-stable contract; no surveyed project does this |
| Dedicated standalone test compose (Immich-style) | **Viable, rejected as first step** | Clean isolation [6] but duplicates base build/health/volume config; worth it only if the E2E matrix multiplies (multiple IdP variants à la oauth2-proxy [5]) |
| Overlay chain on base file (current pattern, formalized) | **Adopt** | Isolation triple already proven in-repo [verified §2.2]; DRY; documented merge semantics [2]; matches what the repo needs (one more environment of the SAME app) |
| Testcontainers | **Reject for the shell suite; already de-facto at vitest layer** | Library-driven lifecycle belongs inside a test runner [20]; the smoke suite is intentionally runner-free; Keycloak module is JVM-only [9] |

---


**Internal artifacts (repo, inspected 2026-09-10 @ `4df5a86`):** `docker-compose.yml`,
`docker-compose.test.yml`, `scripts/e2e-smoke.sh`, `config/dex/config.yml`,
`docs/specs/2026-09-06_SPC-003_testing-strategy.md` (§4.3 T3 definition),
`docs/investigations/2026-09-10_idp-alternatives-dex.md` (INV-IDP-ALT: dex release-gap
analysis, node-oidc-provider recommendation, Keycloak/Authentik memory costs),
`docs/investigations/2026-09-10_docker-builder-tests-mongoose-timeout.md` (builder
hermeticity). Hermes skill `local-pm-oidc` (verified E2E state: dex PKCE live 2026-09-10).

**Search-surfaced but not fetched (claims restricted to what the snippet states):**
payloadcms CI job names ("Setup E2E Matrix"/"Setup Int Matrix") — GitHub Actions run
listing snippet; [11] mock-oauth2-server capability line. Grafana browser-E2E
Keycloak provisioning specifics: **[unverified]** — `devenv/docker/dex` 404s today and
the replacement layout was not confirmed.

## Sources

[1] https://docs.docker.com/compose/how-tos/profiles — Docker Docs: Using profiles with Compose
[2] https://docs.docker.com/compose/how-tos/multiple-compose-files — Docker Docs: Use multiple Compose files
[3] https://github.com/oauth2-proxy/oauth2-proxy/tree/master/contrib/local-environment — oauth2-proxy contrib/local-environment
[4] https://github.com/oauth2-proxy/oauth2-proxy/blob/master/contrib/local-environment/docker-compose.yaml — oauth2-proxy docker-compose.yaml (dex)
[5] https://github.com/oauth2-proxy/oauth2-proxy/blob/master/contrib/local-environment/docker-compose-keycloak.yaml — oauth2-proxy docker-compose-keycloak.yaml
[6] https://github.com/immich-app/immich/blob/main/e2e/docker-compose.yml — Immich e2e/docker-compose.yml
[7] https://github.com/immich-app/immich/blob/main/e2e/vitest.config.ts — Immich e2e vitest.config.ts (globalSetup docker compose)
[8] https://github.com/immich-app/immich/tree/main/e2e — Immich e2e/ directory
[9] https://github.com/dasniko/testcontainers-keycloak — dasniko/testcontainers-keycloak
[10] https://github.com/Soluto/oidc-server-mock — Soluto/oidc-server-mock
[11] https://github.com/navikt/mock-oauth2-server — navikt/mock-oauth2-server
[12] https://github.com/payloadcms/payload/tree/main/templates/blank — payloadcms blank template (test:int/test:e2e)
[13] https://github.com/outline/outline/blob/main/.github/workflows/ci.yml — Outline CI workflow
[14] https://github.com/outline/outline/blob/main/Makefile — Outline Makefile
[15] https://github.com/grafana/grafana/tree/main/pkg/tests/apis/iam — Grafana pkg/tests/apis/iam (integration harness)
[17] https://docs.docker.com/compose/how-tos/extends — Docker Docs: extend compose file
[19] https://github.com/dexidp/dex — dexidp/dex
[20] https://testcontainers.com — Testcontainers
[21] https://github.com/panva/node-oidc-provider — panva/node-oidc-provider
