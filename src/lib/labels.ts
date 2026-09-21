import type { Label, LabelGroup, Ticket } from '@/payload-types'
import { LabelColor, LEGACY_LABEL_COLORS } from '@/types/enums'

export const LABEL_SWATCH: Record<LabelColor, string> = {
  [LabelColor.SLATE]: 'bg-label-slate',
  [LabelColor.INDIGO]: 'bg-label-indigo',
  [LabelColor.BLUE]: 'bg-label-blue',
  [LabelColor.GREEN]: 'bg-label-green',
  [LabelColor.AMBER]: 'bg-label-amber',
  [LabelColor.RED]: 'bg-label-red',
}

const HUE_ANCHORS: { color: LabelColor; hue: number }[] = [
  { color: LabelColor.RED, hue: 0 },
  { color: LabelColor.AMBER, hue: 38 },
  { color: LabelColor.GREEN, hue: 142 },
  { color: LabelColor.BLUE, hue: 217 },
  { color: LabelColor.INDIGO, hue: 258 },
]

export function labelColorOf(value: unknown): LabelColor {
  if (typeof value !== 'string') return LabelColor.SLATE
  const upper = value.toUpperCase()
  return upper in LABEL_SWATCH ? (upper as LabelColor) : LabelColor.SLATE
}

export function nearestLabelColor(value: unknown): LabelColor {
  if (typeof value !== 'string') return LabelColor.SLATE

  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return LabelColor.SLATE

  const known = LEGACY_LABEL_COLORS[trimmed]
  if (known) return known

  const rgb = parseHex(trimmed)
  if (!rgb) return labelColorOf(value)

  const { hue, saturation } = hueOf(rgb)
  if (saturation < 0.18) return LabelColor.SLATE

  let best = HUE_ANCHORS[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const anchor of HUE_ANCHORS) {
    const raw = Math.abs(hue - anchor.hue)
    const distance = Math.min(raw, 360 - raw)
    if (distance < bestDistance) {
      bestDistance = distance
      best = anchor
    }
  }
  return best.color
}

function parseHex(value: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value)
  if (!match) return null

  const digits =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((c) => c + c)
          .join('')
      : match[1]

  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ]
}

function hueOf([r, g, b]: [number, number, number]): { hue: number; saturation: number } {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min

  if (delta === 0) return { hue: 0, saturation: 0 }

  let hue: number
  if (max === red) hue = ((green - blue) / delta) % 6
  else if (max === green) hue = (blue - red) / delta + 2
  else hue = (red - green) / delta + 4

  hue *= 60
  if (hue < 0) hue += 360

  const lightness = (max + min) / 2
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))

  return { hue, saturation }
}

export function labelIdsOf(ticket: Pick<Ticket, 'labels'>): string[] {
  const labels = ticket.labels
  if (!Array.isArray(labels)) return []
  return labels
    .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
    .filter((id): id is string => Boolean(id))
}

export function labelsOf(ticket: Pick<Ticket, 'labels'>): Label[] {
  const labels = ticket.labels
  if (!Array.isArray(labels)) return []
  return labels.filter((entry): entry is Label => typeof entry === 'object' && entry !== null)
}

export function groupOf(label: Label): LabelGroup | null {
  const group = label.group
  if (!group || typeof group === 'string') return null
  return group
}

export function groupIdOf(label: Label): string | null {
  const group = label.group
  if (!group) return null
  return typeof group === 'string' ? group : group.id
}

export interface LabelGrouping {
  group: LabelGroup | null
  labels: Label[]
}

export function groupLabels(labels: Label[]): LabelGrouping[] {
  const buckets = new Map<string, LabelGrouping>()

  for (const label of labels) {
    const group = groupOf(label)
    const key = groupIdOf(label) ?? ''
    const bucket = buckets.get(key)
    if (bucket) bucket.labels.push(label)
    else buckets.set(key, { group, labels: [label] })
  }

  return [...buckets.values()]
    .map((bucket) => ({
      group: bucket.group,
      labels: [...bucket.labels].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (!a.group) return 1
      if (!b.group) return -1
      return (a.group.order ?? 0) - (b.group.order ?? 0) || a.group.name.localeCompare(b.group.name)
    })
}

export function sortLabels(labels: Label[]): Label[] {
  return [...labels].sort((a, b) => a.name.localeCompare(b.name))
}
