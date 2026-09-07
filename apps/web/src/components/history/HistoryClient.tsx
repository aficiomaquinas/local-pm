'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, ChevronLeft, ChevronRight, History as HistoryIcon } from 'lucide-react'
import { VersionRow } from '@/components/history/VersionRow'
import { HistoryFilters, DEFAULT_FILTERS, type HistoryFilterState } from '@/components/history/HistoryFilters'
import { HISTORY_COLLECTIONS, type HistoryDoc, type HistoryResponse } from '@/app/api/history/types'

/**
 * Client surface of the audit trail (SPC-001 §4.5): filters, consolidated
 * feed, expandable per-entry diff, one-click restore with confirmation.
 *
 * The feed comes from the aggregation endpoint (/api/history, master-user
 * gated). Restore goes straight to the native REST endpoint
 * POST /api/{slug}/versions/:id (spec §4.3) — it re-creates a version, so the
 * refresh shows the restore as the newest trail entry.
 */

const PAGE_SIZE = 20

interface HistoryClientProps {
  initialData: HistoryResponse
}

export function HistoryClient({ initialData }: HistoryClientProps) {
  const [data, setData] = useState<HistoryResponse>(initialData)
  const [filters, setFilters] = useState<HistoryFilterState>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parentOptions, setParentOptions] = useState<{ id: string; label: string }[]>([])

  const buildQuery = useCallback(
    (p: number) => {
      const params = new URLSearchParams()
      params.set('collection', filters.collection)
      params.set('page', String(p))
      params.set('limit', String(PAGE_SIZE))
      if (filters.parent) params.set('parent', filters.parent)
      if (filters.from) params.set('from', new Date(`${filters.from}T00:00:00`).toISOString())
      if (filters.to) params.set('to', new Date(`${filters.to}T23:59:59.999`).toISOString())
      if (filters.q) params.set('q', filters.q)
      return params
    },
    [filters],
  )

  const fetchFeed = useCallback(
    async (p: number) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/history?${buildQuery(p).toString()}`)
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? `Request failed (${res.status})`)
        }
        const json = (await res.json()) as HistoryResponse
        setData(json)
        setPage(p)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load history')
      } finally {
        setLoading(false)
      }
    },
    [buildQuery],
  )

  // Parent options for the doc filter (docs of the selected collection).
  useEffect(() => {
    const load = async () => {
      try {
        const slug = filters.collection === 'all' ? 'tickets' : filters.collection
        const res = await fetch(`/api/${slug}?limit=100&sort=-updatedAt&depth=0`)
        const json = (await res.json()) as {
          docs?: { id: string; title?: string; name?: string; ticketId?: string }[]
        }
        setParentOptions(
          (json.docs ?? []).map((d) => ({
            id: d.id,
            label: slug === 'tickets' ? `${d.ticketId ?? ''} · ${d.title ?? ''}`.trim() : d.name ?? d.id,
          })),
        )
      } catch {
        setParentOptions([])
      }
    }
    load()
  }, [filters.collection])

  const totalPages = Math.max(1, Math.ceil(data.totalDocs / PAGE_SIZE))

  const handleRestore = async (doc: HistoryDoc): Promise<boolean> => {
    const res = await fetch(`/api/${doc.collection}/versions/${doc.id}`, { method: 'POST' })
    if (!res.ok) {
      console.error('Restore failed', res.status, await res.text().catch(() => ''))
      return false
    }
    // Refresh the feed: the restore created a new version on top of the trail.
    await fetchFeed(1)
    return true
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 bg-foreground rounded-md flex items-center justify-center">
          <HistoryIcon className="w-4 h-4 text-background" />
        </div>
        <h1 className="text-xl font-semibold text-white">History</h1>
        <span className="text-xs text-gray-500">audit trail · {data.totalDocs} versions</span>
      </div>

      <HistoryFilters filters={filters} onChange={(f) => { setFilters(f); void fetchFeed(1) }} parentOptions={parentOptions} />

      {error && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
        </div>
      ) : data.docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <HistoryIcon className="w-10 h-10 text-gray-600 mb-3" />
          <p className="text-gray-400 text-sm">
            No version entries{filters.collection !== 'all' ? ` for ${filters.collection}` : ''}.
            The trail starts with the first write after deploy.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.docs.map((doc) => (
            <VersionRow key={`${doc.collection}:${doc.id}`} doc={doc} onRestore={handleRestore} />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-center gap-4 mt-6">
        <button
          onClick={() => void fetchFeed(page - 1)}
          disabled={page <= 1 || loading}
          className="flex items-center gap-1 text-sm text-gray-300 hover:text-white disabled:opacity-40 disabled:hover:text-gray-300 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        <span className="text-xs text-gray-500">
          page {page} / {totalPages}
        </span>
        <button
          onClick={() => void fetchFeed(page + 1)}
          disabled={page >= totalPages || loading}
          className="flex items-center gap-1 text-sm text-gray-300 hover:text-white disabled:opacity-40 disabled:hover:text-gray-300 transition-colors"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
