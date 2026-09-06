# ADR-002 — OIDC-compliant authentication, agent-scoped access, and identity model expansion

| | |
|---|---|
| **Repo** | `local-pm` (fork local: `aficiomaquinas/local-pm`) |
| **ID** | ADR-002 |
| **Date** | 2026-09-05 |
| **Status** | ACCEPTED (2026-09-05). Implementation to be tracked in a follow-up spec/branch; this ADR implements nothing itself. |
| **Context docs** | [REQ-002 — distinguished actor credentials & role policy](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) · [ADR-001 — local-first, loopback-only, two-identity provisioning](2026-09-05_ADR-001_local-first-loopback-binding.md) · [SPC-001 — Audit trail & restore, §6 Access policy](../specs/2026-09-05_SPC-001_audit-trail-restore.md) |

---

## Context

### Current state (verified in code, 2026-09-05)

- The three collections (`Projects`, `Teams`, `Tickets` in `src/collections/`) declare
  `access: { read/create/update/delete: () => true }`: **there is no authentication**; `req.user`
  is `undefined` on every REST/MCP operation. `src/payload.config.ts` registers no
  auth-enabled collection.
- The MCP server (`mcp-server/`) connects with `LOCAL_PM_URL` only, no credentials:
  today an agent and the operator are indistinguishable at the application layer.
- Payload records the author of a change from the request's authenticated user: without
  auth, the attribution required by REQ-002.2 is impossible (REQ-002 finding, "Current state").

### Current model and its direction

ADR-001 (ACCEPTED) established **two-identity** provisioning — a single master user
(human) and a single master agent user (automation), with distinguished credentials — and the
loopback-only perimeter. REQ-002 makes the outcome normative: unambiguous per-actor credentials
(REQ-002.1), unambiguous attribution (REQ-002.2) and policy-based exclusion of agents from
audit trails and rollbacks (REQ-002.4; normative in §6 of spec SPC-001).

The operator now raises the bar: adopt an **OIDC-compliant, standard, proven**
authentication model, delegating authentication to an OIDC server external to the app, with the
consequent revision of the identity model (from 1 human + 1 agent to **multiple humans and
multiple agents**).

### Consequences this ADR must resolve

1. Delegating to an external IdP requires an identity data model in Payload (linkage to
   token `iss`/`sub`), not just an alternative login.
2. REQ-002.4 must remain guaranteed **under the new scheme**: the agent's exclusion from the
   trail becomes expressed against roles derived from token claims.
3. With N humans and N agents, data boundaries appear (by groups?) and the super-admin
   question (separate panel or a view inside the existing admin?).
4. The OIDC provider is **not** chosen here: the system must be agnostic as to whether the issuer
   is an already-provisioned self-hosted service (or cloud), parameterizable per environment; and a
   minimal no-webui bootstrap path must exist for development.

## Decision

Proposal (status PROPOSED, subject to user review):

- **D1 — Delegated OIDC-compliant authentication.** Payload does not authenticate its own
  credentials: it validates tokens issued by a configurable OIDC issuer (`OIDC_ISSUER`,
  `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` via env, `.well-known/openid-configuration` discovery).
  The app is a standard relying party; **provider choice is out of this ADR's scope** (authentik,
  auth0, keycloak, better-auth, zitadel, etc. are not decided): any issuer compliant with
  the D2/D3 flows must work without code changes.
- **D2 — Humans: Authorization Code flow + PKCE**, with Payload HTTP-only session cookies
  after token validation (the app is server-rendered; there is no separate SPA exposed to
  code interception). ID/access token claims (`sub`, `iss`, `groups`/`roles`) resolve identity
  and application roles.
- **D3 — Agents: client credentials grant** (OAuth 2.0, RFC 6749 §4.4) for M2M: each agent is
  a confidential client with its own `client_id`/`client_secret` and obtains short-lived
  access tokens; no refresh tokens in this flow. An agent **never** uses a human's
  credentials (REQ-002.1).
- **D4 — Actor type as a first-class claim.** The application role derives from token claims
  (`groups`/`roles`) with an explicit mapping to a closed `AppRole` enum (`superadmin`,
  `human`, `agent`); the actor type (`human|agent`) is a persisted field on the Payload
  identity, not inferred from the token after the fact. The mapping is configuration, not code:
  switching providers requires no ACL changes.
