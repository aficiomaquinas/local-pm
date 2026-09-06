import { ProjectDetail } from '@/components/projects/ProjectDetail'
import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params
  const payload = await getPayload({ config })

  try {
    const project = await payload.findByID({
      collection: 'projects',
      id,
      depth: 0,
    })

    if (!project) {
      notFound()
    }

    // Get tickets for this project
    const ticketsResult = await payload.find({
      collection: 'tickets',
      where: {
        project: { equals: id },
      },
      limit: 1000,
      depth: 1,
    })

    // Get teams for dropdown
    const teamsResult = await payload.find({
      collection: 'teams',
      limit: 100,
    })

    return (
      <ProjectDetail
        project={project}
        tickets={ticketsResult.docs}
        teams={teamsResult.docs}
      />
    )
  } catch {
    notFound()
  }
}
