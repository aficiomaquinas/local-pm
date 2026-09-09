import type { HistoryDoc } from '@/app/api/history/types'

/**
 * History feed grouping (BUG-2, triage 2026-09-07): the API already returns a
 * correct chronological feed with per-field diffs — the defect was purely
 * presentational (a flat list of VersionRows where every entry read as an
 * unrelated "created" card). This helper folds the feed into one group per
 * (collection, parent) so changes to a single ticket render as ONE
 * collapsible group with its versions newest-first inside.
 *
 * 'Created' semantics live at the group level: the creation row is the group's
 * OLDEST version (the one whose diff is empty / vs-{}); every newer version
 * shows only its per-field delta. When a group has predecessors, the oldest
 * row's creation diff is not displayed — only its date marker (triage
 * contributor #2: a missing predecessor made updates look like creations).
 *
 * SPC-005 (mutation labels): the group also carries each entry's restored
 * source date — a restore writes a snapshot IDENTICAL to some older version
 * of the same parent; the newest such match that is not the entry itself
 * marks the entry as 'Restored to <date>'.
 */

export interface HistoryGroup {
  /** Stable key: `${collection}:${parent}`. */
  key: string
  collection: HistoryDoc['collection']
  parent: string
  /** Label of the parent doc (ticket id · title). */
  parentLabel: string
  /** Versions inside the group, newest first. */
  docs: HistoryDoc[]
  /** The group's creation row (oldest version; empty/vs-{} diff). */
  creation: HistoryDoc | null
}

/** True when a version row is a "creation" (no diff, or diff against {}). */
export function isCreationRow(doc: HistoryDoc): boolean {
  return !doc.diff || Object.keys(doc.diff).length === 0
}

/**
 * Detect the version a feed entry restores: snapshot-equality against an
 * older version of the same parent. Compares the JSON of the snapshots
 * (stable key order from Mongo), ignoring the attribution trio — a restore
 * by a different actor than the original write must still match. Returns
 * the matched entry's updatedAt (label source), or null.
 */
export function detectRestoredFrom(
  doc: HistoryDoc,
  groupDocs: HistoryDoc[],
): string | null {
  const strip = (d: HistoryDoc) => {
    const v = { ...((d.version ?? {}) as Record<string, unknown>) }
    delete v.actorType
    delete v.actorId
    delete v.actorLabel
    delete v.updatedAt
    delete v.createdAt
    return JSON.stringify(v)
  }
  const target = strip(doc)
  if (!doc.version || Object.keys(doc.version).length === 0) return null
  // Only entries strictly OLDER than `doc` are restore candidates.
  const candidates = groupDocs.filter(
    (d) => d.id !== doc.id && (d.updatedAt || '') < (doc.updatedAt || ''),
  )
  const match = candidates.find((d) => strip(d) === target)
  return match ? match.updatedAt : null
}

/**
 * Group a chronological (newest-first) feed by (collection, parent).
 * Input order inside each group is preserved, so feeding the API's
 * newest-first docs yields newest-first versions per group. Groups come out
 * in order of each group's newest version (most recently touched first).
 */
export function groupHistoryFeed(docs: HistoryDoc[]): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>()

  for (const doc of docs) {
    const key = `${doc.collection}:${doc.parent}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        collection: doc.collection,
        parent: doc.parent,
        parentLabel: doc.parentLabel,
        docs: [],
        creation: null,
      }
      groups.set(key, group)
    }
    group.docs.push(doc)
    // Feed is newest-first → the LAST row seen per group is the oldest
    // version; that is the creation row candidate.
    if (isCreationRow(doc)) {
      group.creation = doc
    }
  }

  return [...groups.values()]
}
