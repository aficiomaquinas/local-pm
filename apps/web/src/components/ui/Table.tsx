'use client'

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Table({
  caption,
  children,
  className,
}: {
  caption: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-base', className)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  )
}

export function Th({
  children,
  align = 'left',
  sortable,
  sortDirection,
  sortPriority,
  onSort,
  className,
  width,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  sortable?: boolean
  sortDirection?: 'asc' | 'desc' | null

  sortPriority?: number
  onSort?: (additive: boolean) => void
  className?: string
  width?: string
}) {
  const ariaSort = sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none'

  return (
    <th
      scope="col"
      aria-sort={sortable ? ariaSort : undefined}
      style={width ? { width } : undefined}
      className={cn(
        'sticky top-0 z-10 border-b border-border-subtle bg-bg px-3',
        'text-xs font-medium text-text-muted',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={(e) => onSort?.(e.shiftKey)}
          className={cn(
            'group inline-flex h-11 items-center gap-1 rounded-xs',
            align === 'right' && 'flex-row-reverse',
          )}
        >
          {children}
          {sortDirection === 'asc' ? (
            <ArrowUp className="size-3.5" aria-hidden />
          ) : sortDirection === 'desc' ? (
            <ArrowDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronsUpDown
              className="size-3.5 opacity-0 transition-opacity can-hover:group-hover:opacity-60"
              aria-hidden
            />
          )}
          {sortPriority ? (
            <span className="rounded-xs bg-surface-hover px-1 text-2xs tabular">{sortPriority}</span>
          ) : null}
        </button>
      ) : (
        <span className="inline-flex h-11 items-center">{children}</span>
      )}
    </th>
  )
}

export function Tr({
  selected,
  onOpen,
  children,
  className,
}: {
  selected?: boolean

  onOpen?: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <tr
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (!onOpen) return
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault()
          onOpen()
        }
      }}
      aria-selected={selected}
      className={cn(
        'h-11',
        'group border-b border-border-subtle',
        onOpen && 'cursor-pointer',
        'transition-colors duration-micro',
        'can-hover:hover:bg-surface-hover',
        'focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-focus',
        selected && 'relative bg-accent-subtle',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function Td({
  children,
  align = 'left',
  numeric,
  className,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  numeric?: boolean
  className?: string
}) {
  return (
    <td
      className={cn(
        'px-3 align-middle',
        numeric || align === 'right' ? 'text-right tabular' : 'text-left',
        className,
      )}
    >
      {children}
    </td>
  )
}
