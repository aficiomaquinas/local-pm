export const HISTORY_COLLECTIONS = ['projects', 'teams', 'tickets'] as const

export type HistoryCollection = (typeof HISTORY_COLLECTIONS)[number]

export interface HistoryDoc {
  id: string
  collection: HistoryCollection
  parent: string
  parentLabel: string
  autosave: boolean
  createdAt: string
  updatedAt: string
  /** SPC-005 D-4: resolved actor of the write that produced this version. */
  actor: { type: 'user' | 'agent' | 'anonymous'; label: string }
  /** jsondiffpatch delta vs the same parent's previous version (spec §4.3). */
  diff?: Record<string, unknown> | null
  /** The version snapshot is used internally for restore payloads. */
  version?: Record<string, unknown>
}

export interface HistoryResponse {
  docs: HistoryDoc[]
  page: number
  limit: number
  totalDocs: number
}
