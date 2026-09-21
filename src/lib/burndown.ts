import { StatusType } from '@/types/enums'
import { addDays, daysBetween, type IsoDate } from '@/lib/cycles'
import { normalizeEstimate, type EstimateUnit } from '@/lib/estimates'

export interface BurndownTicketState {
  id: string
  inCycle: boolean
  statusType: string | null
  estimate: number | null
  createdAt?: string | null
}

export interface BurndownEvent {
  ticket: string
  field: 'status' | 'cycle' | 'estimate'
  at: string
  fromStatusType?: string | null
  toStatusType?: string | null
  fromInCycle?: boolean
  toInCycle?: boolean
  fromEstimate?: number | null
  toEstimate?: number | null
}

export interface BurndownDay {
  date: IsoDate
  scope: number | null
  completed: number | null
  remaining: number | null
  ideal: number
}

export interface BurndownSeries {
  unit: EstimateUnit
  days: BurndownDay[]
  committed: number
  completed: number
  scope: number
  remaining: number
  unestimated: number
  truncated: boolean
}

export interface BurndownInput {
  startsAt: IsoDate
  endsAt: IsoDate
  today: IsoDate
  unit: EstimateUnit
  tickets: BurndownTicketState[]
  events: BurndownEvent[]
}

const COMPLETED = String(StatusType.COMPLETED)
const CANCELLED = String(StatusType.CANCELLED)

export function isCountedInScope(statusType: string | null): boolean {
  return statusType !== CANCELLED
}

export function isCompletedType(statusType: string | null): boolean {
  return statusType === COMPLETED
}

function weigh(unit: EstimateUnit, estimate: number | null): number {
  if (unit === 'tickets') return 1
  return normalizeEstimate(estimate) ?? 0
}

function existsBy(state: BurndownTicketState, boundary: number | null): boolean {
  if (boundary === null || !state.createdAt) return true
  const created = Date.parse(state.createdAt)
  return Number.isNaN(created) ? true : created <= boundary
}

function totalsFor(
  unit: EstimateUnit,
  states: Map<string, BurndownTicketState>,
  boundary: number | null = null,
): { scope: number; completed: number } {
  let scope = 0
  let completed = 0

  for (const state of states.values()) {
    if (!state.inCycle) continue
    if (!isCountedInScope(state.statusType)) continue
    if (!existsBy(state, boundary)) continue

    const weight = weigh(unit, state.estimate)
    scope += weight
    if (isCompletedType(state.statusType)) completed += weight
  }

  return { scope, completed }
}

function cloneStates(tickets: BurndownTicketState[]): Map<string, BurndownTicketState> {
  return new Map(tickets.map((ticket) => [ticket.id, { ...ticket }]))
}

function revert(state: BurndownTicketState, event: BurndownEvent): void {
  if (event.field === 'status') state.statusType = event.fromStatusType ?? null
  else if (event.field === 'cycle') state.inCycle = Boolean(event.fromInCycle)
  else state.estimate = event.fromEstimate ?? null
}

export function endOfDay(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00.000Z`) + 86_399_999
}

export function idealAt(committed: number, dayIndex: number, totalDays: number): number {
  if (totalDays <= 1) return dayIndex <= 0 ? committed : 0
  const remaining = committed * (1 - dayIndex / (totalDays - 1))
  return Math.max(0, Math.round(remaining * 100) / 100)
}

export const MAX_BURNDOWN_DAYS = 120

export function buildBurndown(input: BurndownInput): BurndownSeries {
  const { startsAt, endsAt, today, unit, tickets } = input

  const spanDays = daysBetween(startsAt, endsAt) + 1
  const totalDays = Math.max(1, Math.min(spanDays, MAX_BURNDOWN_DAYS))
  const truncated = spanDays > MAX_BURNDOWN_DAYS

  const lastDayIndex = today < startsAt ? -1 : Math.min(totalDays - 1, daysBetween(startsAt, today))

  const states = cloneStates(tickets)
  const events = [...input.events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))

  const totalsByIndex = new Map<number, { scope: number; completed: number }>()
  let cursor = 0

  for (let index = totalDays - 1; index >= 0; index -= 1) {
    if (index <= lastDayIndex) {
      const boundary = endOfDay(addDays(startsAt, index))
      while (cursor < events.length && Date.parse(events[cursor].at) > boundary) {
        const state = states.get(events[cursor].ticket)
        if (state) revert(state, events[cursor])
        cursor += 1
      }
      totalsByIndex.set(index, totalsFor(unit, states, boundary))
    }
  }

  const committed = totalsByIndex.get(0)?.scope ?? totalsFor(unit, cloneStates(tickets)).scope

  const days: BurndownDay[] = []
  for (let index = 0; index < totalDays; index += 1) {
    const totals = totalsByIndex.get(index) ?? null
    days.push({
      date: addDays(startsAt, index),
      scope: totals ? totals.scope : null,
      completed: totals ? totals.completed : null,
      remaining: totals ? totals.scope - totals.completed : null,
      ideal: idealAt(committed, index, totalDays),
    })
  }

  const live = totalsFor(unit, cloneStates(tickets))
  const unestimated =
    unit === 'points'
      ? tickets.filter(
          (ticket) =>
            ticket.inCycle &&
            isCountedInScope(ticket.statusType) &&
            normalizeEstimate(ticket.estimate) === null,
        ).length
      : 0

  return {
    unit,
    days,
    committed,
    completed: live.completed,
    scope: live.scope,
    remaining: live.scope - live.completed,
    unestimated,
    truncated,
  }
}

export interface VelocityEntry {
  cycleId: string
  name: string
  number: number
  committed: number
  completed: number
}

export interface VelocitySummary {
  unit: EstimateUnit
  entries: VelocityEntry[]
  average: number
  deliveryRate: number | null
}

export const VELOCITY_WINDOW = 6

export function summarizeVelocity(
  unit: EstimateUnit,
  entries: VelocityEntry[],
  window = VELOCITY_WINDOW,
): VelocitySummary {
  const recent = entries.slice(-window)
  const counted = recent.filter((entry) => entry.committed > 0 || entry.completed > 0)

  const average =
    counted.length === 0
      ? 0
      : Math.round((counted.reduce((sum, entry) => sum + entry.completed, 0) / counted.length) * 10) /
        10

  const committed = counted.reduce((sum, entry) => sum + entry.committed, 0)
  const completed = counted.reduce((sum, entry) => sum + entry.completed, 0)

  return {
    unit,
    entries: recent,
    average,
    deliveryRate: committed > 0 ? Math.round((completed / committed) * 100) : null,
  }
}
