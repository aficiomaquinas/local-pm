import { arrayMove } from '@dnd-kit/sortable'
import { TicketStatus } from '@/types/enums'
import type { Ticket } from '@/payload-types'

/**
 * Pure drag-result math for the kanban board (BUG-1, triage 2026-09-07).
 *
 * `handleDragEnd` used to compute indexes against a `tickets` array snapshot
 * captured at drag-start, while `handleDragOver` had already mutated state via
 * `setTickets` — the PATCH then went out with a stale `sortOrder` (and
 * occasionally a stale target status). Extracting the math here lets it be
 * recalculated from the *current* state inside a `setTickets(prev => …)`
 * updater and unit-tested as a table (T1, SPC-003 §7.2).
 */

export const KANBAN_COLUMNS: TicketStatus[] = [
  TicketStatus.TODO,
  TicketStatus.IN_PROGRESS,
  TicketStatus.DONE,
]

export interface DragResult {
  /** Moved ticket's id, or null when the drop is a no-op. */
  activeId: string | null
  /** Final status of the moved ticket (null on no-op). */
  status: TicketStatus | null
  /** Final sortOrder of the moved ticket (null on no-op). */
  sortOrder: number | null
  /** Full next tickets state with statuses/sortOrders normalized per column. */
  tickets: Ticket[]
}

/**
 * Resolve the outcome of a drop. `tickets` must be the CURRENT state (the
 * caller passes it from inside the state updater). A no-op (dropped on
 * itself, same column same slot, unknown ids) comes back with
 * status/sortOrder === null and the state untouched — the caller must skip
 * the PATCH and any refetch in that case.
 *
 * Accepted drop targets:
 *  - a column id → ticket moves to that column, appended at the end;
 *  - another card → ticket takes that card's slot in its column.
 *
 * The whole target column is renumbered 0..n so every ticket lands on a
 * final, contiguous sortOrder (server sorts by `sortOrder` asc).
 */
export function computeDragResult(
  tickets: Ticket[],
  activeId: string,
  overId: string,
): DragResult {
  const noOp: DragResult = { activeId: null, status: null, sortOrder: null, tickets }

  if (activeId === overId) return noOp

  const activeTicket = tickets.find((t) => t.id === activeId)
  if (!activeTicket) return noOp

  const isOverColumn = KANBAN_COLUMNS.some((col) => col === overId)

  let targetStatus: TicketStatus
  let targetIndex: number

  if (isOverColumn) {
    targetStatus = overId as TicketStatus
    targetIndex = Number.MAX_SAFE_INTEGER // append at the end
  } else {
    const overTicket = tickets.find((t) => t.id === overId)
    if (!overTicket) return noOp
    targetStatus = overTicket.status as TicketStatus
    targetIndex = tickets
      .filter((t) => t.status === targetStatus)
      .findIndex((t) => t.id === overId)
  }

  const columnTickets = tickets.filter((t) => t.status === targetStatus)
  const oldIndex = columnTickets.findIndex((t) => t.id === activeId)
  // Target slot in the column EXCLUDING the mover; when the mover is not yet
  // in the column (status change), the drop index is relative to that
  // shorter array, so insert-then-renumber is the correct order of steps.
  const dropIndex =
    targetIndex === Number.MAX_SAFE_INTEGER ? columnTickets.length : Math.max(0, targetIndex)

  const orderedColumn =
    oldIndex === -1
      ? [
          ...columnTickets.slice(0, dropIndex),
          activeTicket,
          ...columnTickets.slice(dropIndex),
        ]
      : arrayMove(columnTickets, oldIndex, dropIndex)

  // Renumber the target column and apply to the whole state.
  const orderById = new Map<string, number>()
  orderedColumn.forEach((t, i) => orderById.set(t.id, i))

  const nextTickets = tickets.map((ticket) => {
    if (ticket.id === activeId) {
      return { ...ticket, status: targetStatus, sortOrder: orderById.get(ticket.id) ?? 0 }
    }
    const newOrder = orderById.get(ticket.id)
    if (newOrder === undefined) return ticket
    return { ...ticket, sortOrder: newOrder }
  })

  const activeNext = nextTickets.find((t) => t.id === activeId) as Ticket

  // Nothing actually changed (same column, same slot) → no PATCH, no refetch.
  if (
    activeNext.status === activeTicket.status &&
    (activeNext.sortOrder ?? 0) === (activeTicket.sortOrder ?? 0)
  ) {
    return noOp
  }

  return {
    activeId,
    status: targetStatus,
    sortOrder: activeNext.sortOrder ?? 0,
    tickets: nextTickets,
  }
}
