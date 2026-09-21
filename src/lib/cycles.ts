import { StatusType } from '@/types/enums'

export type IsoDate = string

export type CycleState = 'upcoming' | 'active' | 'completed'

export interface CycleSpan {
  startsAt: IsoDate
  endsAt: IsoDate
}

export interface CyclePlan extends CycleSpan {
  number: number
}

export interface ProvisionSettings {
  lengthWeeks: number
  startDay: number
  upcomingCount: number
}

export interface CycleProgress {
  total: number
  completed: number
  started: number
  unstarted: number
  cancelled: number
  percent: number
}

export const MS_PER_DAY = 86_400_000

export const MIN_CYCLE_LENGTH_WEEKS = 1
export const MAX_CYCLE_LENGTH_WEEKS = 8
export const DEFAULT_CYCLE_LENGTH_WEEKS = 2
export const DEFAULT_CYCLE_START_DAY = 1
export const DEFAULT_UPCOMING_CYCLES = 2
export const MAX_UPCOMING_CYCLES = 12
export const MAX_CYCLES_PER_RUN = 104

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function toIsoDate(value: string | number | Date | null | undefined): IsoDate | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' && ISO_DATE.test(value)) return value

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

export function isoToUtcDate(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const shifted = new Date(isoToUtcDate(iso).getTime() + days * MS_PER_DAY)
  return shifted.toISOString().slice(0, 10)
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((isoToUtcDate(to).getTime() - isoToUtcDate(from).getTime()) / MS_PER_DAY)
}

export function weekdayOf(iso: IsoDate): number {
  return isoToUtcDate(iso).getUTCDay()
}

export function alignToStartDay(iso: IsoDate, startDay: number): IsoDate {
  const target = ((Math.trunc(startDay) % 7) + 7) % 7
  const back = (weekdayOf(iso) - target + 7) % 7
  return addDays(iso, -back)
}

export function clampLengthWeeks(weeks: number | null | undefined): number {
  if (!Number.isFinite(weeks as number)) return DEFAULT_CYCLE_LENGTH_WEEKS
  const rounded = Math.round(weeks as number)
  if (rounded < MIN_CYCLE_LENGTH_WEEKS) return MIN_CYCLE_LENGTH_WEEKS
  if (rounded > MAX_CYCLE_LENGTH_WEEKS) return MAX_CYCLE_LENGTH_WEEKS
  return rounded
}

export function clampUpcomingCount(count: number | null | undefined): number {
  if (!Number.isFinite(count as number)) return DEFAULT_UPCOMING_CYCLES
  const rounded = Math.round(count as number)
  if (rounded < 0) return 0
  if (rounded > MAX_UPCOMING_CYCLES) return MAX_UPCOMING_CYCLES
  return rounded
}

export function cycleLengthDays(lengthWeeks: number): number {
  return clampLengthWeeks(lengthWeeks) * 7
}

export function spanFrom(startsAt: IsoDate, lengthWeeks: number): CycleSpan {
  return { startsAt, endsAt: addDays(startsAt, cycleLengthDays(lengthWeeks) - 1) }
}

export function sortCycles<T extends { number: number }>(cycles: T[]): T[] {
  return [...cycles].sort((a, b) => a.number - b.number)
}

export function planMissingCycles(
  existing: CyclePlan[],
  settings: ProvisionSettings,
  on: IsoDate,
): CyclePlan[] {
  const lengthWeeks = clampLengthWeeks(settings.lengthWeeks)
  const upcoming = clampUpcomingCount(settings.upcomingCount)
  const ordered = sortCycles(existing)

  const created: CyclePlan[] = []
  const all = [...ordered]

  const nextAfter = (last: CyclePlan | undefined): CyclePlan => {
    if (!last) {
      return { number: 1, ...spanFrom(alignToStartDay(on, settings.startDay), lengthWeeks) }
    }
    return { number: last.number + 1, ...spanFrom(addDays(last.endsAt, 1), lengthWeeks) }
  }

  const currentIndex = (): number => all.findIndex((cycle) => cycle.endsAt >= on)

  while (created.length < MAX_CYCLES_PER_RUN) {
    const index = currentIndex()
    if (index !== -1 && all.length - index - 1 >= upcoming) break

    const next = nextAfter(all[all.length - 1])
    all.push(next)
    created.push(next)
  }

  return created
}

export function cycleStateAt(
  cycle: CycleSpan & { completedAt?: string | Date | null },
  on: IsoDate,
): CycleState {
  if (cycle.completedAt) return 'completed'
  if (on < cycle.startsAt) return 'upcoming'
  if (on > cycle.endsAt) return 'completed'
  return 'active'
}

export function isElapsed(cycle: CycleSpan, on: IsoDate): boolean {
  return on > cycle.endsAt
}

export function daysRemaining(cycle: CycleSpan, on: IsoDate): number {
  if (on > cycle.endsAt) return 0
  if (on < cycle.startsAt) return daysBetween(cycle.startsAt, cycle.endsAt) + 1
  return daysBetween(on, cycle.endsAt) + 1
}

export function cycleElapsedFraction(cycle: CycleSpan, on: IsoDate): number {
  const total = daysBetween(cycle.startsAt, cycle.endsAt) + 1
  if (total <= 0) return 1
  if (on < cycle.startsAt) return 0
  const done = Math.min(total, daysBetween(cycle.startsAt, on) + 1)
  return done / total
}

const OPEN_TYPES = new Set<string>([StatusType.BACKLOG, StatusType.UNSTARTED, StatusType.STARTED])

export function isOpenStatusType(type: string | null | undefined): boolean {
  return type ? OPEN_TYPES.has(type) : true
}

export function cycleProgress(statusTypes: (string | null | undefined)[]): CycleProgress {
  const progress: CycleProgress = {
    total: statusTypes.length,
    completed: 0,
    started: 0,
    unstarted: 0,
    cancelled: 0,
    percent: 0,
  }

  for (const type of statusTypes) {
    if (type === StatusType.COMPLETED) progress.completed += 1
    else if (type === StatusType.CANCELLED) progress.cancelled += 1
    else if (type === StatusType.STARTED) progress.started += 1
    else progress.unstarted += 1
  }

  const scope = progress.total - progress.cancelled
  progress.percent = scope > 0 ? Math.round((progress.completed / scope) * 100) : 0
  return progress
}

export function defaultCycleName(number: number): string {
  return `Cycle ${number}`
}
