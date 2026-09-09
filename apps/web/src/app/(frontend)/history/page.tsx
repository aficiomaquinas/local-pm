import type { Metadata } from 'next'
import { HistoryClient } from '@/components/history/HistoryClient'
import { getPayload } from 'payload'
import config from '@payload-config'
import { buildHistoryFeed } from '@/app/api/history/feed'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'History · Local PM',
  description: 'Audit trail of projects, teams and tickets (filterable, diffable, restorable)',
}

// Server component: initial consolidated feed (newest page) through the same
// aggregation used by GET /api/history (spec §4.2). The client component owns
// filters / pagination / restore and refetches /api/history from then on.
export default async function HistoryPage() {
  const payload = await getPayload({ config })
  // SPC-005: diffs power the mutation labels (Updated with named fields).
  const initialData = await buildHistoryFeed(payload, new URLSearchParams('withDiff=1'))

  return <HistoryClient initialData={initialData} />
}
