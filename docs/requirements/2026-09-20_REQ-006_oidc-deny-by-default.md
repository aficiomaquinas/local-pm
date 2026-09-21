# REQ-006 — OIDC security boundaries deny by default

| | |
|---|---|
| **ID** | REQ-006 |
| **Date** | 2026-09-20 |
| **Status** | IMPLEMENTED on `fix/oidc-deny-by-default` (gate green) — pending operator review/merge. |
| **Type** | Requirement (what must be fulfilled, not how) |
| **Related** | [SPC-006 — OIDC authentication wiring, §20 amendment](../specs/2026-09-08_SPC-006_oidc-authentication-wiring.md) · [REQ-002 — distinguished actor credentials](2026-09-05_REQ-002_distinguished-actor-credentials.md) · SPC-001 §6 (access policy) · SPC-004 §4e/R-4 (data management policy) · ADR-002 |

---

## Problem statement

The upstream maintainer's roadmap (anaskasmi/local-pm, roadmap task 42) lists three
defects in this fork's OIDC code as pre-conditions for adoption, with the direction
"**invert all three to deny-by-default**". The fork audit of 2026-09-20 (base: master
`fba7286`) confirmed two of them live:

1. **`resolveActorType` privileged-for-unmarked** — **NOT PRESENT**. Verdict:
   `apps/web/src/access/actorPolicy.ts:35-43` already falls through to a plain
   `'user'` for an unmarked principal; privilege requires an explicit marker
   (`roles:['superadmin']` from the groups claim) or the master-user identity.
   Documented, no code change.
2. **`dataManagementAccess` role-less blanket grant** — **CONFIRMED**. Pre-REQ-006,
   `apps/web/src/access/dataManagementPolicy.ts:39` ended its chain with
   `return true` for any authenticated principal carrying NO role marker at all
   (comment: "master user, pre-claims"). Any such principal — not just the master
   user — obtained full import/export (the highest-value data surface: full dataset
   download and mass import, incl. the plugin's custom endpoints via the §4e/R-4
   guard that reuses this function).
3. **JWKS audience skip when unconfigured** — **CONFIRMED**. Pre-REQ-006,
   `apps/web/src/lib/oidc/verify.ts:89-94` spread `...(audience ? { audience } : {})`
   into `jwtVerify`: with `OIDC_AUDIENCE` unset, jose does NOT validate `aud`, and
   the post-verification client-id/azp checks do not restore it. A token from the
   right issuer with the right key but minted for ANOTHER audience passed
   verification — the issuer and key prove origin, only `aud` proves the token was
   minted for THIS relying party.

The standing requirement (not just the two fixes): **no OIDC security boundary may
grant privilege by default, and a security-relevant misconfiguration must fail
closed — loudly — never silently degrade into a weaker check.**

## Requirements

- **REQ-006.1 — No privilege without an explicit marker.** "Authenticated" is an
  identity fact, not an authorization marker. Every capability boundary
  (import/export today; any future surface) must derive its grant from an explicit
  source: a superadmin role marker (`role` string, or the SPC-006 `roles` array) or
  the master-user identity per SPC-001 §6. No branch of an access policy may return
  a blanket allow for a principal class.
- **REQ-006.2 — The master user keeps its pre-claims privilege, resolved through its
  identity.** The one-shot first-register master (E-7) predates OIDC claims and must
  not be locked out of Data Management. Its grant must resolve through the
  master-user identity predicate (`isMasterUser`), never through an unconditional
  default — so any future tightening of the identity model propagates to this
  boundary automatically. Live verification (E2E stack, 2026-09-20) showed the
  schema defaults stamp the local master doc `actorType:'human'`,
  `roles:['human']`: a blanket "roles-array → superadmin-only" rule locks the
  operator out (the pre-REQ-006 reality — REST-verified 403). Discriminator: OIDC
  mirror docs always carry the `(identityIss, identitySub)` pair (§8 upsert); the
  local master does not. Mirrors stay claims-only (no superadmin marker → denied);
  the identity-less local master resolves through its identity.
- **REQ-006.3 — Token audience is always validated in jwks mode.** When verification
  is local (issuer JWKS), `OIDC_AUDIENCE` is REQUIRED configuration. An unset
  audience is a configuration error that fail-fasts at first verification — before
  any network I/O — with an actionable log line; it must never silently skip `aud`
  validation. Tokens whose `aud` does not match (including tokens with NO `aud`)
  are rejected. Introspection mode (RFC 7662) is exempt: the authorization server
  decides `aud` truth server-side and `active` gates acceptance.
- **REQ-006.4 — Agents remain barred from import/export.** Restated (REQ-002 /
  ADR-002 / SPC-004 §4e): the agent identity is denied by policy on every Data
  Management surface, whatever other markers it carries.

## Acceptance criteria

- **AC-a** `dataManagementAccess`: agent → false; anonymous → false; role-less
  agent-marked principal → false (the pre-REQ-006 true-leak); role-less
  master-user identity → true; `role:'superadmin'` → true; `roles:['superadmin']` →
  true; OIDC human mirror (`roles:['human']` + identity pair) → false; local master
  (`roles:['human']`, no identity pair) → true.
- **AC-b** jwks mode with `OIDC_AUDIENCE` unset → token rejected, zero discovery/JWKS
  network calls, single actionable `console.error` naming the fix.
- **AC-c** jwks mode with audience configured → wrong-aud token rejected; aud-less
  token rejected; matching-aud token accepted; multi-aud token containing the
  expected value accepted (RFC 8707 shape).
- **AC-d** introspection mode with `OIDC_AUDIENCE` unset → unaffected (token flow
  unchanged, no config error logged).
- **AC-e** Live E2E: the human leg (dex, aud = client_id) and the m2m leg
  (oidc-dev, aud = RFC 8707 resource indicator) both authenticate with the
  audience check enforced; the local master user retains Data Management access.

## Implementation mapping

| Requirement | Where |
|---|---|
| REQ-006.1 / 006.2 / 006.4 | `apps/web/src/access/dataManagementPolicy.ts` (role-less branch → `isMasterUser`) |
| REQ-006.3 | `apps/web/src/lib/oidc/verify.ts` (`requireJwksAudience()` fail-fast + `aud` always passed to `jwtVerify`) |
| AC-a | `apps/web/tests/o4.req006-data-management.test.ts` |
| AC-b / AC-c / AC-d | `apps/web/tests/o5.req006-verify-audience.test.ts` (+ `o1.oidc-core.test.ts` harness default) |
| AC-e | E2E compose now pins `OIDC_AUDIENCE` per instance (`local-pm-web` for dex, `urn:local-pm:api` for oidc-dev) |

Defect 1 requires no code (see verdict above); it is recorded here and in the
SPC-006 §20 amendment as provenance for the upstream adoption conversation.
