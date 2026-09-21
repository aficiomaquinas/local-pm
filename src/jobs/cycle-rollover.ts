import type { TaskConfig } from 'payload'
import { reconcileAllProjects } from '@/lib/cycle-service'

export const CYCLE_QUEUE = 'cycles'

export const CYCLE_CRON = process.env.LOCAL_PM_CYCLE_CRON || '0 * * * *'

export function cycleCronEnabled(): boolean {
  return process.env.LOCAL_PM_DISABLE_CYCLE_CRON !== 'true'
}

export const cycleRolloverTask: TaskConfig<'cycleRollover'> = {
  slug: 'cycleRollover',
  label: 'Provision cycles and roll over incomplete work',
  schedule: [{ cron: CYCLE_CRON, queue: CYCLE_QUEUE }],
  outputSchema: [
    { name: 'projects', type: 'number' },
    { name: 'created', type: 'number' },
    { name: 'closed', type: 'number' },
    { name: 'rolledOver', type: 'number' },
  ],
  handler: async ({ req }) => {
    const reports = await reconcileAllProjects(req.payload)

    const output = reports.reduce(
      (total, report) => ({
        projects: total.projects + 1,
        created: total.created + report.created,
        closed: total.closed + report.closed,
        rolledOver: total.rolledOver + report.rolledOver,
      }),
      { projects: 0, created: 0, closed: 0, rolledOver: 0 },
    )

    if (output.created > 0 || output.closed > 0) {
      req.payload.logger.info(
        `Cycles: provisioned ${output.created}, closed ${output.closed}, rolled over ${output.rolledOver} tickets across ${output.projects} projects.`,
      )
    }

    return { output }
  },
}
