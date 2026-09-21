import { describe, it, expect } from 'vitest'
import { describeRollup, epicIdOf, epicRefOf, rollupEpic, EMPTY_ROLLUP } from '@/lib/epic'
import { StatusType } from '@/types/enums'
import type { Status, Ticket } from '@/payload-types'

const status = (type: StatusType): Status =>
  ({ id: `s-${type}`, key: type.toLowerCase(), name: type, order: 1000, type }) as unknown as Status

const child = (type: StatusType): Pick<Ticket, 'status'> => ({ status: status(type) })

describe('rollupEpic', () => {
  it('reports an all-zero rollup for an epic with no children', () => {
    expect(rollupEpic([])).toEqual(EMPTY_ROLLUP)
  })

  it('counts completed children against every non-cancelled child', () => {
    const rollup = rollupEpic([
      child(StatusType.COMPLETED),
      child(StatusType.COMPLETED),
      child(StatusType.STARTED),
      child(StatusType.UNSTARTED),
    ])

    expect(rollup.total).toBe(4)
    expect(rollup.done).toBe(2)
    expect(rollup.started).toBe(1)
    expect(rollup.counted).toBe(4)
    expect(rollup.open).toBe(2)
    expect(rollup.percent).toBe(50)
  })

  it('leaves cancelled children out of the percentage but keeps them in the total', () => {
    const rollup = rollupEpic([
      child(StatusType.COMPLETED),
      child(StatusType.CANCELLED),
      child(StatusType.CANCELLED),
    ])

    expect(rollup.total).toBe(3)
    expect(rollup.cancelled).toBe(2)
    expect(rollup.counted).toBe(1)
    expect(rollup.percent).toBe(100)
  })

  it('does not divide by zero when every child is cancelled', () => {
    const rollup = rollupEpic([child(StatusType.CANCELLED), child(StatusType.CANCELLED)])

    expect(rollup.counted).toBe(0)
    expect(rollup.percent).toBe(0)
    expect(rollup.open).toBe(0)
  })

  it('treats backlog children as open work', () => {
    const rollup = rollupEpic([child(StatusType.BACKLOG), child(StatusType.COMPLETED)])

    expect(rollup.open).toBe(1)
    expect(rollup.percent).toBe(50)
  })

  it('counts an unresolved status relationship as open rather than done', () => {
    const rollup = rollupEpic([{ status: 'unpopulated-id' }, child(StatusType.COMPLETED)])

    expect(rollup.done).toBe(1)
    expect(rollup.open).toBe(1)
    expect(rollup.percent).toBe(50)
  })

  it('rounds the percentage to a whole number', () => {
    const rollup = rollupEpic([
      child(StatusType.COMPLETED),
      child(StatusType.UNSTARTED),
      child(StatusType.UNSTARTED),
    ])

    expect(rollup.percent).toBe(33)
  })
})

describe('describeRollup', () => {
  it('says so plainly when the epic is empty', () => {
    expect(describeRollup(rollupEpic([]))).toBe('No tickets in this epic yet')
  })

  it('leads with the done count so the state reads without color', () => {
    expect(describeRollup(rollupEpic([child(StatusType.COMPLETED), child(StatusType.UNSTARTED)]))).toBe(
      '1 of 2 done',
    )
  })

  it('mentions in-progress and cancelled work when there is any', () => {
    const rollup = rollupEpic([
      child(StatusType.COMPLETED),
      child(StatusType.STARTED),
      child(StatusType.CANCELLED),
    ])

    expect(describeRollup(rollup)).toBe('1 of 2 done, 1 in progress, 1 cancelled')
  })
})

describe('epicIdOf', () => {
  it('reads an unpopulated relationship', () => {
    expect(epicIdOf({ epic: 'epic-1' } as Ticket)).toBe('epic-1')
  })

  it('reads a populated relationship', () => {
    expect(epicIdOf({ epic: { id: 'epic-2' } } as Ticket)).toBe('epic-2')
  })

  it('returns null when the ticket is not in an epic', () => {
    expect(epicIdOf({ epic: null } as Ticket)).toBeNull()
    expect(epicIdOf({} as Ticket)).toBeNull()
  })
})

describe('epicRefOf', () => {
  it('returns the populated epic document', () => {
    const epic = { id: 'epic-1', title: 'Checkout rewrite' } as Ticket
    expect(epicRefOf({ epic } as Ticket)).toBe(epic)
  })

  it('returns null for an id-only relationship', () => {
    expect(epicRefOf({ epic: 'epic-1' } as Ticket)).toBeNull()
  })
})
