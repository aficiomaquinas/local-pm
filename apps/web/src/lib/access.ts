import type { Access } from 'payload'

export const requireAuthEnabled = (): boolean => process.env.LOCAL_PM_REQUIRE_AUTH === 'true'

const DELETE_ROLES = new Set(['admin'])

export const readAccess: Access = ({ req }) => (requireAuthEnabled() ? Boolean(req.user) : true)

export const writeAccess: Access = ({ req }) => (requireAuthEnabled() ? Boolean(req.user) : true)

export const deleteAccess: Access = ({ req }) => {
  if (!requireAuthEnabled()) return true
  const role = (req.user as { role?: string } | undefined)?.role
  return typeof role === 'string' && DELETE_ROLES.has(role)
}

export const collectionAccess = {
  read: readAccess,
  create: writeAccess,
  update: writeAccess,
  delete: deleteAccess,
}
