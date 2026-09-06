import type { Access, PayloadRequest } from 'payload'
import { status as httpStatus } from 'http-status'
import { APIError } from 'payload'

/**
 * SPC-001 §6 access policy — NORMATIVE.
 *
 * REQ-002.4 / ADR-001 (D2) provision two identities:
 *   - a single master user (human), and
 *   - a single master agent user (automation),
 * with distinguished credentials.
 *
 * Policy: the agent identity has NO access — by role/ACL, not by convention —
 * to the audit trail or to rollbacks:
 *   - version reads (`readVersions`, REST `GET …/versions*`): denied to the agent;
 *   - restore/rollback (`POST …/versions/:id`): denied to the agent.
 *
 * The OIDC wiring that mints these two identities lands with ADR-002. Until
 * then, `req.user` is the source of truth for whatever credential system is
 * active, and this module only consults that contract:
 *
 *   - a user is the MASTER USER if it has no agent marker, or
 *     `req.user.actorType === 'user'` explicitly;
 *   - a user is the AGENT if `req.user.actorType === 'agent'` (or a legacy
 *     `roles` array containing 'agent' / an `isAgent` boolean flag);
 *   - NO USER AT ALL is treated as an unidentified actor: version reads and
 *     restores are DENIED (deny-by-default). Collection CRUD stays open so
 *     the existing app and its local tooling keep working; only the audit
 *     trail surface is policy-gated. Documented decision for SPC-001 §6.
 */

export type ActorType = 'user' | 'agent'

/** Resolve the actor type from `req.user`. No user → not the master user. */
export function resolveActorType(user: PayloadRequest['user'] | null | undefined): ActorType | null {
  if (!user) return null
  if ((user as { actorType?: unknown }).actorType === 'agent') return 'agent'
  if ((user as { actorType?: unknown }).actorType === 'user') return 'user'
  const roles = (user as { roles?: unknown }).roles
  if (Array.isArray(roles) && roles.includes('agent')) return 'agent'
  if ((user as { isAgent?: unknown }).isAgent === true) return 'agent'
  return 'user'
}

/** True when the request carries the master-user identity. */
export function isMasterUser(user: PayloadRequest['user'] | null | undefined): boolean {
  return resolveActorType(user) === 'user'
}

/** True when the request carries the agent identity. */
export function isAgent(user: PayloadRequest['user'] | null | undefined): boolean {
  return resolveActorType(user) === 'agent'
}

/**
 * `readVersions` ACL per SPC-001 §6: master user allowed; the agent identity
 * and unauthenticated requests are denied. Returning `false` yields Payload's
 * standard 403 Forbidden response on `GET /api/{slug}/versions*`.
 */
export const denyAgents: Access = ({ req }) => isMasterUser(req?.user)

/** Restore variant: `POST /api/{slug}/versions/:id` is master-user exclusive. */
export const restoreMasterOnly: Access = ({ req }) => isMasterUser(req?.user)

/** Human-readable actor label for logs and policy errors. */
export function actorLabel(user: PayloadRequest['user'] | null | undefined): string {
  const t = resolveActorType(user)
  if (t === 'agent') return 'agent'
  if (t === 'user') return `user:${(user as { email?: string })?.email ?? (user as { id?: string })?.id ?? 'unknown'}`
  return 'anonymous'
}

/**
 * Policy guard for custom audit-trail endpoints (`/api/history`) and for
 * collection `update` (which Payload's native restore runs, SPC-001 §6).
 * Throws Payload `APIError`s (403 / 401) instead of returning booleans.
 */
export function enforceMasterOnlyPolicy(surface: string): Access {
  return ({ req }) => {
    const t = resolveActorType(req?.user)
    if (t === 'agent') {
      throw new APIError(
        `Access denied: the agent identity is barred from ${surface} by policy (SPC-001 §6)`,
        httpStatus.FORBIDDEN,
        null,
        true,
      )
    }
    if (!t) {
      throw new APIError(
        `Access denied: authentication required for ${surface} (SPC-001 §6)`,
        httpStatus.UNAUTHORIZED,
        null,
        true,
      )
    }
    return true
  }
}
