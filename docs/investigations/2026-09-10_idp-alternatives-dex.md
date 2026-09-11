# Investigation — dex alternatives as dev/E2E IdP for SPC-006, and OIDC testing patterns

| | |
|---|---|
| **ID** | INV-IDP-ALT (SPC-006 OD-4 follow-up) |
| **Date** | 2026-09-10 |
| **Status** | COMPLETE — recommendation: **stay on dex for the human leg; add `node-oidc-provider` as second compose service for the MCP/E2E leg** |
| **Repo** | `local-pm` (fork `aficiomaquinas/local-pm`); branch `feat/idp-alternatives-research` from master `da731c2` |
| **Related** | [SPC-006 — OIDC authentication wiring](../specs/2026-09-08_SPC-006_oidc-authentication-wiring.md) · ADR-002 D6/OD-4 (dev bootstrap IdP) |

Research contract: every external claim below is cited `[Rn]` to §References; all URLs were
surfaced by donsetch `web_search` (or GitHub API `gh`) and then fetched. Items not confirmed
by a fetched source are marked **[unverified]**.

---

## 1. Problem statement

SPC-006 needs a dev/E2E IdP inside the compose profile `oidc` covering the **complete
contract**:

1. **Human leg** — authorization_code + PKCE (browser interactive).
2. **Agent/MCP leg** — client_credentials grant (RFC 6749 §4.4, machine-to-machine).
3. **Roles** — a claim (`groups` or similar) the app maps to `superadmin|human|agent`
   via `OIDC_ROLE_MAP` (for the agent leg, §6 maps `azp`/`client_id`, so roles on the
   m2m token are a nice-to-have, not a hard requirement — the mirror doc's `actorType`
   already carries the role; but the token claim is what AC-6 uses for humans).

The chosen dex v2.45.1 fails requirement 2: `client_credentials` (PR #4583, merged
2026-03-03) has **no release carrying it** — the latest dex release remains
**v2.45.1, published 2026-03-03** (GitHub API, 2026-09-10), i.e. exactly the day #4583
merged, and the PR branch has since diverged from that tag (compare: ahead 22 / behind 3,
verified 2026-09-10). The operator asked for a broader survey: which self-hosted IdPs
cover the full contract at dev-friendly weight, and what are the standard patterns to test
OIDC E2E without a real IdP.

**Key framing fact:** the application code is done and issuer-agnostic (SPC-006 was built
that way). A provider change costs **zero app changes** — only compose + env. That
asymmetry is what makes the recommendation cheap to implement (§6).

---

## 2. dex status deep-dive (what exactly is missing)

Verified 2026-09-10 against GitHub API:

- PR **#4583** (client_credentials support) merged **2026-03-03**; **no release carries
  it** — `v2.45.1` is still `latest`.
- Issue **[#4690](https://github.com/dexidp/dex/issues/4690)** — *"client_credentials
  grant: groups scope accepted but never populated in token claims"* (opened 2026-03-26,
  closed 2026-04-14 as completed). Even after a release carries #4583, the m2m token
  **would carry no `groups` claim**: the `groups` scope passed validation but the `Groups`
  claims field was never set. Relevant because SPC-006's role mapping for the agent leg is
  `azp`/`client_id`-based (works without groups), but any `OIDC_ROLE_MAP` experiment on an
  m2m token would silently produce the fail-safe default `['human']`.
- PR **[#4691](https://github.com/dexidp/dex/pull/4691)** — *"feat(oauth2): populate
  groups claim in client_credentials tokens"* — **merged 2026-04-14** (merge commit
  `6f68a40a`). So on current `master` dex has the full behavior; the gap is purely
  **release cadence**: 6+ months without a release, 2 unreleased grant-fix features
  stacking.

**Consequence:** waiting for the release is a bet on an external project's cadence with a
moving target (wait for release N with #4583, then verify #4691 is also in it, then
re-check the smoke script). The alternative — pin a build from master — trades a
disposable dev IdP's simplicity for an unpinned image source.

---

## 3. Candidate comparison

### 3.1 Full-featured self-hosted IdPs

