import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prioritizePointerWithin } from '@/components/kanban/collision'

/**
 * T1 (drag UX fix) — the composed collision strategy: a pointer inside a
 * column targets THAT column (never a card of another column), columns beat
 * cards in the closestCorners fallback, and the args are forwarded untouched
 * to dnd-kit's strategies. dnd-kit's own geometry math is stubbed at the
 * module boundary; OUR ordering logic is the test surface.
 */

const COLUMNS = ['TODO', 'IN_PROGRESS', 'DONE']

type Collision = { id: string }
type CollisionArgs = Parameters<ReturnType<typeof prioritizePointerWithin>>[0]

const pointerWithin = vi.fn<() => Collision[] | null>()
const closestCorners = vi.fn<() => Collision[] | null>()

vi.mock('@dnd-kit/core', () => ({
  pointerWithin: (...a: unknown[]) => pointerWithin(...(a as [])),
  closestCorners: (...a: unknown[]) => closestCorners(...(a as [])),
}))

function makeArgs(): CollisionArgs {
  return { pointerX: 1 } as unknown as CollisionArgs
}

const detection = prioritizePointerWithin(COLUMNS)

beforeEach(() => {
  pointerWithin.mockReset()
  closestCorners.mockReset()
})

describe('T1: prioritizePointerWithin (drag collision fix)', () => {
  it('pointer inside the In Progress column → that column is the TOP collision', () => {
    pointerWithin.mockReturnValue([{ id: 'tick_9' }, { id: 'IN_PROGRESS' }])
    const result = detection(makeArgs())
    expect(result?.[0]?.id).toBe('IN_PROGRESS')
    expect(result?.map((c) => c.id)).toEqual(['IN_PROGRESS', 'tick_9'])
    expect(closestCorners).not.toHaveBeenCalled()
  })

  it('pointer over a card only (inside its column) → card wins over nothing else', () => {
    pointerWithin.mockReturnValue([{ id: 'tick_3' }])
    const result = detection(makeArgs())
    expect(result?.map((c) => c.id)).toEqual(['tick_3'])
  })

  it('pointer in an EMPTY area of a column (no card hits) → the column itself is returned', () => {
    pointerWithin.mockReturnValue([{ id: 'DONE' }])
    const result = detection(makeArgs())
    expect(result?.[0]?.id).toBe('DONE')
  })

  it('no pointer overlap (keyboard drag) → closestCorners fallback with columns first', () => {
    pointerWithin.mockReturnValue([])
    closestCorners.mockReturnValue([{ id: 'tick_1' }, { id: 'TODO' }, { id: 'tick_2' }])
    const result = detection(makeArgs())
    expect(closestCorners).toHaveBeenCalledTimes(1)
    expect(result?.map((c) => c.id)).toEqual(['TODO', 'tick_1', 'tick_2'])
  })

  it('fallback: no collisions at all → empty/null passthrough (no crash)', () => {
    pointerWithin.mockReturnValue([])
    closestCorners.mockReturnValue([])
    expect(detection(makeArgs())).toEqual([])
    closestCorners.mockReturnValue(null)
    expect(detection(makeArgs())).toBeNull()
  })

  it('args are forwarded untouched to both strategies', () => {
    pointerWithin.mockReturnValue(null)
    closestCorners.mockReturnValue([])
    const args = makeArgs()
    detection(args)
    expect(pointerWithin).toHaveBeenCalledWith(args)
    expect(closestCorners).toHaveBeenCalledWith(args)
  })
})
