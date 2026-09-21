'use client'

import { cn } from '@/lib/cn'
import type { CycleProgress } from '@/lib/cycles'

export function CycleProgressBar({
  progress,
  label,
  className,
}: {
  progress: CycleProgress
  label: string
  className?: string
}) {
  const scope = progress.total - progress.cancelled

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="flex h-2 overflow-hidden rounded-full bg-surface-hover"
      >
        <div
          className="h-full bg-success transition-[width] duration-standard ease-standard"
          style={{ width: `${progress.percent}%` }}
        />
        <div
          className="h-full bg-info/50 transition-[width] duration-standard ease-standard"
          style={{ width: `${scope > 0 ? Math.round((progress.started / scope) * 100) : 0}%` }}
        />
      </div>
      <p className="text-xs text-text-muted tabular">
        {progress.percent}% complete · {progress.completed} of {scope} done
        {progress.started > 0 && ` · ${progress.started} in progress`}
        {progress.cancelled > 0 && ` · ${progress.cancelled} cancelled`}
      </p>
    </div>
  )
}
