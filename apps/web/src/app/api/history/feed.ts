import { create as createDiffPatcher } from 'jsondiffpatch'
import type { Payload, Where } from 'payload'
import { buildParentLabels } from '@/app/api/history/parentLabels'
import type { HistoryDoc, HistoryResponse } from '@/app/api/history/types'
import { resolveDataManagementActor } from '@/access/dataManagementActor'
import { resolveActorType } from '@/access/actorPolicy'

// SPC-001 §4.4: objectHash by `name` (labels) / `title` (subtasks) for stable
// array diffs; positional fallback keeps other arrays diffable.
const diffPatcher = createDiffPatcher({
  objectHash: (item: object, index?: number): string => {
    const o = item as Record<string, unknown>
    if (typeof o?.name === 'string' && o.name) return o.name
    if (typeof o?.title === 'string' && o.title) return o.title
    return `_idx_${index ?? ''}`
  },
})

const SLUGS = ['projects', 'teams', 'tickets'] as const
type Slug = (typeof SLUGS)[number]

function parseLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? '20', 10)
  if (!Number.isFinite(n) || n <= 0) return 20
  return Math.min(n, 100) // spec §4.3: default 20, cap 100
}

export function resolveCollectionFilter(collectionParam: string | null): Slug[] {
  const value = collectionParam ?? 'all'
  if (!value || value === 'all') return [...SLUGS]
  const filtered = SLUGS.filter((s) => s === value)
  return filtered
}

function buildWhere(slug: Slug, params: URLSearchParams): Where | undefined {
  const and: Record<string, unknown>[] = []

  const parent = params.get('parent')
  if (parent && parent !== 'all') {
    and.push({ parent: { equals: parent } })
  }

  const from = params.get('from')
  if (from) and.push({ updatedAt: { greater_than_equal: from } })

  const to = params.get('to')
  if (to) and.push({ updatedAt: { less_than_equal: to } })

  // Free text (spec §3.2: over the versioned document's title / ticketId) is
  // matched in memory on the snapshot — Payload's query validation rejects
  // `version.*` paths in findVersions `where` clauses.
  if (and.length === 0) return undefined
  if (and.length === 1) return and[0] as Where
  return { and } as Where
}

async function previousVersionOf(
  payload: Payload,
  collection: Slug,
  parent: string,
  beforeIso: string,
): Promise<Record<string, unknown> | undefined> {
  const { docs } = await payload.findVersions({
    collection,
    where: {
      and: [{ parent: { equals: parent } }, { updatedAt: { less_than: beforeIso } }],
    },
    sort: '-updatedAt',
    limit: 1,
    depth: 0,
  })
  return docs[0]?.version as unknown as Record<string, unknown> | undefined
}

/**
 * SPC-005 D-4: resolve `{ type, label }` per entry IN BULK from the version
 * snapshots (the attribution fields ride on the doc, so they ride on every
 * snapshot). No per-entry lookups: the label is the denormalized
 * `actorLabel`; the fallback synthesizes from the type for snapshots
 * written before SPC-005 deployed.
 */
function resolveActorForSnapshot(version: Record<string, unknown>): {
  type: 'user' | 'agent' | 'anonymous'
  label: string
} {
  const rawType = version.actorType
  const type =
    rawType === 'user' || rawType === 'agent' || rawType === 'anonymous'
      ? rawType
      : 'anonymous'
  const rawLabel = typeof version.actorLabel === 'string' ? version.actorLabel : ''
  const label =
    rawLabel ||
    (type === 'user' ? 'user' : type === 'agent' ? 'agent' : 'anonymous')
  return { type, label }
}

/**
 * Consolidated audit-trail feed (SPC-001 §4.3 / G-2): three parallel
 * findVersions calls + in-memory merge, pagination over the combined result.
 * Throws on invalid collection filter. ACL is enforced by the HTTP layer
 * (route.ts) before this runs; the Local API calls here are trusted.
 */
