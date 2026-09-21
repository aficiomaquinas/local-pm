import type { Payload } from 'payload'
import type { Project, Status } from '@/payload-types'
import { StatusType } from '@/types/enums'
import type { ProjectRollup } from '@/lib/initiative'

function projectIdOfStatus(status: Status): string | null {
  const project = status.project
  if (!project) return null
  return typeof project === 'object' ? String(project.id) : String(project)
}

export async function rollupProjects(
  payload: Payload,
  projects: Pick<Project, 'id' | 'name'>[],
): Promise<ProjectRollup[]> {
  if (projects.length === 0) return []

  const statuses = await payload.find({
    collection: 'statuses',
    limit: 500,
    depth: 0,
  })

  const all = statuses.docs as Status[]
  const scopeFor = (projectId: string) =>
    all.filter((status) => {
      const owner = projectIdOfStatus(status)
      return owner === null || owner === projectId
    })

  return Promise.all(
    projects.map(async (project) => {
      const scope = scopeFor(project.id)
      const idsOfType = (...types: StatusType[]) =>
        scope.filter((status) => types.includes(status.type as StatusType)).map((s) => s.id)

      const countFor = (statusIds?: string[]) =>
        payload.count({
          collection: 'tickets',
          where: {
            project: { equals: project.id },
            ...(statusIds ? { status: { in: statusIds } } : {}),
          },
        })

      const [total, done, cancelled, started] = await Promise.all([
        countFor(),
        countFor(idsOfType(StatusType.COMPLETED)),
        countFor(idsOfType(StatusType.CANCELLED)),
        countFor(idsOfType(StatusType.STARTED)),
      ])

      return {
        id: project.id,
        name: project.name,
        total: total.totalDocs,
        done: done.totalDocs,
        cancelled: cancelled.totalDocs,
        started: started.totalDocs,
      }
    }),
  )
}
