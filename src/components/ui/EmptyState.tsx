'use client'

import { AlertTriangle, FilterX, Inbox, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export type EmptyKind = 'no-data' | 'no-match' | 'error'

const DEFAULT_ICON: Record<EmptyKind, LucideIcon> = {
  'no-data': Inbox,
  'no-match': FilterX,
  error: AlertTriangle,
}

export interface EmptyStateProps {
  kind: EmptyKind
  title: string

  description?: string
  icon?: LucideIcon
  action?: { label: string; onClick: () => void }

  children?: React.ReactNode
  compact?: boolean
  className?: string
}

export function EmptyState({
  kind,
  title,
  description,
  icon,
  action,
  children,
  compact,
  className,
}: EmptyStateProps) {
  const Icon = icon ?? DEFAULT_ICON[kind]

  return (
    <div
      role={kind === 'error' ? 'alert' : undefined}
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'px-4 py-8' : 'px-6 py-16',
        kind === 'error' && 'rounded-md border border-danger-border bg-danger-subtle',
        className,
      )}
    >
      <Icon
        className={cn('size-6', kind === 'error' ? 'text-danger-text' : 'text-text-muted')}
        aria-hidden
      />
      <div className="flex flex-col gap-1">
        <p className={cn('text-md font-semibold', kind === 'error' ? 'text-danger-text' : 'text-text')}>
          {title}
        </p>
        {description && (
          <p className="max-w-[46ch] text-base text-text-muted">{description}</p>
        )}
      </div>
      {children}
      {action && (
        <Button
          variant={kind === 'no-data' ? 'primary' : 'secondary'}
          size="lg"
          onClick={action.onClick}
          className="mt-1"
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
