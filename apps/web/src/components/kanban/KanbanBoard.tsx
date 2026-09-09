'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'
import { KanbanHeader } from './KanbanHeader'
import { TicketModal } from './TicketModal'
import { TicketDetailModal } from './TicketDetailModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { computeDragResult, KANBAN_COLUMNS } from './dragLogic'
import { prioritizePointerWithin } from './collision'
import { TicketStatus } from '@/types/enums'
import type { Project, Team, Ticket } from '@/payload-types'

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
  projects: Project[]
  teams: Team[]
  initialColumnPagination?: InitialColumnPagination[]
}

const COLUMNS = [
  { id: TicketStatus.TODO, title: 'Todo' },
  { id: TicketStatus.IN_PROGRESS, title: 'In Progress' },
  { id: TicketStatus.DONE, title: 'Done' },
]

// Helper to create initial pagination state per column
function createInitialColumnPagination(
  initialTickets: Ticket[],
  initialColumnPagination?: InitialColumnPagination[]
): ColumnPaginationState {
  const defaultPagination: ColumnPaginationState = {
    [TicketStatus.TODO]: { page: 1, totalPages: 1, hasNextPage: false, totalDocs: 0, loadedCount: 0 },
    [TicketStatus.IN_PROGRESS]: { page: 1, totalPages: 1, hasNextPage: false, totalDocs: 0, loadedCount: 0 },
    [TicketStatus.DONE]: { page: 1, totalPages: 1, hasNextPage: false, totalDocs: 0, loadedCount: 0 },
  }

  // If we have initial column pagination from server, use it
  if (initialColumnPagination) {
    for (const colPag of initialColumnPagination) {
      const loadedCount = initialTickets.filter(t => t.status === colPag.status).length
      defaultPagination[colPag.status] = {
        page: colPag.page,
        totalPages: colPag.totalPages,
        hasNextPage: colPag.hasNextPage,
        totalDocs: colPag.totalDocs,
        loadedCount,
      }
    }
  } else {
    // Fallback: count tickets per status from initial data
    for (const status of COLUMNS.map(c => c.id)) {
      const count = initialTickets.filter(t => t.status === status).length
      defaultPagination[status] = {
        page: 1,
        totalPages: 1,
        hasNextPage: false,
        totalDocs: count,
        loadedCount: count,
      }
    }
  }

  return defaultPagination
}

