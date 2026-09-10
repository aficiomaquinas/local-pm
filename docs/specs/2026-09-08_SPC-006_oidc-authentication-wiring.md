# Spec — SPC-006 OIDC Authentication Wiring (ADR-002 implementation design)

| | |
|---|---|
| **Repo** | `local-pm` (fork local: `aficiomaquinas/local-pm`, branch `feat/spc006-oidc-wiring`) |
| **ID** | SPC-006 |
| **Date** | 2026-09-08 |
| **Status** | DRAFT (pending operator review) — this spec designs; it implements nothing |
| **Type** | Specification (implementation design for ADR-002) |
| **Depends on** | [ADR-002 — OIDC-compliant authentication (ACCEPTED)](../adr/2026-09-05_ADR-002_oidc-authentication.md) · [REQ-002 — distinguished actor credentials](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) · SPC-001 §6 (access policy) · SPC-004 §4e/R-4 (data management policy) · SPC-005 (actor attribution, implemented) |
| **Related** | [SPC-001 — audit trail & restore](2026-09-05_SPC-001_audit-trail-restore.md) · [SPC-004 — import/export & snapshots](2026-09-07_SPC-004_import-export-snapshots.md) · [SPC-005 — audit attribution & retention](2026-09-08_SPC-005_audit-attribution-retention.md) |
| **Scope driver** | Operator instruction 2026-09-08: "diseño completo del wiring OIDC sobre la users collection existente… NO implementar" |

Research contract honored: every external claim below is cited `[Rn]` to §19 References
(all URLs surfaced by donsetch web searches, then fetched; no guessed URLs). Items not
confirmed by a fetched source are marked **[unverified]**.

