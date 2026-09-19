import { describe, it, expect } from 'vitest'
import {
  applyDrop,
  computeDragResult,
  isRealMove,
  resolveDragTarget,
  resultFromPreview,
} from '@/components/kanban/dragLogic'
import { TicketStatus } from '@/types/enums'
import type { Ticket } from '@/payload-types'

/**
 * Regression table for the two drag defects described in dragLogic.ts:
 *   1. dropping on empty column space persisted sortOrder 0;
 *   2. a drop confirming the live preview was read as a no-op and reverted.
 */

const ticket = (id: string, status: TicketStatus, sortOrder: number): Ticket =>
  ({ id, status, sortOrder, title: `Ticket ${id}` }) as unknown as Ticket

/** a,b,c in TODO; x,y in IN_PROGRESS. */
const board = (): Ticket[] => [
  ticket('a', TicketStatus.TODO, 0),
  ticket('b', TicketStatus.TODO, 1),
  ticket('c', TicketStatus.TODO, 2),
  ticket('x', TicketStatus.IN_PROGRESS, 0),
  ticket('y', TicketStatus.IN_PROGRESS, 1),
]

const find = (tickets: Ticket[], id: string) => tickets.find((t) => t.id === id)!

describe('resolveDragTarget', () => {
  it('resolves a column id to that column, flagged as a column target', () => {
    expect(resolveDragTarget(board(), 'a', TicketStatus.IN_PROGRESS)).toEqual({
      status: TicketStatus.IN_PROGRESS,
      isColumnTarget: true,
    })
  })

  it('resolves a card id to the column that card lives in', () => {
    expect(resolveDragTarget(board(), 'a', 'y')).toEqual({
      status: TicketStatus.IN_PROGRESS,
      isColumnTarget: false,
    })
  })

  it('returns null when dropped on itself or on an unknown id', () => {
    expect(resolveDragTarget(board(), 'a', 'a')).toBeNull()
    expect(resolveDragTarget(board(), 'a', 'nope')).toBeNull()
    expect(resolveDragTarget(board(), 'ghost', 'b')).toBeNull()
  })
})

describe('applyDrop — cross-column onto empty column space', () => {
  it('appends at the end of the target column instead of collapsing to 0', () => {
    // The original bug: overId is the COLUMN id, findIndex returned -1,
    // and sortOrder was persisted as 0 on every such drop.
    const result = applyDrop(board(), 'a', TicketStatus.IN_PROGRESS)

    expect(result.status).toBe(TicketStatus.IN_PROGRESS)
    expect(result.sortOrder).toBe(2) // after x(0) and y(1)
    expect(result.sortOrder).not.toBe(0)
  })

  it('leaves the target column contiguous from 0', () => {
    const result = applyDrop(board(), 'a', TicketStatus.IN_PROGRESS)
    const inProgress = result.tickets
      .filter((t) => t.status === TicketStatus.IN_PROGRESS)
      .map((t) => t.sortOrder)
      .sort((p, q) => (p ?? 0) - (q ?? 0))

    expect(inProgress).toEqual([0, 1, 2])
  })
})

describe('applyDrop — cross-column onto a specific card', () => {
  it('takes the target card slot and pushes the rest down', () => {
    const result = applyDrop(board(), 'a', 'x')

    expect(result.status).toBe(TicketStatus.IN_PROGRESS)
    expect(result.sortOrder).toBe(0)
    expect(find(result.tickets, 'x').sortOrder).toBe(1)
    expect(find(result.tickets, 'y').sortOrder).toBe(2)
  })
})

describe('applyDrop — reordering within one column', () => {
  it('moves a card down and renumbers the column', () => {
    const result = applyDrop(board(), 'a', 'c')

    expect(result.status).toBe(TicketStatus.TODO)
    expect(result.sortOrder).toBe(2)
    expect(find(result.tickets, 'b').sortOrder).toBe(0)
    expect(find(result.tickets, 'c').sortOrder).toBe(1)
  })

  it('does not disturb the other column', () => {
    const result = applyDrop(board(), 'a', 'c')
    expect(find(result.tickets, 'x').sortOrder).toBe(0)
    expect(find(result.tickets, 'y').sortOrder).toBe(1)
  })
})

describe('computeDragResult — no-ops', () => {
  it('reports a structural no-op for a drop on itself', () => {
    const result = computeDragResult(board(), 'a', 'a')
    expect(result.status).toBeNull()
    expect(result.sortOrder).toBeNull()
    expect(result.activeId).toBeNull()
  })

  it('reports a value no-op when the card lands on its current position', () => {
    // 'a' is already at index 0 of TODO; dropping it on itself-as-slot changes nothing.
    const state = board()
    const result = computeDragResult(state, 'a', 'a')
    expect(result.tickets).toBe(state) // state reference preserved
  })
})

describe('resultFromPreview — dnd-kit reports over === active after a preview move', () => {
  it('reads the card position the preview already applied', () => {
    // Once handleDragOver moves the card into the target slot, the card is the
    // droppable nearest the pointer, so dnd-kit names IT as `over` at drop
    // time. Treating that as a self-drop skips the PATCH and the move is lost.
    const previewed = applyDrop(board(), 'a', TicketStatus.IN_PROGRESS).tickets
    const result = resultFromPreview(previewed, 'a')

    expect(result.activeId).toBe('a')
    expect(result.status).toBe(TicketStatus.IN_PROGRESS)
    expect(result.sortOrder).toBe(2)
  })

  it('is a real move when compared against the drag origin', () => {
    const previewed = applyDrop(board(), 'a', TicketStatus.IN_PROGRESS).tickets
    const result = resultFromPreview(previewed, 'a')

    expect(isRealMove(result, { status: TicketStatus.TODO, sortOrder: 0 })).toBe(true)
  })

  it('is NOT a real move when the preview never left the origin', () => {
    const result = resultFromPreview(board(), 'a')
    expect(isRealMove(result, { status: TicketStatus.TODO, sortOrder: 0 })).toBe(false)
  })

  it('returns a no-op for an unknown card', () => {
    const result = resultFromPreview(board(), 'ghost')
    expect(result.status).toBeNull()
  })
})

describe('isRealMove — decided against the drag ORIGIN, not the preview', () => {
  it('is true when the drop differs from where the server thinks the card is', () => {
    const result = applyDrop(board(), 'a', TicketStatus.IN_PROGRESS)
    const origin = { status: TicketStatus.TODO, sortOrder: 0 }
    expect(isRealMove(result, origin)).toBe(true)
  })

  it('stays true even when handleDragOver already advanced state to the drop position', () => {
    // This is the second bug: the preview moves the card mid-drag, so comparing
    // the drop against CURRENT state reads as "nothing changed" and the PATCH
    // is skipped. Comparing against the drag origin keeps it a real move.
    const previewed = applyDrop(board(), 'a', TicketStatus.IN_PROGRESS).tickets
    const result = applyDrop(previewed, 'a', TicketStatus.IN_PROGRESS)
    const origin = { status: TicketStatus.TODO, sortOrder: 0 }

    expect(isRealMove(result, origin)).toBe(true)
  })

  it('is false when the drop lands exactly on the origin', () => {
    const result = applyDrop(board(), 'a', 'a')
    expect(isRealMove(result, { status: TicketStatus.TODO, sortOrder: 0 })).toBe(false)
  })

  it('treats an unknown origin as a real move so client and server reconcile', () => {
    const result = applyDrop(board(), 'a', TicketStatus.DONE)
    expect(isRealMove(result, null)).toBe(true)
  })
})