- **D5 — readVersions human-exclusive; restore likewise.** The `readVersions` ACL of the three
  collections and the restore operation (`POST /api/{slug}/versions/:id`) deny every `agent` role,
  without exception, fulfilling REQ-002.4 and §6 of spec SPC-001. This is operational
  tamper-evidence: an agent able to rewrite history nullifies the audit trail's purpose.
- **D6 — Minimal self-bootstrapable OIDC provider for dev only.** As a **development bootstrap
  option** (not a provider choice), this ADR documents the profile of a no-webui provider,
  startable with static config and pre-declared clients (dex's case: config-driven, no
  administrative GUI), so that `docker compose up` in dev mode suffices to exercise the full
  flow without depending on the already-provisioned production IdP.
- **D7 — Super-admin as a view/ACL inside the single admin** (no separate panel): see the
  "Super admin recommendation" section.

## Data Model

The proposed data model (TypeScript contracts; the concrete collections and `payload-types.ts`
are generated at implementation time — this ADR implements nothing):

```ts
// ── Tipos de identidad ──────────────────────────────────────────────────────

/** Application role (closed). Derived from token claims on every login/exchange. */
export type AppRole = 'superadmin' | 'human' | 'agent'

/** Actor nature, persisted. Drives the structural ACLs (REQ-002.4). */
export type ActorType = 'human' | 'agent'

/** Entry channel, for unambiguous attribution (REQ-002.2). */
export type AuthChannel = 'webui' | 'mcp' | 'rest'

/** External OIDC identity: the (iss, sub) pair is the actor's unique, immutable key. */
export interface OidcIdentity {
  /** Token Issuer Identifier (https, exact as emitted by the provider). */
  iss: string
  /** Token Subject, unique within the issuer. */
  sub: string
  /** Raw groups/roles received at login (mapping audit). */
  rawGroups: string[]
}

/** Document of the auth-enabled `users` collection (Payload). */
export interface LocalPmUser {
  id: string
  email?: string            // M2M agents may have no real email
  name?: string
  actorType: ActorType      // 'human' | 'agent' — never inferred on the fly
  roles: AppRole[]          // derived from claims via the D4 mapping
  identity: OidcIdentity | null  // null only during temporary migration (phase 1 → 2)
  active: boolean           // local kill-switch without waiting on the IdP
  // Native Payload auth fields (hash/salt/email) present per strategy
}

/** Minimum claims the app must be able to read from the token (per-provider config). */
export interface OidcClaimsMapping {
  groupsClaim: string       // e.g. 'groups' | 'roles' | 'local_pm_roles'
  roles: Record<string, AppRole>  // claim value → AppRole (config, not code)
  superAdminGroup: string   // group mapping to 'superadmin'
  agentClientIds: string[]  // client_id values the app recognizes as agent actors
}

/** Actor resolution for an authenticated request (what the ACLs see). */
export interface AuthenticatedActor {
  user: LocalPmUser
  roles: readonly AppRole[]
  isAgent: boolean          // sugar for `roles.includes('agent')` in ACLs
  channel: AuthChannel      // webui | mcp | rest — stamped into audit
}
```

Structural changes relative to the ADR-001/REQ-002 1+1 model:

1. **`(iss, sub)` linkage**: actor uniqueness becomes `(identity.iss, identity.sub)`
   (composite unique index in Mongo). Email stops being the identity key; it is an attribute.
2. **From 1+1 to N+N**: nothing in the model bounds the number of `LocalPmUser`; ADR-001's
   "single master" becomes a special case (the first provisioned user, role `superadmin` or
   `human` per provisioning decision — see Open questions). REQ-002.1's credential uniqueness
   and distinction are preserved: every actor has its own client/identity.
3. **Derived roles, persisted type**: `roles` re-derives from the token on every
   authentication (effective revocation on token expiry), but `actorType` is persisted: the
   structural guarantees of REQ-002.4 do not depend on whether the IdP emits a claim at a
   given moment.
4. **Attribution**: the `(actor, channel)` pair becomes available in `req.user` + `req` so the
   audit trail module (SPC-001, gap G-1) can stamp author and channel unambiguously (REQ-002.2).

## ACL mapping

Normative map REQ-002.4 / SPC-001 §6 → proposed roles:

