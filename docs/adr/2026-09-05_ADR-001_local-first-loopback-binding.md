# ADR-001 — Local-first, loopback-only binding, two-identity provisioning

| | |
|---|---|
| **ID** | ADR-001 |
| **Date** | 2026-09-05 |
| **Status** | ACCEPTED |
| **Context docs** | [REQ-001](../requirements/2026-09-05_REQ-001_loopback-only-binding.md) · [REQ-002](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) · [SPC-001 — Audit trail & restore](../specs/2026-09-05_SPC-001_audit-trail-restore.md) |

---

## Context

1. **The project's original intent:** self-hosted, local usage, single operator — same as the upstream's original creator (`anaskasmi/local-pm`). The fork (`aficiomaquinas/local-pm`) inherits that objective; there is no pivot to public hosting.
2. **Security finding (2026-09-05):** `docker-compose.yml` published the app (3010) and MongoDB (27018) on `0.0.0.0`; MongoDB additionally ran **without authentication**. Verified at runtime: both ports reachable from the whole LAN. With productive data, any machine on the network could read, write, or extract the entire database.
3. **Incoming phase:** the audit trail/rollback module (companion spec) and productive data in the volume — the cost of exposure rises.
4. **Git vector:** both repo remotes are public; data isolation is solved outside the tree (backups outside the working tree), but the network surface is the primary exposure in local mode.

## Decision

- **D1 — Loopback-only binding (local mode):** every published port binds to `127.0.0.1`. MongoDB with no host publishing (compose internal network only). Normative detail: REQ-001.
- **D2 — Two-identity provisioning:** the product is provisioned with a **single master user** (human) and a **single master agent user** (automation), with distinguished credentials. The agent is policy-excluded from audit trails and rollbacks. Normative detail: REQ-002 and spec §5.
- **D3 — Public hosting, should it ever apply, exclusively as a reverse-proxy layer** (TLS, restricted/authenticated access) in front of internal services identical to local mode. The internal topology does not change to face the public.
- **D4 — Prospective hardening:** the general direction is hardening backups/restore and credentials looking forward — not changing the primary objective, which remains local usage.

## Explicit non-goals

- No pivot to multi-tenant or public hosting in this phase.
- No full auth stack introduced "just in case": the accepted viable minimum is loopback binding (D1) + the two-identity model (D2) once the productive phase enters.

## Consequences

- The LAN stops reaching app and Mongo; local access continues via loopback frictionlessly.
- Public exposure requires an additional explicit step (reverse proxy), making accidental exposure impossible.
- The audit trail gains value as evidence: with D2, every entry has an unambiguous actor and only the human can rewrite history.

## Alternatives considered

| Alternative | Verdict |
|---|---|
| Status quo (0.0.0.0 + Mongo without auth) | Rejected: unauthenticated LAN exposure with productive data |
| Full auth stack on every service from the start | Deferred: exceeds the local-usage minimum; D2 covers it at the application layer when productive phase enters |
| Overlay/VPN (tailscale/wireguard) for remote access | Viable as a future remote-access means; not required for the local objective; not excluded by this decision |
