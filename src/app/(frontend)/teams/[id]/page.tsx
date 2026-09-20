import { TeamDetail } from '@/components/teams/TeamDetail'
import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import { TicketStatus } from '@/types/enums'

export const dynamic = 'force-dynamic'

interface TeamPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
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

export default async function TeamPage({ params, searchParams }: TeamPageProps) {
  const { id } = await params
  const { tab } = await searchParams
  const payload = await getPayload({ config })

  try {
    const team = await payload.findByID({ collection: 'teams', id, depth: 0 })
    if (!team) notFound()

    const countFor = (status?: TicketStatus) =>
      payload.count({
        collection: 'tickets',
        where: { team: { equals: id }, ...(status ? { status: { equals: status } } : {}) },
      })

    const [total, todo, inProgress, done] = await Promise.all([
      countFor(),
      countFor(TicketStatus.TODO),
      countFor(TicketStatus.IN_PROGRESS),
      countFor(TicketStatus.DONE),
    ])

    return (
      <TeamDetail
        team={team}
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
