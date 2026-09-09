'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, RotateCcw, History as HistoryIcon } from 'lucide-react'
import { VersionDiff } from '@/components/history/VersionDiff'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { HistoryDoc } from '@/app/api/history/types'
import type { MutationInfo } from '@/components/history/mutationLabel'

/**
 * Collapsible audit-trail feed row (SPC-001 §4.5):
 * meta line (date · collection · parent label) + expandable visual diff +
 * Restore action with explicit confirmation. After a successful restore the
 * row shows a "restored" badge and the feed refreshes (the restore itself
 * creates a new version — visible feedback in the trail).
 *
 * SPC-005: each row carries its mutation label (Created only on the group's
 * first version; Updated with named fields; Restored to <date>; Soft-deleted)
 * and an actor badge ({type, label} resolved by the feed).
 */

const COLLECTION_BADGE: Record<string, string> = {
  tickets: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  projects: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  teams: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
}

const MUTATION_BADGE: Record<MutationInfo['kind'], string> = {
  created: 'text-green-400 border-green-500/30 bg-green-500/10',
  updated: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  restored: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  'soft-deleted': 'text-red-300 border-red-500/30 bg-red-500/10',
}

const ACTOR_BADGE: Record<string, string> = {
  user: 'text-violet-300 border-violet-500/30 bg-violet-500/10',
  agent: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
  anonymous: 'text-gray-400 border-zinc-600/60 bg-zinc-700/30',
}

interface VersionRowProps {
  doc: HistoryDoc
  onRestore: (doc: HistoryDoc) => Promise<boolean>
  /** SPC-005 mutation label data (kind + operator-facing label). */
  mutation?: MutationInfo
}

export function VersionRow({ doc, onRestore, mutation }: VersionRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restored, setRestored] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const date = new Date(doc.updatedAt || doc.createdAt)
  const dateLabel = Number.isNaN(date.getTime())
    ? String(doc.updatedAt || doc.createdAt)
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })

  const isCreation = mutation?.kind === 'created'

  const handleRestore = async () => {
    setRestoring(true)
    setError(null)
    try {
      const ok = await onRestore(doc)
      if (ok) {
        setRestored(true)
        setConfirmOpen(false)
      } else {
        setError('Restore failed — see server response.')
      }
    } finally {
      setRestoring(false)
    }
  }

  return (
    <li className="bg-[#18181b] border border-[#27272a] rounded-lg hover:border-[#3f3f46] transition-colors">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
        )}
        <HistoryIcon className="w-4 h-4 text-gray-600 shrink-0" />
        <span className="text-sm text-gray-300 font-mono shrink-0">{dateLabel}</span>
        <span
          className={`text-[11px] uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${COLLECTION_BADGE[doc.collection] ?? 'bg-zinc-800 text-gray-400 border-zinc-700'}`}
        >
          {doc.collection}
        </span>
        <span className="text-sm text-white truncate flex-1">{doc.parentLabel}</span>
        {mutation && (
          <span
            className={`text-[11px] px-1.5 py-0.5 rounded border shrink-0 min-w-0 max-w-[220px] truncate ${MUTATION_BADGE[mutation.kind]}`}
            title={mutation.fields.length ? mutation.fields.join(', ') : mutation.label}
          >
            {mutation.label}
          </span>
        )}
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded border shrink-0 min-w-0 max-w-[180px] truncate ${ACTOR_BADGE[doc.actor?.type] ?? ACTOR_BADGE.anonymous}`}
          title={`Actor: ${doc.actor?.label ?? 'unknown'}`}
        >
          {doc.actor?.label ?? 'anonymous'}
        </span>
        {restored ? (
          <span className="text-[11px] text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
            ⟲ restored
          </span>
        ) : null}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            setConfirmOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation()
              setConfirmOpen(true)
            }
          }}
          title="Restore this version"
          className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-800/70">
          <div className="flex items-center justify-between mb-3 mt-2">
            <span className="text-xs text-gray-500 font-mono">
              version {doc.id} · parent {doc.parent}
            </span>
            <button
              onClick={() => setConfirmOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-white bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 px-2.5 py-1 rounded-md transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Restore this version
            </button>
          </div>
          <VersionDiff delta={doc.diff} />
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleRestore}
        title="Restore this version?"
        message={`This rolls "${doc.parentLabel}" back to the snapshot from ${dateLabel}.\n\nThe restore itself creates a new version, so the action stays visible in the audit trail.`}
        confirmText="Restore"
        isDestructive={false}
        isLoading={restoring}
      />
    </li>
  )
}
