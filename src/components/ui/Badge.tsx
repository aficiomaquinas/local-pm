'use client'

import { X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { TONE_CHIP, type Tone } from '@/lib/status'

export interface BadgeProps {
  tone?: Tone
  icon?: LucideIcon

  glyph?: string
  children: React.ReactNode

  maxWidth?: string
  title?: string
  className?: string
}

export function Badge({ tone = 'neutral', icon: Icon, glyph, children, maxWidth, title, className }: BadgeProps) {
  return (
    <span
      title={title}
      style={maxWidth ? { maxWidth } : undefined}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-xs border px-1.5',
        'text-xs font-medium',
        TONE_CHIP[tone],
        className,
      )}
    >
      {glyph && <span aria-hidden className="tracking-tighter">{glyph}</span>}
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  )
}

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  tone?: Tone
  icon?: LucideIcon
  children: React.ReactNode

  onRemove?: () => void
  removeLabel?: string

  shape?: 'pill' | 'tag'
  maxWidth?: string
}

export function Chip({
  tone = 'neutral',
  icon: Icon,
  children,
  onRemove,
  removeLabel,
  shape = 'pill',
  maxWidth,
  className,
  title,
  ...props
}: ChipProps) {
  const body = (
    <>
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
    </>
  )

  const shell = cn(
    'inline-flex h-6 shrink-0 items-center gap-1.5 border px-2 text-xs font-medium',
    shape === 'pill' ? 'rounded-full' : 'rounded-xs',
    TONE_CHIP[tone],
    className,
  )

  if (onRemove) {
    return (
      <span className={shell} style={maxWidth ? { maxWidth } : undefined} title={title}>
        {props.onClick ? (
          <button
            type="button"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-xs hover:underline"
            {...props}
          >
            {body}
          </button>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1.5">{body}</span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `Remove ${typeof children === 'string' ? children : 'item'}`}
          className="relative -mr-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full hover:bg-surface-active after:absolute after:size-11 after:content-[''] can-hover:after:hidden"
        >
          <X className="size-3" aria-hidden />
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      title={title}
      style={maxWidth ? { maxWidth } : undefined}
      className={cn(shell, 'cursor-pointer transition-colors duration-micro hover:bg-surface-hover')}
      {...props}
    >
      {body}
    </button>
  )
}

export function CountBadge({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-surface-hover px-1',
        'text-2xs font-medium text-text-muted tabular',
        className,
      )}
    >
      {value}
    </span>
  )
}
