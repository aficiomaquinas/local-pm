import type { Payload } from 'payload'
import type { Cycle, Project } from '@/payload-types'
import { toIsoDate, type IsoDate } from '@/lib/cycles'
import { estimateSettingsOf, normalizeEstimate, unitFor, type EstimateUnit } from '@/lib/estimates'
import {
  buildBurndown,
  summarizeVelocity,
  type BurndownEvent,
  type BurndownSeries,
  type BurndownTicketState,
  type VelocityEntry,
  type VelocitySummary,
} from '@/lib/burndown'

const REPLAYED_FIELDS = ['status', 'cycle', 'estimate']
const TICKET_LIMIT = 2000
const EVENT_LIMIT = 5000

interface StatusLookup {
  typeById: Map<string, string>
  typeByName: Map<string, string>
}

async function loadStatusLookup(payload: Payload): Promise<StatusLookup> {
  const found = await payload.find({
    collection: 'statuses',
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })

  const typeById = new Map<string, string>()
  const typeByName = new Map<string, string>()

  for (const status of found.docs) {
    const type = typeof status.type === 'string' ? status.type : null
    if (!type) continue
    typeById.set(String(status.id), type)
    if (typeof status.name === 'string') typeByName.set(status.name.trim().toLowerCase(), type)
  }

  return { typeById, typeByName }
}

function statusTypeOf(lookup: StatusLookup, id: unknown, name: unknown): string | null {
  if (typeof id === 'string' && id) {
    const byId = lookup.typeById.get(id)
    if (byId) return byId
  }
  if (typeof name === 'string' && name.trim()) {
    return lookup.typeByName.get(name.trim().toLowerCase()) ?? null
  }
  return null
}

function matchesCycle(cycle: Cycle, id: unknown, name: unknown): boolean {
  if (typeof id === 'string' && id) return id === String(cycle.id)
  if (typeof name === 'string' && name.trim()) return name.trim() === cycle.name
  return false
}

function idOf(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    const id = (value as { id: unknown }).id
    return id === null || id === undefined ? null : String(id)
  }
  return null
}

async function ticketsThatLeft(payload: Payload, cycle: Cycle): Promise<string[]> {
  const found = await payload.find({
    collection: 'activity',
    where: {
      and: [
        { field: { equals: 'cycle' } },
        {
          or: [{ fromId: { equals: String(cycle.id) } }, { from: { equals: cycle.name } }],
        },
      ],
    },
    limit: EVENT_LIMIT,
    depth: 0,
    overrideAccess: true,
  })

  const ids = new Set<string>()
  for (const row of found.docs) {
    const ticketId = idOf(row.ticket)
    if (ticketId) ids.add(ticketId)
  }
  return [...ids]
}

export interface BurndownOptions {
  today?: IsoDate
  live?: boolean
}

export function snapshotOf(cycle: Cycle): BurndownSeries | null {
  const raw = cycle.progressSnapshot
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = raw as Partial<BurndownSeries>
  if (!Array.isArray(candidate.days) || typeof candidate.unit !== 'string') return null
  return candidate as BurndownSeries
}

