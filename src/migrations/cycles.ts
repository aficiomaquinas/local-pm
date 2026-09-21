import 'dotenv/config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import config from '../payload.config'
import { reconcileAllProjects, type CycleReconcileReport } from '../lib/cycle-service'

export interface CycleMigrationReport {
  projectsEnabled: number
  cyclesCreated: number
  cyclesClosed: number
  ticketsRolledOver: number
  perProject: CycleReconcileReport[]
}

export async function migrateCycles(payload: Payload): Promise<CycleMigrationReport> {
  const perProject = await reconcileAllProjects(payload)

  return perProject.reduce<CycleMigrationReport>(
    (report, entry) => ({
      projectsEnabled: report.projectsEnabled + 1,
      cyclesCreated: report.cyclesCreated + entry.created,
      cyclesClosed: report.cyclesClosed + entry.closed,
      ticketsRolledOver: report.ticketsRolledOver + entry.rolledOver,
      perProject,
    }),
    {
      projectsEnabled: 0,
      cyclesCreated: 0,
      cyclesClosed: 0,
      ticketsRolledOver: 0,
      perProject,
    },
  )
}

async function main() {
  const payload = await getPayload({ config })
  const report = await migrateCycles(payload)

  console.log(`projects with cycles: ${report.projectsEnabled}`)
  console.log(`cycles provisioned:   ${report.cyclesCreated}`)
  console.log(`cycles closed:        ${report.cyclesClosed}`)
  console.log(`tickets rolled over:  ${report.ticketsRolledOver}`)

  if (report.projectsEnabled === 0) {
    console.log('Nothing to do: cycles are off for every project.')
  }

  process.exit(0)
}

const invokedDirectly = process.argv[1]?.includes('migrations/cycles')
if (invokedDirectly) void main()
