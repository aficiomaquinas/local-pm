import type { Access } from 'payload'
import { APIError } from 'payload'
import { status as httpStatus } from 'http-status'

/**
 * Soft delete (SPC-004 D2, bug-triage 2026-09-07 BUG-3 resolution):
 *
 * Deleting a document used to destroy its whole version trail — Payload's
 * delete operation cascades `deleteCollectionVersions` when `versions` is
 * enabled (verified against payload/dist/collections/operations/delete.js
 * during triage). An audit trail that the very action it records can destroy
 * is not an audit trail, so deletion becomes a flag:
 *
 *   - `deleted: boolean` field (default false) on tickets/projects/teams;
 *   - read access hides deleted docs (query constraint — the kanban board's
 *     server page and client refetch both inherit the filter);
 *   - `beforeDelete` hard-blocks real deletes from the request path (403).
 *     The real purge lives in a terminal-only, operator-run script — never
 *     reachable through the API.
 *
 * This module is deliberately import-free of Payload types at runtime so it
 * can be unit-tested as T1 (only `APIError`/`httpStatus` are used).
 */

export const DELETED_FIELD = {
  name: 'deleted',
  type: 'checkbox',
  label: 'Deleted (soft)',
  defaultValue: false,
  admin: {
    position: 'sidebar',
    // Hidden from admin forms: operators use the UI Delete action, which
    // PATCHes this field; hand-toggling in the admin panel is not a flow.
    condition: () => false,
    description: 'Soft delete — hidden from the board, trail preserved',
  },
} as const

/**
 * Read ACL: everyone may read, minus soft-deleted docs. Implemented as a
 * query constraint (not a post-find filter) so list endpoints, the kanban
 * board's server render and client refetches all inherit it.
 */
export const readExcludingDeleted: Access = ({ req }) => {
  void req
  return {
    deleted: { not_equals: true },
  }
}

/**
 * `beforeOperation` delete guard. Payload's delete operation runs
 * `beforeOperation` with operation 'delete'. Hard delete is disabled from
 * every request path; the real purge is the operator's terminal script.
 */
export function blockHardDelete({ operation }: { operation?: string }): void {
  if (operation !== 'delete') return
  throw new APIError(
    'Hard delete is disabled; use soft delete (PATCH { deleted: true })',
    httpStatus.FORBIDDEN,
    null,
    true,
  )
}