| | client_credentials | PKCE (auth code) | roles/groups claims | Image (Docker Hub, compressed) | Idle RAM | Services | License | Latest release | Sources |
|---|---|---|---|---|---|---|---|---|---|
| **Keycloak** | **YES** — service accounts; the grant "creates a token based on the metadata and permissions of a service account associated with the client" [R15]; roles land in the token via role protocol mappers (Service accounts guide) [R16] | **YES** — native OIDC feature (Core); JS adapter sets `pkceMethod=S256` by default since 24.0 [R17] | YES — realm/client roles + groups, mapper-shaped into tokens [R16] | ~180 MB `quay.io/keycloak/keycloak` [unverified — not measured] | ~1.5 GB (with its PostgreSQL; JVM/Quarkus) [R3] | 2 (keycloak + postgres) | Apache-2.0 (GitHub API) | 26.7.3 (2026-08-31) (GitHub API) | [R3][R15][R16][R17] |
| **Authentik** | **YES** — "the OAuth 2.0 specification includes the client credentials grant, which allows M2M authentication without user involvement" (official docs) [R18]; community confirms the grant for service accounts [R19] | **YES** — standard OIDC provider feature [R18] | YES — custom claims/expressions per provider [R18] | (registry versioned image; Hub `latest` not measurable via API — 0 MB response) [unverified] | ~600 MB for the whole stack: server + worker + PostgreSQL + Redis [R3] | **4** (server, worker, postgres, redis) [R3] | MIT core + enterprise (docs) [R3]; repo license `NOASSERTION` (GitHub API, custom file) | version/2026.8.2 (2026-09-09) (GitHub API) | [R3][R18][R19] |
| **Zitadel** | **YES** — official guide: service accounts authenticate via client credentials (`grant_type=client_credentials` + basic auth); opaque access token by default, JWT optional per service account [R7]; shipped in v2.19.1 [R8] | **YES** — PKCE flow covered in self-host tutorial [R9] | YES — machine users + roles; claims inspectable in tutorial [R9] | [unverified — not measured] | [unverified] — advertised as lightweight; needs PostgreSQL/CockroachDB | 2 (zitadel + DB) | **AGPL-3.0** (GitHub API) — fine for dev tooling, friction for upstream redistribution of a compose profile | v4.17.3 (2026-09-04) (GitHub API) | [R7][R8][R9] |
| **Authentik alternative: Ory Hydra** | **YES** — implements the complete OAuth 2.0 standard incl. client credentials (official page) [R10]; dedicated curl walkthrough exists [R11] | **YES** — official page lists PKCE among flows [R10] | **NO by itself** — Hydra is an OAuth2 *server* only: **no login UI, no user store, no groups**; requires a separate *Login & Consent app* and usually Ory Kratos for identities [R12] | [unverified] | "low resource" per Ory, no independent figure [unverified] | **3–4** (hydra + postgres + login/consent app (+ kratos)) [R12] | Apache-2.0 (GitHub API) | actively pushed (2026-07-29) (GitHub API) | [R10][R11][R12] |
| **Authelia** | **YES** — grant-types table: `client_credentials` **Supported: Yes** (with the note that such clients can't take `openid`/`offline` scopes) [R4] | **YES** — authorization_code supported [R4]; OpenID Certified (Core/Discovery/Form Post) [R4] | YES — YAML-configured clients; groups claim configurable [unverified — intro page doesn't show claim config] | **28 MB** (Docker Hub, compressed, 2026-09-10) | ~30–40 MB RAM (third-party measurements; homelab comparisons) [R5][R6] | **1** (single container, YAML config) | Apache-2.0 (GitHub API) | v4.39.25 (2026-09-10) (GitHub API) — very active | [R4][R5][R6] |
| **Casdoor** | **YES** — official OAuth doc lists grant types "Authorization Code, Implicit, ROPC, **Client C**[redentials]…", plus a "Client Credentials Grant: use when the application has no frontend" section [R13]; M2M section in Public API doc [R14] | **YES** — standard flows documented [R13] | YES — users/groups/roles in console [R13] | **54 MB** (Docker Hub, compressed, 2026-09-10) | [unverified] — needs its own DB (defaults to SQLite file, dev-friendly) | 1 (single container + optional DB) | Apache-2.0 (GitHub API) | v4.3.0 (2026-09-09) (GitHub API) | [R13][R14] |
| **Logto** | **YES** — "M2M applications adopt the Client Credentials Flow" (official docs) [R20] | **YES** — OIDC-certified provider [unverified — inferred from product docs; certification page not fetched] | YES — M2M roles assignable [R20] | [unverified — not measured] | [unverified] — Node stack + PostgreSQL | 2 (logto + postgres) | **MPL-2.0** (GitHub API) | v1.43.0 (2026-09-31→2026-08-31) (GitHub API) | [R20] |

