import type { Where } from 'payload'
export function ticketSearchWhere(query: string): Where {
  const value = query.trim()
  return value ? { or: [{ title: { like: value } }, { ticketId: { like: value } }] } : {}
}

export function appendTicketSearch(params: URLSearchParams, query: string): void {
  const value = query.trim()
  if (!value) return
  params.set('where[or][0][title][like]', value)
  params.set('where[or][1][ticketId][like]', value)
}
