'use client'

import { cn } from '@/lib/cn'
import {
  TONE_TEXT,
  ticketPriorityMeta,
  ticketStatusMeta,
  projectStatusMeta,
  type StateMeta,
} from '@/lib/status'
import { Badge } from './Badge'

function InlineState({ meta, className }: { meta: StateMeta; className?: string }) {
  const Icon = meta.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-base', className)}>
      <Icon className={cn('size-4 shrink-0', TONE_TEXT[meta.tone])} aria-hidden />
      <span>{meta.label}</span>
    </span>
  )
}

export function TicketStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = ticketStatusMeta(status)
  return (
    <Badge tone={meta.tone} icon={meta.icon} className={className}>
      {meta.label}
    </Badge>
  )
}

export function TicketStatusInline({ status, className }: { status: string | null | undefined; className?: string }) {
  return <InlineState meta={ticketStatusMeta(status)} className={className} />
}

export function ProjectStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = projectStatusMeta(status)
  return (
    <Badge tone={meta.tone} icon={meta.icon} className={className}>
      {meta.label}
    </Badge>
  )
}

export function PriorityIndicator({
  priority,
  showLabel = false,
  className,
}: {
  priority: string | null | undefined
  showLabel?: boolean
  className?: string
}) {
  const meta = ticketPriorityMeta(priority)

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      title={showLabel ? undefined : `Priority: ${meta.label}`}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block w-7 shrink-0 text-right text-2xs leading-none tracking-[-0.08em]',
          TONE_TEXT[meta.tone],
        )}
      >
        {meta.glyph}
      </span>
      {showLabel ? (
        <span className="text-base">{meta.label}</span>
      ) : (
        <span className="sr-only">Priority: {meta.label}</span>
      )}
    </span>
  )
}

export function PriorityInline({ priority, className }: { priority: string | null | undefined; className?: string }) {
  const meta = ticketPriorityMeta(priority)
  return (
    <span className={cn('inline-flex items-center gap-2 text-base', className)}>
      <span aria-hidden className={cn('w-7 text-right text-2xs tracking-[-0.08em]', TONE_TEXT[meta.tone])}>
        {meta.glyph}
      </span>
      <span>{meta.label}</span>
    </span>
  )
}
