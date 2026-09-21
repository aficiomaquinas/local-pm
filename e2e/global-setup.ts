import dotenv from 'dotenv'

dotenv.config()

function withDatabase(uri: string, dbName: string): string {
  const [base, query] = uri.split('?')
  const trimmed = base.replace(/\/[^/]*$/, '')
  return `${trimmed}/${dbName}${query ? `?${query}` : ''}`
}

export default async function globalSetup() {
  const sourceUri = process.env.DATABASE_URI ?? 'mongodb://localhost:27018/local-pm'
  const e2eUri = process.env.E2E_DATABASE_URI ?? withDatabase(sourceUri, 'local-pm-e2e')

  if (e2eUri === sourceUri) {
    throw new Error('Refusing to seed statuses into the working database.')
  }

  const originalUri = process.env.DATABASE_URI
  process.env.DATABASE_URI = e2eUri

  try {
    const { getPayload } = await import('payload')
    const { default: config } = await import('../src/payload.config')
    const { migrateTicketStatuses } = await import('../src/migrations/configurable-statuses')

    const payload = await getPayload({ config })
    const report = await migrateTicketStatuses(payload)

    if (report.ticketsUnresolved.length > 0) {
      throw new Error(
        `E2E database has ${report.ticketsUnresolved.length} tickets whose status could not be resolved.`,
      )
    }

    await payload.destroy?.()
  } finally {
    if (originalUri === undefined) delete process.env.DATABASE_URI
    else process.env.DATABASE_URI = originalUri
  }
}
