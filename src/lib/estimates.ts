import { EstimateScale } from '@/types/enums'

export interface EstimatePoint {
  value: number
  label: string
}

export interface EstimateSettings {
  enabled: boolean
  scale: EstimateScale
}

export type EstimateUnit = 'points' | 'tickets'

export const DEFAULT_ESTIMATE_SCALE = EstimateScale.FIBONACCI
export const MAX_ESTIMATE = 1000

const LINEAR: number[] = [1, 2, 3, 4, 5]
const FIBONACCI: number[] = [1, 2, 3, 5, 8, 13]
const EXPONENTIAL: number[] = [1, 2, 4, 8, 16]

const TSHIRT: EstimatePoint[] = [
  { value: 1, label: 'XS' },
  { value: 2, label: 'S' },
  { value: 3, label: 'M' },
  { value: 5, label: 'L' },
  { value: 8, label: 'XL' },
]

const NUMERIC_SCALES: Record<string, number[]> = {
  [EstimateScale.LINEAR]: LINEAR,
  [EstimateScale.FIBONACCI]: FIBONACCI,
  [EstimateScale.EXPONENTIAL]: EXPONENTIAL,
}

const ALL_SCALES: string[] = [
  EstimateScale.LINEAR,
  EstimateScale.EXPONENTIAL,
  EstimateScale.FIBONACCI,
  EstimateScale.TSHIRT,
]

export function isEstimateScale(value: unknown): value is EstimateScale {
  return typeof value === 'string' && ALL_SCALES.includes(value)
}

export function normalizeScale(value: unknown): EstimateScale {
  return isEstimateScale(value) ? value : DEFAULT_ESTIMATE_SCALE
}

export function estimatePoints(scale: unknown): EstimatePoint[] {
  const resolved = normalizeScale(scale)
  if (resolved === EstimateScale.TSHIRT) return TSHIRT
  return NUMERIC_SCALES[resolved].map((value) => ({ value, label: String(value) }))
}

export function normalizeEstimate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return null
  const rounded = Math.round(numeric)
  if (rounded <= 0) return null
  return Math.min(rounded, MAX_ESTIMATE)
}

export function estimateLabel(scale: unknown, value: unknown): string | null {
  const points = normalizeEstimate(value)
  if (points === null) return null
  const match = estimatePoints(scale).find((point) => point.value === points)
  return match ? match.label : String(points)
}

export function estimateDescription(scale: unknown, value: unknown): string | null {
  const points = normalizeEstimate(value)
  if (points === null) return null
  const label = estimateLabel(scale, points)
  if (label === String(points)) return `${points} ${points === 1 ? 'point' : 'points'}`
  return `${label} — ${points} ${points === 1 ? 'point' : 'points'}`
}

export function estimateSettingsOf(
  project: { estimates?: { enabled?: boolean | null; scale?: string | null } | null } | null | undefined,
): EstimateSettings {
  const raw = project?.estimates
  return {
    enabled: Boolean(raw?.enabled),
    scale: normalizeScale(raw?.scale),
  }
}

export function unitFor(settings: Pick<EstimateSettings, 'enabled'>): EstimateUnit {
  return settings.enabled ? 'points' : 'tickets'
}

export function unitNoun(unit: EstimateUnit, count: number): string {
  if (unit === 'points') return count === 1 ? 'point' : 'points'
  return count === 1 ? 'ticket' : 'tickets'
}

export function weightOf(unit: EstimateUnit, estimate: unknown): number {
  if (unit === 'tickets') return 1
  return normalizeEstimate(estimate) ?? 0
}