export function KanbanBoard({ initialTickets, projects, teams, initialColumnPagination }: KanbanBoardProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [tickets, setTickets] = useState<Ticket[]>(initialTickets)
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)

  // Initialize from URL params
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    searchParams.get('project')
  )
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    searchParams.get('team')
  )

  // Sync URL when filters change
  const updateUrlParams = useCallback((projectId: string | null, teamId: string | null) => {
    const params = new URLSearchParams()
    if (projectId) params.set('project', projectId)
    if (teamId) params.set('team', teamId)
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }, [router, pathname])

  // Update URL when filters change
  const handleProjectChange = useCallback((projectId: string | null) => {
    setSelectedProjectId(projectId)
    updateUrlParams(projectId, selectedTeamId)
  }, [selectedTeamId, updateUrlParams])

  const handleTeamChange = useCallback((teamId: string | null) => {
    setSelectedTeamId(teamId)
    updateUrlParams(selectedProjectId, teamId)
  }, [selectedProjectId, updateUrlParams])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null)
  const [viewingTicket, setViewingTicket] = useState<Ticket | null>(null)

  // Pagination state per column
  const [columnPagination, setColumnPagination] = useState<ColumnPaginationState>(
    () => createInitialColumnPagination(initialTickets, initialColumnPagination)
  )
  const [loadingColumns, setLoadingColumns] = useState<Record<TicketStatus, boolean>>({
    [TicketStatus.TODO]: false,
    [TicketStatus.IN_PROGRESS]: false,
    [TicketStatus.DONE]: false,
  })
  const [isRefetching, setIsRefetching] = useState(false)

  // Track if this is the initial mount to avoid refetching on first render
  const isInitialMount = useRef(true)

  // BUG-1: while a drag is in flight, the filter-refetch effect (triggered by
  // router.replace on URL sync) must not overwrite the optimistic setTickets
  // with server state from before the PATCH landed. The drag sets this flag;
  // the effect skips its fetch while it is set and the drag clears it after
  // the PATCH settles.
  const isDraggingRef = useRef(false)

  // Refetch tickets when filters change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    // BUG-1: a drag is in flight → skip this round; the drag's PATCH resolves
    // afterwards and the state it committed is already authoritative. (When
    // filters change mid-drag, the drag refetches the new filters itself.)
    if (isDraggingRef.current) return

    const refetchTickets = async () => {
      setIsRefetching(true)
      try {
        // Fetch all three columns in parallel
        const fetchColumn = async (status: TicketStatus) => {
          let url = `/api/tickets?page=1&limit=20&depth=2&sort=sortOrder&where[status][equals]=${status}`
          if (selectedProjectId) {
            url += `&where[project][equals]=${selectedProjectId}`
          }
          if (selectedTeamId) {
            url += `&where[team][equals]=${selectedTeamId}`
          }
          const response = await fetch(url)
          return response.json()
        }

        const [todoData, inProgressData, doneData] = await Promise.all([
          fetchColumn(TicketStatus.TODO),
          fetchColumn(TicketStatus.IN_PROGRESS),
          fetchColumn(TicketStatus.DONE),
        ])

        // Combine all tickets
        const newTickets = [
          ...(todoData.docs || []),
          ...(inProgressData.docs || []),
          ...(doneData.docs || []),
        ]
        setTickets(newTickets)

        // Update pagination state for all columns
        setColumnPagination({
          [TicketStatus.TODO]: {
            page: todoData.page ?? 1,
            totalPages: todoData.totalPages ?? 1,
            hasNextPage: todoData.hasNextPage ?? false,
            totalDocs: todoData.totalDocs ?? 0,
            loadedCount: todoData.docs?.length ?? 0,
          },
          [TicketStatus.IN_PROGRESS]: {
            page: inProgressData.page ?? 1,
            totalPages: inProgressData.totalPages ?? 1,
            hasNextPage: inProgressData.hasNextPage ?? false,
            totalDocs: inProgressData.totalDocs ?? 0,
            loadedCount: inProgressData.docs?.length ?? 0,
          },
          [TicketStatus.DONE]: {
            page: doneData.page ?? 1,
            totalPages: doneData.totalPages ?? 1,
            hasNextPage: doneData.hasNextPage ?? false,
            totalDocs: doneData.totalDocs ?? 0,
            loadedCount: doneData.docs?.length ?? 0,
          },
        })
      } catch (error) {
        console.error('Failed to refetch tickets:', error)
      } finally {
        setIsRefetching(false)
      }
    }

    refetchTickets()
  }, [selectedProjectId, selectedTeamId])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Load more tickets for a specific column
  const loadMoreTicketsForColumn = useCallback(async (status: TicketStatus) => {
    const colPag = columnPagination[status]
    if (!colPag.hasNextPage || loadingColumns[status]) return

    setLoadingColumns(prev => ({ ...prev, [status]: true }))
    try {
      const nextPage = colPag.page + 1
      let url = `/api/tickets?page=${nextPage}&limit=20&depth=2&sort=sortOrder&where[status][equals]=${status}`
      if (selectedProjectId) {
        url += `&where[project][equals]=${selectedProjectId}`
      }
      if (selectedTeamId) {
        url += `&where[team][equals]=${selectedTeamId}`
      }

      const response = await fetch(url)
      const data = await response.json()

      if (data.docs && data.docs.length > 0) {
        // Avoid duplicates by filtering out existing ticket IDs
        const existingIds = new Set(tickets.map(t => t.id))
        const newTickets = data.docs.filter((t: Ticket) => !existingIds.has(t.id))

        setTickets((prev) => [...prev, ...newTickets])
        setColumnPagination(prev => ({
          ...prev,
          [status]: {
            page: data.page,
            totalPages: data.totalPages,
            hasNextPage: data.hasNextPage,
            totalDocs: data.totalDocs,
            loadedCount: prev[status].loadedCount + newTickets.length,
          },
        }))
      }
    } catch (error) {
      console.error(`Failed to load more tickets for ${status}:`, error)
    } finally {
      setLoadingColumns(prev => ({ ...prev, [status]: false }))
    }
  }, [columnPagination, loadingColumns, selectedProjectId, selectedTeamId, tickets])

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (selectedProjectId) {
        const projectId = typeof ticket.project === 'string' ? ticket.project : ticket.project?.id
        if (projectId !== selectedProjectId) return false
      }
      if (selectedTeamId) {
        const teamId = typeof ticket.team === 'string' ? ticket.team : ticket.team?.id
        if (teamId !== selectedTeamId) return false
      }
      return true
    })
  }, [tickets, selectedProjectId, selectedTeamId])

  const getTicketsByStatus = useCallback(
    (status: TicketStatus) => {
      return filteredTickets
        .filter((ticket) => ticket.status === status)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    },
    [filteredTickets]
  )

  const handleDragStart = (event: DragStartEvent) => {
    const ticket = tickets.find((t) => t.id === event.active.id)
    setActiveTicket(ticket || null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeTicket = tickets.find((t) => t.id === activeId)
    if (!activeTicket) return

    // Check if we're over a column
    const isOverColumn = COLUMNS.some((col) => col.id === overId)
    if (isOverColumn) {
      const newStatus = overId as TicketStatus
      if (activeTicket.status !== newStatus) {
        setTickets((prev) =>
          prev.map((ticket) =>
            ticket.id === activeId ? { ...ticket, status: newStatus } : ticket
          )
        )
      }
      return
    }

    // We're over another ticket
    const overTicket = tickets.find((t) => t.id === overId)
    if (!overTicket) return

    if (activeTicket.status !== overTicket.status) {
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === activeId ? { ...ticket, status: overTicket.status } : ticket
        )
      )
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTicket(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    if (activeId === overId) return

    // BUG-1: a drag is in flight from here until the PATCH settles — the
    // filter-refetch effect must stay suppressed through the whole window
    // (it re-runs on router.replace URL syncs and would otherwise clobber
    // the optimistic state with pre-PATCH server data).
    isDraggingRef.current = true
    try {
      // BUG-1: recompute from the CURRENT state inside the setTickets updater
      // (handleDragOver already mutated it during the drag) and PATCH with
      // the final values computed there — no stale drag-start snapshot. A
      // no-op drop returns nulls: nothing to PATCH, nothing to refetch.
      let patch: { status: TicketStatus; sortOrder: number } | null = null

      setTickets((prev) => {
        const result = computeDragResult(prev, activeId, overId)
        if (result.status !== null && result.sortOrder !== null) {
          patch = { status: result.status, sortOrder: result.sortOrder }
        }
        return result.tickets
      })

      if (!patch) return

      // Refetch only after the PATCH resolves (fresh column pagination and
      // authoritative order) — never before it, and never on no-op drops.
      await fetch(`/api/tickets/${activeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })

      const params = new URLSearchParams(window.location.search)
      if (params.get('project') || params.get('team')) {
        const url = `/api/tickets?page=1&limit=20&depth=2&sort=sortOrder` +
          (params.get('project') ? `&where[project][equals]=${params.get('project')}` : '') +
          (params.get('team') ? `&where[team][equals]=${params.get('team')}` : '')
        const response = await fetch(url)
        const data = await response.json()
        if (Array.isArray(data.docs)) {
          setTickets(data.docs)
        }
        // No pagination rewrite: a move does not change column doc counts.
      }
    } catch (error) {
      console.error('Failed to update ticket:', error)
    } finally {
      isDraggingRef.current = false
      setActiveTicket(null)
    }
  }

  const handleCreateTicket = () => {
    setEditingTicket(null)
    setIsModalOpen(true)
  }

  const handleViewTicket = (ticket: Ticket) => {
    setViewingTicket(ticket)
  }

  const handleTicketSaved = (savedTicket: Ticket) => {
    if (editingTicket) {
      setTickets((prev) =>
        prev.map((t) => (t.id === savedTicket.id ? savedTicket : t))
      )
    } else {
      setTickets((prev) => [...prev, savedTicket])
    }
    setIsModalOpen(false)
    setEditingTicket(null)
  }

  const handleTicketUpdated = (updatedTicket: Ticket) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t))
    )
    setViewingTicket(updatedTicket)
  }

  // BUG-3 soft delete: the UI Delete action PATCHes `deleted: true` — never a
  // hard DELETE (the collections' beforeOperation guard 403s that anyway) —
  // with a confirmation. The read constraint hides the ticket on refresh; we
  // also drop it from local state for instant feedback. The version trail
  // survives, so the audit history keeps the ticket.
  const [pendingDelete, setPendingDelete] = useState<Ticket | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDeleteTicket = async (ticketId: string) => {
    const ticket = tickets.find((t) => t.id === ticketId) ?? null
    setPendingDelete(ticket)
  }

  const confirmSoftDelete = async () => {
    if (!pendingDelete) return
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/tickets/${pendingDelete.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted: true }),
      })
      if (!response.ok) throw new Error(`Soft delete failed (${response.status})`)
      setTickets((prev) => prev.filter((t) => t.id !== pendingDelete.id))
      setViewingTicket((prev) => (prev?.id === pendingDelete.id ? null : prev))
      setPendingDelete(null)
    } catch (error) {
      console.error('Failed to soft delete ticket:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <KanbanHeader
        projects={projects}
        teams={teams}
        selectedProjectId={selectedProjectId}
        selectedTeamId={selectedTeamId}
        onProjectChange={handleProjectChange}
        onTeamChange={handleTeamChange}
        onCreateTicket={handleCreateTicket}
      />

      <DndContext
        sensors={sensors}
        // Drag UX fix (2026-09-08): pointerWithin-first composed collision
        // detection — dropping anywhere inside a column (incl. empty areas)
        // now reliably targets that column instead of a card in another one.
        collisionDetection={prioritizePointerWithin(KANBAN_COLUMNS)}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 flex gap-4 p-6 overflow-x-auto">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.id}
              id={column.id}
              title={column.title}
              tickets={getTicketsByStatus(column.id)}
              onViewTicket={handleViewTicket}
              onDeleteTicket={handleDeleteTicket}
              pagination={{
                hasNextPage: columnPagination[column.id].hasNextPage,
                totalDocs: columnPagination[column.id].totalDocs,
                loadedCount: columnPagination[column.id].loadedCount,
              }}
              isLoadingMore={loadingColumns[column.id]}
              onLoadMore={() => loadMoreTicketsForColumn(column.id)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTicket ? <KanbanCard ticket={activeTicket} isOverlay /> : null}
        </DragOverlay>
      </DndContext>

      <TicketModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        ticket={editingTicket}
        projects={projects}
        teams={teams}
        allTickets={tickets}
        onSave={handleTicketSaved}
        defaultProjectId={selectedProjectId}
      />

      {viewingTicket && (
        <TicketDetailModal
          isOpen={!!viewingTicket}
          onClose={() => setViewingTicket(null)}
          ticket={viewingTicket}
          projects={projects}
          teams={teams}
          allTickets={tickets}
          onUpdate={handleTicketUpdated}
          onDelete={handleDeleteTicket}
        />
      )}

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmSoftDelete}
        title="Delete this ticket?"
        message={`This soft-deletes "${pendingDelete?.title ?? ''}".\n\nIt disappears from the board, but its full audit history is preserved — deletion never destroys the trail.`}
        confirmText="Delete"
        isDestructive
        isLoading={isDeleting}
      />
    </div>
  )
}
