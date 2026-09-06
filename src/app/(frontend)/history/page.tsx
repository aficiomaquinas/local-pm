import type { Metadata } from 'next'
import { HistoryClient } from '@/components/history/HistoryClient'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Payload } from 'payload'
import type { HistoryResponse } from '@/app/api/history/types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'History · Local PM',
  description: 'Audit trail of projects, teams and tickets (filterable, diffable, restorable)',
}

type Slug = 'projects' | 'teams' | 'tickets'

interface RawVersion {
  id: string | number
  parent: string | number
  autosave?: boolean
  createdAt?: string
  updatedAt?: string
  version?: unknown
}

async function latestVersions(
  payload: Payload,
  slug: Slug,
): Promise<{ docs: RawVersion[]; totalDocs: number }> {
  const result = await payload.findVersions({
    collection: slug,
    sort: '-updatedAt',
    limit: 100,
    depth: 0,
  })
  return {
    docs: result.docs as unknown as RawVersion[],
    totalDocs: result.totalDocs ?? 0,
  }
}

// Server component: initial consolidated feed (newest page) via the Local API
// (spec §4.2). The client component owns filters / pagination / restore and
// refetches /api/history from then on.
export default async function HistoryPage() {
  const payload = await getPayload({ config })

  const [projects, teams, tickets] = await Promise.all([
    latestVersions(payload, 'projects'),
    latestVersions(payload, 'teams'),
    latestVersions(payload, 'tickets'),
  ])

  const merged: HistoryResponse['docs'] = []

  const push = (collection: Slug, docs: RawVersion[]) => {
    for (const v of docs) {
      merged.push({
        id: String(v.id),
        collection,
        parent: String(v.parent),
        parentLabel: '', // resolved client-side on the first /api/history fetch
        autosave: Boolean(v.autosave),
        createdAt: v.createdAt ?? '',
        updatedAt: v.updatedAt ?? '',
      })
    }
  }

  push('projects', projects.docs)
  push('teams', teams.docs)
  push('tickets', tickets.docs)

  merged.sort((a, b) => {
    const da = a.updatedAt || a.createdAt
    const db = b.updatedAt || b.createdAt
    return da < db ? 1 : da > db ? -1 : 0
  })

  const initialData: HistoryResponse = {
    docs: merged.slice(0, 20),
    page: 1,
    limit: 20,
    totalDocs: projects.totalDocs + teams.totalDocs + tickets.totalDocs,
  }

  return <HistoryClient initialData={initialData} />
}
