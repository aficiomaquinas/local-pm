import { ProjectDetail } from '@/components/projects/ProjectDetail'
import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface ProjectPageProps {
  params: Promise<{ id: string }>
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

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params
  const payload = await getPayload({ config })

  try {
    const project = await payload.findByID({ collection: 'projects', id, depth: 0 })
    if (!project) notFound()

    const [ticketsResult, teamsResult] = await Promise.all([
      payload.find({
        collection: 'tickets',
        where: { project: { equals: id } },
        limit: 200,
        depth: 1,
        sort: 'sortOrder',
      }),
      payload.find({ collection: 'teams', limit: 100 }),
    ])

    return (
      <ProjectDetail project={project} tickets={ticketsResult.docs} teams={teamsResult.docs} />
    )
  } catch {
    notFound()
  }
}
