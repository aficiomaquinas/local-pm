import { TeamDetail } from '@/components/teams/TeamDetail'
import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface TeamPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: TeamPageProps) {
  const { id } = await params
  try {
    const payload = await getPayload({ config })
    const team = await payload.findByID({ collection: 'teams', id, depth: 0 })
    return { title: `${team.name} · local-pm` }
  } catch {
    return { title: 'Team · local-pm' }
  }
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { id } = await params
  const payload = await getPayload({ config })

  try {
    const team = await payload.findByID({ collection: 'teams', id, depth: 0 })
    if (!team) notFound()

    const [ticketsResult, projectsResult] = await Promise.all([
      payload.find({
        collection: 'tickets',
        where: { team: { equals: id } },
        limit: 200,
        depth: 1,
        sort: 'sortOrder',
      }),
      payload.find({ collection: 'projects', limit: 100 }),
    ])

    return (
      <TeamDetail team={team} tickets={ticketsResult.docs} projects={projectsResult.docs} />
    )
  } catch {
    notFound()
  }
}
