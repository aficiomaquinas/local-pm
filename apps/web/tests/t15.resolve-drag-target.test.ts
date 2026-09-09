import { describe, it, expect } from 'vitest'
import {
  resolveDragTarget,
  applyDrop,
  isRealMove,
  computeDragResult,
} from '@/components/kanban/dragLogic'
import { TicketStatus } from '@/types/enums'
import type { Ticket } from '@/payload-types'

/**
 * T1 (drag collision fix) — target resolution + real-move detection.
 *
 * handleDragOver and handleDragEnd must agree on WHICH column a drop
 * targets (resolveDragTarget) and on WHEN a drop is a real move
 * (isRealMove, judged against the drag-start origin — what the server
 * knows). The regression this pins: handleDragOver used to mutate only
 * the status (leaving a junk sortOrder) and handleDragEnd compared the
 * drop against the already-mutated state, so dropping a card on the In
 * Progress column body re-solved to the optimistic position → misread
 * as a no-op → no PATCH → the next filter refetch silently reverted the
 * move ("drop on In Progress does nothing").
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

/** Same preview step handleDragOver performs: enter target column at the end. */
function previewCrossColumn(tickets: Ticket[], activeId: string, status: TicketStatus): Ticket[] {
  const maxSort = tickets
    .filter((t) => t.status === status && t.id !== activeId)
    .reduce((max, t) => Math.max(max, t.sortOrder ?? 0), -1)
  return tickets.map((t) =>
    t.id === activeId ? { ...t, status, sortOrder: maxSort + 1 } : t,
  )
}

describe('T1: resolveDragTarget (column vs card resolution)', () => {
  it('over a column id → that column, isColumnTarget', () => {
    const tickets = board()
    expect(resolveDragTarget(tickets, 't1', IN_PROGRESS)).toEqual({
      status: IN_PROGRESS,
      isColumnTarget: true,
    })
    expect(resolveDragTarget(tickets, 't1', TODO)).toEqual({
      status: TODO,
      isColumnTarget: true,
    })
    expect(resolveDragTarget(tickets, 'i1', DONE)).toEqual({
      status: DONE,
      isColumnTarget: true,
    })
  })

  it('over a card → its CURRENT column, not a column target', () => {
    const tickets = board()
    expect(resolveDragTarget(tickets, 't1', 'i2')).toEqual({
      status: IN_PROGRESS,
      isColumnTarget: false,
    })
    expect(resolveDragTarget(tickets, 't1', 't3')).toEqual({
      status: TODO,
      isColumnTarget: false,
    })
  })

  it('resolves against the CURRENT state (card already moved by dragOver)', () => {
    const preview = previewCrossColumn(board(), 't1', IN_PROGRESS)
    // t1 now lives in IN_PROGRESS → dropping onto t1 resolves there.
    expect(resolveDragTarget(preview, 't1', 't1')).toBeNull() // self
    expect(resolveDragTarget(preview, 'i1', 't1')).toEqual({
      status: IN_PROGRESS,
      isColumnTarget: false,
    })
  })

  it('null on: dropped on itself, unknown over id, unknown active id', () => {
    const tickets = board()
    expect(resolveDragTarget(tickets, 't1', 't1')).toBeNull()
    expect(resolveDragTarget(tickets, 't1', 'ghost')).toBeNull()
    expect(resolveDragTarget(tickets, 'ghost', 't2')).toBeNull()
  })
})

