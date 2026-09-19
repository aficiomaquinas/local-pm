import type { Access } from 'payload'

/**
 * Opt-in access control for the REST/GraphQL API and the admin panel.
 *
 * Adapted from Ars Nova Singers (@ArsNovaSingers) in ArsNovaSingers/local-pm-Ars,
 * commit d488521 "Phase 0: auth, configurable statuses, milestones, custom
 * fields, atomic ticket IDs". See CREDITS.md.
 *
 * Local PM ships with OPEN access so that a fresh `docker compose up` works
 * with no setup and the bundled MCP server keeps working out of the box. That
 * is the right default for a tool bound to loopback on one developer's
 * machine, and the wrong one for anything reachable by another host: with
 * `create/update/delete` all `() => true`, any client that can open the port
 * can rewrite every ticket, project and team.
 *
 * Set `LOCAL_PM_REQUIRE_AUTH=true` to require a logged-in user for every
 * operation. Do that only once every caller — the MCP server included — holds
 * a credential, or you will lock out your own automation.
 *
 * The flag is read per-request rather than captured at module load so that
 * tests (and a process that rewrites its own env) observe the current value.
 */
export const requireAuthEnabled = (): boolean => process.env.LOCAL_PM_REQUIRE_AUTH === 'true'

/** Roles that may perform destructive operations when auth is required. */
const DELETE_ROLES = new Set(['admin'])

export const readAccess: Access = ({ req }) => (requireAuthEnabled() ? Boolean(req.user) : true)

export const writeAccess: Access = ({ req }) => (requireAuthEnabled() ? Boolean(req.user) : true)

/**
 * Destructive operations are held to a higher bar than ordinary writes: an
 * ordinary member can move a ticket, only an admin can destroy one.
 */
export const deleteAccess: Access = ({ req }) => {
  if (!requireAuthEnabled()) return true
  const role = (req.user as { role?: string } | undefined)?.role
  return typeof role === 'string' && DELETE_ROLES.has(role)
}

/** The standard access block applied to every business collection. */
export const collectionAccess = {
  read: readAccess,
  create: writeAccess,
  update: writeAccess,
  delete: deleteAccess,
}
