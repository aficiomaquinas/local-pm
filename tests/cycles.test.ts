import { describe, it, expect } from 'vitest'
import {
  addDays,
  alignToStartDay,
  clampLengthWeeks,
  clampUpcomingCount,
  cycleElapsedFraction,
  cycleLengthDays,
  cycleProgress,
  cycleStateAt,
  daysBetween,
  daysRemaining,
  defaultCycleName,
  isElapsed,
  isOpenStatusType,
  MAX_CYCLES_PER_RUN,
  planMissingCycles,
  sortCycles,
  spanFrom,
  toIsoDate,
  weekdayOf,
  type CyclePlan,
  type ProvisionSettings,
} from '@/lib/cycles'
import { StatusType } from '@/types/enums'

const settings = (overrides: Partial<ProvisionSettings> = {}): ProvisionSettings => ({
  lengthWeeks: 2,
  startDay: 1,
  upcomingCount: 2,
  ...overrides,
})

describe('toIsoDate', () => {
  it('passes a plain day through untouched', () => {
    expect(toIsoDate('2026-09-21')).toBe('2026-09-21')
  })

  it('takes the UTC day from a timestamp', () => {
    expect(toIsoDate('2026-09-21T23:30:00.000Z')).toBe('2026-09-21')
  })

  it('reads a Date in UTC', () => {
    expect(toIsoDate(new Date(Date.UTC(2026, 8, 21, 12)))).toBe('2026-09-21')
  })

  it('returns null for empty and unparseable values', () => {
    expect(toIsoDate(null)).toBeNull()
    expect(toIsoDate('')).toBeNull()
    expect(toIsoDate('not a date')).toBeNull()
  })
})

describe('day arithmetic', () => {
  it('adds and subtracts across a month boundary', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
  })

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })

  it('counts days between two dates', () => {
    expect(daysBetween('2026-09-21', '2026-10-04')).toBe(13)
    expect(daysBetween('2026-10-04', '2026-09-21')).toBe(-13)
  })

  it('reads the UTC weekday', () => {
    expect(weekdayOf('2026-09-21')).toBe(1)
    expect(weekdayOf('2026-09-20')).toBe(0)
  })
})

describe('alignToStartDay', () => {
  it('leaves a date that already falls on the start day', () => {
    expect(alignToStartDay('2026-09-21', 1)).toBe('2026-09-21')
  })

  it('rolls back to the most recent start day', () => {
    expect(alignToStartDay('2026-09-24', 1)).toBe('2026-09-21')
  })

  it('rolls back a full week at most', () => {
    expect(alignToStartDay('2026-09-20', 1)).toBe('2026-09-14')
  })

  it('supports Sunday as day zero', () => {
    expect(alignToStartDay('2026-09-24', 0)).toBe('2026-09-20')
  })

  it('normalises an out-of-range start day', () => {
    expect(alignToStartDay('2026-09-24', 8)).toBe(alignToStartDay('2026-09-24', 1))
    expect(alignToStartDay('2026-09-24', -6)).toBe(alignToStartDay('2026-09-24', 1))
  })
})

describe('clamping', () => {
  it('keeps the cycle length inside the supported range', () => {
    expect(clampLengthWeeks(0)).toBe(1)
    expect(clampLengthWeeks(99)).toBe(8)
    expect(clampLengthWeeks(3)).toBe(3)
  })

  it('falls back to the default for a missing length', () => {
    expect(clampLengthWeeks(null)).toBe(2)
    expect(clampLengthWeeks(undefined)).toBe(2)
    expect(clampLengthWeeks(Number.NaN)).toBe(2)
  })

  it('allows zero upcoming cycles but not a negative count', () => {
    expect(clampUpcomingCount(0)).toBe(0)
    expect(clampUpcomingCount(-3)).toBe(0)
    expect(clampUpcomingCount(99)).toBe(12)
  })

  it('turns weeks into days', () => {
    expect(cycleLengthDays(2)).toBe(14)
    expect(cycleLengthDays(1)).toBe(7)
  })
})

describe('spanFrom', () => {
  it('ends on the last day of the cycle, inclusive', () => {
    expect(spanFrom('2026-09-21', 2)).toEqual({ startsAt: '2026-09-21', endsAt: '2026-10-04' })
  })

  it('makes a one week cycle seven days long', () => {
    const span = spanFrom('2026-09-21', 1)
    expect(span.endsAt).toBe('2026-09-27')
    expect(daysBetween(span.startsAt, span.endsAt) + 1).toBe(7)
  })
})

