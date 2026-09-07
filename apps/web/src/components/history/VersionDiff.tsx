'use client'

import { Fragment } from 'react'

/**
 * Visual diff renderer for jsondiffpatch deltas (SPC-001 §4.4).
 *
 * Changelog format: field → before → after, with semantic colors
 * (green=added, red=removed, amber=changed) on the repo's dark zinc theme.
 * Text diffs inside deltas (long strings) are rendered by jsondiffpatch's
 * own HTML formatter.
 */

interface DiffContext {
  path: string[]
}

function isTextDiffDelta(d: unknown[]): boolean {
  // jsondiffpatch text diff: ["<diff string>", 0, 2]
  return d.length === 3 && d[1] === 0 && d[2] === 2 && typeof d[0] === 'string'
}

function isRemovedDelta(d: unknown[]): boolean {
  return d.length === 3 && d[1] === 0 && d[2] === 0
}

function formatValue(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function truncate(text: string, max = 220): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function DeltaValue({ value, tone }: { value: unknown; tone: 'added' | 'removed' | 'plain' }) {
  const text = truncate(formatValue(value))
  const cls =
    tone === 'added'
      ? 'bg-green-500/10 text-green-400 border-green-500/30'
      : tone === 'removed'
        ? 'bg-red-500/10 text-red-400 border-red-500/30'
        : 'bg-zinc-800/60 text-gray-300 border-zinc-700'
  return (
    <span className={`inline-block max-w-full overflow-x-auto rounded border px-1.5 py-0.5 text-xs font-mono whitespace-pre-wrap break-all ${cls}`}>
      {text === '' ? '(empty)' : text}
    </span>
  )
}

function NodeDelta({ delta, ctx }: { delta: Record<string, unknown>; ctx: DiffContext }) {
  return (
    <div className="space-y-1">
      {Object.entries(delta)
        .filter(([key]) => key !== '_t')
        .map(([key, value]) => (
          <DeltaEntry key={key} fieldKey={key} value={value} ctx={ctx} />
        ))}
    </div>
  )
}

function ArrayDelta({ delta, ctx }: { delta: Record<string, unknown>; ctx: DiffContext }) {
  return (
    <div className="space-y-1 border-l-2 border-zinc-700/70 pl-3">
      {Object.entries(delta)
        .filter(([key]) => key !== '_t')
        .map(([key, value]) => (
          <DeltaEntry key={key} fieldKey={key} value={value} ctx={ctx} isArrayItem />
        ))}
    </div>
  )
}

function DeltaEntry({
  fieldKey,
  value,
  ctx,
  isArrayItem,
}: {
  fieldKey: string
  value: unknown
  ctx: DiffContext
  isArrayItem?: boolean
}) {
  // Array item keys are indices or objectHash ids; render them as items, not fields.
  const label = isArrayItem ? `#${fieldKey}` : fieldKey
  const path = [...ctx.path, label]

  // Primitive changed: [before, after]
  if (Array.isArray(value) && value.length === 2 && typeof value[1] === 'number' && !isTextDiffDelta(value)) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm" data-path={path.join('.')}>
        <span className="text-gray-400 font-medium min-w-[90px]">{label}</span>
        <DeltaValue value={value[0]} tone="removed" />
        <span className="text-gray-500">→</span>
        <DeltaValue value={value[1]} tone="added" />
      </div>
    )
  }

  // Added: [after]
  if (Array.isArray(value) && value.length === 1) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm" data-path={path.join('.')}>
        <span className="text-green-400 font-medium min-w-[90px]">+ {label}</span>
        <DeltaValue value={value[0]} tone="added" />
      </div>
    )
  }

  // Removed: [before, 0, 0] — moved: [toIndex, 3] — text diff: [s, 0, 2]
  if (Array.isArray(value)) {
    if (isTextDiffDelta(value)) {
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-path={path.join('.')}>
          <span className="text-amber-400 font-medium min-w-[90px]">~ {label}</span>
          <span className="text-xs text-amber-300/80 italic">text edited</span>
        </div>
      )
    }
    if (isRemovedDelta(value)) {
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-path={path.join('.')}>
          <span className="text-red-400 font-medium min-w-[90px]">− {label}</span>
          <DeltaValue value={value[0]} tone="removed" />
        </div>
      )
    }
    // Moved array item: [destinationIndex, 3]
    if (value.length === 2 && value[1] === 3) {
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-path={path.join('.')}>
          <span className="text-blue-400 font-medium min-w-[90px]">↕ {label}</span>
          <span className="text-xs text-blue-300/80">moved to position {String(value[0])}</span>
        </div>
      )
    }
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm" data-path={path.join('.')}>
        <span className="text-amber-400 font-medium min-w-[90px]">~ {label}</span>
        <DeltaValue value={value} tone="plain" />
      </div>
    )
  }

  // Nested node: object delta or array delta (array delta has _t: 'a')
  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>
    const isArr = node._t === 'a'
    return (
      <div className="text-sm" data-path={path.join('.')}>
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-medium">{isArr ? label : `~ ${label}`}</span>
          <span className="text-xs text-gray-500">{isArr ? '(array)' : '(object)'}</span>
        </div>
        <div className="mt-1">
          {isArr ? <ArrayDelta delta={node} ctx={{ path }} /> : <NodeDelta delta={node} ctx={{ path }} />}
        </div>
      </div>
    )
  }

  return null
}

export function VersionDiff({ delta }: { delta: Record<string, unknown> | null | undefined }) {
  if (!delta || Object.keys(delta).length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No field changes vs the previous version (identical snapshot).
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-wrap items-center gap-4 pb-2 mb-3 border-b border-zinc-800/80 text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-green-500" /> added
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-red-500" /> removed
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-amber-500" /> changed
        </span>
        <span className="ml-auto">version[N] vs version[N−1] · same parent</span>
      </div>
      <NodeDelta delta={delta} ctx={{ path: [] }} />
    </div>
  )
}

export default VersionDiff
