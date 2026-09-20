import { describe, it, expect } from 'vitest'
import {
  findStatusByKey,
  legacyKeyFor,
  slugifyKey,
  sortStatuses,
  statusIdOf,
  statusKeyOf,
} from '@/lib/workflow'
import { DEFAULT_STATUSES, StatusType, TicketStatus } from '@/types/enums'
import type { Status, Ticket } from '@/payload-types'

const status = (id: string, key: string, name: string, order: number, type: StatusType): Status =>
  ({ id, key, name, order, type }) as unknown as Status

const workflow = (): Status[] => [
  status('s3', 'done', 'Done', 3000, StatusType.COMPLETED),
  status('s1', 'todo', 'Todo', 1000, StatusType.UNSTARTED),
  status('s2', 'in_progress', 'In Progress', 2000, StatusType.STARTED),
]

describe('slugifyKey', () => {
  it('lowercases and underscores a display name', () => {
    expect(slugifyKey('In Review')).toBe('in_review')
  })

  it('collapses runs of punctuation and trims the edges', () => {
    expect(slugifyKey('  Ready -- for   QA!  ')).toBe('ready_for_qa')
  })

  it('leaves an already-valid key untouched', () => {
    expect(slugifyKey('in_progress')).toBe('in_progress')
  })
})

describe('legacyKeyFor', () => {
  it('maps every legacy enum value to a default status key', () => {
    for (const spec of DEFAULT_STATUSES) {
      expect(legacyKeyFor(spec.legacy)).toBe(spec.key)
    }
  })

  it('maps the three original statuses by name', () => {
    expect(legacyKeyFor(TicketStatus.TODO)).toBe('todo')
    expect(legacyKeyFor(TicketStatus.IN_PROGRESS)).toBe('in_progress')
    expect(legacyKeyFor(TicketStatus.DONE)).toBe('done')
  })

  it('returns null for a value it cannot place, so migration reports it', () => {
    expect(legacyKeyFor('ARCHIVED')).toBeNull()
    expect(legacyKeyFor(undefined)).toBeNull()
    expect(legacyKeyFor({ id: 'abc' })).toBeNull()
  })
})

describe('sortStatuses', () => {
  it('orders by the order field ascending', () => {
    expect(sortStatuses(workflow()).map((s) => s.key)).toEqual(['todo', 'in_progress', 'done'])
  })

  it('breaks ties on name so the order is stable', () => {
    const tied = [
      status('b', 'beta', 'Beta', 1000, StatusType.UNSTARTED),
      status('a', 'alpha', 'Alpha', 1000, StatusType.UNSTARTED),
    ]
    expect(sortStatuses(tied).map((s) => s.key)).toEqual(['alpha', 'beta'])
  })

  it('does not mutate the input', () => {
    const input = workflow()
    sortStatuses(input)
    expect(input.map((s) => s.key)).toEqual(['done', 'todo', 'in_progress'])
  })
})

describe('statusIdOf', () => {
  it('reads the id from a populated relationship', () => {
    const ticket = { status: status('s2', 'in_progress', 'In Progress', 2000, StatusType.STARTED) }
    expect(statusIdOf(ticket as Ticket)).toBe('s2')
  })

  it('passes through an unpopulated id string', () => {
    expect(statusIdOf({ status: 's2' } as unknown as Ticket)).toBe('s2')
  })

  it('returns null when a ticket has no status', () => {
    expect(statusIdOf({ status: null } as unknown as Ticket)).toBeNull()
  })
})

describe('statusKeyOf', () => {
  it('reads the key from a populated relationship', () => {
    const ticket = { status: status('s3', 'done', 'Done', 3000, StatusType.COMPLETED) }
    expect(statusKeyOf(ticket as Ticket)).toBe('done')
  })

  it('returns null for an unpopulated relationship, since the key is not knowable', () => {
    expect(statusKeyOf({ status: 's3' } as unknown as Ticket)).toBeNull()
  })
})

describe('findStatusByKey', () => {
  it('finds a status by its stable key', () => {
    expect(findStatusByKey(workflow(), 'in_progress')?.id).toBe('s2')
  })

  it('returns undefined for a key outside the workflow', () => {
    expect(findStatusByKey(workflow(), 'in_review')).toBeUndefined()
  })
})
