import type { Access, PayloadRequest } from 'payload'

/**
 * SPC-006 / ADR-002 phase 1 (OD-7, resolved "in scope, sequenced after M5"):
 * business-collection CRUD hardening. The shipped `() => true` accesses were
 * the pre-OIDC bridge posture (SPC-001 §3: "collection CRUD stays open — the
 * kanban and local tooling depend on it"); once identities can actually
 * authenticate (local session OR OIDC bearer), an anonymous mutation is a
 * hole, not a convenience — AC-2 (`POST /api/tickets` without credentials →
 * 401) depends on this.
 *
 * Semantics — deliberately permissive-but-authenticated:
 *   - ANY authenticated actor passes: the local-strategy session (master
 *     user, OD-1 keeps local login alive) and OIDC-authenticated humans and
 *     agents alike. Business CRUD is NOT superadmin-only; the single-user +
 *     single-agent setup (optionality principle) must keep working with the
 *     flag off and on.
 *   - Agents keep FULL business CRUD by design: REQ-002/ADR-002 bar agents
 *     from the audit trail (actorPolicy denyAgents/restoreMasterOnly) and
 *     from Data Management (dataManagementAccess) — never from tickets.
 *     The MCP agent mutating tickets IS the product (SPC-006 §1.3, AC-5).
 *   - Anonymous → false → Payload standard 401.
 *
 * `read` intentionally stays `readExcludingDeleted` (the kanban's server
 * render and public board reads); only the mutation verbs are hardened.
 * Restore paths are NOT affected: native restore runs `update`, which the
 * beforeOperation restoreVersion guards already restrict to the master user
 * (SPC-001 §6) — an authenticated agent passing this predicate still gets
 * 403 from those guards.
 */

/** Authenticated-only mutation access (ADR-002 phase 1 / AC-2). */
export const authenticatedMutations: Access = ({ req }) => {
  return Boolean((req as PayloadRequest | undefined)?.user)
}