describe('planMissingCycles', () => {
  it('starts the first cycle on the configured weekday, not today', () => {
    const plans = planMissingCycles([], settings(), '2026-09-24')
    expect(plans[0]).toEqual({ number: 1, startsAt: '2026-09-21', endsAt: '2026-10-04' })
  })

  it('creates the active cycle plus the requested upcoming ones', () => {
    const plans = planMissingCycles([], settings({ upcomingCount: 2 }), '2026-09-21')
    expect(plans.map((p) => p.number)).toEqual([1, 2, 3])
    expect(plans[1].startsAt).toBe('2026-10-05')
    expect(plans[2].startsAt).toBe('2026-10-19')
  })

  it('leaves no gap between consecutive cycles', () => {
    const plans = planMissingCycles([], settings(), '2026-09-21')
    for (let i = 1; i < plans.length; i += 1) {
      expect(plans[i].startsAt).toBe(addDays(plans[i - 1].endsAt, 1))
    }
  })

  it('honours an upcoming count of zero', () => {
    const plans = planMissingCycles([], settings({ upcomingCount: 0 }), '2026-09-21')
    expect(plans.map((p) => p.number)).toEqual([1])
  })

  it('is idempotent once the cycles exist', () => {
    const first = planMissingCycles([], settings(), '2026-09-21')
    expect(planMissingCycles(first, settings(), '2026-09-21')).toEqual([])
  })

  it('never re-dates or renumbers an existing cycle', () => {
    const existing: CyclePlan[] = [{ number: 1, startsAt: '2026-09-21', endsAt: '2026-10-04' }]
    const plans = planMissingCycles(existing, settings(), '2026-09-21')
    expect(plans.every((plan) => plan.number > 1)).toBe(true)
    expect(existing[0]).toEqual({ number: 1, startsAt: '2026-09-21', endsAt: '2026-10-04' })
  })

  it('appends after the last cycle rather than after today', () => {
    const existing: CyclePlan[] = [{ number: 7, startsAt: '2026-09-21', endsAt: '2026-10-04' }]
    const plans = planMissingCycles(existing, settings(), '2026-09-28')
    expect(plans.map((p) => p.number)).toEqual([8, 9])
    expect(plans[0].startsAt).toBe('2026-10-05')
  })

  it('applies a changed length only to cycles created afterwards', () => {
    const existing: CyclePlan[] = [{ number: 1, startsAt: '2026-09-21', endsAt: '2026-10-04' }]
    const plans = planMissingCycles(existing, settings({ lengthWeeks: 1 }), '2026-09-21')
    expect(plans[0]).toEqual({ number: 2, startsAt: '2026-10-05', endsAt: '2026-10-11' })
    expect(plans[1]).toEqual({ number: 3, startsAt: '2026-10-12', endsAt: '2026-10-18' })
  })

  it('backfills the gap when nothing ran for months', () => {
    const existing: CyclePlan[] = [{ number: 1, startsAt: '2026-01-05', endsAt: '2026-01-18' }]
    const plans = planMissingCycles(existing, settings(), '2026-03-02')
    const all = [...existing, ...plans]

    expect(plans[0].startsAt).toBe('2026-01-19')
    const active = all.find((c) => c.startsAt <= '2026-03-02' && c.endsAt >= '2026-03-02')
    expect(active).toBeDefined()
    expect(all.filter((c) => c.startsAt > (active as CyclePlan).endsAt)).toHaveLength(2)
  })

  it('does not exceed the per-run creation cap', () => {
    const existing: CyclePlan[] = [{ number: 1, startsAt: '2000-01-03', endsAt: '2000-01-16' }]
    const plans = planMissingCycles(existing, settings(), '2026-09-21')
    expect(plans.length).toBe(MAX_CYCLES_PER_RUN)
  })

  it('accepts existing cycles in any order', () => {
    const existing: CyclePlan[] = [
      { number: 2, startsAt: '2026-10-05', endsAt: '2026-10-18' },
      { number: 1, startsAt: '2026-09-21', endsAt: '2026-10-04' },
    ]
    const plans = planMissingCycles(existing, settings(), '2026-09-21')
    expect(plans.map((p) => p.number)).toEqual([3])
  })
})

describe('sortCycles', () => {
  it('orders by cycle number without mutating the input', () => {
    const input = [{ number: 3 }, { number: 1 }, { number: 2 }]
    expect(sortCycles(input).map((c) => c.number)).toEqual([1, 2, 3])
    expect(input[0].number).toBe(3)
  })
})

