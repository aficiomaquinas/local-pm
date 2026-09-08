import type { Access, PayloadRequest } from 'payload'
import { status as httpStatus } from 'http-status'
import { APIError } from 'payload'

/**
 * SPC-004 §4e access policy — NORMATIVE (xref REQ-002, ADR-002, SPC-001 §6).
 *
 * Import/export and the saved-snapshot collections (`exports`/`imports`) are
 * superadmin-only. Semantics (mirrors `actorPolicy.ts` deny-by-default):
 *
 *   - the agent identity is barred BY POLICY, not by convention
 *     (REQ-002/ADR-002: an agent that could export exfiltrates the dataset
 *     bypassing channel attribution; one that could import performs mass
 *     mutation outside the audit trail);
 *   - no user at all is denied (deny-by-default, same decision as SPC-001 §6);
 *   - a request carrying `role: 'superadmin'` claims is allowed
 *     (post-ADR-002 OIDC claims);
 *   - the master user, pre-claims (ADR-002 pending), IS the superadmin
 *     identity and is allowed.
 *
 * Applied to four collection surfaces — `exports.read`, `exports.create`,
 * `imports.read`, `imports.create` — plus, transitively through those access
 * functions, the plugin's custom endpoints (`POST /api/exports/download`,
 * `POST /api/exports/export-preview`). Read access to `exports` means ability
 * to download the data it holds, hence it is gated identically.
 */
export const dataManagementAccess: Access = ({ req }) => {
  const user = req?.user as PayloadRequest['user']
  const actorType = resolveDataManagementActor(user)
  if (actorType === 'agent') return false // REQ-002/ADR-002: no agent import/export
  if (!actorType) return false // no auth / anonymous → deny-by-default
  const role = (user as { role?: unknown } | null | undefined)?.role
  if (typeof role === 'string') return role === 'superadmin' // post-ADR-002 claims
  return true // master user, pre-claims
}

/**
 * R-4 guard (SPC-004 §4e note + §6 R-4) — endpoint-level enforcement for the
 * plugin's CUSTOM endpoints (`POST /api/exports/download`,
 * `POST /api/exports/export-preview`, `POST /api/imports/preview-data`).
 *
 * Payload does NOT run collection `access` for collection-configured custom
 * endpoints, and these handlers call createExport/createImport directly:
 * `createExport` only checks that SOME user is present, so a valid agent
 * credential would stream the full dataset from `/download`, bypassing the
 * `exports.read`/`exports.create` policy above. Gate here, at the exact
 * surface the spec flags as unverified — throwing 401/403 (documented
 * fallback: "endpoint-level access override").
 */
export function enforceDataManagementEndpointPolicy(surface: string) {
  return ({ req }: { req: PayloadRequest }) => {
    if (!dataManagementAccess({ req })) {
      const user = req?.user as PayloadRequest['user']
      const actorType = resolveDataManagementActor(user)
      throw new APIError(
        `Access denied: ${actorType === 'agent' ? 'the agent identity is barred from' : 'authentication required for'} ${surface} (SPC-004 §4e/R-4)`,
        actorType === 'agent' ? httpStatus.FORBIDDEN : httpStatus.UNAUTHORIZED,
        null,
        true,
      )
    }
    return true
  }
}

type DataManagementActor = 'agent' | 'user' | null

/**
 * Actor resolution for the Data Management surfaces. Reuses the SPC-001
 * `resolveActorType` contract (agent markers win, then explicit 'user',
 * then legacy `roles`/`isAgent` markers, default master user) and adds the
 * SPC-004 actor vocabulary from the bridge users collection: `superadmin`
 * and `human` map to the master-user identity, `agent` stays barred.
 */
function resolveDataManagementActor(user: PayloadRequest['user'] | null | undefined): DataManagementActor {
  if (!user) return null
  const marker = (user as { actorType?: unknown }).actorType
  if (marker === 'agent') return 'agent'
  if (marker === 'superadmin' || marker === 'human' || marker === 'user') return 'user'
  const roles = (user as { roles?: unknown }).roles
  if (Array.isArray(roles) && roles.includes('agent')) return 'agent'
  if ((user as { isAgent?: unknown }).isAgent === true) return 'agent'
  return 'user'
}
