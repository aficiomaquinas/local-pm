'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse-soft rounded-sm bg-surface-hover', className)}
    />
  )
}

export function useDelayedFlag(active: boolean, delay = 180, hold = 450): boolean {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | undefined
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    let shownAt = 0

    if (active) {
      showTimer = setTimeout(() => {
        shownAt = Date.now()
        setShown(true)
      }, delay)
    } else {
      setShown((wasShown) => {
        if (!wasShown) return false
        const elapsed = Date.now() - shownAt
        hideTimer = setTimeout(() => setShown(false), Math.max(0, hold - elapsed))
        return true
      })
    }

    return () => {
      if (showTimer) clearTimeout(showTimer)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [active, delay, hold])

  return shown
}

export function CardSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-md border border-border-subtle bg-surface p-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-1.5 h-4 w-2/3" />
          <Skeleton className="mt-3 h-5 w-24" />
        </div>
      ))}
    </div>
  )
}

export function RowSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-9 items-center gap-3 border-b border-border-subtle px-3">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-4 flex-1 max-w-[40%]" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}