### 3.2 Embedded / library options (the dev-grade sweet spot)

| | client_credentials | PKCE | roles/claims | Footprint | License | Maturity | Sources |
|---|---|---|---|---|---|---|---|
| **`node-oidc-provider` (panva)** v9.12.2 | **YES** — `features.clientCredentials` is a first-class configuration feature (docs TOC) [R1]; a dedicated "Client Credentials only clients" recipe exists [R1]; the library ships test suites for the grant (test dir listing) [R2] | **YES** — authorization code with PKCE validation is core behavior; source checks `code_challenge`/`code_verifier` [R21]; PKCE docs section exists [R23] | **YES — whatever you want**: `claims` config parameter maps arbitrary claims into tokens (claims parameter documented) [R1] | **ONE npm package** in the repo's own runtime (no container, no extra DB — memory adapter for dev); ~50–80 lines of config | MIT (npm) | **OpenID Certified** (Basic, Implicit, Hybrid, Config, Form Post, 3rd-Party-Init, FAPI 1.0/2.0, CIBA) [R1]; v9.x line receives features+fixes [R1]; sole-maintainer risk (author states it) [R1] | [R1][R2][R21][R23] |
| **`ory/fosite` (Go SDK)** | YES — "implements peer-reviewed RFC6749…" incl. client_credentials (README) [R22]; used by Hydra itself [R22] | YES (RFC-aware, PKCE included) [R22] | n/a (you build the server) | library only, but **Go** — this repo is TypeScript; writing a Go IdP service for a dev profile is a non-starter | Apache-2.0 (GitHub API) | pushed 2025-11-20 (slowing) (GitHub API) | [R22] |

### 3.3 OIDC testing patterns (industry practice)

| Pattern | What it is | Fit for local-pm |
|---|---|---|
| **Unit mock / stub JWKS** (already done) | Stub `fetch` + local `generateKeyPair('RS256')`; verify token-verify logic without I/O | ✅ implemented (o1.oidc-core.test.ts); right level for the verify matrix (bad sig, bad iss, skew, unknown kid) |
| **Embedded IdP in-process / as compose service** | Mount a programmable provider (node-oidc-provider) with in-memory clients/users; full HTTP surface (discovery/token/jwks/userinfo/introspection) | ✅ **the standard Node-ecosystem answer** — one dev dependency, real HTTP round-trips, deterministic, no external cadence |
| **Testcontainers (real IdP in Docker)** | Spin the actual production IdP (e.g. dasniko/testcontainers-keycloak: "Spin up a real Keycloak… no mocks") for Java integration tests [R24]; skycloak CI/CD guide [R25]; workshop lab pattern [R26] | Indirectly usable: `docker compose --profile oidc up` IS the local-pm variant of this pattern; full Keycloak-in-tests is heavyweight for a loopback-only dev stack |
| **Contract recording / WireMock-style mocks** | Record/replay IdP responses; popular in Spring-land [R27] | ❌ brittle for auth (state, nonces, time) — hoop.dev explicitly warns "mocking removes… truth" [R28]; rejected |

The hoop.dev guide's recommendation aligns: *"Start with your actual identity provider.
Use the same authorization endpoints, token endpoints, and JWKS URIs you run in
production… Mocking removes network risk, but it also removes truth."* [R28] — i.e. E2E
should run against a **real IdP process**, which any of our full-contract candidates
satisfies; the question is only which one is proportionate.

---

## 4. The weight paradox (full IdPs vs the dev use case)

The measured numbers make one thing stark: **every full-featured replacement is heavier
and more complex than the problem requires.**

| Option | New containers | Extra DB | Idle RAM (approx.) | Setup effort for compose profile |
|---|---|---|---|---|
| dex (today) | 1 | none (memory) | tens of MB [unverified — not measured; image is 50 MB compressed] | done |
| node-oidc-provider service | 1 (tiny Node script) | none | tens of MB [unverified — same Node class as the app itself] | ~1 file + ~60 lines |
| Authelia | 1 | none | ~30–40 MB [R5][R6] | YAML config, but roles → `groups` claim plumbing [unverified detail] |
| Casdoor | 1 | optional (SQLite) | [unverified] | web-console setup (clicks, not files) |
| Zitadel | 2 | postgres/cockroach | [unverified] | console + machine-user provisioning |
| Authentik | 4 | postgres + redis | ~600 MB [R3] | 4-service compose + console flows |
| Keycloak | 2 | postgres | ~1.5 GB [R3] | realm/client/mapper model, 60–90 s boot [R3] |
| Hydra (+ login app) | 3–4 | postgres | [unverified] | you must BUILD the login/consent app [R12] |

