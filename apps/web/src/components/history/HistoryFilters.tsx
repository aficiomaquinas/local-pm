'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { HISTORY_COLLECTIONS } from '@/app/api/history/types'

/**
 * Filter bar for the audit trail (SPC-001 §3.2 / §4.5):
 * collection, document (parent), date range, free text.
 */

export interface HistoryFilterState {
  collection: string // 'all' | slug
  parent: string // '' | doc id
  from: string // ISO date (yyyy-mm-dd from <input type="date">)
  to: string
  q: string
}

export const DEFAULT_FILTERS: HistoryFilterState = {
  collection: 'all',
  parent: '',
  from: '',
  to: '',
  q: '',
}

interface HistoryFiltersProps {
  filters: HistoryFilterState
  onChange: (next: HistoryFilterState) => void
  /** Parent options for the doc filter (loaded for the chosen collection). */
  parentOptions: { id: string; label: string }[]
}

export function HistoryFilters({ filters, onChange, parentOptions }: HistoryFiltersProps) {
  const [draft, setDraft] = useState<HistoryFilterState>(filters)

  // Keep the draft in sync when filters are reset from outside.
  useEffect(() => {
    setDraft(filters)
  }, [filters])

  const inputCls =
    'bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-gray-500">Collection</span>
        <select
          value={draft.collection}
          onChange={(e) => {
            const collection = e.target.value
            // Parent options are per-collection: drop the parent when switching.
            onChange({ ...draft, collection, parent: '' })
            setDraft({ ...draft, collection, parent: '' })
          }}
          className={inputCls}
        >
          <option value="all">all</option>
          {HISTORY_COLLECTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-gray-500">Document</span>
        <select
          value={draft.parent}
          onChange={(e) => {
            onChange({ ...draft, parent: e.target.value })
            setDraft({ ...draft, parent: e.target.value })
          }}
          className={inputCls + ' min-w-[180px]'}
        >
          <option value="">— any —</option>
          {parentOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-gray-500">From</span>
        <input
          type="date"
          value={draft.from}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-gray-500">To</span>
        <input
          type="date"
          value={draft.to}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1 flex-1 min-w-[220px]">
        <span className="text-[11px] uppercase tracking-wide text-gray-500">Search text</span>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
          <input
            type="text"
            value={draft.q}
            placeholder="title or ticketId…"
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onChange(draft)
            }}
            className={inputCls + ' w-full pl-8'}
          />
        </div>
      </label>

      <button
        onClick={() => onChange(draft)}
        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-1.5 rounded-md transition-colors"
      >
        Filter
      </button>
      <button
        onClick={() => {
          setDraft(DEFAULT_FILTERS)
          onChange(DEFAULT_FILTERS)
        }}
        className="text-gray-400 hover:text-white text-sm px-2 py-1.5 transition-colors"
      >
        Reset
      </button>
    </div>
  )
}
