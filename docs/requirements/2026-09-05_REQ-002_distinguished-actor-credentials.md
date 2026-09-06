# REQ-002 — Distinguished actor credentials (human vs agent) & role policy

| | |
|---|---|
| **ID** | REQ-002 |
| **Date** | 2026-09-05 |
| **Status** | DRAFT — pending review. |
| **Type** | Requirement (what must be fulfilled, not how) |
| **Related** | [SPC-001 — Audit trail & restore, §5 Access policy](../specs/2026-09-05_SPC-001_audit-trail-restore.md) · [ADR-001](../adr/2026-09-05_ADR-001_local-first-loopback-binding.md) |

---

## Provisioning model (normative, current phase)

The product is provisioned with exactly two operating identities:

| Identidad | Naturaleza | Uso |
|---|---|---|
| **Master user** | Human (operator) | webUI, administration, audit trail, rollbacks |
| **Master agent user** | Automation (MCP/REST tooling) | ticket/project/team mutations by agents |

The two identities carry **distinguished credentials**. An agent NEVER operates under the human's identity nor reuses their credentials. (Prospective hardening — see ADR-001: the primary objective remains local usage, same as the original creator.)

## Current state (evidence, 2026-09-05 — code inspection; runtime confirmation pending)

- The three collections declare `access: { read/create/update/delete: () => true }` → **no authentication is enforced**; `req.user` is undefined on API/REST/MCP operations.
- The MCP server (README) connects with `LOCAL_PM_URL` only, no credentials.
- Payload records the author of a change from the request's authenticated user; without auth, attribution is null/anonymous.
- Current consequence: a change made via webUI and one made by an agent via MCP/REST are indistinguishable in any audit trail (and will be in the companion spec's versions module too).

## Requirement

- **REQ-002.1:** Every actor mutating documents (create/update/delete/restore) operates with DISTINGUISHED, unambiguous credentials per the provisioning model above. Agents NEVER reuse human credentials.
- **REQ-002.2:** Every audit trail / version history entry resolves to an identified actor without ambiguity: who (identity), through which channel (webUI / MCP / REST), when.
- **REQ-002.3:** Identity confusion between actors in tickets/audit log is a blocking defect for productive data.
- **REQ-002.4 (role policy — indispensable):** The agent identity has NO access, by policy (role/ACL), to audit trails (version history reads) NOR to rollback/restore operations. Those capabilities are exclusive to the master user. Normative detail: [SPC-001 — Audit trail & restore, §5 Access policy](../specs/2026-09-05_SPC-001_audit-trail-restore.md). Rationale: an agent able to rewrite history nullifies the audit trail's purpose (role separation = operational tamper-evidence).

**Recorded open question (requires research at implementation):** attribution is a function of Payload's authentication (system users). Path to be defined — deciding it is not this document's job: a dedicated bot user for the agent (natural fit to the provisioning model), per-actor API keys, or both. The requirement is the outcome (unambiguous attribution + agent exclusion from trail/rollback), not the mechanism.

## Verification

- Change via webUI by the master user → audit/version attributed to that identity.
- Change via MCP with the master agent user's credential → attributed to the agent identity, distinct from the human's.
- The agent identity attempts to read `/api/{slug}/versions` or run `POST …/versions/:id` → **denied by ACL**; the master user → allowed.
- A mutation attempt without credentials → rejected.

## Pending user decision

| ID | Decision |
|---|---|
| D-R2 | The master agent user's credential mechanism (dedicated bot user vs API keys), within the two-identity provisioning model |
