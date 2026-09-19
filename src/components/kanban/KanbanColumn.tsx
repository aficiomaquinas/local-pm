'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronDown, ChevronsLeftRight, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ticketStatusMeta } from '@/lib/status'
import { TicketStatus } from '@/types/enums'
import { Button } from '@/components/ui/Button'
import { CountBadge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { CardSkeletonList } from '@/components/ui/Skeleton'
import { KanbanCard } from './KanbanCard'
import type { Ticket } from '@/payload-types'

export interface ColumnPaginationInfo {
  hasNextPage: boolean
  totalDocs: number
  loadedCount: number
}

export interface KanbanColumnProps {
  id: TicketStatus
  tickets: Ticket[]
  collapsed: boolean
  onToggleCollapsed: () => void
  onAddCard: () => void
  onOpenTicket: (ticket: Ticket) => void
  onEditTicket: (ticket: Ticket) => void
  onDeleteTicket: (ticket: Ticket) => void
  onMoveToColumn: (ticket: Ticket, status: TicketStatus) => void
  onReorder: (ticket: Ticket, direction: -1 | 1) => void
  pagination: ColumnPaginationInfo
  isLoadingMore: boolean
  onLoadMore: () => void

  isRefreshing: boolean
  landedTicketId: string | null
}

export function KanbanColumn({
  id,
  tickets,
  collapsed,
  onToggleCollapsed,
  onAddCard,
  onOpenTicket,
  onEditTicket,
  onDeleteTicket,
  onMoveToColumn,
  onReorder,
  pagination,
  isLoadingMore,
  onLoadMore,
  isRefreshing,
  landedTicketId,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const meta = ticketStatusMeta(id)
  const StatusIcon = meta.icon

  if (collapsed) {
    return (
      <div className="flex w-12 shrink-0 snap-start flex-col items-center gap-3 rounded-md border border-border-subtle bg-bg-subtle py-3">
        <Tooltip content={`Expand ${meta.label}`}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={ChevronsLeftRight}
            aria-label={`Expand ${meta.label} column`}
            onClick={onToggleCollapsed}
          />
        </Tooltip>
        <CountBadge value={pagination.totalDocs} />
        <span
          className="text-xs font-medium tracking-wide text-text-muted"
          style={{ writingMode: 'vertical-rl' }}
        >
          {meta.label}
        </span>
      </div>
    )
  }

  return (
    <section
      aria-label={`${meta.label} column`}
      className="flex w-72 shrink-0 snap-start flex-col rounded-md border border-border-subtle bg-bg-subtle max-md:w-full"
    >
      <header className="sticky top-0 z-10 flex h-10 flex-none items-center gap-2 rounded-t-md border-b border-border-subtle bg-bg-subtle px-3">
        <StatusIcon className={cn('size-4 shrink-0', meta.tone === 'success' ? 'text-success-text' : meta.tone === 'info' ? 'text-info-text' : 'text-text-muted')} aria-hidden />
        <h2 className="truncate text-sm font-medium text-text">{meta.label}</h2>
        <CountBadge value={pagination.totalDocs} />

        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip content={`Add a ticket to ${meta.label}`}>
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              icon={Plus}
              aria-label={`Add a ticket to ${meta.label}`}
              onClick={onAddCard}
            />
          </Tooltip>
          <Tooltip content="Collapse column">
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              icon={ChevronsLeftRight}
              aria-label={`Collapse ${meta.label} column`}
              onClick={onToggleCollapsed}
            />
          </Tooltip>
        </div>
      </header>

      <div
        ref={setNodeRef}
        data-testid={`column-${id}`}
        data-column-status={id}
        className={cn(
          'flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto p-3',

          isOver && tickets.length === 0 && 'bg-accent-subtle',
        )}
      >
        <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.map((ticket) => (
            <KanbanCard
              key={ticket.id}
              ticket={ticket}
              justLanded={landedTicketId === ticket.id}
              onOpen={() => onOpenTicket(ticket)}
              onEdit={() => onEditTicket(ticket)}
              onDelete={() => onDeleteTicket(ticket)}
              onMoveToColumn={(status) => onMoveToColumn(ticket, status)}
              onReorder={(direction) => onReorder(ticket, direction)}
            />
          ))}
        </SortableContext>

        {isRefreshing && tickets.length === 0 && <CardSkeletonList count={3} />}

        {!isRefreshing && tickets.length === 0 && (
          <p className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border-subtle px-3 py-8 text-center text-base text-text-muted">
            Nothing in {meta.label.toLowerCase()}.
          </p>
        )}

        {pagination.hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronDown}
            loading={isLoadingMore}
            onClick={onLoadMore}
            fullWidth
            className="mt-1"
          >
            {isLoadingMore
              ? 'Loading…'
              : `Load more (${pagination.loadedCount} of ${pagination.totalDocs})`}
          </Button>
        )}
      </div>
    </section>
  )
}
