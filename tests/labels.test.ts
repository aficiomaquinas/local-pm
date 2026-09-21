import { describe, it, expect } from 'vitest'
import {
  LABEL_SWATCH,
  groupLabels,
  labelColorOf,
  labelIdsOf,
  labelsOf,
  nearestLabelColor,
  sortLabels,
} from '@/lib/labels'
import { inlineLabelsOf, isMigrated } from '@/migrations/shared-labels'
import { LabelColor } from '@/types/enums'
import type { Label, LabelGroup, Ticket } from '@/payload-types'

const group = (id: string, name: string, order: number): LabelGroup =>
  ({ id, name, key: name.toLowerCase(), order }) as unknown as LabelGroup

const label = (
  id: string,
  name: string,
  color: LabelColor = LabelColor.SLATE,
  owner: LabelGroup | string | null = null,
): Label => ({ id, name, key: name.toLowerCase(), color, group: owner }) as unknown as Label

const ticket = (labels: Ticket['labels']): Ticket => ({ labels }) as unknown as Ticket

describe('labelColorOf', () => {
  it('accepts a palette value in any casing', () => {
    expect(labelColorOf('indigo')).toBe(LabelColor.INDIGO)
    expect(labelColorOf('AMBER')).toBe(LabelColor.AMBER)
  })

  it('falls back to slate for anything off the palette', () => {
    expect(labelColorOf('chartreuse')).toBe(LabelColor.SLATE)
    expect(labelColorOf(null)).toBe(LabelColor.SLATE)
    expect(labelColorOf(undefined)).toBe(LabelColor.SLATE)
  })

  it('has a swatch class for every palette entry', () => {
    for (const color of Object.values(LabelColor)) {
      expect(LABEL_SWATCH[color]).toBeTruthy()
    }
  })
})

describe('nearestLabelColor', () => {
  it('maps the hexes the old inline labels shipped with', () => {
    expect(nearestLabelColor('#6366f1')).toBe(LabelColor.INDIGO)
    expect(nearestLabelColor('#10b981')).toBe(LabelColor.GREEN)
    expect(nearestLabelColor('#f97316')).toBe(LabelColor.AMBER)
    expect(nearestLabelColor('#64748b')).toBe(LabelColor.SLATE)
  })

  it('maps an unknown hex to the nearest hue rather than giving up', () => {
    expect(nearestLabelColor('#00ff00')).toBe(LabelColor.GREEN)
    expect(nearestLabelColor('#ff0000')).toBe(LabelColor.RED)
    expect(nearestLabelColor('#0000ff')).toBe(LabelColor.INDIGO)
  })

  it('treats a near-grey as slate however dark it is', () => {
    expect(nearestLabelColor('#888888')).toBe(LabelColor.SLATE)
    expect(nearestLabelColor('#1f2124')).toBe(LabelColor.SLATE)
  })

  it('accepts three-digit hexes and a missing hash', () => {
    expect(nearestLabelColor('0f0')).toBe(LabelColor.GREEN)
    expect(nearestLabelColor('#f00')).toBe(LabelColor.RED)
  })

  it('falls back to slate for something that is not a colour at all', () => {
    expect(nearestLabelColor('')).toBe(LabelColor.SLATE)
    expect(nearestLabelColor(42)).toBe(LabelColor.SLATE)
  })
})

describe('labelIdsOf and labelsOf', () => {
  it('reads ids whether the relationship is populated or not', () => {
    expect(labelIdsOf(ticket(['l1', 'l2']))).toEqual(['l1', 'l2'])
    expect(labelIdsOf(ticket([label('l1', 'bug'), 'l2']))).toEqual(['l1', 'l2'])
  })

  it('returns only the populated labels', () => {
    expect(labelsOf(ticket(['l1'])).length).toBe(0)
    expect(labelsOf(ticket([label('l1', 'bug')])).map((l) => l.name)).toEqual(['bug'])
  })

  it('treats an absent relationship as no labels', () => {
    expect(labelIdsOf(ticket(null))).toEqual([])
    expect(labelsOf(ticket(undefined as unknown as Ticket['labels']))).toEqual([])
  })
})

describe('sortLabels', () => {
  it('orders by name without mutating the input', () => {
    const input = [label('l2', 'zebra'), label('l1', 'alpha')]
    expect(sortLabels(input).map((l) => l.name)).toEqual(['alpha', 'zebra'])
    expect(input.map((l) => l.name)).toEqual(['zebra', 'alpha'])
  })
})

describe('groupLabels', () => {
  const area = group('g1', 'Area', 1000)
  const kind = group('g2', 'Kind', 2000)

  it('orders groups by their own order and sorts labels inside each', () => {
    const grouped = groupLabels([
      label('l1', 'qa', LabelColor.AMBER, kind),
      label('l2', 'frontend', LabelColor.BLUE, area),
      label('l3', 'api', LabelColor.GREEN, area),
    ])

    expect(grouped.map((g) => g.group?.name)).toEqual(['Area', 'Kind'])
    expect(grouped[0].labels.map((l) => l.name)).toEqual(['api', 'frontend'])
  })

  it('puts ungrouped labels last', () => {
    const grouped = groupLabels([label('l1', 'loose'), label('l2', 'frontend', LabelColor.BLUE, area)])

    expect(grouped.map((g) => g.group?.name ?? null)).toEqual(['Area', null])
  })

  it('keeps a label whose group is only an id out of the named groups', () => {
    const grouped = groupLabels([label('l1', 'orphan', LabelColor.SLATE, 'g9')])

    expect(grouped).toHaveLength(1)
    expect(grouped[0].group).toBeNull()
  })
})

describe('inlineLabelsOf', () => {
  it('reads the old array-of-objects shape', () => {
    expect(inlineLabelsOf([{ name: ' bug ', color: '#ef4444' }])).toEqual([
      { name: 'bug', color: '#ef4444' },
    ])
  })

  it('reads a bare string, which some seeds wrote', () => {
    expect(inlineLabelsOf(['bug'])).toEqual([{ name: 'bug', color: null }])
  })

  it('drops entries with no usable name', () => {
    expect(inlineLabelsOf([{ name: '   ', color: '#fff' }, { color: '#fff' }, null])).toEqual([])
  })

  it('returns nothing for a non-array', () => {
    expect(inlineLabelsOf(null)).toEqual([])
    expect(inlineLabelsOf('bug')).toEqual([])
  })
})

describe('isMigrated', () => {
  it('recognises an array of relationship ids', () => {
    expect(isMigrated(['64b1', '64b2'])).toBe(true)
  })

  it('recognises an ObjectId, which the raw driver returns rather than a string', () => {
    expect(isMigrated([{ toHexString: () => '64b1' }])).toBe(true)
  })

  it('rejects the inline shape even though Payload gives each array row an id', () => {
    expect(isMigrated([{ name: 'bug', color: '#ef4444', id: '68f0' }])).toBe(false)
  })

  it('rejects an empty array, which needs no rewrite either way', () => {
    expect(isMigrated([])).toBe(false)
  })
})
