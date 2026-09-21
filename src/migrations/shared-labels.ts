import 'dotenv/config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import config from '../payload.config'
import { nearestLabelColor } from '../lib/labels'
import { slugifyKey } from '../lib/workflow'

export interface LabelMigrationReport {
  labelsCreated: number
  labelsReused: number
  ticketsMigrated: number
  ticketsAlreadyMigrated: number
  ticketsUntouched: number
  ticketsUnresolved: { id: string; labels: unknown }[]
}

interface InlineLabel {
  name: string
  color: unknown
}

export function inlineLabelsOf(value: unknown): InlineLabel[] {
  if (!Array.isArray(value)) return []

  const found: InlineLabel[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      const name = entry.trim()
      if (name) found.push({ name, color: null })
      continue
    }
    if (entry && typeof entry === 'object' && 'name' in (entry as Record<string, unknown>)) {
      const raw = (entry as { name: unknown }).name
      const name = typeof raw === 'string' ? raw.trim() : ''
      if (name) found.push({ name, color: (entry as { color?: unknown }).color ?? null })
    }
  }
  return found
}

export function isMigrated(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false
  return value.every(
    (entry) =>
      typeof entry === 'string' ||
      (entry !== null && typeof entry === 'object' && !('name' in (entry as object))),
  )
}

export async function ensureLabel(
  payload: Payload,
  name: string,
  color: unknown,
): Promise<{ id: string; created: boolean }> {
  const key = slugifyKey(name)

  const existing = await payload.find({
    collection: 'labels',
    depth: 0,
    limit: 1,
    where: { key: { equals: key } },
  })

  if (existing.docs.length > 0) return { id: String(existing.docs[0].id), created: false }

  const created = await payload.create({
    collection: 'labels',
    data: { name, key, color: nearestLabelColor(color) },
  })

  return { id: String(created.id), created: true }
}

export async function migrateInlineLabels(payload: Payload): Promise<LabelMigrationReport> {
  const report: LabelMigrationReport = {
    labelsCreated: 0,
    labelsReused: 0,
    ticketsMigrated: 0,
    ticketsAlreadyMigrated: 0,
    ticketsUntouched: 0,
    ticketsUnresolved: [],
  }

  const raw = payload.db.collections.tickets
  const docs = await raw.find({}, null, { lean: true })
  const byKey = new Map<string, string>()

  for (const doc of docs as unknown as { _id: unknown; labels?: unknown }[]) {
    const current = doc.labels

    if (!Array.isArray(current) || current.length === 0) {
      report.ticketsUntouched += 1
      continue
    }

    if (isMigrated(current)) {
      report.ticketsAlreadyMigrated += 1
      continue
    }

    const inline = inlineLabelsOf(current)
    if (inline.length === 0) {
      report.ticketsUnresolved.push({ id: String(doc._id), labels: current })
      continue
    }

    const ids: string[] = []
    for (const label of inline) {
      const key = slugifyKey(label.name)
      const cached = byKey.get(key)
      if (cached) {
        report.labelsReused += 1
        if (!ids.includes(cached)) ids.push(cached)
        continue
      }

      const { id, created } = await ensureLabel(payload, label.name, label.color)
      byKey.set(key, id)
      if (created) report.labelsCreated += 1
      else report.labelsReused += 1
      if (!ids.includes(id)) ids.push(id)
    }

    await raw.updateOne({ _id: doc._id }, { $set: { labels: ids } })
    report.ticketsMigrated += 1
  }

  return report
}

async function main() {
  const payload = await getPayload({ config })
  const report = await migrateInlineLabels(payload)

  console.log(`labels created:   ${report.labelsCreated}`)
  console.log(`labels reused:    ${report.labelsReused}`)
  console.log(`tickets migrated: ${report.ticketsMigrated}`)
  console.log(`already migrated: ${report.ticketsAlreadyMigrated}`)
  console.log(`no labels:        ${report.ticketsUntouched}`)

  if (report.ticketsUnresolved.length > 0) {
    console.log(`unresolved:       ${report.ticketsUnresolved.length}`)
    for (const row of report.ticketsUnresolved.slice(0, 20)) {
      console.log(`  ${row.id} had labels ${JSON.stringify(row.labels)}`)
    }
    process.exitCode = 1
  }

  process.exit(process.exitCode ?? 0)
}

const invokedDirectly = process.argv[1]?.includes('shared-labels')
if (invokedDirectly) void main()
