import { arrayMove } from '@dnd-kit/sortable'
import { TicketStatus } from '@/types/enums'
import type { Ticket } from '@/payload-types'

/**
 * Pure drag-result math for the kanban board.
 *
 * Adapted from Victor Gonzalez (@aficiomaquinas) in aficiomaquinas/local-pm,
 * commit bf1da41 "fix(kanban): apply full drop position in dragOver; PATCH
 * decided vs drag origin".
 *
 * Two defects motivated extracting this:
 *
 *  1. `handleDragEnd` PATCHed
 *     `sortOrder: columnTickets.findIndex(t => t.id === overId) + 1`. When a
 *     card was dropped on empty column space, `overId` is the COLUMN id, so
 *     `findIndex` returned -1 and every such drop persisted `sortOrder: 0`,
 *     silently stacking cards on top of each other.
 *  2. `handleDragOver` mutated only `status`, leaving the sortOrder from the
 *     source column. A drop that confirmed the preview then re-solved to the
 *     position the optimistic state already held, the move was read as a
 *     no-op, no PATCH was sent, and the next refetch reverted the card.
 *
 * Keeping the math here — pure, taking the CURRENT state as an argument —
 * lets it be recomputed inside a `setTickets(prev => ...)` updater and
 * unit-tested as a table rather than through the DOM.
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
  /** Full next tickets state, with the target column renumbered 0..n. */
  tickets: Ticket[]
}

/** Resolved drop target, shared by the live preview and the final drop math. */
export interface DragTarget {
  /** Column the dragged ticket lands in. */
  status: TicketStatus
  /** true → the `over` id IS the column (drop on empty column space). */
  isColumnTarget: boolean
}

/**
 * Resolve WHICH column a drop targets, purely from the CURRENT state.
 *
 *  - `overId` is a column id → that column (append at the end);
 *  - `overId` is another card → the column that card lives in;
 *  - anything else (dropped on itself, unknown ids) → null (no-op).
 *
 * Column ids are TicketStatus values and card ids are Mongo ObjectIds, so
 * the two id namespaces never collide.
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
 * Apply a drop to the state with no "did anything change" shortcut.
 *
 * Structurally invalid drops (self, unknown ids) return nulls and untouched
 * state; everything else normalizes the target column and returns the final
 * status/sortOrder plus the next tickets array.
 *
 * Split from `computeDragResult` so the caller can decide "is this a real
 * move" against the DRAG-START origin (what the server knows) rather than the
 * current optimistic state — `handleDragOver` legitimately advances the state
 * to the drop position mid-drag, and that must not suppress the PATCH.
 */
export function applyDrop(tickets: Ticket[], activeId: string, overId: string): DragResult {
  const noOp: DragResult = { activeId: null, status: null, sortOrder: null, tickets }

  const target = resolveDragTarget(tickets, activeId, overId)
  if (!target) return noOp

  const activeTicket = tickets.find((t) => t.id === activeId) as Ticket
  const targetStatus = target.status

  const columnTickets = tickets.filter((t) => t.status === targetStatus)
  const oldIndex = columnTickets.findIndex((t) => t.id === activeId)

  // Target slot within the column. A column drop appends; a card drop takes
  // that card's slot. When the mover is not yet in the column (status change)
  // the drop index is relative to the shorter array, so insert-then-renumber
  // is the correct order of steps.
  const dropIndex = target.isColumnTarget
    ? columnTickets.length
    : Math.max(0, columnTickets.findIndex((t) => t.id === overId))

  const orderedColumn =
    oldIndex === -1
      ? [...columnTickets.slice(0, dropIndex), activeTicket, ...columnTickets.slice(dropIndex)]
      : arrayMove(columnTickets, oldIndex, dropIndex)

  // Renumber the target column 0..n and apply to the whole state.
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
 * The drop result for "the card stays exactly where the live preview put it".
 *
 * dnd-kit reports `over === active` at drop time whenever `handleDragOver` has
 * already moved the card into the target slot: the card now occupies that
 * position, so under `closestCorners` it is itself the nearest droppable to the
 * pointer. Read literally that looks like "dropped on itself" — a no-op — and
 * the PATCH is skipped, which is precisely the silent-revert bug in a second
 * disguise. It actually means the preview IS the drop, so the card's current
 * previewed position is the answer.
 */
export function resultFromPreview(tickets: Ticket[], activeId: string): DragResult {
  const active = tickets.find((t) => t.id === activeId)
  if (!active) return { activeId: null, status: null, sortOrder: null, tickets }

  return {
    activeId,
    status: active.status as TicketStatus,
    sortOrder: active.sortOrder ?? 0,
    tickets,
  }
}

/**
 * True when the drop actually changes the ticket's server-known position (the
 * drag-start origin). `origin === null` (unknown start — e.g. the ticket
 * vanished mid-drag) counts as a real move whenever the drop itself is valid,
 * since a PATCH to the freshly resolved position is then the only way to
 * reconcile client and server.
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
 * Resolve the outcome of a drop against the CURRENT state.
 *
 * A no-op (dropped on itself, same column same slot, unknown ids) comes back
 * with status/sortOrder === null and the state reference untouched — the
 * caller must then skip both the PATCH and the refetch.
 */
export function computeDragResult(
  tickets: Ticket[],
  activeId: string,
  overId: string,
): DragResult {
  const result = applyDrop(tickets, activeId, overId)

  // Structural no-op (self/unknown) → state untouched, nulls already set.
  if (result.status === null) return result

  // Value no-op: the drop lands exactly on the CURRENT position.
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
