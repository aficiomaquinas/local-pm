'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, ChevronLeft, ChevronRight, History as HistoryIcon, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { VersionRow } from '@/components/history/VersionRow'
import { HistoryFilters, DEFAULT_FILTERS, type HistoryFilterState } from '@/components/history/HistoryFilters'
import { HISTORY_COLLECTIONS, type HistoryDoc, type HistoryResponse } from '@/app/api/history/types'
import { groupHistoryFeed, detectRestoredFrom } from '@/components/history/grouping'
import { mutationInfo, type MutationInfo } from '@/components/history/mutationLabel'

/**
 * Client surface of the audit trail (SPC-001 §4.5): filters, consolidated
 * feed, expandable per-entry diff, one-click restore with confirmation.
 *
 * The feed comes from the aggregation endpoint (/api/history, master-user
 * gated). Restore goes straight to the native REST endpoint
 * POST /api/{slug}/versions/:id (spec §4.3) — it re-creates a version, so the
 * refresh shows the restore as the newest trail entry.
 *
 * BUG-2 (triage 2026-09-07): the feed renders grouped by (collection, parent)
 * — one collapsible group per ticket/project/team, versions newest-first
 * inside, 'Created' marked only on the group's first (oldest) version.
 * Collapsed by default except the feed's leading group. The fetch is
 * untouched: the API was never the bug.
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
  // Accordion: null = default (leading group expanded, rest collapsed);
  // '' = user collapsed everything; a key = that group is expanded.
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const buildQuery = useCallback(
    (p: number) => {
      const params = new URLSearchParams()
      params.set('collection', filters.collection)
      params.set('page', String(p))
      params.set('limit', String(PAGE_SIZE))
      // SPC-005: diffs power the mutation labels (Updated with named fields).
      params.set('withDiff', '1')
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
        // New page/feed → back to the default expansion (leading group open).
        setExpandedKey(null)
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

  const groups = useMemo(() => groupHistoryFeed(data.docs), [data.docs])
  const firstGroupKey = groups[0]?.key ?? null

  // SPC-005: per-row mutation labels. Computed from the grouped feed so
  // 'Created' is reserved to each group's oldest version and restores are
  // detected by snapshot-equality within the group.
  const mutations = useMemo(() => {
    const map = new Map<string, MutationInfo>()
    for (const group of groups) {
      for (const doc of group.docs) {
        const restoredFrom = detectRestoredFrom(doc, group.docs)
        map.set(
          `${doc.collection}:${doc.id}`,
          mutationInfo(doc, group.creation?.id === doc.id, restoredFrom),
        )
      }
    }
    return map
  }, [groups])

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

  const toggleGroup = (key: string, isExpanded: boolean) => {
    setExpandedKey(isExpanded ? '' : key)
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
          {groups.map((group) => {
            const isExpanded = expandedKey === null ? group.key === firstGroupKey : expandedKey === group.key
            return (
              <li key={group.key} className="bg-[#18181b] border border-[#27272a] rounded-lg">
                <button
                  onClick={() => toggleGroup(group.key, isExpanded)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4 text-gray-500 shrink-0" />
                  )}
                  <HistoryIcon className="w-4 h-4 text-gray-600 shrink-0" />
                  <span
                    className={`text-[11px] uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${groupBadge(group.collection)}`}
                  >
                    {group.collection}
                  </span>
                  <span className="text-sm text-white truncate flex-1">{group.parentLabel}</span>
                  <span className="text-[11px] text-gray-500 shrink-0">
                    {group.docs.length} {group.docs.length === 1 ? 'version' : 'versions'}
                  </span>
                  {group.creation && (
                    <span className="text-[11px] text-green-400 border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 rounded shrink-0">
                      created
                    </span>
                  )}
                  {groupHeaderActor(group.docs)}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 pt-1 border-t border-zinc-800/70">
                    <ul className="space-y-1.5">
                      {group.docs.map((doc) => (
                        <VersionRow
                          key={`${doc.collection}:${doc.id}`}
                          doc={doc}
                          onRestore={handleRestore}
                          // SPC-005: 'Created' only on the group's first
                          // (oldest) version; updates carry named fields;
                          // restores are detected within the group.
                          mutation={mutations.get(`${doc.collection}:${doc.id}`)}
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            )
          })}
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

function groupBadge(collection: string): string {
  const BADGE: Record<string, string> = {
    tickets: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    projects: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    teams: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  }
  return BADGE[collection] ?? 'bg-zinc-800 text-gray-400 border-zinc-700'
}

const GROUP_ACTOR_BADGE: Record<string, string> = {
  user: 'text-violet-300 border-violet-500/30 bg-violet-500/10',
  agent: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
  anonymous: 'text-gray-400 border-zinc-600/60 bg-zinc-700/30',
}

/**
 * SPC-005 D-4: last-actor chip on each group header — the identity of the
 * most recent write to this parent (the feed is newest-first, so docs[0]).
 */
function groupHeaderActor(docs: HistoryDoc[]) {
  const actor = docs[0]?.actor
  if (!actor) return null
  return (
    <span
      className={`text-[11px] px-1.5 py-0.5 rounded border shrink-0 ${GROUP_ACTOR_BADGE[actor.type] ?? GROUP_ACTOR_BADGE.anonymous}`}
      title={`Last change by: ${actor.label}`}
    >
      {actor.label}
    </span>
  )
}