export async function loadBurndown(
  payload: Payload,
  cycle: Cycle,
  project: Project,
  options: BurndownOptions = {},
): Promise<BurndownSeries> {
  if (!options.live) {
    const frozen = snapshotOf(cycle)
    if (frozen) return frozen
  }

  const unit = unitFor(estimateSettingsOf(project))
  const startsAt = toIsoDate(cycle.startsAt)
  const endsAt = toIsoDate(cycle.endsAt)
  const today = options.today ?? (toIsoDate(new Date()) as IsoDate)

  if (!startsAt || !endsAt) {
    return {
      unit,
      days: [],
      committed: 0,
      completed: 0,
      scope: 0,
      remaining: 0,
      unestimated: 0,
      truncated: false,
    }
  }

  const [lookup, departed] = await Promise.all([
    loadStatusLookup(payload),
    ticketsThatLeft(payload, cycle),
  ])

  const inCycle = await payload.find({
    collection: 'tickets',
    where: { cycle: { equals: String(cycle.id) } },
    limit: TICKET_LIMIT,
    depth: 1,
    overrideAccess: true,
  })

  const states = new Map<string, BurndownTicketState>()

  for (const ticket of inCycle.docs) {
    const status = ticket.status
    states.set(String(ticket.id), {
      id: String(ticket.id),
      inCycle: true,
      statusType: status && typeof status === 'object' ? (status.type ?? null) : null,
      estimate: normalizeEstimate(ticket.estimate),
      createdAt: ticket.createdAt ?? null,
    })
  }

  const missing = departed.filter((id) => !states.has(id))
  if (missing.length > 0) {
    const left = await payload.find({
      collection: 'tickets',
      where: { id: { in: missing } },
      limit: TICKET_LIMIT,
      depth: 1,
      overrideAccess: true,
    })

    for (const ticket of left.docs) {
      const status = ticket.status
      states.set(String(ticket.id), {
        id: String(ticket.id),
        inCycle: false,
        statusType: status && typeof status === 'object' ? (status.type ?? null) : null,
        estimate: normalizeEstimate(ticket.estimate),
        createdAt: ticket.createdAt ?? null,
      })
    }
  }

  const ticketIds = [...states.keys()]
  const events = ticketIds.length === 0 ? [] : await loadEvents(payload, ticketIds, cycle, lookup)

  return buildBurndown({
    startsAt,
    endsAt,
    today,
    unit,
    tickets: [...states.values()],
    events,
  })
}

async function loadEvents(
  payload: Payload,
  ticketIds: string[],
  cycle: Cycle,
  lookup: StatusLookup,
): Promise<BurndownEvent[]> {
  const found = await payload.find({
    collection: 'activity',
    where: {
      and: [{ ticket: { in: ticketIds } }, { field: { in: REPLAYED_FIELDS } }],
    },
    sort: '-createdAt',
    limit: EVENT_LIMIT,
    depth: 0,
    overrideAccess: true,
  })

  const events: BurndownEvent[] = []

  for (const row of found.docs) {
    const ticket = idOf(row.ticket)
    const at = typeof row.createdAt === 'string' ? row.createdAt : null
    if (!ticket || !at) continue

    if (row.field === 'status') {
      events.push({
        ticket,
        field: 'status',
        at,
        fromStatusType: statusTypeOf(lookup, row.fromId, row.from),
        toStatusType: statusTypeOf(lookup, row.toId, row.to),
      })
    } else if (row.field === 'cycle') {
      events.push({
        ticket,
        field: 'cycle',
        at,
        fromInCycle: matchesCycle(cycle, row.fromId, row.from),
        toInCycle: matchesCycle(cycle, row.toId, row.to),
      })
    } else if (row.field === 'estimate') {
      events.push({
        ticket,
        field: 'estimate',
        at,
        fromEstimate: normalizeEstimate(row.from),
        toEstimate: normalizeEstimate(row.to),
      })
    }
  }

  return events
}

export async function freezeBurndown(
  payload: Payload,
  cycle: Cycle,
  project: Project,
  today?: IsoDate,
): Promise<BurndownSeries> {
  const series = await loadBurndown(payload, cycle, project, { live: true, today })

  await payload.update({
    collection: 'cycles',
    id: String(cycle.id),
    data: { progressSnapshot: series as unknown as Record<string, unknown> },
    depth: 0,
    overrideAccess: true,
  })

  return series
}

export async function loadVelocity(
  payload: Payload,
  project: Project,
  options: { window?: number; today?: IsoDate } = {},
): Promise<VelocitySummary> {
  const unit: EstimateUnit = unitFor(estimateSettingsOf(project))

  const found = await payload.find({
    collection: 'cycles',
    where: {
      and: [{ project: { equals: String(project.id) } }, { completedAt: { exists: true } }],
    },
    sort: 'number',
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })

  const closed = (found.docs as Cycle[]).filter((cycle) => Boolean(cycle.completedAt))
  const window = options.window
  const considered = window ? closed.slice(-window) : closed

  const entries: VelocityEntry[] = []

  for (const cycle of considered) {
    const series = await loadBurndown(payload, cycle, project, { today: options.today })
    entries.push({
      cycleId: String(cycle.id),
      name: cycle.name,
      number: cycle.number,
      committed: series.committed,
      completed: series.completed,
    })
  }

  return summarizeVelocity(unit, entries, window)
}
