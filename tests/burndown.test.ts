import { describe, it, expect } from 'vitest'
import { StatusType } from '@/types/enums'
import {
  buildBurndown,
  idealAt,
  summarizeVelocity,
  type BurndownEvent,
  type BurndownInput,
  type BurndownTicketState,
} from '@/lib/burndown'

const SPAN = { startsAt: '2026-03-02', endsAt: '2026-03-08' }

function ticket(overrides: Partial<BurndownTicketState> = {}): BurndownTicketState {
  return {
    id: overrides.id ?? 't1',
    inCycle: overrides.inCycle ?? true,
    statusType: overrides.statusType ?? StatusType.UNSTARTED,
    estimate: overrides.estimate ?? null,
    createdAt: overrides.createdAt ?? null,
  }
}

function run(overrides: Partial<BurndownInput> = {}) {
  return buildBurndown({
    ...SPAN,
    today: '2026-03-08',
    unit: 'tickets',
    tickets: [],
    events: [],
    ...overrides,
  })
}

function completedOn(id: string, day: string, from = StatusType.STARTED): BurndownEvent {
  return {
    ticket: id,
    field: 'status',
    at: `${day}T10:00:00.000Z`,
    fromStatusType: from,
    toStatusType: StatusType.COMPLETED,
  }
}

describe('buildBurndown', () => {
  it('covers every day of the cycle span', () => {
    const series = run()
    expect(series.days).toHaveLength(7)
    expect(series.days[0].date).toBe('2026-03-02')
    expect(series.days[6].date).toBe('2026-03-08')
  })

  it('holds remaining flat when nothing has been finished', () => {
    const series = run({ tickets: [ticket({ id: 'a' }), ticket({ id: 'b' })] })
    expect(series.days.map((d) => d.remaining)).toEqual([2, 2, 2, 2, 2, 2, 2])
    expect(series.committed).toBe(2)
    expect(series.completed).toBe(0)
  })

  it('burns work down on the day it was actually finished, not before', () => {
    const series = run({
      tickets: [
        ticket({ id: 'a', statusType: StatusType.COMPLETED }),
        ticket({ id: 'b', statusType: StatusType.COMPLETED }),
      ],
      events: [completedOn('a', '2026-03-04'), completedOn('b', '2026-03-07')],
    })

    expect(series.days.map((d) => d.remaining)).toEqual([2, 2, 1, 1, 1, 0, 0])
    expect(series.days.map((d) => d.completed)).toEqual([0, 0, 1, 1, 1, 2, 2])
    expect(series.days.every((d) => d.scope === 2)).toBe(true)
  })

  it('raises scope on the day a ticket was added to the cycle', () => {
    const series = run({
      tickets: [ticket({ id: 'a' }), ticket({ id: 'late' })],
      events: [
        {
          ticket: 'late',
          field: 'cycle',
          at: '2026-03-05T09:00:00.000Z',
          fromInCycle: false,
          toInCycle: true,
        },
      ],
    })

    expect(series.days.map((d) => d.scope)).toEqual([1, 1, 1, 2, 2, 2, 2])
    expect(series.committed).toBe(1)
  })

  it('drops scope on the day a ticket was pulled out of the cycle', () => {
    const series = run({
      tickets: [ticket({ id: 'a' }), ticket({ id: 'gone', inCycle: false })],
      events: [
        {
          ticket: 'gone',
          field: 'cycle',
          at: '2026-03-06T09:00:00.000Z',
          fromInCycle: true,
          toInCycle: false,
        },
      ],
    })

    expect(series.days.map((d) => d.scope)).toEqual([2, 2, 2, 2, 1, 1, 1])
  })

  it('reopening a ticket puts the work back', () => {
    const series = run({
      tickets: [ticket({ id: 'a', statusType: StatusType.STARTED })],
      events: [
        completedOn('a', '2026-03-03'),
        {
          ticket: 'a',
          field: 'status',
          at: '2026-03-06T10:00:00.000Z',
          fromStatusType: StatusType.COMPLETED,
          toStatusType: StatusType.STARTED,
        },
      ],
    })

    expect(series.days.map((d) => d.remaining)).toEqual([1, 0, 0, 0, 1, 1, 1])
  })

  it('leaves cancelled work out of scope entirely', () => {
    const series = run({
      tickets: [ticket({ id: 'a' }), ticket({ id: 'x', statusType: StatusType.CANCELLED })],
    })

    expect(series.days.every((d) => d.scope === 1)).toBe(true)
    expect(series.scope).toBe(1)
  })

  it('weighs by estimate when the project counts points', () => {
    const series = run({
      unit: 'points',
      tickets: [
        ticket({ id: 'a', estimate: 5, statusType: StatusType.COMPLETED }),
        ticket({ id: 'b', estimate: 3 }),
      ],
      events: [completedOn('a', '2026-03-05')],
    })

    expect(series.days.map((d) => d.remaining)).toEqual([8, 8, 8, 3, 3, 3, 3])
    expect(series.days.map((d) => d.completed)).toEqual([0, 0, 0, 5, 5, 5, 5])
    expect(series.committed).toBe(8)
  })

  it('uses the estimate as it stood on the day, not the one it carries now', () => {
    const series = run({
      unit: 'points',
      tickets: [ticket({ id: 'a', estimate: 8 })],
      events: [
        {
          ticket: 'a',
          field: 'estimate',
          at: '2026-03-06T12:00:00.000Z',
          fromEstimate: 2,
          toEstimate: 8,
        },
      ],
    })

    expect(series.days.map((d) => d.scope)).toEqual([2, 2, 2, 2, 8, 8, 8])
  })

  it('counts unestimated tickets so the chart can admit what it is missing', () => {
    const series = run({
      unit: 'points',
      tickets: [ticket({ id: 'a', estimate: 5 }), ticket({ id: 'b' }), ticket({ id: 'c' })],
    })

    expect(series.unestimated).toBe(2)
    expect(run({ tickets: [ticket({ id: 'b' })] }).unestimated).toBe(0)
  })

  it('leaves days the cycle has not reached as null rather than zero', () => {
    const series = run({ today: '2026-03-04', tickets: [ticket({ id: 'a' })] })

    expect(series.days.map((d) => d.remaining)).toEqual([1, 1, 1, null, null, null, null])
    expect(series.days.every((d) => typeof d.ideal === 'number')).toBe(true)
  })

  it('plots nothing yet for a cycle that has not started', () => {
    const series = run({ today: '2026-02-20', tickets: [ticket({ id: 'a' })] })
    expect(series.days.every((d) => d.remaining === null)).toBe(true)
  })

  it('keeps a ticket out of scope on the days before it existed', () => {
    const series = run({
      tickets: [
        ticket({ id: 'a' }),
        ticket({ id: 'later', createdAt: '2026-03-05T14:00:00.000Z' }),
      ],
    })

    expect(series.days.map((d) => d.scope)).toEqual([1, 1, 1, 2, 2, 2, 2])
    expect(series.committed).toBe(1)
  })

  it('counts a ticket created before the cycle from the first day', () => {
    const series = run({
      tickets: [ticket({ id: 'a', createdAt: '2026-02-01T09:00:00.000Z' })],
    })
    expect(series.days.every((d) => d.scope === 1)).toBe(true)
  })

  it('ignores events belonging to tickets it was not given', () => {
    const series = run({
      tickets: [ticket({ id: 'a' })],
      events: [completedOn('ghost', '2026-03-04')],
    })
    expect(series.days.map((d) => d.remaining)).toEqual([1, 1, 1, 1, 1, 1, 1])
  })
})