The compose profile serves **one developer's loopback E2E** (ADR-001 perimeter). Keycloak
at 1.5 GB idle / 2–4 h setup [R3] and Authentik at 4 services / 600 MB [R3] are
production-proportioned tools; adopting one to obtain a grant dex will eventually carry is
a poor trade. Authelia and Casdoor are legitimately light, but they move the same
functionality into a second moving external dependency — no better than dex, just
different.

---

## 5. node-oidc-provider as the agent-leg IdP (evaluation)

**It covers the full contract** (verified §3.2) and it is the only candidate that is
**in-ecosystem** (npm/TypeScript, same runtime as the app). Concretely for local-pm:

```js
// sketch — the whole dev IdP (config/dex equivalent), ~60 lines
import { Provider } from 'oidc-provider';                     // MIT, v9.12.2 [R1]
const provider = new Provider('http://oidc-dev:5556', {
  clients: [
    { // human: confidential client, auth-code + PKCE (S256)
      client_id: 'local-pm-web', client_secret: 'dev-secret',
      redirect_uris: ['http://localhost:3010/api/auth/oidc/callback'],
      grant_types: ['authorization_code'], response_types: ['code'],
    },
    { // agent: m2m client
      client_id: 'local-pm-mcp', client_secret: 'dev-secret-mcp',
      grant_types: ['client_credentials'],
      scope: 'openid profile groups',
    },
  ],
  features: { clientCredentials: { enabled: true } },          // [R1]
  claims: { profile: ['preferred_username'], groups: ['groups'] }, // role source for OIDC_ROLE_MAP [R1]
  // interaction: the only real work — wire a one-click (or auto-submit) consent/login page
  // for the human leg; the MCP leg never touches it.
  findAccount: async (ctx, id) => ({ accountId: id, claims: async () => ({ sub: id, groups: ['human'] }) }),
});
provider.listen(5556);
```

- **Deterministic** — we control tokens, exp, groups, and can mint negative cases (tampered
  sig, wrong iss, expired) on demand for the smoke script. Matches the unit-test philosophy
  already in o1.oidc-core.test.ts, but over real HTTP.
- **No external release cadence** — the package lives in our lockfile.
- **OpenID Certified** for the flows we use [R1], so "compliant issuer" (AC-6) testing is
  real, not mocked.
- **Interaction UI is the one cost** — the human leg needs a minimal login/consent page
  (the library expects an "interaction" step [R1]). A single static page with an auto-post
  suffices for E2E. This is genuinely the only code to write.
- **Caveat to record:** sole maintainer [R1] — as a *dev-only* dependency (devDependency +
  compose profile, never shipped) that risk is acceptable.

---

## 6. Recommendation

### (a) IdP dev/E2E for the `oidc` profile

**Keep dex, add `node-oidc-provider` alongside it as the agent/MCP leg IdP.**

1. **dex stays** exactly as shipped today (`ghcr.io/dexidp/dex:v2.45.1` + existing
   config): the human leg (auth-code + PKCE) is verified working E2E (skill note,
   2026-09-10) and dex is the IdP closest in spirit to the project (single binary, 50 MB
   image, memory storage, YAML-only).
