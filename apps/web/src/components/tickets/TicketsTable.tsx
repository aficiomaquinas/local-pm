'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ListFilter, Loader2, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDateCompact } from '@/lib/format'
import { ticketStatusOptions } from '@/lib/status'
import { TicketStatus } from '@/types/enums'
import { useEntityQuery } from '@/hooks/useEntityQuery'
import { AvatarLabel } from '@/components/ui/Avatar'
import { Button, LinkButton } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Kbd } from '@/components/ui/Kbd'
import { Select } from '@/components/ui/Select'
import { RowSkeletonList, useDelayedFlag } from '@/components/ui/Skeleton'
import { PriorityIndicator, TicketStatusBadge } from '@/components/ui/StateIndicator'
import { TicketKey } from '@/components/ui/EntityMark'
import { Table, Td, Th, Tr } from '@/components/ui/Table'
import type { Member, Project, Team, Ticket } from '@/payload-types'

type SortKey = 'sortOrder' | 'title' | '-title' | '-createdAt' | 'createdAt' | 'dueDate'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'sortOrder', label: 'Board order' },
  { value: '-createdAt', label: 'Newest first' },
  { value: 'createdAt', label: 'Oldest first' },
  { value: 'title', label: 'Title A–Z' },
  { value: '-title', label: 'Title Z–A' },
  { value: 'dueDate', label: 'Due date' },
]

export interface TicketsTableProps {
  where: Record<string, string | null | undefined>
  caption: string
  keyColor?: string | null
  newTicketHref?: string
  emptyTitle: string
  emptyDescription: string
  relationColumn: 'team' | 'project'
}

export function TicketsTable({
  where,
  caption,
  keyColor,
  newTicketHref,
  emptyTitle,
  emptyDescription,
  relationColumn,
}: TicketsTableProps) {
  const router = useRouter()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [sort, setSort] = useState<SortKey>('sortOrder')

  const { docs, totalDocs, hasNextPage, loading, loadingMore, error, loadMore, retry } =
    useEntityQuery<Ticket>(query, {
      collection: 'tickets',
      searchField: 'title',
      sort,
      where: { ...where, status: status || undefined },
      depth: 1,
      pageSize: 25,
    })

  const showSkeleton = useDelayedFlag(loading)
  const hasFilters = Boolean(query || status)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasNextPage || loading || loadingMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '300px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, loading, loadingMore, loadMore, docs.length])

  const clearFilters = () => {
    setQuery('')
    setStatus('')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex h-8 min-w-44 flex-1 items-center gap-2 rounded-sm border border-border bg-surface px-2.5 md:max-w-72">
          <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
          <span className="sr-only">Search these tickets</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tickets"
            className="min-w-0 flex-1 bg-transparent text-base text-text outline-none max-sm:text-md"
          />
          {loading && (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-text-muted" aria-hidden />
          )}
        </label>

        <Select
          aria-label="Filter by status"
          value={status}
          onValueChange={(next) => setStatus(next as TicketStatus | '')}
          className="w-40 max-sm:w-full"
          options={[{ value: '', label: 'All statuses', icon: ListFilter }, ...ticketStatusOptions()]}
        />

        <Select
          aria-label="Sort tickets"
          value={sort}
          onValueChange={(next) => setSort(next as SortKey)}
          className="w-44 max-sm:w-full"
          options={SORTS}
        />

        {newTicketHref && (
          <LinkButton
            variant="primary"
            icon={Plus}
            href={newTicketHref}
            className="ml-auto max-sm:w-full"
          >
            New ticket
            <Kbd keys="c" tone="inverse" className="ml-1.5" />
          </LinkButton>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted tabular" aria-live="polite">
          {totalDocs} {totalDocs === 1 ? 'ticket' : 'tickets'}
        </span>

        {status && (
          <Chip tone="accent" onRemove={() => setStatus('')} removeLabel="Remove status filter">
            Status: {ticketStatusOptions().find((o) => o.value === status)?.label}
          </Chip>
        )}
        {query && (
          <Chip tone="accent" onRemove={() => setQuery('')} removeLabel="Clear the search">
            Search: {query}
          </Chip>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>
            Clear all
          </Button>
        )}
      </div>

      {error ? (
        <EmptyState
          kind="error"
          title="Couldn't load these tickets"
          description={error}
          action={{ label: 'Retry', onClick: retry }}
        />
      ) : showSkeleton && docs.length === 0 ? (
        <RowSkeletonList count={5} />
      ) : docs.length === 0 && hasFilters ? (
        <EmptyState
          kind="no-match"
          compact
          title="No tickets match"
          description="Nothing here fits the current search and status."
          action={{ label: 'Clear filters', onClick: clearFilters }}
        />
      ) : docs.length === 0 ? (
        <EmptyState
          kind="no-data"
          compact
          title={emptyTitle}
          description={emptyDescription}
          action={
            newTicketHref
              ? { label: 'Create the first ticket', onClick: () => router.push(newTicketHref) }
              : undefined
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-border-subtle">
            <Table caption={caption}>
              <thead>
                <tr>
                  <Th className="w-px whitespace-nowrap">Key</Th>
                  <Th className="w-px whitespace-nowrap">
                    <span className="sr-only">Priority</span>
                  </Th>
                  <Th>Title</Th>
                  <Th width="9rem">Status</Th>
                  <Th width="12rem">{relationColumn === 'team' ? 'Team' : 'Project'}</Th>
                  <Th width="11rem">Assignee</Th>
                  <Th width="8rem">Due</Th>
                </tr>
              </thead>
              <tbody>
                {docs.map((ticket) => {
                  const relation =
                    relationColumn === 'team'
                      ? typeof ticket.team === 'object'
                        ? (ticket.team as Team)
                        : null
                      : typeof ticket.project === 'object'
                        ? (ticket.project as Project)
                        : null
                  const assignee =
                    typeof ticket.assignee === 'object' ? (ticket.assignee as Member) : null
                  const overdue =
                    ticket.dueDate &&
                    ticket.status !== TicketStatus.DONE &&
                    new Date(ticket.dueDate).getTime() < Date.now()

                  return (
                    <Tr key={ticket.id} onOpen={() => router.push(`/tickets/${ticket.id}`)}>
                      <Td className="whitespace-nowrap">
                        <TicketKey
                          value={ticket.ticketId}
                          color={
                            keyColor ??
                            (typeof ticket.project === 'object'
                              ? (ticket.project as Project).color
                              : null)
                          }
                        />
                      </Td>
                      <Td>
                        <PriorityIndicator priority={ticket.priority} />
                      </Td>
                      <Td>
                        <Link
                          href={`/tickets/${ticket.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate font-medium text-text hover:underline"
                          title={ticket.title}
                        >
                          {ticket.title}
                        </Link>
                      </Td>
                      <Td>
                        <TicketStatusBadge status={ticket.status} />
                      </Td>
                      <Td className="truncate text-text-muted">{relation?.name ?? '—'}</Td>
                      <Td className="text-text">
                        <AvatarLabel
                          name={assignee?.name}
                          seed={assignee?.id}
                          fallback="Unassigned"
                        />
                      </Td>
                      <Td
                        className={cn(
                          'whitespace-nowrap tabular',
                          overdue ? 'font-medium text-danger-text' : 'text-text-muted',
                        )}
                      >
                        {ticket.dueDate ? formatDateCompact(ticket.dueDate) : '—'}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </div>

          {hasNextPage && (
            <div ref={sentinelRef} className="flex justify-center py-3">
              <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
                {loadingMore ? 'Loading…' : `Load more (${docs.length} of ${totalDocs})`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