describe('cycleStateAt', () => {
  const span = { startsAt: '2026-09-21', endsAt: '2026-10-04' }

  it('is upcoming before the first day', () => {
    expect(cycleStateAt(span, '2026-09-20')).toBe('upcoming')
  })

  it('is active on the first and last day', () => {
    expect(cycleStateAt(span, '2026-09-21')).toBe('active')
    expect(cycleStateAt(span, '2026-10-04')).toBe('active')
  })

  it('is completed the day after it ends', () => {
    expect(cycleStateAt(span, '2026-10-05')).toBe('completed')
  })

  it('is completed once it has been closed, even mid-cycle', () => {
    expect(cycleStateAt({ ...span, completedAt: '2026-09-25T10:00:00.000Z' }, '2026-09-25')).toBe(
      'completed',
    )
  })

  it('reports whether a cycle has elapsed', () => {
    expect(isElapsed(span, '2026-10-04')).toBe(false)
    expect(isElapsed(span, '2026-10-05')).toBe(true)
  })
})

describe('daysRemaining', () => {
  const span = { startsAt: '2026-09-21', endsAt: '2026-10-04' }

  it('counts the current day as remaining', () => {
    expect(daysRemaining(span, '2026-10-04')).toBe(1)
    expect(daysRemaining(span, '2026-09-21')).toBe(14)
  })

  it('is zero once the cycle has ended', () => {
    expect(daysRemaining(span, '2026-10-05')).toBe(0)
  })

  it('reports the full length for a cycle that has not started', () => {
    expect(daysRemaining(span, '2026-09-01')).toBe(14)
  })
})

describe('cycleElapsedFraction', () => {
  const span = { startsAt: '2026-09-21', endsAt: '2026-10-04' }

  it('is zero before the cycle starts', () => {
    expect(cycleElapsedFraction(span, '2026-09-20')).toBe(0)
  })

  it('is one on the last day', () => {
    expect(cycleElapsedFraction(span, '2026-10-04')).toBe(1)
  })

  it('is half way through the middle day', () => {
    expect(cycleElapsedFraction(span, '2026-09-27')).toBeCloseTo(0.5, 5)
  })

  it('never exceeds one after the cycle ends', () => {
    expect(cycleElapsedFraction(span, '2026-12-01')).toBe(1)
  })
})

describe('isOpenStatusType', () => {
  it('treats backlog, unstarted and started as unfinished', () => {
    expect(isOpenStatusType(StatusType.BACKLOG)).toBe(true)
    expect(isOpenStatusType(StatusType.UNSTARTED)).toBe(true)
    expect(isOpenStatusType(StatusType.STARTED)).toBe(true)
  })

  it('treats completed and cancelled as finished', () => {
    expect(isOpenStatusType(StatusType.COMPLETED)).toBe(false)
    expect(isOpenStatusType(StatusType.CANCELLED)).toBe(false)
  })

  it('treats an unknown status as unfinished so work is never dropped', () => {
    expect(isOpenStatusType(null)).toBe(true)
    expect(isOpenStatusType(undefined)).toBe(true)
  })
})

describe('cycleProgress', () => {
  it('counts each status type', () => {
    const progress = cycleProgress([
      StatusType.COMPLETED,
      StatusType.COMPLETED,
      StatusType.STARTED,
      StatusType.UNSTARTED,
      StatusType.BACKLOG,
      StatusType.CANCELLED,
    ])

    expect(progress.total).toBe(6)
    expect(progress.completed).toBe(2)
    expect(progress.started).toBe(1)
    expect(progress.unstarted).toBe(2)
    expect(progress.cancelled).toBe(1)
  })

  it('excludes cancelled work from the percentage', () => {
    expect(cycleProgress([StatusType.COMPLETED, StatusType.CANCELLED]).percent).toBe(100)
  })

  it('is zero for an empty cycle rather than NaN', () => {
    expect(cycleProgress([]).percent).toBe(0)
  })

  it('is zero when every ticket was cancelled', () => {
    expect(cycleProgress([StatusType.CANCELLED]).percent).toBe(0)
  })

  it('rounds to a whole percentage', () => {
    expect(cycleProgress([StatusType.COMPLETED, StatusType.STARTED, StatusType.STARTED]).percent).toBe(33)
  })
})

describe('defaultCycleName', () => {
  it('names a cycle after its number', () => {
    expect(defaultCycleName(4)).toBe('Cycle 4')
  })
})
