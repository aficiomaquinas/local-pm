import { describe, it, expect } from 'vitest'
import {
  PROJECT_DATES,
  TICKET_DATES,
  dateOrderError,
  durationInDays,
  pendingDateOrderError,
  toDay,
} from '@/lib/dates'

describe('toDay', () => {
  it('passes a plain day through untouched', () => {
    expect(toDay('2026-03-14')).toBe('2026-03-14')
  })

  it('takes the UTC day out of a full timestamp', () => {
    expect(toDay('2026-03-14T23:30:00.000Z')).toBe('2026-03-14')
  })

  it('reads a Date the same way', () => {
    expect(toDay(new Date('2026-03-14T00:00:00.000Z'))).toBe('2026-03-14')
  })

  it('treats empty and unparseable values as no date', () => {
    expect(toDay(null)).toBeNull()
    expect(toDay(undefined)).toBeNull()
    expect(toDay('')).toBeNull()
    expect(toDay('   ')).toBeNull()
    expect(toDay('not a date')).toBeNull()
    expect(toDay(new Date('nonsense'))).toBeNull()
    expect(toDay({ day: '2026-03-14' })).toBeNull()
  })
})

describe('dateOrderError', () => {
  it('accepts a start before the end', () => {
    expect(dateOrderError('2026-03-01', '2026-03-14', TICKET_DATES)).toBeNull()
  })

  it('accepts a one-day range', () => {
    expect(dateOrderError('2026-03-14', '2026-03-14', TICKET_DATES)).toBeNull()
  })

  it('accepts a half-filled range, since either date alone is valid', () => {
    expect(dateOrderError('2026-03-14', null, TICKET_DATES)).toBeNull()
    expect(dateOrderError(null, '2026-03-14', TICKET_DATES)).toBeNull()
    expect(dateOrderError(null, null, TICKET_DATES)).toBeNull()
  })

  it('names the fix, not just the fault', () => {
    expect(dateOrderError('2026-03-14', '2026-03-01', TICKET_DATES)).toBe(
      'Due date is before the start date. Choose a due date on or after 2026-03-14.',
    )
  })

  it('uses the wording of whichever range it was given', () => {
    expect(dateOrderError('2026-03-14', '2026-03-01', PROJECT_DATES)).toBe(
      'Target date is before the start date. Choose a target date on or after 2026-03-14.',
    )
  })

  it('compares days, not instants, so a later time on the same day still passes', () => {
    expect(
      dateOrderError('2026-03-14T18:00:00.000Z', '2026-03-14T06:00:00.000Z', TICKET_DATES),
    ).toBeNull()
  })
})

describe('pendingDateOrderError', () => {
  it('reads both sides off the incoming data on a create', () => {
    expect(
      pendingDateOrderError(TICKET_DATES, { startDate: '2026-03-14', dueDate: '2026-03-01' }),
    ).toContain('on or after 2026-03-14')
  })

  it('falls back to the stored document for fields a patch left out', () => {
    expect(
      pendingDateOrderError(
        TICKET_DATES,
        { dueDate: '2026-03-01' },
        { startDate: '2026-03-14', dueDate: '2026-03-20' },
      ),
    ).toContain('on or after 2026-03-14')
  })

  it('lets a patch that clears the start date through', () => {
    expect(
      pendingDateOrderError(
        TICKET_DATES,
        { startDate: null },
        { startDate: '2026-03-14', dueDate: '2026-03-01' },
      ),
    ).toBeNull()
  })

  it('validates a project against its own field names', () => {
    expect(
      pendingDateOrderError(
        PROJECT_DATES,
        { targetDate: '2026-01-01' },
        { startDate: '2026-06-01' },
      ),
    ).toContain('target date on or after 2026-06-01')
  })

  it('has nothing to say about a document with no dates', () => {
    expect(pendingDateOrderError(TICKET_DATES, { title: 'No dates here' }, {})).toBeNull()
  })
})

describe('durationInDays', () => {
  it('counts both end days', () => {
    expect(durationInDays('2026-03-01', '2026-03-14')).toBe(14)
  })

  it('calls a single day one day', () => {
    expect(durationInDays('2026-03-14', '2026-03-14')).toBe(1)
  })

  it('spans a month boundary', () => {
    expect(durationInDays('2026-02-27', '2026-03-02')).toBe(4)
  })

  it('refuses to measure a half or reversed range', () => {
    expect(durationInDays('2026-03-14', null)).toBeNull()
    expect(durationInDays(null, '2026-03-14')).toBeNull()
    expect(durationInDays('2026-03-14', '2026-03-01')).toBeNull()
  })
})