describe('T1: isRealMove (commit decision vs drag-start origin)', () => {
  it('invalid drop result → never a real move', () => {
    const noOp = { activeId: null, status: null, sortOrder: null, tickets: [] as Ticket[] }
    expect(isRealMove(noOp, { status: TODO, sortOrder: 0 })).toBe(false)
    expect(isRealMove(noOp, null)).toBe(false)
  })

  it('same status + same sortOrder → false (drop matches the origin)', () => {
    const res = { activeId: 't1', status: TODO, sortOrder: 0, tickets: [] as Ticket[] }
    expect(isRealMove(res, { status: TODO, sortOrder: 0 })).toBe(false)
  })

  it('same column, different slot → true', () => {
    const res = { activeId: 't1', status: TODO, sortOrder: 2, tickets: [] as Ticket[] }
    expect(isRealMove(res, { status: TODO, sortOrder: 0 })).toBe(true)
  })

  it('status change → true regardless of sortOrder', () => {
    const res = { activeId: 't1', status: DONE, sortOrder: 0, tickets: [] as Ticket[] }
    expect(isRealMove(res, { status: TODO, sortOrder: 0 })).toBe(true)
  })

  it('null origin + valid drop → true (cannot prove it is a no-op)', () => {
    const res = { activeId: 't1', status: DONE, sortOrder: 1, tickets: [] as Ticket[] }
    expect(isRealMove(res, null)).toBe(true)
  })
})

describe('T1: dragOver → dragEnd pipeline (pure simulation of the regression)', () => {
  it('drop on In Progress column body AFTER dragOver previewed it → PATCH is still emitted', () => {
    const tickets = board()

    // 1. dragOver: t1 enters IN_PROGRESS optimistically at the end (sort 2).
    const preview = previewCrossColumn(tickets, 't1', IN_PROGRESS)
    expect(preview.find((t) => t.id === 't1')).toMatchObject({
      status: IN_PROGRESS,
      sortOrder: 2,
    })

    // 2. dragEnd over the same column id: applyDrop resolves from the
    // CURRENT (previewed) state…
    const result = applyDrop(preview, 't1', IN_PROGRESS)
    expect(result.status).toBe(IN_PROGRESS)
    expect(result.sortOrder).toBe(2)

    // 3. …and the commit decision compares against the DRAG-START origin
    // (TODO, 0) — not the previewed state, which is already at the drop
    // position. This is exactly the comparison that used to swallow the
    // PATCH and let the refetch revert the move.
    const origin = { status: TODO, sortOrder: 0 }
    expect(isRealMove(result, origin)).toBe(true)
    expect({ status: result.status, sortOrder: result.sortOrder }).toEqual({
      status: IN_PROGRESS,
      sortOrder: 2,
    })
  })

  it('applyDrop after cross-column preview keeps the whole target column contiguous', () => {
    const preview = previewCrossColumn(board(), 't1', IN_PROGRESS)
    const result = applyDrop(preview, 't1', IN_PROGRESS)

    const ip = result.tickets
      .filter((t) => t.status === IN_PROGRESS)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((t) => [t.id, t.sortOrder])
    expect(ip).toEqual([
      ['i1', 0],
      ['i2', 1],
      ['t1', 2],
    ])

    // Source column lost the mover, survivors keep their order.
    const todo = result.tickets
      .filter((t) => t.status === TODO)
      .map((t) => [t.id, t.sortOrder])
    expect(todo).toEqual([
      ['t2', 1],
      ['t3', 2],
    ])
  })

  it('drop back on the origin column+slot → no PATCH (genuine no-op)', () => {
    const tickets = board()
    // t3 sits last in TODO; "dropping" it back onto itself-slot resolves to
    // its exact origin → isRealMove must be false.
    const result = applyDrop(tickets, 't3', 't3') // self → structural no-op
    expect(result.status).toBeNull()
    expect(isRealMove(result, { status: TODO, sortOrder: 2 })).toBe(false)

    // Same through computeDragResult's public no-op contract.
    const viaCompute = computeDragResult(tickets, 't3', 't3')
    expect(viaCompute.status).toBeNull()
    expect(viaCompute.tickets).toBe(tickets)
  })

  it('applyDrop never returns a value no-op for a REAL move (dragEnd contract)', () => {
    const preview = previewCrossColumn(board(), 't1', DONE)
    const result = applyDrop(preview, 't1', DONE)
    expect(result.status).toBe(DONE)
    expect(result.sortOrder).not.toBeNull()
    expect(result.activeId).toBe('t1')
  })
})
