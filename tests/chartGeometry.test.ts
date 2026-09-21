import { describe, it, expect } from 'vitest'
import {
  axisTicks,
  bandAt,
  barWidth,
  innerHeight,
  innerWidth,
  lastDefined,
  linePath,
  niceMax,
  xAt,
  yAt,
  type Plot,
} from '@/lib/chart-geometry'

const plot: Plot = {
  width: 420,
  height: 220,
  padding: { top: 10, right: 20, bottom: 30, left: 40 },
}

describe('plot box', () => {
  it('subtracts the padding from the drawable area', () => {
    expect(innerWidth(plot)).toBe(360)
    expect(innerHeight(plot)).toBe(180)
  })

  it('never returns a negative box when padding exceeds the size', () => {
    const tiny: Plot = { width: 10, height: 10, padding: { top: 20, right: 20, bottom: 20, left: 20 } }
    expect(innerWidth(tiny)).toBe(0)
    expect(innerHeight(tiny)).toBe(0)
  })
})

describe('niceMax', () => {
  it('rounds the axis up to a readable number', () => {
    expect(niceMax(17)).toBe(20)
    expect(niceMax(7)).toBe(8)
    expect(niceMax(21)).toBe(40)
    expect(niceMax(100)).toBe(100)
  })

  it('never returns zero, so an empty chart still has an axis', () => {
    expect(niceMax(0)).toBe(4)
    expect(niceMax(-5)).toBe(4)
    expect(niceMax(Number.NaN)).toBe(4)
  })

  it('always lands at or above the value it was given', () => {
    for (const value of [1, 3, 9, 13, 44, 57, 99, 130, 999]) {
      expect(niceMax(value)).toBeGreaterThanOrEqual(value)
    }
  })
})

describe('axisTicks', () => {
  it('divides the axis evenly from zero to the max', () => {
    expect(axisTicks(20, 4)).toEqual([0, 5, 10, 15, 20])
  })
})

describe('scales', () => {
  it('spreads points across the full width', () => {
    expect(xAt(plot, 0, 5)).toBe(40)
    expect(xAt(plot, 4, 5)).toBe(400)
  })

  it('centres a lone point instead of pinning it to the left edge', () => {
    expect(xAt(plot, 0, 1)).toBe(220)
  })

  it('puts zero on the baseline and the max at the top', () => {
    expect(yAt(plot, 0, 20)).toBe(190)
    expect(yAt(plot, 20, 20)).toBe(10)
    expect(yAt(plot, 10, 20)).toBe(100)
  })

  it('clamps a value outside the domain rather than drawing off-canvas', () => {
    expect(yAt(plot, 50, 20)).toBe(10)
    expect(yAt(plot, -5, 20)).toBe(190)
    expect(yAt(plot, 5, 0)).toBe(190)
  })
})

describe('bands and bars', () => {
  it('centres each band in its slot', () => {
    const band = bandAt(plot, 0, 4)
    expect(band.width).toBe(90)
    expect(band.center).toBe(85)
  })

  it('leaves air in the slot and caps the bar thickness', () => {
    expect(barWidth(90, 2)).toBeLessThanOrEqual(24)
    expect(barWidth(90, 2)).toBeGreaterThan(0)
    expect(barWidth(400, 1)).toBe(24)
    expect(barWidth(4, 2)).toBeGreaterThanOrEqual(2)
  })
})

describe('linePath', () => {
  it('draws a single run', () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 2, y: 3 }])).toBe('M0 1 L2 3')
  })

  it('breaks the path at a gap instead of dropping to the axis', () => {
    const path = linePath([{ x: 0, y: 1 }, null, { x: 4, y: 5 }])
    expect(path).toBe('M0 1 M4 5')
  })

  it('returns nothing for an empty series', () => {
    expect(linePath([])).toBe('')
    expect(linePath([null, null])).toBe('')
  })
})

describe('lastDefined', () => {
  it('finds the final real value for the end label', () => {
    expect(lastDefined([1, 2, null, null])).toEqual({ index: 1, value: 2 })
    expect(lastDefined([null])).toBeNull()
    expect(lastDefined([0, null])).toEqual({ index: 0, value: 0 })
  })
})
