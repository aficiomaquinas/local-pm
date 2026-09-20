import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ProjectDetail } from '@/components/projects/ProjectDetail'
import { TicketStatus } from '@/types/enums'

export const dynamic = 'force-dynamic'

interface ProjectPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

export async function generateMetadata({ params }: ProjectPageProps) {
  const { id } = await params
  try {
    const payload = await getPayload({ config })
    const project = await payload.findByID({ collection: 'projects', id, depth: 0 })
    return { title: `${project.name} · local-pm` }
  } catch {
    return { title: 'Project · local-pm' }
  }
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { id } = await params
  const { tab } = await searchParams
  const payload = await getPayload({ config })

  try {
    const project = await payload.findByID({ collection: 'projects', id, depth: 0 })
    if (!project) notFound()

    const countFor = (status?: TicketStatus) =>
      payload.count({
        collection: 'tickets',
        where: {
          project: { equals: id },
          ...(status ? { status: { equals: status } } : {}),
        },
      })

    const [total, todo, inProgress, done] = await Promise.all([
      countFor(),
      countFor(TicketStatus.TODO),
      countFor(TicketStatus.IN_PROGRESS),
      countFor(TicketStatus.DONE),
    ])

    return (
      <ProjectDetail
        project={project}
        stats={{
          total: total.totalDocs,
          todo: todo.totalDocs,
          inProgress: inProgress.totalDocs,
          done: done.totalDocs,
        }}
        initialTab={tab === 'tickets' ? 'tickets' : 'overview'}
      />
    )
  } catch {
    notFound()
  }
}
