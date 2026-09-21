import { describe, it, expect } from 'vitest'
import { EstimateScale } from '@/types/enums'
import {
  DEFAULT_ESTIMATE_SCALE,
  MAX_ESTIMATE,
  estimateDescription,
  estimateLabel,
  estimatePoints,
  estimateSettingsOf,
  isEstimateScale,
  normalizeEstimate,
  normalizeScale,
  unitFor,
  unitNoun,
  weightOf,
} from '@/lib/estimates'

describe('estimate scales', () => {
  it('offers the documented values for each scale', () => {
    expect(estimatePoints(EstimateScale.LINEAR).map((p) => p.value)).toEqual([1, 2, 3, 4, 5])
    expect(estimatePoints(EstimateScale.FIBONACCI).map((p) => p.value)).toEqual([1, 2, 3, 5, 8, 13])
    expect(estimatePoints(EstimateScale.EXPONENTIAL).map((p) => p.value)).toEqual([1, 2, 4, 8, 16])
  })

  it('maps t-shirt sizes onto the fibonacci values so they still sum', () => {
    expect(estimatePoints(EstimateScale.TSHIRT)).toEqual([
      { value: 1, label: 'XS' },
      { value: 2, label: 'S' },
      { value: 3, label: 'M' },
      { value: 5, label: 'L' },
      { value: 8, label: 'XL' },
    ])
  })

  it('falls back to the default scale for anything unrecognised', () => {
    expect(normalizeScale('NONSENSE')).toBe(DEFAULT_ESTIMATE_SCALE)
    expect(normalizeScale(null)).toBe(DEFAULT_ESTIMATE_SCALE)
    expect(isEstimateScale('TSHIRT')).toBe(true)
    expect(isEstimateScale('SHIRT')).toBe(false)
  })
})

describe('normalizeEstimate', () => {
  it('keeps positive whole numbers and drops everything else', () => {
    expect(normalizeEstimate(5)).toBe(5)
    expect(normalizeEstimate('8')).toBe(8)
    expect(normalizeEstimate(2.4)).toBe(2)
    expect(normalizeEstimate(0)).toBeNull()
    expect(normalizeEstimate(-3)).toBeNull()
    expect(normalizeEstimate('')).toBeNull()
    expect(normalizeEstimate(null)).toBeNull()
    expect(normalizeEstimate('abc')).toBeNull()
  })

  it('caps absurd values rather than storing them', () => {
    expect(normalizeEstimate(999_999)).toBe(MAX_ESTIMATE)
  })
})

describe('estimateLabel', () => {
  it('labels a value in the project scale', () => {
    expect(estimateLabel(EstimateScale.TSHIRT, 5)).toBe('L')
    expect(estimateLabel(EstimateScale.FIBONACCI, 5)).toBe('5')
  })

  it('shows a value the current scale no longer offers rather than hiding it', () => {
    expect(estimateLabel(EstimateScale.TSHIRT, 13)).toBe('13')
    expect(estimateLabel(EstimateScale.LINEAR, 8)).toBe('8')
  })

  it('reads out both the size and the points it is worth', () => {
    expect(estimateDescription(EstimateScale.TSHIRT, 5)).toBe('L — 5 points')
    expect(estimateDescription(EstimateScale.TSHIRT, 1)).toBe('XS — 1 point')
    expect(estimateDescription(EstimateScale.FIBONACCI, 3)).toBe('3 points')
    expect(estimateDescription(EstimateScale.FIBONACCI, null)).toBeNull()
  })
})

describe('estimateSettingsOf', () => {
  it('treats a project with no settings as estimates off', () => {
    expect(estimateSettingsOf(null)).toEqual({ enabled: false, scale: DEFAULT_ESTIMATE_SCALE })
    expect(estimateSettingsOf({})).toEqual({ enabled: false, scale: DEFAULT_ESTIMATE_SCALE })
  })

  it('reads an enabled project', () => {
    expect(estimateSettingsOf({ estimates: { enabled: true, scale: 'TSHIRT' } })).toEqual({
      enabled: true,
      scale: EstimateScale.TSHIRT,
    })
  })
})

describe('units', () => {
  it('counts tickets when estimates are off and points when they are on', () => {
    expect(unitFor({ enabled: false })).toBe('tickets')
    expect(unitFor({ enabled: true })).toBe('points')
    expect(weightOf('tickets', null)).toBe(1)
    expect(weightOf('tickets', 8)).toBe(1)
    expect(weightOf('points', 8)).toBe(8)
    expect(weightOf('points', null)).toBe(0)
  })

  it('pluralises the unit', () => {
    expect(unitNoun('points', 1)).toBe('point')
    expect(unitNoun('points', 2)).toBe('points')
    expect(unitNoun('tickets', 1)).toBe('ticket')
    expect(unitNoun('tickets', 0)).toBe('tickets')
  })
})
