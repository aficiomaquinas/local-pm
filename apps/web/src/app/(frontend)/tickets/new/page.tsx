import { getPayload } from 'payload'
import config from '@payload-config'
import { TicketForm } from '@/components/tickets/TicketForm'
import { TicketStatus } from '@/types/enums'
import type { Project } from '@/payload-types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New ticket · local-pm' }

interface NewTicketPageProps {
  searchParams: Promise<{ project?: string; status?: string; returnTo?: string }>
}

export default async function NewTicketPage({ searchParams }: NewTicketPageProps) {
  const params = await searchParams
  const projectId = params.project || null
  const status = (Object.values(TicketStatus) as string[]).includes(params.status ?? '')
    ? (params.status as TicketStatus)
    : TicketStatus.TODO

  let project: Project | null = null
  if (projectId) {
    try {
      const payload = await getPayload({ config })
      project = await payload.findByID({ collection: 'projects', id: projectId, depth: 0 })
    } catch {
      project = null
    }
  }

  return (
    <TicketForm
      ticket={null}
      project={project}
      defaultProjectId={project?.id ?? null}
      defaultStatus={status}
      returnTo={params.returnTo}
    />
  )
}
