import type { HistoryDoc } from '@/app/api/history/types'

/**
 * SPC-005 / action-plan item 2 — History mutation labels (BUG-2 follow-up).
 *
 * The feed carries a jsondiffpatch delta per entry (vs the parent's previous
 * version). The original UI rendered 'Created' on every row whose diff was
 * empty-or-vs-{} — which, for a group's later versions, read every update as
 * another creation. This module translates each entry into operator language:
 *
 *   - 'Created'          → ONLY the group's first (oldest) version;
 *   - 'Updated (n: F1, F2)' → any later version with field changes;
 *   - 'Restored to <date>'  → the write that came from a version restore
 *     (Payload stamps req.context.isRestoringVersion during restoreVersion;
 *     detectable because the snapshot equals an OLDER version's snapshot);
 *   - 'Soft-deleted'     → the entry whose snapshot carries deleted: true.
 *
 * Pure functions (delta → strings): no React, no fetch — T1-testable per
 * SPC-003 §7.2.
 */

export interface MutationInfo {
  /** Canonical verb: Created | Updated | Restored | Soft-deleted. */
  kind: 'created' | 'updated' | 'restored' | 'soft-deleted'
  /** Full operator-facing label, e.g. `Updated (2 fields: Status, Priority)`. */
  label: string
  /** Human field names the delta touches (empty for created). */
  fields: string[]
}

/** Field-path → human label (schema names; fallback = raw path). */
const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  name: 'Name',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  project: 'Project',
  team: 'Team',
  dueDate: 'Due Date',
  labels: 'Labels',
  subtasks: 'Subtasks',
  blockedBy: 'Blocked By',
  icon: 'Icon',
  color: 'Color',
  ticketId: 'Ticket ID',
  prefix: 'Prefix',
  ticketCounter: 'Ticket Counter',
  sortOrder: 'Sort Order',
  deleted: 'Deleted',
}

/** Map a delta field path (top-level key) to its human label. */
export function humanFieldName(path: string): string {
  return FIELD_LABELS[path] ?? path
}

/** jsondiffpatch array-marker: the `_t: 'a'` node signals an array delta. */
function isDeltaNode(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * Extract the changed top-level field names from a jsondiffpatch delta.
 * Array deltas (`_t: 'a'`) keep their inner item keys but the FIELD is the
 * top-level one, so we only ever name top-level entries.
 */
export function deltaFieldPaths(delta: Record<string, unknown> | null | undefined): string[] {
  if (!delta || !isDeltaNode(delta)) return []
  return Object.keys(delta).filter((k) => k !== '_t')
}

/** True when the version snapshot is a soft delete state (deleted: true). */
export function isSoftDeleteSnapshot(doc: HistoryDoc): boolean {
  const v = (doc.version ?? {}) as Record<string, unknown>
  return v.deleted === true
}

/**
 * Date rendering shared with the row UI: 'Sep 8, 2026, 10:00' style, stable
 * across server/client by using UTC-free explicit parts of the ISO string.
 */
function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Mutation info for one feed entry.
 *
 * @param doc        the feed entry (delta + snapshot)
 * @param isGroupCreation  true when this entry IS the group's oldest version
 * @param restoredFrom     ISO date of the snapshot this entry restores
 *                         (already detected by the caller), if any
 */
export function mutationInfo(
  doc: HistoryDoc,
  isGroupCreation: boolean,
  restoredFrom?: string | null,
): MutationInfo {
  // Restore detection wins over the field list: a restore usually also
  // changes fields (whatever the old snapshot differs in).
  if (restoredFrom) {
    return {
      kind: 'restored',
      label: `Restored to ${shortDate(restoredFrom)}`,
      fields: deltaFieldPaths(doc.diff),
    }
  }

  if (isSoftDeleteSnapshot(doc) && !isGroupCreation) {
    return {
      kind: 'soft-deleted',
      label: 'Soft-deleted',
      fields: deltaFieldPaths(doc.diff).map(humanFieldName),
    }
  }

  if (isGroupCreation) {
    return { kind: 'created', label: 'Created', fields: [] }
  }

  const fields = deltaFieldPaths(doc.diff).map(humanFieldName)
  if (fields.length === 0) {
    // No predecessor delta available (e.g. feed without withDiff) — a
    // non-creation row with an empty delta is still an update-shaped entry.
    return { kind: 'updated', label: 'Updated', fields: [] }
  }
  const list = fields.join(', ')
  return {
    kind: 'updated',
    label: `Updated (${fields.length} ${fields.length === 1 ? 'field' : 'fields'}: ${list})`,
    fields,
  }
}
