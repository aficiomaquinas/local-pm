import { describe, it, expect } from 'vitest'
import {
  applyDrop,
  computeDragResult,
  isRealMove,
  resolveDragTarget,
  resultFromPreview,
} from '@/components/kanban/dragLogic'
import { TicketStatus } from '@/types/enums'

const COLUMN_IDS: string[] = [
  TicketStatus.TODO,
  TicketStatus.IN_PROGRESS,
  TicketStatus.DONE,
]
import type { Ticket } from '@/payload-types'

const ticket = (id: string, status: TicketStatus, sortOrder: number): Ticket =>
  ({ id, status, sortOrder, title: `Ticket ${id}` }) as unknown as Ticket

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
    expect(resolveDragTarget(board(), 'a', TicketStatus.IN_PROGRESS, COLUMN_IDS)).toEqual({
      status: TicketStatus.IN_PROGRESS,
      isColumnTarget: true,
    })
  })

  it('resolves a card id to the column that card lives in', () => {
    expect(resolveDragTarget(board(), 'a', 'y', COLUMN_IDS)).toEqual({
      status: TicketStatus.IN_PROGRESS,
      isColumnTarget: false,
    })
  })

  it('returns null when dropped on itself or on an unknown id', () => {
    expect(resolveDragTarget(board(), 'a', 'a', COLUMN_IDS)).toBeNull()
    expect(resolveDragTarget(board(), 'a', 'nope', COLUMN_IDS)).toBeNull()
    expect(resolveDragTarget(board(), 'ghost', 'b', COLUMN_IDS)).toBeNull()
  })
})

describe('applyDrop — cross-column onto empty column space', () => {
  it('appends at the end of the target column instead of collapsing to 0', () => {
    const result = applyDrop(board(), 'a', TicketStatus.IN_PROGRESS, COLUMN_IDS)

    expect(result.status).toBe(TicketStatus.IN_PROGRESS)
    expect(result.sortOrder).toBe(2)
    expect(result.sortOrder).not.toBe(0)
  })

  it('leaves the target column contiguous from 0', () => {
    const result = applyDrop(board(), 'a', TicketStatus.IN_PROGRESS, COLUMN_IDS)
    const inProgress = result.tickets
      .filter((t) => t.status === TicketStatus.IN_PROGRESS)
      .map((t) => t.sortOrder)
      .sort((p, q) => (p ?? 0) - (q ?? 0))

    expect(inProgress).toEqual([0, 1, 2])
  })
})

describe('applyDrop — cross-column onto a specific card', () => {
  it('takes the target card slot and pushes the rest down', () => {
    const result = applyDrop(board(), 'a', 'x', COLUMN_IDS)

    expect(result.status).toBe(TicketStatus.IN_PROGRESS)
    expect(result.sortOrder).toBe(0)
    expect(find(result.tickets, 'x').sortOrder).toBe(1)
    expect(find(result.tickets, 'y').sortOrder).toBe(2)
  })
})

describe('applyDrop — reordering within one column', () => {
  it('moves a card down and renumbers the column', () => {
    const result = applyDrop(board(), 'a', 'c', COLUMN_IDS)

    expect(result.status).toBe(TicketStatus.TODO)
    expect(result.sortOrder).toBe(2)
    expect(find(result.tickets, 'b').sortOrder).toBe(0)
    expect(find(result.tickets, 'c').sortOrder).toBe(1)
  })

  it('does not disturb the other column', () => {
    const result = applyDrop(board(), 'a', 'c', COLUMN_IDS)
    expect(find(result.tickets, 'x').sortOrder).toBe(0)
    expect(find(result.tickets, 'y').sortOrder).toBe(1)
  })
})

describe('computeDragResult — no-ops', () => {
  it('reports a structural no-op for a drop on itself', () => {
    const result = computeDragResult(board(), 'a', 'a', COLUMN_IDS)
    expect(result.status).toBeNull()
    expect(result.sortOrder).toBeNull()
    expect(result.activeId).toBeNull()
  })

  it('reports a value no-op when the card lands on its current position', () => {
    const state = board()
    const result = computeDragResult(state, 'a', 'a', COLUMN_IDS)
    expect(result.tickets).toBe(state)
  })
})

describe('resultFromPreview — dnd-kit reports over === active after a preview move', () => {
  it('reads the card position the preview already applied', () => {
    const previewed = applyDrop(board(), 'a', TicketStatus.IN_PROGRESS, COLUMN_IDS).tickets
    const result = resultFromPreview(previewed, 'a')

    expect(result.activeId).toBe('a')
    expect(result.status).toBe(TicketStatus.IN_PROGRESS)
    expect(result.sortOrder).toBe(2)
  })

  it('is a real move when compared against the drag origin', () => {
    const previewed = applyDrop(board(), 'a', TicketStatus.IN_PROGRESS, COLUMN_IDS).tickets
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
    const result = applyDrop(board(), 'a', TicketStatus.IN_PROGRESS, COLUMN_IDS)
    const origin = { status: TicketStatus.TODO, sortOrder: 0 }
    expect(isRealMove(result, origin)).toBe(true)
  })

  it('stays true even when handleDragOver already advanced state to the drop position', () => {
    const previewed = applyDrop(board(), 'a', TicketStatus.IN_PROGRESS, COLUMN_IDS).tickets
    const result = applyDrop(previewed, 'a', TicketStatus.IN_PROGRESS, COLUMN_IDS)
    const origin = { status: TicketStatus.TODO, sortOrder: 0 }

    expect(isRealMove(result, origin)).toBe(true)
  })

  it('is false when the drop lands exactly on the origin', () => {
    const result = applyDrop(board(), 'a', 'a', COLUMN_IDS)
    expect(isRealMove(result, { status: TicketStatus.TODO, sortOrder: 0 })).toBe(false)
  })

  it('treats an unknown origin as a real move so client and server reconcile', () => {
    const result = applyDrop(board(), 'a', TicketStatus.DONE, COLUMN_IDS)
    expect(isRealMove(result, null)).toBe(true)
  })
})
