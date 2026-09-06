import { getPayload } from 'payload'
import type { Payload } from 'payload'
import { HISTORY_COLLECTIONS, type HistoryCollection } from '@/app/api/history/types'

/**
 * Resolves `parentLabel` for history feed entries in bulk (SPC-001 §4.3):
 *   - tickets: "TICK-0042 · Fix pool PHP-FPM"
 *   - projects/teams: the doc's `name`
 * Deleted parents fall back to a short id, keeping the row restorable.
 */
export async function buildParentLabels(
  payload: Payload,
  docs: { collection: HistoryCollection; parent: string }[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const byCollection = new Map<HistoryCollection, Set<string>>()

  for (const doc of docs) {
    if (!byCollection.has(doc.collection)) byCollection.set(doc.collection, new Set())
    byCollection.get(doc.collection)!.add(doc.parent)
  }

  await Promise.all(
    HISTORY_COLLECTIONS.filter((slug) => byCollection.has(slug)).map(async (slug) => {
      const ids = [...byCollection.get(slug)!]
      const result = await payload.find({
        collection: slug,
        where: { id: { in: ids } },
        limit: ids.length,
        depth: 0,
      })
      for (const p of result.docs) {
        const rec = p as unknown as Record<string, unknown>
        const label =
          slug === 'tickets'
            ? `${String(rec.ticketId ?? '')} · ${String(rec.title ?? '')}`.replace(/^ · | · $/g, '')
            : String(rec.name ?? '')
        labels.set(`${slug}:${String(p.id)}`, label || String(p.id))
      }
    }),
  )

  return labels
}
