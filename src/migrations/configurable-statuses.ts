import 'dotenv/config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import config from '../payload.config'
import { DEFAULT_STATUSES } from '../types/enums'
import { legacyKeyFor } from '../lib/workflow'

export interface MigrationReport {
  statusesCreated: number
  ticketsMigrated: number
  ticketsAlreadyMigrated: number
  ticketsReassigned: number
  ticketsUnresolved: { id: string; status: unknown }[]
}

export async function ensureDefaultStatuses(payload: Payload): Promise<Map<string, string>> {
  const byKey = new Map<string, string>()

  for (const spec of DEFAULT_STATUSES) {
    const existing = await payload.find({
      collection: 'statuses',
      depth: 0,
      limit: 1,
      where: { and: [{ key: { equals: spec.key } }, { project: { exists: false } }] },
    })

    if (existing.docs.length > 0) {
      byKey.set(spec.key, String(existing.docs[0].id))
      continue
    }

    const created = await payload.create({
      collection: 'statuses',
      data: { name: spec.name, key: spec.key, type: spec.type, order: spec.order },
    })
    byKey.set(spec.key, String(created.id))
  }

  return byKey
}

export async function migrateTicketStatuses(payload: Payload): Promise<MigrationReport> {
  const byKey = await ensureDefaultStatuses(payload)

  const all = await payload.find({ collection: 'statuses', limit: 500, depth: 0 })
  const validIds = new Set(all.docs.map((doc) => String(doc.id)))
  const fallbackId = byKey.get(DEFAULT_STATUSES[0].key) ?? null

  const report: MigrationReport = {
    statusesCreated: byKey.size,
    ticketsMigrated: 0,
    ticketsAlreadyMigrated: 0,
    ticketsReassigned: 0,
    ticketsUnresolved: [],
  }

  const raw = payload.db.collections.tickets
  const docs = await raw.find({}, null, { lean: true })

  for (const doc of docs as unknown as { _id: unknown; status?: unknown }[]) {
    const id = String(doc._id)
    const current = doc.status

    if (current && validIds.has(String(current))) {
      report.ticketsAlreadyMigrated += 1
      continue
    }

    const key = legacyKeyFor(current)
    const target = key ? byKey.get(key) : undefined

    if (target) {
      await raw.updateOne({ _id: doc._id }, { $set: { status: target } })
      report.ticketsMigrated += 1
      continue
    }

    if (!fallbackId) {
      report.ticketsUnresolved.push({ id, status: current })
      continue
    }

    await raw.updateOne({ _id: doc._id }, { $set: { status: fallbackId } })
    report.ticketsReassigned += 1
  }

  return report
}

async function main() {
  const payload = await getPayload({ config })
  const report = await migrateTicketStatuses(payload)

  console.log(`statuses available: ${report.statusesCreated}`)
  console.log(`tickets migrated:   ${report.ticketsMigrated}`)
  console.log(`already migrated:   ${report.ticketsAlreadyMigrated}`)
  console.log(`reassigned:         ${report.ticketsReassigned}`)

  if (report.ticketsUnresolved.length > 0) {
    console.log(`unresolved:         ${report.ticketsUnresolved.length}`)
    for (const row of report.ticketsUnresolved.slice(0, 20)) {
      console.log(`  ${row.id} had status ${JSON.stringify(row.status)}`)
    }
    process.exitCode = 1
  }

  process.exit(process.exitCode ?? 0)
}

const invokedDirectly = process.argv[1]?.includes('configurable-statuses')
if (invokedDirectly) void main()
