'use client'

import { useId } from 'react'
import { cn } from '@/lib/cn'

export function LogoMark({ className }: { className?: string }) {
  const gradientId = useId()
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('shrink-0', className)}
      focusable="false"
      aria-hidden
      role="presentation"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--indigo-9)" />
          <stop offset="100%" stopColor="var(--indigo-11)" />
        </linearGradient>
      </defs>

      <rect width="32" height="32" rx="9" fill={'url(#' + gradientId + ')'} />

      <g fill="#fff">
        <rect x="7" y="9" width="4.5" height="14" rx="2.25" opacity="0.65" />
        <rect x="13.75" y="6" width="4.5" height="20" rx="2.25" />
        <rect x="20.5" y="12" width="4.5" height="8" rx="2.25" opacity="0.45" />
      </g>
    </svg>
  )
}

export function Logo({
  showWordmark = true,
  className,
  markClassName,
}: {
  showWordmark?: boolean
  className?: string
  markClassName?: string
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <LogoMark className={cn('size-7', markClassName)} />
      {showWordmark && (
        <span className="truncate text-md font-semibold tracking-[-0.02em] text-text">
          local<span className="text-accent-text">pm</span>
        </span>
      )}
    </span>
  )
}
