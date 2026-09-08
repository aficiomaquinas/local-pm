import { describe, it, expect } from 'vitest'
import { computeDragResult, KANBAN_COLUMNS } from '@/components/kanban/dragLogic'
import { TicketStatus } from '@/types/enums'
import type { Ticket } from '@/payload-types'

/**
 * W7 — kanban drag math as a pure table (BUG-1, T1 per SPC-003 §7.2).
 *
 * handleDragEnd used to compute indexes against a drag-start snapshot of
 * `tickets` (stale closure) while handleDragOver had already mutated state —
 * the PATCH went out with a wrong sortOrder and the filter refetch then
 * reverted the optimistic move. The math now lives in computeDragResult,
 * called with the CURRENT state inside the setTickets updater; these tests
 * pin its input→output table: same-ticket, over-column, over-card,
 * cross-column, renumbering and the no-op contract that suppresses the PATCH.
 */

const TODO = TicketStatus.TODO
const IN_PROGRESS = TicketStatus.IN_PROGRESS
const DONE = TicketStatus.DONE

function mk(id: string, status: TicketStatus, sortOrder: number): Ticket {
  return { id, status, sortOrder } as unknown as Ticket
}

const board = () => [
  mk('t1', TODO, 0),
  mk('t2', TODO, 1),
  mk('t3', TODO, 2),
  mk('i1', IN_PROGRESS, 0),
  mk('i2', IN_PROGRESS, 1),
  mk('d1', DONE, 0),
]

/** Column view as the board renders it: sorted by sortOrder. */
function column(tickets: Ticket[], status: TicketStatus) {
  return tickets
    .filter((t) => t.status === status)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((t) => [t.id, t.sortOrder])
}

describe('W7: computeDragResult (drag math, T1 table)', () => {
  it('exposes the three kanban columns as drop-target ids', () => {
    expect(KANBAN_COLUMNS).toEqual([TODO, IN_PROGRESS, DONE])
  })

  it('dropped on itself → no-op (nulls, state untouched)', () => {
    const tickets = board()
    const res = computeDragResult(tickets, 't1', 't1')
    expect(res.activeId).toBeNull()
    expect(res.status).toBeNull()
    expect(res.sortOrder).toBeNull()
    expect(res.tickets).toBe(tickets)
  })

  it('unknown over id → no-op', () => {
    const tickets = board()
    const res = computeDragResult(tickets, 't1', 'ghost')
    expect(res.status).toBeNull()
    expect(res.sortOrder).toBeNull()
    expect(res.tickets).toBe(tickets)
  })

  it('unknown active id → no-op', () => {
    const tickets = board()
    const res = computeDragResult(tickets, 'ghost', 't2')
    expect(res.status).toBeNull()
    expect(res.tickets).toBe(tickets)
  })

  it('over a column → status change, appended at the end, sortOrder = column length', () => {
    const tickets = board()
    const res = computeDragResult(tickets, 't1', DONE)

    expect(res.activeId).toBe('t1')
    expect(res.status).toBe(DONE)
    expect(res.sortOrder).toBe(1) // DONE had 1 ticket → appended at index 1

    // The DONE column renumbers contiguously; the mover lands after d1.
    expect(column(res.tickets, DONE)).toEqual([
      ['d1', 0],
      ['t1', 1],
    ])

    // Source column (TODO) is untouched apart from losing the mover.
    expect(column(res.tickets, TODO)).toEqual([
      ['t2', 1],
      ['t3', 2],
    ])
  })

  it("over a card in another column → takes that card's slot, cross-column renumber", () => {
    const tickets = board()
    const res = computeDragResult(tickets, 't1', 'i2') // drop onto i2 (index 1 in IN_PROGRESS)

    expect(res.status).toBe(IN_PROGRESS)
    expect(res.sortOrder).toBe(1)

    expect(column(res.tickets, IN_PROGRESS)).toEqual([
      ['i1', 0],
      ['t1', 1],
      ['i2', 2],
    ])
  })

  it('over a card in the same column → reorder within the column (0..n renumbered)', () => {
    const tickets = board()
    const res = computeDragResult(tickets, 't1', 't3') // move t1 below t3

    expect(res.status).toBe(TODO)
    expect(column(res.tickets, TODO)).toEqual([
      ['t2', 0],
      ['t3', 1],
      ['t1', 2],
    ])
    expect(res.sortOrder).toBe(2)
  })

  it('move that lands on identical position → no-op (no PATCH, no refetch)', () => {
    // t2 already sits at TODO index 1; dropping it "onto itself slot" yields
    // the same status+sortOrder → the caller must skip the PATCH.
    const tickets = [mk('t1', TODO, 0), mk('t2', TODO, 1)]
    const res = computeDragResult(tickets, 't2', 't2')
    expect(res.status).toBeNull()
    expect(res.tickets).toBe(tickets)
  })

  it('recompute from CURRENT state: stale-closure scenario patched correctly', () => {
    // Regression for the triage scenario: during the drag, handleDragOver
    // already moved t1 into IN_PROGRESS optimistically. handleDragEnd now
    // recomputes from that CURRENT state — the final values must reflect it,
    // not the drag-start snapshot.
    const current = [
      mk('t2', TODO, 0),
      mk('t3', TODO, 1),
      mk('t1', IN_PROGRESS, 3), // optimistic status from handleDragOver, junk sortOrder
      mk('i1', IN_PROGRESS, 0),
      mk('i2', IN_PROGRESS, 1),
    ]
    const res = computeDragResult(current, 't1', 'i1')

    expect(res.status).toBe(IN_PROGRESS)
    // Dropping onto i1: the mover takes i1's slot (i1 shifts down) —
    // dnd-kit arrayMove semantics, computed from the CURRENT state.
    expect(res.sortOrder).toBe(1)
    expect(column(res.tickets, IN_PROGRESS)).toEqual([
      ['i1', 0],
      ['t1', 1],
      ['i2', 2],
    ])
  })
})
