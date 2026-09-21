import { getPayload } from 'payload'
import config from '@payload-config'
import { TicketForm } from '@/components/tickets/TicketForm'
import { resolveWorkflow } from '@/lib/workflow'
import type { Project } from '@/payload-types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New ticket · local-pm' }

interface NewTicketPageProps {
  searchParams: Promise<{ project?: string; status?: string; returnTo?: string }>
}

export default async function NewTicketPage({ searchParams }: NewTicketPageProps) {
  const params = await searchParams
  const projectId = params.project || null
  const payload = await getPayload({ config })
  const workflow = await resolveWorkflow(payload, projectId)
  const requested = params.status ?? ''
  const status =
    workflow.find((entry) => entry.id === requested || entry.key === requested)?.id ??
    workflow[0]?.id ??
    ''

  let project: Project | null = null
  if (projectId) {
    try {
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