| Operation (Payload) | `agent` | `human` | `superadmin` | Norm |
|---|---|---|---|---|
| `read` (projects/teams/tickets) | ✓ | ✓ | ✓ | REQ-002.1 (identified) |
| `create/update/delete` (colecciones de negocio) | ✓ | ✓ | ✓ | REQ-002.1 |
| `readVersions` (GET `/api/{slug}/versions*`) | **✗ DENIED** | ✓ | ✓ | REQ-002.4, SPC-001 §6 |
| Restore (`POST /api/{slug}/versions/:id`) | **✗ DENIED** | ✓ | ✓ | REQ-002.4, SPC-001 §6 |
| `admin` (acceso al Admin Panel) | ✗ | ✓ | ✓ | Decision D7 |
| `users` management (invite, activate/deactivate) | ✗ | ✗ | ✓ | Administration boundary |
| Claims → roles mapping (config) | — | — | — | Decision D4 |

Notas:

- The agent denial is **by policy (ACL), not by convention**: with a valid agent credential,
  `readVersions` and restore respond denied. SPC-001 §7.7 already mandates that test.
- With group-based boundaries (phase 3, Migration path), business-collection `read` may
  return **query constraints** (Payload supports returning a query instead of a boolean,
  restricting documents by the actor's group) instead of a global `true`.
- Business `create/update/delete` remains allowed for agents: that is their function (ticket/
  project/team mutations via MCP/REST, REQ-002 "Provisioning model"). The dividing line is the
  history, not the operation.

## Code impact

Identified change areas (not implemented):

1. **Authentication strategy in Payload.** Payload 3.x supports auth-enabled collections with
   custom strategies (`auth.strategies`, an `authenticate` that receives headers and returns the
   Payload user or null) and `disableLocalStrategy` when the native email/password strategy is
   not used. Proposal: an auth-enabled `users` collection with an OIDC strategy that validates
   the token (signature via the issuer's JWKS, `iss`, `aud`, expiry) and resolves an
   `AuthenticatedActor`; Payload's HTTP-only cookie flow is kept for the admin session.
   Integrating alternative: the community plugin `payload-plugin-oidc` exists (sign-in with a
   custom provider, login button, optional user creation, configurable callback), but its scope
   covers human login only — not agent client-credentials nor this ADR's role mapping; its
   maintenance and Payload 3.x compatibility must be evaluated at implementation time.
2. **Callback / exchange endpoints** (Next.js server-side routes): authorization code + PKCE
   for humans; bearer token validation for M2M.
3. **MCP server**: add a client credentials flow (issuer token endpoint, token cache until
   expiry, `Authorization: Bearer` on every fetch). Today it uses bare `LOCAL_PM_URL`.
4. **ACLs**: replace `access: () => true` with the "ACL mapping" functions; add explicit
   `readVersions` when SPC-001 introduces `versions: true`.
5. **Admin UI login**: a "Sign in with <issuer>" button/redirect on the admin login view
   (Payload allows customizing admin views and components); agents do not access the admin.
6. **Typing**: the "Data Model" interfaces in `src/types/`; `payload-types.ts` regenerated when
   the auth-enabled collection is added.

## DB impact

- **New auth-enabled `users` collection** (Payload auth: native `hash`/`salt`/`email` fields
  per strategy). Documents: `LocalPmUser` shape.
- **Indexes**: composite unique `(identity.iss, identity.sub)`; unique on `email` when present;
  index on `actorType` for administrative queries.
- **`_slug_versions` collections** (future, SPC-001): unchanged by this ADR; their
  `readVersions` ACL is what gets restricted.
- **Existing data migration**: there are no users today; no identity backfill. The bootstrap
  creates the first user(s) (phase 1 of the Migration path). Payload generates the schema
  (Mongo collections are created on first write); no data migration scripts are required,
  only initial provisioning.

## Migration path

Proposed phases (incremental; each leaves the system coherent):

1. **Phase 0 — today**: `access: () => true` everywhere; no auth; no attribution.
2. **Phase 1 — two identities over OIDC (fulfills REQ-002 in its 1+1 form):** parameterizable
   OIDC issuer; exactly two identities provisioned (human master user via code+PKCE;
   master agent user via client credentials). "ACL mapping" ACLs active (agents without
   versions/restore). ADR-001 D2 is satisfied by the new mechanism.
3. **Phase 2 — N humans / N agents:** onboarding of additional identities (invited humans;
   one client credentials per agent, each with its own identity). No schema change: the
   (iss, sub) model is already N-compatible. Group boundaries become activatable here: IdP
   groups → query constraints on per-collection `read` (e.g. a `team-x` group sees only its
   projects).
4. **Phase 3 — super-admin and identity administration:** the `superadmin` role manages `users`
   (on/offboarding, deactivation), reviews the claims mapping and audits attribution. The app
   never was multi-tenant and will not become so in this phase (ADR-001 non-goals intact).

The order guarantees REQ-002.1–.4 are fulfilled from phase 1 onward, and that phases 2–3 are
population and administration extensions, not redesigns.

## Super admin recommendation

**Recommendation: a single admin with `superadmin`-role ACL/conditionals (admin tab / custom
views), NOT a separate panel.** Rationale:

1. **Payload already provides the mechanism**: Admin Panel access is governed by the `admin`
   function of auth-enabled collections, and views/capabilities are conditioned by role (custom
   views, components that hide or show based on `req.user`). A second admin would imply a second
   Payload config or a gating proxy in front — more surface, more deployment, zero gain
   for a loopback-first app.
2. **Case scale**: local-pm is local-first with a handful of identities. Physical panel
   separation makes sense when there are operators who must not even know the administrative
   plane exists; here the same operator is the super-admin.
3. **Reversal cost**: if it ever grew, promoting the administration view to its own route is a
   scoped refactor; merging two duplicated panels is not.
   Concrete proposed form: a custom admin view (`/admin/identity`, say) — `users` listing,
   activate/deactivate, current claims mapping — visible only with the `superadmin` role
   (and protected server-side, not merely hidden in UI: Payload custom views are public by
   default unless secured).

## Alternatives considered

| Alternative | Verdict |
|---|---|
| **Status quo (no auth)** | Rejected: violates REQ-002.1–.3 with productive data; null attribution. |
| **Embedded Payload auth (email/password + API keys, no OIDC)** | Serious and simple: native `auth` + `useAPIKey: true` for the agent (`Authorization: <slug> API-Key <key>`), satisfies 1+1 and the ACL mapping with fewer pieces. **Reasons to prefer OIDC**: (a) the operator's direction toward a proven standard and credential delegation to an IdP; (b) MFA/passkeys/federation live on the provider side; (c) N humans without managing passwords in the app; (d) short-token revocation versus non-expiring API keys. Recorded as a legitimate fallback should the OIDC provider be considered excessive for phase 1. |
| **NextAuth/Auth.js (or Better Auth) as a layer in front of Payload** | Viable and popular, but it introduces a second auth runtime with its own session store and two identity sources of truth to synchronize (custom adapter toward Payload `users`). Payload's native custom strategy achieves the same within a single model (the validated user is a Payload document from the start). Rejected for duplication, not for incapability. |
| **Community plugin `payload-plugin-oidc`** | Covers human login with a custom provider and user creation, but not agent client credentials nor this ADR's actor-type/roles mapping. To be evaluated as a base or reference at implementation time; not adopted as a decision. |
| **Separate super-admin panel** | Rejected: see "Super admin recommendation". |
| **Choosing an OIDC provider now (keycloak/authentik/zitadel/dex/…)** | Out of scope by design of the assignment: the ADR fixes the *contract* (parameterizable issuer, standard flows, mappable claims); the provider is swappable. Dex is mentioned only as a *dev bootstrap profile* (config-driven, no webui), not as a choice. |
| **Agents sharing a human user** | Rejected: violates REQ-002.1 and destroys attribution (REQ-002.2/.3). |

## Open questions

1. **Dev provider for the bootstrap**: the dex profile (static config, no webui, single
   container) versus equally headless alternatives. An implementation decision, not this
   ADR's.
2. **Is the first provisioned human `superadmin` or `human`?** Default proposal:
   `superadmin` (phase 3 needs an owner from day one), to be confirmed by the operator.
3. **Are agents represented as IdP M2M clients (tokens without a user) or as `users` documents
   with `actorType: 'agent'` + client credentials?** Proposal: both at once (a client in
   the IdP + a mirror document with roles and `active`), so they can be deactivated locally
   without touching the IdP. To be confirmed.
4. **Group boundaries: query-constrained reads from phase 2, or global until a new
   decision?** Proposal: global (every identified actor reads everything) in phases 1–2; group
   constraints when the first real need appears.
5. **Human refresh tokens**: short-expiry session cookies + admin auto-refresh versus provider
   refresh tokens. An implementation detail.

## Verification criteria

This ADR verifies (when implemented) if:

1. Every mutation without credentials is rejected (401) on REST, MCP and admin.
2. A change via webUI attributes to the human; one via MCP attributes to the agent; both are
   distinguishable by `(actor, channel)` — SPC-001 §7.7 / REQ-002.2 requirement.
3. With a valid agent credential: `GET /api/tickets/versions` → denied; `POST
   /api/tickets/versions/:id` → denied; the master user gets 200 on both (REQ-002.4).
4. Pointing `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` at another compliant provider
   requires no code changes (config and claims mapping only).
5. Two humans and two agents operate simultaneously with correct attribution (phase 2).
6. The `superadmin` role accesses identity administration; `human` does not see it; `agent`
   neither, and does not access the admin.
7. Dev mode boots the full OIDC flow with the bootstrap provider without any provider
   webui interaction (D6).

## References

Everything cited was read for this ADR (donsetch searches + fetch of the resulting URLs;
no guessed URLs):

| Source | What it contributed |
|---|---|
| [Payload — Authentication Overview](https://payloadcms.com/docs/authentication/overview) | Opciones de `auth` en colecciones (`tokenExpiration`, `useAPIKey`, `useSessions`, `disableLocalStrategy`, `strategies`), estrategias nativas (cookies HTTP-only, JWT, API keys) y auto-login de desarrollo. |
| [Payload — Custom Strategies](https://payloadcms.com/docs/authentication/custom-strategies) | Mechanics of a custom strategy (`authenticate` receiving `payload`/`headers` → user or null; `disableLocalStrategy: true`), basis of Code impact §1. |
| [Payload — API Key Strategy](https://payloadcms.com/docs/authentication/api-keys) | `useAPIKey: true`, `Authorization: <slug> API-Key <key>` header, key encryption in DB, `disableLocalStrategy` for API-key-only; used in the "embedded auth" alternative. |
| [Payload — Collection Access Control](https://payloadcms.com/docs/access-control/collections) | Per-collection `create/read/update/delete/admin/unlock/readVersions` functions; `readVersions` also restricts the versions UI; queries as constraints — basis of the ACL mapping and group boundaries. |
| [Payload — Customizing Views](https://payloadcms.com/docs/custom-components/custom-views) | Admin custom views (`admin.components.views`), their security (public by default) — basis of the super-admin recommendation. |
| [payload-plugin-oidc (GitHub, gousta)](https://github.com/gousta/payload-plugin-oidc) | Existing community OIDC plugin: features (sign-in with a custom provider, login button, optional user creation, role mapping from userinfo) and its limits against this ADR. |
| [dexidp/dex (GitHub)](https://github.com/dexidp/dex) | Dex as a config-driven federated OIDC provider; sample ID token with `iss/sub/aud/groups` claims; connector table and `groups` claim support — the D6 dev-bootstrap profile. |
| [Pocket ID (GitHub)](https://github.com/pocket-id/pocket-id) | Minimal self-hosted OIDC provider (OIDC cert, passkeys, docker) — weight contrast for the dev bootstrap; its admin webui keeps it away from the no-webui profile. |
| [oauth.net — Client Credentials Grant](https://oauth.net/2/grant-types/client-credentials/) | Definition of the M2M flow (RFC 6749 §4.4): no redirect, no user, no refresh token; short tokens — basis of D3. |
| [RFC 6749 — The OAuth 2.0 Authorization Framework](https://www.rfc-editor.org/info/rfc6749/) | Normative framework of the client credentials grant cited by oauth.net. |
| [Auth0 — Authorization Code Flow with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce) | Step-by-step code+PKCE mechanics (code_verifier/challenge, id+access token) — basis of D2. |
| [Microsoft Entra — client credentials flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow) | "Two-legged" M2M flow, permissions to the application itself, absence of refresh tokens, authorization by client-id ACL — reinforces D3 and the `agentClientIds` field. |
| [Zitadel — Zitadel vs Keycloak](https://zitadel.com/blog/zitadel-vs-keycloak) | Self-hosted provider contrast (supported protocols, multi-tenancy, IdP audit trail) — context for leaving provider choice out without ignoring it. |

Internal references: [REQ-002](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md)
(Contrasted requirement — provisioning model, REQ-002.1–.4, open decision D-R2) ·
[ADR-001](2026-09-05_ADR-001_local-first-loopback-binding.md) (ACCEPTED — loopback-only,
two-identity provisioning, non-goals) · [SPC-001 — Audit trail & restore](../specs/2026-09-05_SPC-001_audit-trail-restore.md)
(§6 normative Access policy; §7.7 agent-denial verification; G-1 author attribution) ·
Code: `src/payload.config.ts`, `src/collections/{Projects,Teams,Tickets}.ts` (`access: () => true`),
`mcp-server/` (`LOCAL_PM_URL`, no credentials).