describe('idealAt', () => {
  it('runs from the committed total down to zero across the span', () => {
    expect(idealAt(10, 0, 5)).toBe(10)
    expect(idealAt(10, 4, 5)).toBe(0)
    expect(idealAt(10, 2, 5)).toBe(5)
  })

  it('handles a one-day cycle without dividing by zero', () => {
    expect(idealAt(10, 0, 1)).toBe(10)
    expect(idealAt(10, 1, 1)).toBe(0)
  })
})

describe('summarizeVelocity', () => {
  const entries = [
    { cycleId: '1', name: 'Cycle 1', number: 1, committed: 10, completed: 8 },
    { cycleId: '2', name: 'Cycle 2', number: 2, committed: 12, completed: 12 },
    { cycleId: '3', name: 'Cycle 3', number: 3, committed: 10, completed: 4 },
  ]

  it('averages what was actually completed', () => {
    expect(summarizeVelocity('points', entries).average).toBe(8)
  })

  it('reports how much of what was committed got done', () => {
    expect(summarizeVelocity('points', entries).deliveryRate).toBe(75)
  })

  it('keeps an empty cycle out of the average instead of letting it drag', () => {
    const withEmpty = [...entries, { cycleId: '4', name: 'Cycle 4', number: 4, committed: 0, completed: 0 }]
    expect(summarizeVelocity('points', withEmpty).average).toBe(8)
    expect(summarizeVelocity('points', withEmpty).entries).toHaveLength(4)
  })

  it('only looks back over the window', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      cycleId: String(i),
      name: `Cycle ${i}`,
      number: i,
      committed: 10,
      completed: i,
    }))
    const summary = summarizeVelocity('points', many, 3)
    expect(summary.entries.map((e) => e.number)).toEqual([7, 8, 9])
    expect(summary.average).toBe(8)
  })

  it('has no delivery rate when nothing was ever committed', () => {
    expect(summarizeVelocity('tickets', []).deliveryRate).toBeNull()
    expect(summarizeVelocity('tickets', []).average).toBe(0)
  })
})
