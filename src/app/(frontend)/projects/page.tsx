import { ProjectsList } from '@/components/projects/ProjectsList'
import { getPayload } from 'payload'
import config from '@payload-config'
import { requireUser, projectScopeWhere, authRequired, scopedLocalArgs } from '@/lib/rbac'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Projects · local-pm' }

const PAGE_SIZE = 20

export default async function ProjectsPage() {
  const payload = await getPayload({ config })
  const user = authRequired() ? await requireUser() : null
  const scope = authRequired() ? await projectScopeWhere(user, 'id') : null

  const projectsResult = await payload.find({
    collection: 'projects',
    limit: PAGE_SIZE,
    page: 1,
    sort: '-createdAt',
    ...(scope ? { where: scope } : {}),
    ...scopedLocalArgs(user),
  })

  return (
    <ProjectsList
      initialProjects={projectsResult.docs}
      initialPagination={{
        page: projectsResult.page ?? 1,
        totalPages: projectsResult.totalPages,
        hasNextPage: projectsResult.hasNextPage,
        totalDocs: projectsResult.totalDocs,
      }}
    />
  )
}