**Optionality principle (operator requirement, 2026-09-09):** OIDC is an *opt-in module*,
consistent with the upstream contribution offer (anaskasmi/local-pm#2): with
`OIDC_ENABLED=false` (the default) the system behaves exactly as today — local
email/password login, first-register, no IdP dependency, no new boot-time failure modes.
The simple single-user + single-agent setup stays simple; nothing in M0–M6 forces an
external IdP. The only irreversible step (M7, `disableLocalStrategy: true`) stays
behind an explicit operator gate (OD-1, §18).

---

## 1. Objective

Design the concrete wiring that turns ADR-002 (ACCEPTED, implements nothing) into an
implementable plan over the code that exists today:

1. A custom auth strategy on the existing `users` collection (Payload 3.88 `auth.strategies`).
2. The human flow: Authorization Code + PKCE in Next.js App Router route handlers.
3. The agent flow: OAuth 2.0 client credentials (RFC 6749 §4.4) resolved to an `agent` user.
4. Configurable claims→roles mapping (env, not code).
5. The interaction of all of the above with the shipped ACL modules (`actorPolicy.ts`,
   `dataManagementPolicy.ts`) — which must keep denying agents the audit trail.
6. MCP server bearer authentication (today it sends no credentials at all).
7. Env vars, migration steps, acceptance criteria, and risks.

## 2. Current state (repo evidence, verified 2026-09-08)

- **E-1** — `apps/web/src/collections/Users.ts` is the SPC-004 §5.5/D-2 minimal bridge:
  `auth: true` (local email/password strategy), fields `name`, `actorType`
  (`superadmin|human|agent`, default `human`), `active` (kill-switch). Its docblock says
  "ADR-002 subsumes this collection later; do not extend it toward OIDC here" — this spec
  is that extension. The single master user is created via first-register.
- **E-2** — `apps/web/src/access/actorPolicy.ts` (SPC-001 §6, normative):
  `resolveActorType()` → `'user' | 'agent' | null` from `req.user` markers
  (`actorType === 'agent'` wins; explicit `'user'`; legacy `roles[]`/`isAgent` markers;
  default `'user'` when a user exists; `null` when no user). `denyAgents` /
  `restoreMasterOnly` allow only the master identity; `enforceMasterOnlyPolicy` throws
  403 (agent) / 401 (anonymous) on the audit surfaces.
- **E-3** — `apps/web/src/access/dataManagementPolicy.ts` (SPC-004 §4e/R-4):
  exports/imports are superadmin-only; `resolveDataManagementActor()` maps bridge
  `actorType` `superadmin|human` → `'user'`, `agent` → `'agent'`, and already
  accepts a post-ADR-002 `role === 'superadmin'` claim on the user document.
- **E-4** — The three business collections carry `readVersions: denyAgents`,
  restore-via-`beforeOperation` guard, `blockHardDelete`, and `maxPerDoc: 100`
  (SPC-001/SPC-005).
- **E-5** — `packages/mcp-server/src/index.ts`: `apiRequest()` (line ~157) does a bare
  `fetch(\`${LOCAL_PM_URL}/api${endpoint}\`)` with only `Content-Type`; no `Authorization`
  header, no credentials anywhere in the file. `LOCAL_PM_URL` is its only env input.
- **E-6** — `apps/web/src/payload.config.ts` registers `[Projects, Teams, Tickets, Users]`;
  `.env.example` holds only `DATABASE_URI`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`.
- **E-7** — A real master user exists on the dev master branch (first-register flow in
  use). Any wiring must not orphan it.

## 3. Design overview

```
                    ┌────────────────────────── OIDC Issuer (any compliant IdP) ─────────┐
                    │  /.well-known/openid-configuration   /authorize  /token  /jwks    │
                    │  /userinfo  /introspect (optional)                                 │
                    └───────┬──────────────────────────────────────────┬────────────────┘
                            │ code+PKCE (human, browser)               │ client_credentials (agent, server-to-server)
   ┌────────────────────────▼───────────────┐          ┌──────────────▼──────────────────────────┐
   │ apps/web (Next 15 route handlers)      │          │ packages/mcp-server (stdio MCP)         │
   │ /api/auth/oidc/authorize  → redirect   │          │ token cache → Authorization: Bearer     │
   │ /api/auth/oidc/callback   → exchange + │          │ on every apiRequest()                   │
   │   id_token verify (JWKS) + upsert user │          └──────────────┬──────────────────────────┘
   │   + set Payload session cookie         │                         │ Bearer <access_token>
   │ /api/auth/oidc/logout     → clear      │                        ▼
   └────────────────────────┬───────────────┐   ┌─────────────────────────────────────────────┐
                            │ payload-token │   │ Payload 3.88 (payload.config.ts)            │
                            ▼               │   │ users collection:                           │
   ┌────────────────────────────────────┐   │   │   auth.local strategy (kept for now, OD-1)  │
   │ Admin panel / REST (same origin)   │◄──┘   │   │ auth.strategies[oidc]: authenticate(req)    │
   │ req.user = users doc               │       │   │     → verify Bearer JWT via issuer JWKS     │
   │ ACLs: actorPolicy/dataManagement   │       │   │     → (iss,sub | client_id) → user doc      │
   └────────────────────────────────────┘       └─────────────────────────────────────────────┘
```

Two credentials doors, one identity store:

- **Humans** authenticate at the IdP (code + PKCE) inside Next route handlers; the app
  then holds a **Payload session cookie** (HTTP-only) exactly like today's local login.
  The browser never sees an OIDC token [R5][R6].
- **Agents** obtain short-lived access tokens from the IdP via client credentials and
  present `Authorization: Bearer` on each REST call; Payload's custom strategy validates
  the token on every request [R1].

## 4. D-1 — Custom auth strategy on `users`

Payload 3.x replaced Passport with first-class custom strategies: an entry in
`auth.strategies` with `name` and `authenticate({ payload, headers, ... })` that returns
`{ user: { collection: 'users', ...doc } | null, responseHeaders? }`; the local
email/password strategy is disabled with `auth.disableLocalStrategy: true` **only if
replaced entirely** [R1]. Strategies execute on every request against auth surfaces and
receive the raw request `headers` [R1]; changes to strategies require a server restart
(no hot reload) [R1].

Design for `apps/web/src/collections/Users.ts`:

```ts
auth: {
  // OD-1 (open): keep local strategy until the operator confirms removal.
  // Keeping it preserves first-register (E-7) and gives a fallback login.
  disableLocalStrategy: false,
  strategies: [
    {
      name: 'oidc',
      authenticate: async ({ payload, headers }) => {
        const auth = headers.get('authorization') ?? ''
        if (!auth.toLowerCase().startsWith('bearer ')) return { user: null }
        const token = auth.slice(7).trim()
        const actor = await resolveOidcActor(payload, token) // §5–§7
        return { user: actor } // null → unauthenticated (fail-closed)
      },
    },
  ],
}
```

Resolution order inside `resolveOidcActor`:

1. Verify signature via the issuer's JWKS (`createRemoteJWKSet`) and claims `iss`, `aud`
   (when `OIDC_AUDIENCE` set), `exp`/`nbf` with `OIDC_CLOCK_SKEW_SECONDS` tolerance,
   using `jose.jwtVerify` [R7]. Any failure → `{ user: null }` (never throw into the
   request pipeline).
2. Classify the actor: if a client-id claim (`OIDC_AGENT_CLIENT_ID_CLAIM`, default
   `azp`; fallbacks `client_id`, `cid` — naming varies per issuer **[unverified]**)
   matches an entry of `OIDC_AGENT_CLIENT_IDS` → agent path (§6). Otherwise → human path
   (§5) keyed by `(iss, `sub`)`.
3. Upsert the `users` document (§8) and return it with the collection slug attached, as
   the strategy contract requires [R1].

What the strategy deliberately does **not** do: no HTTP redirects, no state/PKCE —
those live in the Next endpoints (§5). The strategy is a pure request→user function,
matching Payload's own built-ins [R1].

### Session shape

After a human login the app keeps using Payload's native session cookie; the strategy
never mints sessions itself. Precedent for setting the standard `payload-token` cookie
from a custom callback exists in the community (the Payload-era Passport/OIDC thread
mints a JWT signed with `payload.secret` and sets the `<prefix>-token` cookie) [R9];
in Payload 3 the supported equivalents are the local strategy's own cookie handling for
password login and the auth operations' cookie renewal for refresh [R4]. Implementation
note for the callback (§5): the hand-off mechanism must produce a cookie Payload's local
strategy recognizes — either `payload.login()` against the kept local strategy
(requires the user to have a password — not true for OIDC-provisioned users) or signing
a Payload-format JWT `{ id, collection: 'users', email }` with `payload.secret` and
setting the standard cookie with `getCookieExpiration(tokenExpiration)` [R9]. The spec
mandates the second (JWT cookie) path; it is one dependency-free function in
`src/lib/oidc/session.ts` and mirrors what the community solution proved works [R9].

## 5. D-2 — Human flow: Authorization Code + PKCE (Next route handlers)

Route handlers (Next 15 App Router, server-only; no token ever reaches the browser) [R5]:

| Route | Method | Responsibility |
|---|---|---|
| `apps/web/src/app/api/auth/oidc/authorize/route.ts` | GET | Discovery (cached) → generate `code_verifier` + S256 `code_challenge` + `state` + `nonce` → stash all three in short-lived HTTP-only cookies (10 min) → 302 to `authorization_endpoint` with `response_type=code`, `client_id`, `redirect_uri`, `scope=OIDC_SCOPE`, `code_challenge_method=S256` [R5][R6]. |
| `apps/web/src/app/api/auth/oidc/callback/route.ts` | GET | Validate `state` against cookie (CSRF) → token exchange (server-to-server, `application/x-www-form-urlencoded`, `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret`, `code_verifier`) [R5][R6] → validate ID token per §4 step 1 **plus**: `nonce` matches the stashed value, `azp`/`aud` checks per OIDC Core ID Token Validation §3.1.3.7 [R8] → upsert user by `(iss, sub)` (§8) → derive roles (§7) → set Payload session cookie (§4) → delete the PKCE/state/nonce cookies → 302 `/admin`. |
| `apps/web/src/app/api/auth/oidc/logout/route.ts` | GET/POST | Clear the Payload session cookie (server-side; HTTP-only cookies are untouchable from JS [R4]) → if discovery exposes `end_session_endpoint`, redirect there with `post_logout_redirect_uri` and `id_token_hint` [R6]; otherwise land on `/`. |

Flow-level decisions, each grounded:

- **PKCE with S256 is mandatory even for this confidential client** — OAuth 2.1 makes
  PKCE required for the authorization code flow, and it costs nothing server-side [R5].
  `state` is validated on callback (CSRF) and `nonce` is bound into the ID token check
  [R5][R8][R10].
- **Exact redirect URI matching** at the issuer (pre-registered
  `{NEXT_PUBLIC_SERVER_URL}/api/auth/oidc/callback`); no wildcard, no open redirectors —
  RFC 9700 BCP [R10].
- **Discovery** (`{OIDC_ISSUER}/.well-known/openid-configuration`) is fetched lazily on
  first use and cached in-process (TTL `OIDC_DISCOVERY_TTL_SECONDS`, default 3600);
  boot does not depend on the IdP being up (loopback-friendly). Endpoints used:
  `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `userinfo_endpoint`
  (optional), `end_session_endpoint` (optional) [R5][R6].
- **userinfo is a fallback, not the identity source**: identity comes from the validated
  ID token `(iss, sub)`; userinfo is fetched only when the groups claim is not present in
  the ID token and `OIDC_GROUPS_CLAIM` must be resolved (some issuers only put groups in
  userinfo **[unverified — issuer-dependent]**).

## 6. D-3 — Agent flow: client credentials (M2M)

Agents are confidential clients at the IdP (RFC 6749 §4.4 client credentials grant: the
client authenticates itself and receives an access token for its own account; the grant
defines no refresh token — §4.4.1 **[unverified body; grant structure verified via TOC
and §2 abstract [R11]; "no refresh tokens" also stated by oauth.net in ADR-002's verified
research]**). Auth0's flow guide frames the same: call your API from a machine-to-machine
application using client credentials [R13].

Agent identity resolution (in `resolveOidcActor`, §4 step 2):

- Match the token's client-id claim against `OIDC_AGENT_CLIENT_IDS`. Precedence:
  `azp` (OIDC Core's authorized-party claim [R8]) → `client_id` → `cid` (issuer-specific
  **[unverified]**), overridable with `OIDC_AGENT_CLIENT_ID_CLAIM`.
- No match → treat as human (`sub` path). A human token therefore can never be promoted
  to agent by claim fiddling, and vice versa: an agent client_id never upserts a human
  document.
- Local kill-switch: the mirror user document's `active: false` (E-1) short-circuits
  `authenticate` → `{ user: null }`, so the operator can disable an agent without
  touching the IdP (ADR-002 open question 3 resolved as "yes, mirror document").

**Verification mode** (`OIDC_VERIFY_MODE`, default `jwks`):

| Mode | Mechanism | When to choose |
|---|---|---|
| `jwks` (default) | Local `jwtVerify` against the issuer JWKS [R7]. Zero network per request (cached keys). Requires JWT access tokens with `OIDC_AUDIENCE` set. | Default for compliant issuers that mint JWTs. Audience restriction is RFC 9700 BCP [R10]. |
| `introspection` | RFC 7662 introspection endpoint per request (POST `token` + client credentials; `active` flag decides) [R14]. | Opaque-token issuers, or when instant revocation matters more than latency. Local scale makes the per-request call acceptable. |

Client-credentials tokens are short-lived by design [R11][R13]; the app holds no agent
secrets beyond its own introspection credentials (in introspection mode only).

## 7. D-4 — Claims → roles mapping (config, not code)

ADR-002 D4: the mapping is configuration so a provider swap needs no ACL changes.
Env-driven mapping (all read at strategy init; a restart applies changes — consistent
with strategies not hot-reloading [R1]):

| Env var | Default | Meaning |
|---|---|---|
| `OIDC_GROUPS_CLAIM` | `groups` | Claim holding group/role values (string or string[]; `roles`, `local_pm_roles`, … are common alternatives). |
| `OIDC_ROLE_MAP` | `{}` | JSON: claim value → AppRole. `{"idp-admins":"superadmin","idp-staff":"human"}`. |
| `OIDC_SUPERADMIN_GROUP` | *(empty)* | Sugar: this single claim value maps to `superadmin` without editing the map. |
| `OIDC_AGENT_CLIENT_IDS` | `[]` | JSON array of client_ids recognized as agents (§6). |

Derivation for a human token: `raw = token[OIDC_GROUPS_CLAIM] ?? []`;
`roles = raw.map(v => OIDC_ROLE_MAP[v] ?? (v === OIDC_SUPERADMIN_GROUP ? 'superadmin' : null)).filter(Boolean)`;
if the result is empty → `['human']` (fail-safe: lowest privilege, never `superadmin`
by absence of claims). Superadmin therefore comes only from an explicit mapped group
claim — satisfying ADR-002's ACL table (users management = superadmin-only).

Worked example for a generic issuer (dex-style static groups):

```jsonc
// .env
OIDC_GROUPS_CLAIM=groups
OIDC_ROLE_MAP={"local-pm-admins":"superadmin","local-pm-users":"human"}
OIDC_AGENT_CLIENT_IDS=["local-pm-agent-rover"]
// token: { iss: "https://id.lan", sub: "u-42", groups: ["local-pm-admins"] }
// → roles: ["superadmin"] → users doc: actorType "superadmin", roles ["superadmin"]
```

Bridge reconciliation (E-1 vs ADR-002 D4): the persisted `actorType` is re-derived on
every login from the mapped roles — `superadmin ∈ roles` → `'superadmin'`; agent client
→ `'agent'`; otherwise `'human'`. The existing `roles` **array** field is added to the
collection (§8) while `actorPolicy.resolveActorType` keeps accepting both the bridge
`actorType` and a legacy `roles[]` marker (E-2) — so the two ACL modules need **zero
code changes** (§9).

## 8. Data model — `users` collection changes

Added fields (additive; nothing existing is removed — first-register keeps working, §12):

| Field | Type | Notes |
|---|---|---|
| `identityIss` | text, indexed | Token `iss`, exactly as emitted. |
| `identitySub` | text, indexed | Token `sub`. Identity key is the pair `(iss, sub)` (ADR-002); email becomes an attribute. |
| `roles` | select (hasMany): `superadmin \| human \| agent` | Re-derived from claims at every login (effective revocation at token expiry, ADR-002). |
| `rawGroups` | JSON array | Unmapped claim values, for mapping audit (ADR-002 `OidcIdentity.rawGroups`). |
| `lastLoginAt` | date | Diagnostics. |
| `lastChannel` | select: `webui \| rest \| mcp` | Best-effort channel stamp (§9 note). |

Uniqueness: the `(identityIss, identitySub)` pair is enforced in the upsert path
(`payload.find` on the pair → create/update, with a retry-on-duplicate guard). A
compound unique index at the Mongo level is desirable; whether Payload 3.88 collection
`indexes` can express *unique* compound indexes is **[unverified]** — if not, the
guarded upsert is the enforcement point and the index stays non-unique (or is created
manually). `email` keeps Payload's native unique handling for local-strategy users.

Agents: `email` may be synthetic (`agent-rover@clients.local` — ADR-002 allows agents
without real emails); `name` carries the client_id; `active` is the kill-switch (§6).

## 9. D-5 — ACL impact: `actorPolicy.ts` / `dataManagementPolicy.ts` unchanged by design

The wiring's contract with the shipped policy modules (E-2, E-3):

- `actorPolicy.resolveActorType(req.user)` sees the same document shape it sees today:
  `actorType: 'agent'` → agent (denied versions/restore/audit); anything else with a
  user → master identity. The OIDC upsert writes `actorType: 'agent'` for agent
  clients, so **an agent presenting a perfectly valid OIDC token still gets 403 on
  `GET /api/{slug}/versions*` and restore** — denial by ACL, not by convention
  (REQ-002.4, SPC-001 §6). This is acceptance criterion AC-3.
- `dataManagementAccess` continues to deny `agent` outright and to allow
  `role === 'superadmin'` (already coded for post-ADR-002 claims, E-3). After this
  wiring, `users.role`... is spelled `roles`; the module reads `user.role` (string).
  **Required code delta (the only ACL-module change):** extend
  `dataManagementAccess` to accept `Array.isArray(user.roles) &&
  user.roles.includes('superadmin')` alongside the existing markers — one-line
  addition, semantics unchanged. Everything else in both modules is untouched.
- Anonymous requests: strategy returns null → `req.user` undefined → `denyAgents` and
  `dataManagementAccess` deny (deny-by-default preserved).
- Superadmin identity: membership in the mapped superadmin group (§7) yields
  `actorType: 'superadmin'` + `roles: ['superadmin']`; the identity-administration view
  (ADR-002 phase 3) is out of this spec's scope.
- Channel stamp (ADR-002 `AuthenticatedActor.channel`): best-effort in this wiring.
  The MCP server will send `X-LocalPM-Channel: mcp` (§10); the strategy copies it into
  the returned user object's `lastChannel` at login time only. Full per-request channel
  attribution in audit entries remains SPC-005's `actorType/actorId/actorLabel` design
  (implemented) and is not re-specified here.

## 10. D-6 — MCP server: bearer token on every fetch

Today `apiRequest()` sends no credentials (E-5). Design for
`packages/mcp-server/src/index.ts`:

- New env: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (the *agent* client's
  own credentials, from the MCP process env — never the human's).
- On startup (lazy, first call): discovery → token endpoint
  `grant_type=client_credentials` (+ `scope` if `OIDC_SCOPE_MCP` set) → cache
  `{ access_token, expires_at }` with `expires_in − 60 s` safety margin; re-fetch when
  expired, and once immediately after any 401 from the API (single retry, then surface
  the error).
- `apiRequest()` adds `Authorization: Bearer <token>` and `X-LocalPM-Channel: mcp` to
  every request.
- The MCP server authenticates as **itself** (its own client-credentials token); it does
  not relay user tokens. Token passthrough — accepting a client's token and forwarding
  it upstream without validating it was issued to you — is the documented MCP anti-
  pattern [R12]; the same logic makes the shared-admin-credential pattern of Solo.io's
  Pattern 1 an anti-pattern (blast radius, attribution mess) [R12]. One MCP server =
  one agent identity = clean attribution (REQ-002.2).

## 11. D-7 — Sessions & refresh (resolves ADR-002 open question 5)

**Decision: Payload-native silent refresh; no IdP refresh tokens.**

- Login stores no IdP tokens server-side; the session is Payload's own HTTP-only cookie
  [R2][R4]. The access/ID tokens from the callback are used once and discarded.
- `POST /api/users/refresh-token` (Payload's refresh operation) renews the cookie while
  the current token is still valid — the admin panel's session continues without any
  IdP round-trip; once expired, the user re-authenticates at the IdP [R4].
- The authorization request therefore does **not** include `offline_access`; there is
  no refresh token to store, rotate, or leak. RFC 9700's refresh-token rules (rotation,
  sender-constraining) apply only to holders of refresh tokens [R10] — not holding one
  is the simpler compliant position, and at loopback scale a re-login is one click
  through the IdP.
- Roles re-derive at each login, so IdP group changes take effect on next login; a
  mid-session group demotion takes effect at token/session expiry (accepted limitation,
  ADR-002's "effective revocation on token expiry").
- Alternative considered and rejected: silent refresh via a hidden IdP iframe or
  rotation with stored refresh tokens [R6] — a second session store and a token
  custody surface for zero local benefit.

## 12. First-register compatibility (E-7)

- `auth.disableLocalStrategy` stays `false` while OD-1 is open → email/password login,
  first-register, and the existing master user keep working unchanged.
- The existing master user has no `identityIss/identitySub`. Binding it to OIDC is a
  one-time operation: log in locally, then complete an OIDC login whose `(iss, sub)`
  is attached to the same document by email match — or simply let the OIDC upsert
  create a second document and deactivate the old one (operator's choice at rollout;
  no schema blocker either way).
- If the operator later confirms OD-1 (`disableLocalStrategy: true`), first-register
  disappears and provisioning becomes "exists at the IdP + upsert on first login" —
  the migration plan (§15) sequences this last, behind an explicit operator gate.

## 13. Environment variables (new `.env.example` block)

```bash
# ── OIDC (apps/web) — ADR-002 D1: issuer-agnostic, discovery-driven ──────────
OIDC_ENABLED=false                          # feature flag; false = today's behavior
OIDC_ISSUER=                                # e.g. https://id.lan/dex  (discovery: /.well-known/openid-configuration)
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_REDIRECT_URI=                          # default: ${NEXT_PUBLIC_SERVER_URL}/api/auth/oidc/callback
OIDC_SCOPE=openid profile email
OIDC_GROUPS_CLAIM=groups                    # §7
OIDC_ROLE_MAP={}                            # JSON: claim value → superadmin|human|agent
OIDC_SUPERADMIN_GROUP=                      # optional single-value sugar
OIDC_AGENT_CLIENT_IDS=[]                    # JSON array of agent client_ids
OIDC_AGENT_CLIENT_ID_CLAIM=azp              # azp | client_id | cid
OIDC_AUDIENCE=                              # expected aud for agent tokens (jwks mode); empty = skip aud check
OIDC_VERIFY_MODE=jwks                       # jwks | introspection (RFC 7662)
OIDC_INTROSPECTION_URL=                     # discovery-provided when verify mode is introspection; override here
OIDC_CLOCK_SKEW_SECONDS=60
OIDC_DISCOVERY_TTL_SECONDS=3600
OIDC_JWKS_CACHE_SECONDS=600                 # proactive refetch window; unknown kid forces immediate refetch [unverified: jose auto-refetch on kid miss]
OIDC_COOKIE_SECURE=auto                     # auto = secure unless NEXT_PUBLIC_SERVER_URL is http://localhost|127.0.0.1 (§16)

# ── OIDC agent client (packages/mcp-server) ──────────────────────────────────
# OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET (same names; agent client's values)
OIDC_SCOPE_MCP=                             # optional scope for the client_credentials grant
```

Cookie policy note: Payload exposes `auth.cookies` (`secure`, `sameSite`, `domain`)
[R2]; `OIDC_COOKIE_SECURE=auto` maps to `secure: false` on plain-http loopback
deployments (§16) and `true` everywhere else.

## 14. Verification checklist embedded in design

Each mechanism above names its failure mode; the acceptance criteria (§16) turn the
security-relevant ones into executable checks: invalid/mismatched signature → 401;
`state` mismatch → 400 before any token exchange; missing/mismatched `nonce` → callback
rejects; unknown kid → JWKS refetch then verify; `active: false` agent → 401-equivalent
(null user → 401); issuer pointing elsewhere → fail-closed.

## 15. Migration plan (each step leaves the system coherent)

| Step | Change | Verify before proceeding |
|---|---|---|
| M0 | Branch, `.env.example` block (§13), no behavior change (`OIDC_ENABLED=false`) | App boots; existing tests green |
| M1 | `users` additive fields (§8) + `generate:types` | Types compile; admin shows new fields; first-register still works |
| M2 | `src/lib/oidc/` pure modules: discovery, JWKS verify, claims mapping, upsert (unit-testable, no I/O at import) | Unit tests: verify accept/reject matrix (bad sig, bad iss, expired, skew, unknown kid, role map) |
| M3 | Strategy `oidc` wired into `Users.ts` (§4), flag-gated | Bearer-less requests unaffected; garbage bearer → 401 |
| M4 | Next endpoints authorize/callback/logout (§5) | Full human login against the dev IdP (ADR-002 D6 bootstrap profile — provider choice still open, OD-4); session cookie set; `/admin` reachable |
| M5 | MCP server bearer (§10) | Agent mutations attributed to the agent user; `X-LocalPM-Channel: mcp` visible in logs |
| M6 | ACL verification (§9) + acceptance criteria run (§16) | AC-1…AC-10 all pass |
| M7 | *(operator-gated)* `disableLocalStrategy: true` (OD-1), deprecate first-register | All logins flow through the IdP; master user bound (§12) |

No data migration is required beyond provisioning: Mongo collections are created on
first write and the new fields are additive (ADR-002 DB impact).

## 16. Acceptance criteria

Every criterion is independently checkable (curl-level unless noted):

1. **AC-1 Token invalid → 401.** `GET /api/tickets` with `Authorization: Bearer
   <tampered>` → 401/403-equivalent denial (strategy returns null, fail-closed).
2. **AC-2 Anonymous mutation → denied.** `POST /api/tickets` without credentials → 401
   (with `OIDC_ENABLED=true` and the collections' access hardened per ADR-002 phase 1 —
   note: flipping business CRUD from `() => true` to authenticated access is ADR-002
   scope and lands with this spec's implementation or a sibling change).
3. **AC-3 Agent token cannot read the audit trail.** With a valid agent (client-
   credentials) token: `GET /api/tickets/versions` → **403**; `POST
   /api/tickets/versions/:id` → **403** (actorPolicy `denyAgents`/`restoreMasterOnly`
   unchanged, §9).
4. **AC-4 Master token CAN.** With the master human's session/bearer:
   `GET /api/tickets/versions` → 200; restore → 200.
5. **AC-5 Attribution.** A mutation via MCP attributes to the agent user; the same
   mutation via webUI attributes to the human; SPC-005's actor fields differ
   accordingly (REQ-002.2).
6. **AC-6 Provider swap, zero code change.** Pointing `OIDC_ISSUER/CLIENT_ID/SECRET`
   (+ `OIDC_ROLE_MAP` if claim shapes differ) at a second compliant issuer and
   completing a human + an agent login with no source edits (ADR-002 verification
   criterion 4).
7. **AC-7 First-register intact (while OD-1 open).** A fresh database + app boot still
   offers first-register; the created user can log in locally (§12).
8. **AC-8 Superadmin gate.** A token whose mapped roles include `superadmin` passes
   `dataManagementAccess` (exports/imports allowed); an agent token is 403'd on the
   same endpoints — including the plugin custom endpoints gated by R-4 (E-3).
9. **AC-9 Logout & refresh.** `GET /api/auth/oidc/logout` clears the session (subsequent
   `me` → null); `POST /api/users/refresh-token` with a live cookie renews it; with an
   expired one → error prompting re-login [R4].
10. **AC-10 Clock skew & revocation.** A token whose `exp` is within
    `OIDC_CLOCK_SKEW_SECONDS` is accepted; beyond it, rejected. In `introspection`
    mode, an `active: false` token from the IdP is rejected immediately [R14].
11. **AC-11 Agent kill-switch.** Setting the agent mirror doc `active: false` makes its
    (still cryptographically valid) tokens yield 401 (§6).
12. **AC-12 MCP no-credential regression guard.** With agent env unset, the MCP server
    fails loudly at first tool call (missing config), not silently as anonymous.

## 17. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Clock skew** between app and IdP | Valid tokens rejected (or stale accepted) | `OIDC_CLOCK_SKEW_SECONDS` (60 s default) applied at verification (§4); NTP on the host; introspection mode removes skew from the equation (server-side truth [R14]). |
| **JWKS rotation / unknown `kid`** | Signature errors after IdP key rotation | `createRemoteJWKSet` with proactive refetch window + forced refetch on unknown kid (§13); verify failure is fail-closed, never fail-open. |
| **Loopback without HTTPS** | (a) IdPs often require https redirect URIs; (b) `Secure` cookies break on `http://localhost` | (a) RFC 8252 §7.3 legitimizes http loopback redirect URIs for native/loopback apps [R10b/R15], and ADR-001's loopback perimeter is the threat model; register `http://localhost:3010/api/auth/oidc/callback` (per-issuer allowance **[unverified — provider-dependent]**); dev bootstrap IdP (OD-4) accepts loopback http. (b) `OIDC_COOKIE_SECURE=auto` drops `Secure` only for loopback http (§13) — acceptable inside ADR-001's perimeter, forced `true` otherwise. |
| **IdP unavailable at boot** | App cannot start if discovery is boot-time | Lazy, cached discovery (§5); auth surfaces fail-closed with 503; business app unaffected while `OIDC_ENABLED=false`. |
| **Groups claim missing / reshaped** | Silent privilege change | Fail-safe default `['human']`; `rawGroups` persisted for audit (§7–§8); mapping is env (restart applies [R1]). |
| **Strategy not hot-reloaded** | Confusing dev behavior | Documented by Payload [R1]; noted in M2/M3 steps. |
| **Upsert race (two first-logins concurrently)** | Duplicate identities | Find-then-create with duplicate-key retry (§8); loopback scale makes collision rare. |
| **Session/claims staleness** | Revoked group until next login | Accepted, bounded by session TTL (§11); `active` kill-switch covers emergencies. |
| **Secrets in env / compose** | Client secret leakage | Secrets only in env/compose (never in repo); introspection client is the only secret the API holds; MCP secrets live in the agent's own env (§10, §13). |
| **disableLocalStrategy regression** | Lockout, broken first-register | OD-1 stays open; M7 runs only behind explicit operator confirmation (§12, §15). |

## 18. Open decisions for the operator

| ID | Decision | Spec's default position |
|---|---|---|
| **OD-1** | `disableLocalStrategy` on the users collection — disable password login? (task-mandated open decision) | Keep local strategy until OIDC flow is proven in production use; M7 executes the flip. |
| **OD-2** | First provisioned human = `superadmin`? (ADR-002 open q. 2) | Yes — phase 3 needs an owner from day one. |
| **OD-3** | Agent = IdP client + mirror `users` doc? (ADR-002 open q. 3) | Yes — mirror doc gives the local kill-switch (§6, AC-11). |
| **OD-4** | Dev bootstrap IdP (dex profile per ADR-002 D6 vs alternative) | Deferred to implementation; contract above is provider-agnostic. |
| **OD-5** | Cookie `Secure` policy on loopback http (§16 risk) | `auto` (insecure only on loopback http), per ADR-001 perimeter. |
| **OD-6** | Refresh policy confirmation (§11) | Payload-native silent refresh; no IdP refresh tokens. |
| **OD-7** | Flip business-collection CRUD from `() => true` to authenticated access in the same implementation (AC-2 depends on it) | In scope for the implementation branch; sequenced after M5. |

## 19. References

All URLs below surfaced by donsetch `web_search` and then fetched with `web_fetch`
(no constructed URLs). Search queries used: *payload cms 3 custom auth strategy oidc ·
payload cms authentication strategies example · oidc authorization code pkce next.js
app router · payload cms api keys vs jwt · jsonwebtoken jose verify jwks nodejs · mcp
server authorization bearer token pattern · oidc client credentials machine to machine
best practices · payload plugin oidc 3.x status*, plus follow-ups (refresh operation,
loopback redirect RFC 8252, ID token validation, RFC 7662).

| # | Source (URL · title) | What it contributed |
|---|---|---|
| R1 | https://payloadcms.com/docs/authentication/custom-strategies — *Custom Strategies \| Documentation \| Payload* | Exact 3.x strategy contract: `auth.strategies` with `name` + `authenticate({payload, headers, canSetHeaders, isGraphQL})` returning `{user \| null, responseHeaders}`; `disableLocalStrategy`; "moved away from Passport in 3.0"; strategies require a server restart (no hot reload). Basis of §4. |
| R2 | https://payloadcms.com/docs/authentication/overview — *Authentication Overview \| Documentation \| Payload* | Auth config surface: `tokenExpiration`, `useSessions`, `useAPIKey`, `cookies {secure, sameSite, domain}`, `strategies`, `disableLocalStrategy`; the three built-in strategies (HTTP-only cookies / JWT / API keys); cookies unreadable by JS. Basis of §4, §11, §13. |
| R3 | https://payloadcms.com/docs/authentication/api-keys — *API Key Strategy \| Documentation \| Payload* | `Authorization: <slug> API-Key <key>` header contract; keys encrypted in DB (PAYLOAD_SECRET dependency); API-key-only collections via `disableLocalStrategy`. Considered and set aside in favor of OIDC client credentials (ADR-002 alternative retained as fallback). Informs §6, §10 comparison. |
| R4 | https://payloadcms.com/docs/authentication/operations — *Authentication Operations \| Documentation \| Payload* | `me` / `logout` / `refresh` operations; refresh requires a still-valid token and renews the HTTP-only cookie; logout must be server-side. Basis of §5 (logout route) and §11 (silent refresh decision). |
| R5 | https://startwithidentity.com/recipes/add-login-to-nextjs/ — *Add login to a Next.js app with OIDC* (Start with Identity, 2026-06-19) | Complete App Router code+PKCE recipe: discovery caching, verifier/S256 challenge + `state` in short-lived httpOnly cookies, server-side token exchange, `nonce` check, ID-token validation (JWKS, iss/aud/exp) before trusting claims, security checklist ("OAuth 2.1 makes PKCE mandatory"; browser only ever holds the opaque session cookie). Basis of §5. |
| R6 | https://blog.antosubash.com/posts/openid-connect-with-nextjs-with-openid-client-6-and-next-15 — *OpenID Connect with Next.js 15 and openid-client 6* | `openid-client` v6 flow: `client.discovery`, `authorizationCodeGrant` with `pkceCodeVerifier`/`expectedState`, `fetchUserInfo`, `buildEndSessionUrl`; secure-flag-on-production cookie practice; userinfo for profile claims. Cross-check of §5 and the rejected refresh-token alternative in §11. |
| R7 | https://www.npmjs.com/package/jose — *jose* (npm) | JWT verification primitives: `jwtVerify` (signature + claims-set validation), remote JWKS usage (`createRemoteJWKSet`), zero dependencies, Node/ESM support; spec compliance list (RFC 7515/7519…). Basis of §4 step 1 and §13 JWKS caching. |
| R8 | https://openid.net/specs/openid-connect-core-1_0.html — *OpenID Connect Core 1.0 (errata set 2)* | Normative ID Token model and §3.1.3.7 ID Token Validation (iss/aud/exp/nonce/azp); azp as authorized party; §12 refresh tokens; §15.4 RP mandatory features. Basis of §4, §5 (nonce), §6 (`azp`). |
| R9 | https://payloadcms.com/community-help/github/how-to-set-up-payload-cms-authentication-with-okta-via-openid-connect-oidc-oauth-20 — *How to set up Payload CMS authentication with Okta via OIDC* (community help archive) | Historical Passport-era pitfalls (strategy name prefixed by collection slug; Payload expects JSON not redirect on `me`) and the working precedent: mint a `payload.secret`-signed JWT with `{id, collection, email}` and set the `<prefix>-token` HTTP-only cookie with `getCookieExpiration`. Basis of the session hand-off in §4 (session shape) and a warning against Passport-style approaches in 3.x. |
| R10 | https://workos.com/blog/oauth-best-practices — *OAuth best practices: We read RFC 9700 so you don't have to* (WorkOS) | RFC 9700 BCP digest: exact-string redirect URI matching, PKCE/state as CSRF defenses, mix-up defense, short-lived tokens, audience restriction, refresh-token rotation/sender-constraint rules, ROPC and implicit rejections. Basis of §5 decisions, §6 (`jwks` mode + audience), §11, §17. |
| R11 | https://www.rfc-editor.org/info/rfc6749/ — *RFC 6749: The OAuth 2.0 Authorization Framework* | Framework normative base; §4.4 Client Credentials Grant placement (§4.4/§4.4.1 in TOC, fetched structure); updated-by list showing RFC 9700/8252 relationship. Basis of §6. (§4.4.1's "no refresh token" sentence: body not re-read in this pass — **[unverified body; consistent with oauth.net's statement already verified in ADR-002 research]**.) |
| R12 | https://www.solo.io/blog/mcp-authorization-patterns-for-upstream-api-calls — *MCP Authorization Patterns for Upstream API Calls* (Solo.io, 2025-09-17) | MCP upstream-auth patterns: shared admin service account = anti-pattern (blast radius, attribution mess); **token passthrough** quoted from MCP spec security best practices as anti-pattern. Basis of §10 (server authenticates as itself). |
| R13 | https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-credentials-flow — *Client Credentials Flow - Auth0 Docs* | M2M framing ("call your API from a machine-to-machine (M2M) application using the Client Credentials Flow"); fetch landed on the docs index rather than the article body — contribution limited to that framing **[unverified body]**; normative weight carried by R11. |
| R14 | https://www.rfc-editor.org/info/rfc7662/ — *RFC 7662: OAuth 2.0 Token Introspection* | Introspection endpoint contract: query the AS for a token's `active` state + metadata. Basis of §6 `introspection` mode and AC-10. |
| R15 | https://www.rfc-editor.org/info/rfc8252/ — *RFC 8252: OAuth 2.0 for Native Apps (BCP 212)* | §7.3 Loopback Interface Redirection: loopback redirect URIs use the http scheme, acceptable for loopback interfaces; external-user-agent flow model. Basis of the loopback/HTTPS risk analysis (§17) and `OIDC_COOKIE_SECURE=auto` (§13). |
| R16 | https://github.com/gousta/payload-plugin-oidc — *gousta/payload-plugin-oidc* | Community plugin capabilities (sign-in button, optional user creation, userinfo hook) and its limits: human login only, no client-credentials/agent story, no claims→roles mapping; Payload 3.x compatibility not stated in the README **[unverified]**. Confirms ADR-002's "evaluate, don't adopt" verdict; not used in this design. |

Internal references: [ADR-002](../adr/2026-09-05_ADR-002_oidc-authentication.md)
(ACCEPTED — D1–D7 decisions, data model, ACL table, migration phases; this spec is its
implementation design) · [REQ-002](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md)
(REQ-002.1–.4; D-R2 resolved toward OIDC client credentials) ·
[SPC-001 §6](2026-09-05_SPC-001_audit-trail-restore.md) (normative access policy;
§7.7 agent-denial verification) · [SPC-004 §4e/R-4](2026-09-07_SPC-004_import-export-snapshots.md)
(data-management policy + endpoint gating) · [SPC-005](2026-09-08_SPC-005_audit-attribution-retention.md)
(actor attribution fields — consume `req.user` this wiring produces) ·
Code: `apps/web/src/collections/Users.ts`, `apps/web/src/access/actorPolicy.ts`,
`apps/web/src/access/dataManagementPolicy.ts`, `apps/web/src/payload.config.ts`,
`packages/mcp-server/src/index.ts` (`apiRequest`), `.env.example`.
