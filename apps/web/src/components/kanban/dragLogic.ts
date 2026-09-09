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
 * Resolved drop target for a drag, shared by handleDragOver (live preview)
 * and computeDragResult (final drop math).
 */
export interface DragTarget {
  /** Column the dragged ticket lands in. */
  status: TicketStatus
  /** true → the `over` id IS the column (drop on empty column space). */
  isColumnTarget: boolean
}

/**
 * Resolve WHICH column a drop targets, purely from the CURRENT state.
 *
 *  - `overId` is a column id → that column itself (append at the end);
 *  - `overId` is another card → the column that card lives in;
 *  - anything else (dropped on itself, unknown ids) → null (no-op).
 *
 * Column ids are the TicketStatus values; card ids are Mongo ObjectIds, so
 * the two namespaces never collide (same discriminator collision.ts uses).
 */
export function resolveDragTarget(
  tickets: Ticket[],
  activeId: string,
  overId: string,
): DragTarget | null {
  if (activeId === overId) return null

  const activeTicket = tickets.find((t) => t.id === activeId)
  if (!activeTicket) return null

  if (KANBAN_COLUMNS.some((col) => col === overId)) {
    return { status: overId as TicketStatus, isColumnTarget: true }
  }

  const overTicket = tickets.find((t) => t.id === overId)
  if (!overTicket) return null

  return { status: overTicket.status as TicketStatus, isColumnTarget: false }
}

/**
 * Apply a drop to the state WITHOUT any "did anything change" shortcut:
 * structurally invalid drops (self, unknown ids) return nulls + untouched
 * state; everything else normalizes the target column and returns the final
 * status/sortOrder plus the next tickets array.
 *
 * Split out from computeDragResult so handleDragEnd can decide "is this a
 * real move" against the DRAG-START origin (what the server knows) instead
 * of the current optimistic state — handleDragOver legitimately brings the
 * state to the drop position during the drag, which must NOT suppress the
 * PATCH.
 */
export function applyDrop(
  tickets: Ticket[],
  activeId: string,
  overId: string,
): DragResult {
  const noOp: DragResult = { activeId: null, status: null, sortOrder: null, tickets }

  const target = resolveDragTarget(tickets, activeId, overId)
  if (!target) return noOp

  const activeTicket = tickets.find((t) => t.id === activeId) as Ticket
  const targetStatus = target.status
  let targetIndex: number

  if (target.isColumnTarget) {
    targetIndex = Number.MAX_SAFE_INTEGER // append at the end
  } else {
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

  return {
    activeId,
    status: targetStatus,
    sortOrder: activeNext.sortOrder ?? 0,
    tickets: nextTickets,
  }
}

/**
 * True when the drop result actually changes the ticket's server-known
 * position (the drag-start origin). `origin === null` (unknown start, e.g.
 * the ticket vanished mid-drag) is treated as a real move whenever the drop
 * itself is valid — a PATCH to a freshly resolved position is then the only
 * way to reconcile.
 */
export function isRealMove(
  result: DragResult,
  origin: { status: TicketStatus; sortOrder: number } | null,
): boolean {
  if (result.status === null || result.sortOrder === null) return false
  if (!origin) return true
  return result.status !== origin.status || result.sortOrder !== origin.sortOrder
}

/**
 * Resolve the outcome of a drop. `tickets` must be the CURRENT state (the
 * caller passes it from inside the state updater). A no-op (dropped on
 * itself, same column same slot, unknown ids) comes back with
 * status/sortOrder === null and the state untouched — the caller must skip
 * the PATCH and any refetch in that case.
 *
 * Accepted drop targets (via resolveDragTarget):
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
  const result = applyDrop(tickets, activeId, overId)

  // Structural no-op (self/unknown) → state untouched, nulls already set.
  if (result.status === null) return result

  // Value no-op: the drop lands exactly on the CURRENT position → treat as
  // nothing happened (no PATCH, no refetch, state reference preserved).
  const activePrev = tickets.find((t) => t.id === result.activeId)
  const activeNext = result.tickets.find((t) => t.id === result.activeId)
  if (
    activePrev &&
    activeNext &&
    activeNext.status === activePrev.status &&
    (activeNext.sortOrder ?? 0) === (activePrev.sortOrder ?? 0)
  ) {
    return { activeId: null, status: null, sortOrder: null, tickets }
  }

  return result
}