export async function buildHistoryFeed(
  payload: Payload,
  params: URLSearchParams,
): Promise<HistoryResponse> {
  const slugs = resolveCollectionFilter(params.get('collection'))
  if (slugs.length === 0) {
    throw new Error(`Invalid collection filter: ${params.get('collection')}`)
  }

  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const limit = parseLimit(params.get('limit'))
  const withDiff = params.get('withDiff') === '1'

  const PER_FEED_LIMIT = 100
  const results = await Promise.all(
    slugs.map((slug) =>
      payload.findVersions({
        collection: slug,
        where: buildWhere(slug, params) as Where,
        sort: '-updatedAt',
        limit: PER_FEED_LIMIT,
        page: 1,
        depth: 0,
      }),
    ),
  )

  type Entry = { doc: HistoryDoc; date: string }
  const merged: Entry[] = []
  let totalDocs = 0

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i]
    const result = results[i]
    totalDocs += result.totalDocs ?? 0
    for (const v of result.docs) {
      const raw = v as {
        id: unknown
        parent: unknown
        autosave?: boolean
        createdAt?: string
        updatedAt?: string
        version?: unknown
      }
      merged.push({
        doc: {
          id: String(raw.id),
          collection: slug,
          parent: String(raw.parent),
          parentLabel: '', // resolved in bulk below
          autosave: Boolean(raw.autosave),
          createdAt: raw.createdAt ?? '',
          updatedAt: raw.updatedAt ?? '',
          // SPC-005 D-4: actor resolved from the snapshot (bulk, below).
          actor: { type: 'anonymous', label: 'anonymous' },
          version: (raw.version ?? {}) as unknown as Record<string, unknown>,
        },
        date: raw.updatedAt ?? raw.createdAt ?? '',
      })
    }
  }

  // Consolidated chronological feed (spec §3.2).
  merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  // Free-text filter over the version snapshot (title / ticketId, spec §3.2).
  // Note: matching happens on the fetched window (≤100 per collection), which
  // is exact at local-pm scale (v1, G-2).
  const q = params.get('q')?.trim().toLowerCase()
  if (q) {
    const matches = (d: HistoryDoc) => {
      const v = (d.version ?? {}) as Record<string, unknown>
      return (
        String(v.title ?? '').toLowerCase().includes(q) ||
        String(v.ticketId ?? '').toLowerCase().includes(q) ||
        String(v.name ?? '').toLowerCase().includes(q)
      )
    }
    const filtered = merged.filter((e) => matches(e.doc))
    merged.length = 0
    merged.push(...filtered)
    totalDocs = merged.length
  }

  const start = (page - 1) * limit
  const pageEntries = merged.slice(start, start + limit)

  // Resolve parent labels in bulk (one find per involved collection, depth 0).
  const parentLabelMap = await buildParentLabels(
    payload,
    pageEntries.map((e) => e.doc),
  )
  for (const entry of pageEntries) {
    entry.doc.parentLabel =
      parentLabelMap.get(`${entry.doc.collection}:${entry.doc.parent}`) ??
      `${entry.doc.parent.slice(0, 8)}…`
    // SPC-005 D-4: actor comes from the snapshot itself — no extra queries.
    entry.doc.actor = resolveActorForSnapshot(entry.doc.version ?? {})
  }

  // Diffs: version[N] vs version[N-1] of the same parent, ordered by updatedAt
  // (spec §4.4). Optional on the feed via ?withDiff=1 (spec §4.3).
  if (withDiff) {
    await Promise.all(
      pageEntries.map(async (entry) => {
        const prev = await previousVersionOf(
          payload,
          entry.doc.collection,
          entry.doc.parent,
          entry.doc.updatedAt,
        )
        // A parent's first record (creation) diffs against {} (spec §4.4).
        const delta = diffPatcher.diff(prev ?? {}, entry.doc.version ?? {})
        entry.doc.diff = (delta ?? null) as Record<string, unknown> | null
      }),
    )
  }

  // The version snapshot is internal (diff input); the response contract
  // (spec §4.3) carries only the metadata + optional diff.
  const docs: HistoryDoc[] = pageEntries.map((e) => {
    const { version: _version, ...rest } = e.doc
    void _version
    return rest
  })

  return { docs, page, limit, totalDocs }
}