2. **Add a tiny `oidc-dev` Node service** (node-oidc-provider) to the same compose
   profile, serving **client_credentials** for the MCP leg. The smoke script's m2m section
   points at it. This unblocks AC-3/AC-5/AC-11/AC-12 E2E **now**, instead of betting on
   dex's release cadence — especially given the groups-claim bug found an extra fix cycle
   after the grant itself (#4690 → #4691).
3. **Both IdPs validate the issuer-agnostic contract (AC-6) for free:** two different
   issuers, one unchanged app config surface — that is exactly the criterion's intent, and
   it's worth more than any single provider.
4. **When dex ships a release with #4583 + #4691** (watch `v2.45.2`/`v2.46.0`), the m2m
   section can be repointed to dex and the extra service dropped — a compose-only
   operation. Until then, `grantTypes: client_credentials` stays inert in the dex config
   exactly as documented there today.

**Rejected alternatives** (with reasons): Keycloak/Authentik — overprovisioned by 1–2
orders of magnitude in RAM/services for a loopback dev stack [R3]; Hydra — requires
building a login/consent app to do what dex already does [R12]; Zitadel — excellent
product but AGPL-3.0 + always needs a real DB [R7][R8]; Authelia/Casdoor — viable
full-contract replacements, but they swap one external dependency for another with no
dev-experience gain; fosite — wrong language for this repo [R22].

### (b) Keep or replace dex for the human leg now?

**Keep.** The human leg works today; replacing it trades a verified asset for an
unverified migration with zero functional gain. Re-evaluate only if: (i) dex fails to
release for many more months AND the operator wants a single IdP; or (ii) production
target IdP turns out to be Authelia/Casdoor-class, in which case making that IdP the dev
IdP gives maximum fidelity. For (b)-now, the answer is no change.

### Implementation sketch (compose-only, no app changes)

- `docker-compose.oidc.yml`: add service `oidc-dev` (build from a 20-line
  `config/oidc-dev/` folder with the sketch above), loopback-only port (e.g. 5557), same
  pattern as `dex`.
- `.env.oidc.example`: point the **MCP** client env (`OIDC_ISSUER` etc. of
  packages/mcp-server) at the oidc-dev issuer; the **web** app env stays on dex.
- Smoke script (T2): extend m2m section to run against oidc-dev; human section unchanged
  on dex.
- Dependency: `oidc-provider` as devDependency of `apps/web` (or a standalone tiny
  package) — dev-only.

---

## 7. References

All URLs surfaced by donsetch `web_search` then fetched with `web_fetch`, or pulled live
from the GitHub REST API (`gh api`, 2026-09-10) / Docker Hub registry API / npm registry.
No constructed URLs.

| # | Source | What it verified |
|---|---|---|
| R1 | https://github.com/panva/node-oidc-provider · https://github.com/panva/node-oidc-provider/blob/main/docs/README.md | OpenID Certified list (Basic/Config/FAPI…); `features.clientCredentials`; `claims` parameter; "Client Credentials only clients" recipe; v9.x support table; sole-maintainer statement; mountable to express/koa. npm: v9.12.2, MIT (npm registry API, 2026-09-10). |
| R2 | https://github.com/panva/node-oidc-provider/tree/main/test | Test-suite dirs incl. `client_credentials`, `claims`, `pkce` (`code` integration dirs) — the grant is covered by the project's own tests. |
| R3 | https://use-apify.com/blog/authentik-vs-keycloak-2026 | Measured idle RAM: Authentik stack ~600 MB (4 services: server+worker+postgres+redis), Keycloak ~1.5 GB (with postgres; 60–90 s boot); setup complexity comparison; Keycloak Apache-2.0, Authentik MIT core + enterprise. |
| R4 | https://www.authelia.com/integration/openid-connect/introduction/ | Grant-types table: `client_credentials` **Supported** (note: no `openid`/`offline` scopes for such clients); `authorization_code` supported; OpenID Certified (Core/Discovery/Form Post). |
| R5 | https://www.houseoffoss.com/post/authelia-vs-authentik-which-self-hosted-identity-provider-is-better-in-2025 | Authelia: 20 MB image, ~30 MB RAM, YAML config. |
| R6 | https://eastkode.in/articles/authelia-vs-authentik-vs-keycloak-sso-2026 · https://blog.elest.io/authentik-vs-authelia-vs-keycloak-choosing-the-right-self-hosted-identity-provider-in-2026 | Homelab comparison: Authelia ~40 MB RAM / 8-min setup vs Authentik 120 MB vs Keycloak 280 MB (one measurement set); "container under 20 MB / less than 30 MB memory" (another set). |
| R7 | https://zitadel.com/docs/guides/integrate/service-accounts/client-credentials | Official Zitadel client-credentials guide (service account + secret, `grant_type=client_credentials`, basic auth; opaque token default, JWT optional). |
| R8 | https://github.com/zitadel/zitadel/discussions/5170 | client-credentials grant on machine users shipped in Zitadel v2.19.1. |
| R9 | https://rawkode.academy/courses/complete-guide-zitadel | Zitadel self-host tutorial covers PKCE flow + introspection + roles. |
| R10 | https://ory.sh/docs/hydra (official Ory Hydra page, surfaced by search) | "Implements the complete OAuth 2.0 standard as authorization code, client credentials, refresh token, PKCE…"; "optimized for… low resource". |
| R11 | https://www.naiyer.dev/post/2023/06/21/client-credentials-flow-with-ory-hydra/ (surfaced by search as "Client Credentials flow with Ory Hydra") | Walkthrough of the grant with curl + client registration. |
| R12 | https://www.ory.sh/hydra/docs/ (quickstart, surfaced by search: "Ory Hydra (OAuth2) Quickstart") | Quickstart requires the exemplary **Login & Consent App** alongside hydra + DB → Hydra alone has no login UI/user store. |
| R13 | https://casdoor.org/docs/how-to-connect/oauth | Supported grant types incl. Client Credentials; "Use Client Credentials Grant when the application has no frontend"; Enable Client Credentials for the app. |
| R14 | https://casdoor.github.io/docs/basic/public-api | "Client ID and Client Secret (M2M): use this for machine-to-machine calls (no user)." |
| R15 | https://www.keycloak.org/docs/latest/server_admin/ (sections surfaced by search: Service accounts) | "The Client Credentials Grant creates a token based on the metadata and permissions of a service account associated with the client"; service-account roles tab; role protocol mappers shape claims. |
| R16 | https://www.keycloak.org/docs/latest/server_admin/ (roles/groups sections) | roles/groups model and token mapping (same fetched guide). |
| R17 | https://www.keycloak.org/2024/03/keycloak-2400-released (surfaced by search as "Keycloak 24.0.0 released") | JS adapter defaults `pkceMethod` to S256 from 24.0. |
| R18 | https://docs.goauthentik.io/docs/add-secure-apps/providers/oauth2/ (surfaced by search: "Machine-to-Machine (M2M) authentication" / "OAuth 2.0 provider") | "The OAuth 2.0 specification includes the client credentials grant, which allows machine-to-machine (M2M) authentication without user involvement." |
| R19 | Community post surfaced by search: "Authentik offers the OAuth2 client_credentials grant for machine-to-machine (M2M) or service-to-service" | Corroboration of the grant support. |
| R20 | https://logto.io/docs/ (pages surfaced by search: "Machine-to-machine: Auth with Logto", "Secure machine-to-machine authentication & authorization") | "Logto machine-to-machine (M2M) applications adopt the Client Credentials Flow"; M2M roles. |
| R21 | https://github.com/panva/node-oidc-provider/blob/main/lib/actions/grants/authorization_code.js | PKCE enforced in the auth-code grant (code_challenge/code_verifier checks in source). |
| R22 | https://github.com/ory/fosite | "Extensible security first OAuth 2.0 and OpenID Connect SDK for Go", Apache-2.0; implements RFC6749 incl. client_credentials; basis of Hydra. |
| R23 | DeepWiki page surfaced by search: https://deepwiki.com/panva/node-oidc-provider/7.7-pkce-and-state-validation | PKCE + state validation and grant-type coverage listing (Client Credentials Flow among features). |
| R24 | https://github.com/dasniko/testcontainers-keycloak | Keycloak testcontainer: "Spin up a real Keycloak OAuth2/OIDC identity provider… in your Java integration tests — no mocks." |
| R25 | https://skycloak.io/blog/keycloak-testcontainers-automated-testing | CI/CD pattern: real IdP containers for auth tests. |
| R26 | https://andifalk.gitbook.io/openid-connect-workshop/bonus-labs/keycloak-test-containers | Workshop lab: E2E tests of an OIDC resource server against a real Keycloak container. |
| R27 | Reddit thread surfaced by search: "Mocking OAuth2 / OpenID Connect in Spring Boot with WireMock" (r/java) | WireMock pattern + top comment preferring a real Keycloak testcontainer (1–3 s start with prebuilt image). |
| R28 | https://hoop.dev/blog/effective-strategies-for-oidc-integration-testing | Testing doctrine: use your actual IdP for E2E ("mocking… removes truth"); automate token validation incl. negative cases; run on every build. |
| R29 | dex GitHub API (2026-09-10): releases list; issues #4690; PR #4691; PR #4583 (per repo data) | v2.45.1 (2026-03-03) = latest release; #4583 merged 2026-03-03 (unreleased); #4690 (groups never populated) closed 2026-04-14 via merged PR #4691 (merge commit 6f68a40a). |

Internal: [SPC-006](../specs/2026-09-08_SPC-006_oidc-authentication-wiring.md) (§6 agent
identity, §13 env, §16 AC-6) · ADR-002 D6 (dev bootstrap IdP, provider-agnostic contract)
· `config/dex/config.yml` (live status notes of v2.45.1) ·
`docker-compose.oidc.yml` (profile `oidc`) · Hermes skill `local-pm-oidc` (verified E2E
state, 2026-09-10).
