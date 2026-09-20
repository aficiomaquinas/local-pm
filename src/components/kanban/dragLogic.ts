import { arrayMove } from '@dnd-kit/sortable'
import { TicketStatus } from '@/types/enums'
import type { Ticket } from '@/payload-types'

export const KANBAN_COLUMNS: TicketStatus[] = [
  TicketStatus.TODO,
  TicketStatus.IN_PROGRESS,
  TicketStatus.DONE,
]

export interface DragResult {
  activeId: string | null
  status: TicketStatus | null
  sortOrder: number | null
  tickets: Ticket[]
}

export interface DragTarget {
  status: TicketStatus
  isColumnTarget: boolean
}

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

export function applyDrop(tickets: Ticket[], activeId: string, overId: string): DragResult {
  const noOp: DragResult = { activeId: null, status: null, sortOrder: null, tickets }

  const target = resolveDragTarget(tickets, activeId, overId)
  if (!target) return noOp

  const activeTicket = tickets.find((t) => t.id === activeId) as Ticket
  const targetStatus = target.status

  const columnTickets = tickets.filter((t) => t.status === targetStatus)
  const oldIndex = columnTickets.findIndex((t) => t.id === activeId)

  const dropIndex = target.isColumnTarget
    ? columnTickets.length
    : Math.max(0, columnTickets.findIndex((t) => t.id === overId))

  const orderedColumn =
    oldIndex === -1
      ? [...columnTickets.slice(0, dropIndex), activeTicket, ...columnTickets.slice(dropIndex)]
      : arrayMove(columnTickets, oldIndex, dropIndex)

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

export function isRealMove(
  result: DragResult,
  origin: { status: TicketStatus; sortOrder: number } | null,
): boolean {
  if (result.status === null || result.sortOrder === null) return false
  if (!origin) return true
  return result.status !== origin.status || result.sortOrder !== origin.sortOrder
}

export function computeDragResult(
  tickets: Ticket[],
  activeId: string,
  overId: string,
): DragResult {
  const result = applyDrop(tickets, activeId, overId)

  if (result.status === null) return result

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
