import { describe, expect, it } from 'vitest'
import { appendTicketSearch, ticketSearchWhere } from '../src/lib/ticket-search'

describe('ticket discovery', () => {
  it('matches titles and keys even for a short search', () => {
    expect(ticketSearchWhere(' A ')).toEqual({
      or: [{ title: { like: 'A' } }, { ticketId: { like: 'A' } }],
    })
  })
  it('preserves other filters and encodes punctuation as data', () => {
    const params = new URLSearchParams({ 'where[project][equals]': 'project-1' })
    appendTicketSearch(params, ' UX-3 & refresh ')
    expect(params.get('where[project][equals]')).toBe('project-1')
    expect(params.get('where[or][0][title][like]')).toBe('UX-3 & refresh')
    expect(params.get('where[or][1][ticketId][like]')).toBe('UX-3 & refresh')
    expect(params.size).toBe(3)
  })
  it('does not filter whitespace-only searches', () => {
    expect(ticketSearchWhere('   ')).toEqual({})
    const params = new URLSearchParams()
    appendTicketSearch(params, ' ')
    expect(params.size).toBe(0)
  })
})
