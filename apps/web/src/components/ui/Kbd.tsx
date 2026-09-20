'use client'

import { cn } from '@/lib/cn'
import { formatKeys } from '@/lib/shortcuts'

export type KbdTone = 'default' | 'inverse' | 'quiet'

const TONE: Record<KbdTone, string> = {
  default: 'border-border-subtle bg-surface-hover text-text-muted',

  inverse: 'border-white/25 bg-white/15 text-current',
  quiet: 'border-transparent bg-transparent text-text-muted',
}

export function Kbd({
  keys,
  raw,
  tone = 'default',
  className,
}: {
  keys?: string

  raw?: string
  tone?: KbdTone
  className?: string
}) {
  const label = raw ?? (keys ? formatKeys(keys) : '')
  if (!label) return null

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-0.5', className)}>
      <span className="sr-only">{label}</span>
      {label.split(' then ').map((chord, index) => (
        <kbd
          key={`${chord}-${index}`}
          aria-hidden
          className={cn(
            'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border px-1',
            'font-sans text-2xs font-medium leading-none tabular',
            TONE[tone],
          )}
        >
          {chord}
        </kbd>
      ))}
    </span>
  )
}
