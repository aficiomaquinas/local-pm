'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { MousePointerSensor } from './sensors'
import { ticketStatusMeta } from '@/lib/status'
import { useShortcut } from '@/lib/shortcuts'
import { TicketStatus } from '@/types/enums'
import { AUTH_NUDGE_EVENT } from '@/components/auth/AuthStatusBanner'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { BoardToolbar, type BoardFilters } from './BoardToolbar'
import { KanbanCard } from './KanbanCard'
import { KanbanColumn } from './KanbanColumn'
import { TicketPanel } from './TicketPanel'
import { applyDrop, isRealMove, resultFromPreview, type DragResult } from './dragLogic'
import type { Ticket } from '@/payload-types'

interface ColumnPaginationInfo {
  page: number
  totalPages: number
  hasNextPage: boolean
  totalDocs: number
  loadedCount: number
}

type ColumnPaginationState = Record<TicketStatus, ColumnPaginationInfo>

interface InitialColumnPagination {
  status: TicketStatus
  page: number
  totalPages: number
  hasNextPage: boolean
  totalDocs: number
}

interface KanbanBoardProps {
  initialTickets: Ticket[]
  hasProjects: boolean
  initialColumnPagination?: InitialColumnPagination[]
}

const COLUMNS: TicketStatus[] = [TicketStatus.TODO, TicketStatus.IN_PROGRESS, TicketStatus.DONE]
const PAGE_SIZE = 20
const COLLAPSED_COLUMNS_KEY = 'local-pm:board-collapsed'
const BOARD_PATH = '/board'

function emptyPagination(): ColumnPaginationState {
  return {
    [TicketStatus.TODO]: { page: 1, totalPages: 1, hasNextPage: false, totalDocs: 0, loadedCount: 0 },
    [TicketStatus.IN_PROGRESS]: { page: 1, totalPages: 1, hasNextPage: false, totalDocs: 0, loadedCount: 0 },
    [TicketStatus.DONE]: { page: 1, totalPages: 1, hasNextPage: false, totalDocs: 0, loadedCount: 0 },
  }
}

function createInitialColumnPagination(
  initialTickets: Ticket[],
  initial?: InitialColumnPagination[],
): ColumnPaginationState {
  const state = emptyPagination()
  if (initial) {
    for (const column of initial) {
      state[column.status] = {
        page: column.page,
        totalPages: column.totalPages,
        hasNextPage: column.hasNextPage,
        totalDocs: column.totalDocs,
        loadedCount: initialTickets.filter((t) => t.status === column.status).length,
      }
    }
  } else {
    for (const status of COLUMNS) {
      const count = initialTickets.filter((t) => t.status === status).length
      state[status] = { page: 1, totalPages: 1, hasNextPage: false, totalDocs: count, loadedCount: count }
    }
  }
  return state
}

function filtersToSearch(filters: BoardFilters, ticketId: string | null): string {
  const params = new URLSearchParams()
  if (filters.projectId) params.set('project', filters.projectId)
  if (filters.teamId) params.set('team', filters.teamId)
  if (filters.assigneeId) params.set('assignee', filters.assigneeId)
  if (filters.query) params.set('q', filters.query)
  if (ticketId) params.set('ticket', ticketId)
  const qs = params.toString()
  return qs ? `?${qs}` : BOARD_PATH
}

