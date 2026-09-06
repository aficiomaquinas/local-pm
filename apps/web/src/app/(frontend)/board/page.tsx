import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { getPayload } from 'payload'
import config from '@payload-config'
import { TicketStatus } from '@/types/enums'
import type { Where } from 'payload'

export const dynamic = 'force-dynamic'

const TICKETS_PER_COLUMN = 20

interface BoardPageProps {
  searchParams: Promise<{ project?: string; team?: string }>
}

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const params = await searchParams
  const projectFilter = params.project || null
  const teamFilter = params.team || null

  const payload = await getPayload({ config })

  // Build where clause for each status with optional project/team filters
  const buildWhere = (status: TicketStatus): Where => {
    const conditions: Where = { status: { equals: status } }
    if (projectFilter) {
      conditions.project = { equals: projectFilter }
    }
    if (teamFilter) {
      conditions.team = { equals: teamFilter }
    }
    return conditions
  }

  // Fetch tickets per status column in parallel
  const [todoResult, inProgressResult, doneResult, projectsResult, teamsResult] = await Promise.all([
    payload.find({
      collection: 'tickets',
      limit: TICKETS_PER_COLUMN,
      page: 1,
      sort: 'sortOrder',
      depth: 2,
      where: buildWhere(TicketStatus.TODO),
    }),
    payload.find({
      collection: 'tickets',
      limit: TICKETS_PER_COLUMN,
      page: 1,
      sort: 'sortOrder',
      depth: 2,
      where: buildWhere(TicketStatus.IN_PROGRESS),
    }),
    payload.find({
      collection: 'tickets',
      limit: TICKETS_PER_COLUMN,
      page: 1,
      sort: 'sortOrder',
      depth: 2,
      where: buildWhere(TicketStatus.DONE),
    }),
    payload.find({
      collection: 'projects',
      limit: 100,
    }),
    payload.find({
      collection: 'teams',
      limit: 100,
    }),
  ])

  // Combine all tickets
  const initialTickets = [
    ...todoResult.docs,
    ...inProgressResult.docs,
    ...doneResult.docs,
  ]

  // Build per-column pagination info
  const initialColumnPagination = [
    {
      status: TicketStatus.TODO,
      page: todoResult.page ?? 1,
      totalPages: todoResult.totalPages,
      hasNextPage: todoResult.hasNextPage,
      totalDocs: todoResult.totalDocs,
    },
    {
      status: TicketStatus.IN_PROGRESS,
      page: inProgressResult.page ?? 1,
      totalPages: inProgressResult.totalPages,
      hasNextPage: inProgressResult.hasNextPage,
      totalDocs: inProgressResult.totalDocs,
    },
    {
      status: TicketStatus.DONE,
      page: doneResult.page ?? 1,
      totalPages: doneResult.totalPages,
      hasNextPage: doneResult.hasNextPage,
      totalDocs: doneResult.totalDocs,
    },
  ]

  return (
    <KanbanBoard
      initialTickets={initialTickets}
      projects={projectsResult.docs}
      teams={teamsResult.docs}
      initialColumnPagination={initialColumnPagination}
    />
  )
}
