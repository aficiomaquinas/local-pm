import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { create as createDiffPatcher } from 'jsondiffpatch'
import type { Payload, PayloadRequest, Where } from 'payload'
import type { NextRequest } from 'next/server'
import { enforceMasterOnlyPolicy } from '@/access/actorPolicy'
import { buildParentLabels } from '@/app/api/history/parentLabels'
import type { HistoryDoc, HistoryResponse } from '@/app/api/history/types'

export const dynamic = 'force-dynamic'

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

function buildWhere(slug: Slug, params: URLSearchParams): Record<string, unknown> | undefined {
  const and: Record<string, unknown>[] = []

  const parent = params.get('parent')
  if (parent && parent !== 'all') {
    and.push({ parent: { equals: parent } })
  }

  const from = params.get('from')
  if (from) and.push({ updatedAt: { greater_than_equal: from } })

  const to = params.get('to')
  if (to) and.push({ updatedAt: { less_than_equal: to } })

  const q = params.get('q')?.trim()
  if (q) {
    // Spec §3.2: free text over the versioned document's title / ticketId.
    if (slug === 'tickets') {
      and.push({
        or: [
          { 'version.title': { like: q } },
          { 'version.ticketId': { like: q } },
        ],
      })
    } else {
      and.push({ 'version.title': { like: q } })
    }
  }

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
      and: [
        { parent: { equals: parent } },
        { updatedAt: { less_than: beforeIso } },
      ],
    },
    sort: '-updatedAt',
    limit: 1,
    depth: 0,
  })
  return docs[0]?.version as unknown as Record<string, unknown> | undefined
}

export async function GET(req: NextRequest) {
  const payload: Payload = await getPayload({ config })

  const requestWithUser = req as NextRequest & { user?: PayloadRequest['user'] }
  if (!requestWithUser.user) {
    try {
      const { headers } = await import('next/headers')
      const hdrs = await headers()
      const { createLocalReq } = await import('payload')
      const localReq = await createLocalReq(
        { req: { headers: hdrs } as unknown as PayloadRequest },
        payload,
      )
      requestWithUser.user = localReq.user
    } catch {
      requestWithUser.user = null
    }
  }

  // SPC-001 §6: the audit trail is master-user exclusive
  // (agent + anonymous denied, per the documented decision in src/access/actorPolicy.ts).
  enforceMasterOnlyPolicy('the audit history endpoint')({ req: requestWithUser as unknown as PayloadRequest })

  const params = req.nextUrl.searchParams

  const collectionParam = params.get('collection') ?? 'all'
  const slugs: Slug[] =
    collectionParam === 'all' || !collectionParam
      ? [...SLUGS]
      : SLUGS.includes(collectionParam as Slug)
        ? [collectionParam as Slug]
        : []

  if (slugs.length === 0) {
    return NextResponse.json(
      { error: `Invalid collection filter: ${collectionParam}` },
      { status: 400 },
    )
  }

  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const limit = parseLimit(params.get('limit'))
  const withDiff = params.get('withDiff') === '1'

  // SPC-001 G-2: three parallel findVersions calls + in-memory merge,
  // pagination over the combined result. Sufficient at local-pm scale (v1).
  const PER_FEED_LIMIT = 100
  let results
  try {
    results = await Promise.all(
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
  } catch (err) {
    console.error('[api/history] findVersions failed', err)
    return NextResponse.json({ error: 'Failed to query versions' }, { status: 500 })
  }

  type Entry = { doc: HistoryDoc; date: string }
  const merged: Entry[] = []
  let totalDocs = 0

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i]
    const result = results[i]
    totalDocs += result.totalDocs ?? 0
    for (const v of result.docs) {
      merged.push({
        doc: {
          id: String(v.id),
          collection: slug,
          parent: String(v.parent),
          parentLabel: '', // resolved in bulk below
          autosave: Boolean((v as { autosave?: boolean }).autosave),
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
          version: (v.version ?? {}) as unknown as Record<string, unknown>,
        } as HistoryDoc,
        date: v.updatedAt ?? v.createdAt ?? '',
      })
    }
  }

  // Consolidated chronological feed (spec §3.2).
  merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

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

  const docs: HistoryDoc[] = pageEntries.map((e) => {
    const { version: _version, ...rest } = e.doc
    void _version
    return rest
  })

  const response: HistoryResponse = {
    docs,
    page,
    limit,
    totalDocs,
  }

  return NextResponse.json(response)
}