export function KanbanBoard({
  initialTickets,
  hasProjects,
  initialColumnPagination,
}: KanbanBoardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [tickets, setTickets] = useState<Ticket[]>(initialTickets)
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)
  const [landedTicketId, setLandedTicketId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const [filters, setFilters] = useState<BoardFilters>({
    projectId: searchParams.get('project'),
    teamId: searchParams.get('team'),
    assigneeId: searchParams.get('assignee'),
    query: searchParams.get('q') ?? '',
  })
  const [openTicketId, setOpenTicketId] = useState<string | null>(searchParams.get('ticket'))

  const [pendingDelete, setPendingDelete] = useState<Ticket | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [collapsedColumns, setCollapsedColumns] = useState<TicketStatus[]>([])
  const [columnPagination, setColumnPagination] = useState<ColumnPaginationState>(() =>
    createInitialColumnPagination(initialTickets, initialColumnPagination),
  )
  const [loadingColumns, setLoadingColumns] = useState<Record<TicketStatus, boolean>>({
    [TicketStatus.TODO]: false,
    [TicketStatus.IN_PROGRESS]: false,
    [TicketStatus.DONE]: false,
  })
  const [refreshing, setRefreshing] = useState(false)

  const fetchedFor = useRef(
    JSON.stringify({
      projectId: searchParams.get('project'),
      teamId: searchParams.get('team'),
      assigneeId: searchParams.get('assignee'),
      query: searchParams.get('q') ?? '',
    }),
  )
  const dragOriginRef = useRef<{ status: TicketStatus; sortOrder: number } | null>(null)

  const ticketsRef = useRef<Ticket[]>(tickets)
  useEffect(() => {
    ticketsRef.current = tickets
  }, [tickets])

  useEffect(() => {
    const focused = new URLSearchParams(window.location.search).get('status')
    if (focused && COLUMNS.includes(focused as TicketStatus)) {
      setCollapsedColumns(COLUMNS.filter((s) => s !== focused))
      return
    }
    try {
      const stored = localStorage.getItem(COLLAPSED_COLUMNS_KEY)
      if (stored) setCollapsedColumns(JSON.parse(stored) as TicketStatus[])
    } catch {}
  }, [])

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search)
      setFilters({
        projectId: params.get('project'),
        teamId: params.get('team'),
        assigneeId: params.get('assignee'),
        query: params.get('q') ?? '',
      })
      setOpenTicketId(params.get('ticket'))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const syncUrl = useCallback((next: BoardFilters, ticketId: string | null, push: boolean) => {
    const url = filtersToSearch(next, ticketId)
    if (push) window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  }, [])

  const updateFilters = useCallback(
    (patch: Partial<BoardFilters>) => {
      setFilters((current) => {
        const next = { ...current, ...patch }
        const isTyping = 'query' in patch && Object.keys(patch).length === 1
        syncUrl(next, openTicketId, !isTyping)
        return next
      })
    },
    [openTicketId, syncUrl],
  )

  const openTicket = useCallback(
    (ticket: Ticket | null) => {
      setOpenTicketId(ticket?.id ?? null)
      syncUrl(filters, ticket?.id ?? null, true)
    },
    [filters, syncUrl],
  )

  const createTicket = useCallback(
    (status: TicketStatus) => {
      const params = new URLSearchParams({ status })
      if (filters.projectId) params.set('project', filters.projectId)
      params.set('returnTo', filtersToSearch(filters, null))
      router.push(`/tickets/new?${params}`)
    },
    [filters, router],
  )

  const editTicket = useCallback(
    (ticket: Ticket) => {
      const params = new URLSearchParams({ returnTo: filtersToSearch(filters, ticket.id) })
      router.push(`/tickets/${ticket.id}/edit?${params}`)
    },
    [filters, router],
  )

  useEffect(() => {
    const signature = JSON.stringify({
      projectId: filters.projectId,
      teamId: filters.teamId,
      assigneeId: filters.assigneeId,
      query: filters.query,
    })
    if (signature === fetchedFor.current) return
    fetchedFor.current = signature

    const controller = new AbortController()
    const run = async () => {
      setRefreshing(true)
      try {
        const fetchColumn = async (status: TicketStatus) => {
          const params = new URLSearchParams({
            page: '1',
            limit: String(PAGE_SIZE),
            depth: '2',
            sort: 'sortOrder',
          })
          params.set('where[status][equals]', status)
          if (filters.projectId) params.set('where[project][equals]', filters.projectId)
          if (filters.teamId) params.set('where[team][equals]', filters.teamId)
          if (filters.assigneeId) {
            params.set('where[assignee][equals]', filters.assigneeId)
          }
          if (filters.query.trim()) params.set('where[title][like]', filters.query.trim())
          const response = await fetch(`/api/tickets?${params}`, { signal: controller.signal })
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
          return response.json()
        }

        const [todo, inProgress, done] = await Promise.all(COLUMNS.map(fetchColumn))
        const byStatus = { TODO: todo, IN_PROGRESS: inProgress, DONE: done } as Record<
          TicketStatus,
          { docs?: Ticket[]; page?: number; totalPages?: number; hasNextPage?: boolean; totalDocs?: number }
        >

        setTickets(COLUMNS.flatMap((status) => byStatus[status].docs ?? []))
        setColumnPagination(
          COLUMNS.reduce((acc, status) => {
            const data = byStatus[status]
            acc[status] = {
              page: data.page ?? 1,
              totalPages: data.totalPages ?? 1,
              hasNextPage: data.hasNextPage ?? false,
              totalDocs: data.totalDocs ?? 0,
              loadedCount: data.docs?.length ?? 0,
            }
            return acc
          }, emptyPagination()),
        )
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        toast({
          tone: 'error',
          title: "Couldn't load the board",
          description: error instanceof Error ? error.message : 'Check your connection and try again.',
        })
      } finally {
        setRefreshing(false)
      }
    }

    const timer = setTimeout(run, filters.query ? 300 : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [filters.projectId, filters.teamId, filters.assigneeId, filters.query, toast])

  const sensors = useSensors(
    useSensor(MousePointerSensor, { activationConstraint: { distance: 8 } }),

    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ticketsByStatus = useCallback(
    (status: TicketStatus) =>
      tickets
        .filter((t) => t.status === status)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [tickets],
  )

  const openedTicket = useMemo(
    () => tickets.find((t) => t.id === openTicketId) ?? null,
    [tickets, openTicketId],
  )

  const totalLoaded = tickets.length
  const hasFilters = Boolean(
    filters.projectId || filters.teamId || filters.assigneeId || filters.query,
  )

  const flash = (ticketId: string) => {
    setLandedTicketId(ticketId)
    setTimeout(() => setLandedTicketId((id) => (id === ticketId ? null : id)), 700)
  }

  const revertTicket = (
    ticketId: string,
    origin: { status: TicketStatus; sortOrder: number } | null,
  ) => {
    if (!origin) return
    const reverted = ticketsRef.current.map((ticket) =>
      ticket.id === ticketId ? { ...ticket, status: origin.status, sortOrder: origin.sortOrder } : ticket,
    )
    ticketsRef.current = reverted
    setTickets(reverted)
  }

  const persistMove = async (
    ticketId: string,
    status: TicketStatus,
    sortOrder: number,
    origin: { status: TicketStatus; sortOrder: number } | null,
  ) => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, sortOrder }),
      })

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }
      flash(ticketId)
    } catch (error) {
      revertTicket(ticketId, origin)
      const ticket = ticketsRef.current.find((t) => t.id === ticketId)
      const message = error instanceof Error ? error.message : ''
      // SPC-007 v2 (REQ-005.4): an auth failure is not a transport error —
      // pulse the anonymous banner (amber→red) so the standing explanation
      // ("log in to make changes") draws the eye, alongside the toast.
      const httpStatus = Number(message.split(' ')[0])
      if (httpStatus === 401 || httpStatus === 403) {
        window.dispatchEvent(new CustomEvent(AUTH_NUDGE_EVENT))
      }
      // Failure surface is the upstream PR#7 toast (v2.1 amendment: the
      // class-specific red banner was judged redundant and removed). The
      // optimistic move has already been reverted to the drag origin above.
      toast({
        tone: 'error',
        title: "Couldn't move that ticket",
        description: `${ticket?.ticketId ?? 'The ticket'} is back in ${
          ticketStatusMeta(origin?.status).label
        }. ${message}`.trim(),
      })
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const ticket = tickets.find((t) => t.id === event.active.id)
    setActiveTicket(ticket ?? null)

    dragOriginRef.current = ticket
      ? { status: ticket.status as TicketStatus, sortOrder: ticket.sortOrder ?? 0 }
      : null
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const next = applyDrop(ticketsRef.current, active.id as string, over.id as string).tickets
    ticketsRef.current = next
    setTickets(next)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTicket(null)

    const origin = dragOriginRef.current
    dragOriginRef.current = null
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const result: DragResult =
      overId === activeId
        ? resultFromPreview(ticketsRef.current, activeId)
        : applyDrop(ticketsRef.current, activeId, overId)
    ticketsRef.current = result.tickets
    setTickets(result.tickets)

    if (!isRealMove(result, origin)) return

    await persistMove(activeId, result.status as TicketStatus, result.sortOrder as number, origin)
  }

  const moveToColumn = async (ticket: Ticket, status: TicketStatus) => {
    const origin = { status: ticket.status as TicketStatus, sortOrder: ticket.sortOrder ?? 0 }
    const result = applyDrop(ticketsRef.current, ticket.id, status)
    if (!isRealMove(result, origin)) return

    ticketsRef.current = result.tickets
    setTickets(result.tickets)
    setAnnouncement(
      `${ticket.ticketId ?? ticket.title} moved to ${ticketStatusMeta(status).label} from ${
        ticketStatusMeta(origin.status).label
      }.`,
    )
    await persistMove(ticket.id, result.status as TicketStatus, result.sortOrder as number, origin)
  }

  const reorder = async (ticket: Ticket, direction: -1 | 1) => {
    const column = ticketsByStatus(ticket.status as TicketStatus)
    const index = column.findIndex((t) => t.id === ticket.id)
    const neighbour = column[index + direction]
    if (!neighbour) return

    const origin = { status: ticket.status as TicketStatus, sortOrder: ticket.sortOrder ?? 0 }
    const result = applyDrop(ticketsRef.current, ticket.id, neighbour.id)
    if (!isRealMove(result, origin)) return

    ticketsRef.current = result.tickets
    setTickets(result.tickets)
    setAnnouncement(
      `${ticket.ticketId ?? ticket.title} moved to position ${index + direction + 1} in ${
        ticketStatusMeta(origin.status).label
      }.`,
    )
    await persistMove(ticket.id, result.status as TicketStatus, result.sortOrder as number, origin)
  }

  const loadMore = async (status: TicketStatus) => {
    const column = columnPagination[status]
    if (!column.hasNextPage || loadingColumns[status]) return

    setLoadingColumns((prev) => ({ ...prev, [status]: true }))
    try {
      const params = new URLSearchParams({
        page: String(column.page + 1),
        limit: String(PAGE_SIZE),
        depth: '2',
        sort: 'sortOrder',
      })
      params.set('where[status][equals]', status)
      if (filters.projectId) params.set('where[project][equals]', filters.projectId)
      if (filters.teamId) params.set('where[team][equals]', filters.teamId)
      if (filters.assigneeId) params.set('where[assignee][equals]', filters.assigneeId)
      if (filters.query.trim()) params.set('where[title][like]', filters.query.trim())

      const response = await fetch(`/api/tickets?${params}`)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const data = await response.json()

      if (data.docs?.length) {
        const existing = new Set(ticketsRef.current.map((t) => t.id))
        const fresh = (data.docs as Ticket[]).filter((t) => !existing.has(t.id))
        setTickets((prev) => [...prev, ...fresh])
        setColumnPagination((prev) => ({
          ...prev,
          [status]: {
            page: data.page,
            totalPages: data.totalPages,
            hasNextPage: data.hasNextPage,
            totalDocs: data.totalDocs,
            loadedCount: prev[status].loadedCount + fresh.length,
          },
        }))
      }
    } catch (error) {
      toast({
        tone: 'error',
        title: `Couldn't load more ${ticketStatusMeta(status).label} tickets`,
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setLoadingColumns((prev) => ({ ...prev, [status]: false }))
    }
  }

  const toggleColumn = (status: TicketStatus) => {
    setCollapsedColumns((prev) => {
      const next = prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
      try {
        localStorage.setItem(COLLAPSED_COLUMNS_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/tickets/${pendingDelete.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      setTickets((prev) => prev.filter((t) => t.id !== pendingDelete.id))
      setColumnPagination((prev) => {
        const status = pendingDelete.status as TicketStatus
        return {
          ...prev,
          [status]: {
            ...prev[status],
            totalDocs: Math.max(0, prev[status].totalDocs - 1),
            loadedCount: Math.max(0, prev[status].loadedCount - 1),
          },
        }
      })
      if (openTicketId === pendingDelete.id) openTicket(null)
      setPendingDelete(null)
      toast({ title: `${pendingDelete.ticketId ?? 'Ticket'} deleted`, tone: 'info' })
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't delete that ticket",
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setDeleting(false)
    }
  }

  useShortcut({
    id: 'board.clearFilters',
    keys: 'shift+x',
    description: 'Clear all board filters',
    group: 'Board',
    scope: 'board',
    enabled: hasFilters,
    run: () => updateFilters({ projectId: null, teamId: null, assigneeId: null, query: '' }),
  })

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const ticket = ticketsRef.current.find((t) => t.id === active.id)
      if (!ticket) return
      return `Picked up ${ticket.ticketId ?? ticket.title}, "${ticket.title}", from list ${
        ticketStatusMeta(ticket.status).label
      }. Use the arrow keys to move it, Space to drop, Escape to cancel.`
    },
    onDragOver: ({ active, over }) => {
      const ticket = ticketsRef.current.find((t) => t.id === active.id)
      if (!ticket || !over) return
      return `${ticket.ticketId ?? ticket.title} is over list ${
        ticketStatusMeta(ticket.status).label
      }.`
    },
    onDragEnd: ({ active }) => {
      const ticket = ticketsRef.current.find((t) => t.id === active.id)
      const origin = dragOriginRef.current
      if (!ticket) return
      return `Task "${ticket.title}" moved to list "${ticketStatusMeta(ticket.status).label}"${
        origin ? ` from "${ticketStatusMeta(origin.status).label}"` : ''
      }.`
    },
    onDragCancel: ({ active }) => {
      const ticket = ticketsRef.current.find((t) => t.id === active.id)
      return `Move cancelled. ${ticket?.ticketId ?? 'The ticket'} returned to its original position.`
    },
  }

  return (
    <div className="flex h-full flex-col">
      <BoardToolbar
        filters={filters}
        onChange={updateFilters}
        resultCount={totalLoaded}
        onCreateTicket={() => createTicket(TicketStatus.TODO)}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <ErrorBoundary region="The board">
        {!hasProjects ? (
          <EmptyState
            kind="no-data"
            title="No projects yet"
            description="Tickets belong to a project, so create one first and the board fills up from there."
            action={{ label: 'Go to Projects', onClick: () => window.location.assign('/projects') }}
          />
        ) : totalLoaded === 0 && hasFilters && !refreshing ? (
          <EmptyState
            kind="no-match"
            title="No tickets match these filters"
            description="Nothing on this board fits the current project, team, assignee and search combination."
            action={{
              label: 'Clear filters',
              onClick: () =>
                updateFilters({ projectId: null, teamId: null, assigneeId: null, query: '' }),
            }}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            accessibility={{ announcements }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div
              className={
                'flex min-h-0 flex-1 snap-x snap-proximity gap-4 overflow-x-auto p-6 ' +
                'max-md:snap-mandatory max-md:gap-3 max-md:p-4'
              }
            >
              {COLUMNS.map((status) => (
                <KanbanColumn
                  key={status}
                  id={status}
                  tickets={ticketsByStatus(status)}
                  collapsed={collapsedColumns.includes(status)}
                  onToggleCollapsed={() => toggleColumn(status)}
                  onAddCard={() => createTicket(status)}
                  onOpenTicket={openTicket}
                  ticketHref={(ticket) => filtersToSearch(filters, ticket.id)}
                  onEditTicket={editTicket}
                  onDeleteTicket={setPendingDelete}
                  onMoveToColumn={moveToColumn}
                  onReorder={reorder}
                  pagination={{
                    hasNextPage: columnPagination[status].hasNextPage,
                    totalDocs: columnPagination[status].totalDocs,
                    loadedCount: columnPagination[status].loadedCount,
                  }}
                  isLoadingMore={loadingColumns[status]}
                  onLoadMore={() => loadMore(status)}
                  isRefreshing={refreshing}
                  landedTicketId={landedTicketId}
                />
              ))}
            </div>

            <DragOverlay>
              {activeTicket ? (
                <div className="w-72 max-w-[280px]">
                  <KanbanCard ticket={activeTicket} isOverlay />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </ErrorBoundary>

      {openedTicket && (
        <TicketPanel
          ticket={openedTicket}
          onClose={() => openTicket(null)}
          onUpdate={(next) => setTickets((prev) => prev.map((t) => (t.id === next.id ? next : t)))}
          onDelete={setPendingDelete}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete this ticket?"
        message={
          pendingDelete
            ? `${pendingDelete.ticketId ?? 'This ticket'} — “${pendingDelete.title}”`
            : ''
        }
        consequence="Its subtasks, labels and dependency links go with it. This cannot be undone."
        confirmLabel="Delete ticket"
      />
    </div>
  )
}
