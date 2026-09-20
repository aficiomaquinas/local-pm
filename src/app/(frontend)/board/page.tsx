import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { getPayload } from 'payload'
import config from '@payload-config'
import { TicketStatus } from '@/types/enums'
import type { Where } from 'payload'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Board · local-pm' }

const TICKETS_PER_COLUMN = 20
const MIN_SEARCH = 3

interface BoardPageProps {
  searchParams: Promise<{ project?: string; team?: string; q?: string }>
}

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const params = await searchParams
  const projectFilter = params.project || null
  const teamFilter = params.team || null
  const query = (params.q || '').trim()

  const payload = await getPayload({ config })

  const buildWhere = (status: TicketStatus): Where => {
    const conditions: Where = { status: { equals: status } }
    if (projectFilter) conditions.project = { equals: projectFilter }
    if (teamFilter) conditions.team = { equals: teamFilter }
    if (query.length >= MIN_SEARCH) conditions.title = { like: query }
    return conditions
  }

  const findColumn = (status: TicketStatus) =>
    payload.find({
      collection: 'tickets',
      limit: TICKETS_PER_COLUMN,
      page: 1,
      sort: 'sortOrder',
      depth: 2,
      where: buildWhere(status),
    })

  const [todoResult, inProgressResult, doneResult, projectsResult] = await Promise.all([
    findColumn(TicketStatus.TODO),
    findColumn(TicketStatus.IN_PROGRESS),
    findColumn(TicketStatus.DONE),
    payload.find({ collection: 'projects', limit: 0, depth: 0 }),
  ])

  const initialTickets = [...todoResult.docs, ...inProgressResult.docs, ...doneResult.docs]

  const initialColumnPagination = [
    { status: TicketStatus.TODO, result: todoResult },
    { status: TicketStatus.IN_PROGRESS, result: inProgressResult },
    { status: TicketStatus.DONE, result: doneResult },
  ].map(({ status, result }) => ({
    status,
    page: result.page ?? 1,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
    totalDocs: result.totalDocs,
  }))

  return (
    <KanbanBoard
      initialTickets={initialTickets}
      hasProjects={projectsResult.totalDocs > 0}
      initialColumnPagination={initialColumnPagination}
    />
  )
}
