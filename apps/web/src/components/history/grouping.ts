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
