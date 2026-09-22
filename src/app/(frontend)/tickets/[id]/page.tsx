import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { TicketDetail } from '@/components/tickets/TicketDetail'
import { requireUser, authRequired, scopedLocalArgs } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

interface TicketPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: TicketPageProps) {
  const { id } = await params
  const user = authRequired() ? await requireUser() : null
  try {
    const payload = await getPayload({ config })
    const ticket = await payload.findByID({ collection: 'tickets', id, depth: 0, ...scopedLocalArgs(user) })
    return { title: `${ticket.ticketId ?? 'Ticket'} · ${ticket.title} · local-pm` }
  } catch {
    return { title: 'Ticket · local-pm' }
  }
}

export default async function TicketPage({ params }: TicketPageProps) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = authRequired() ? await requireUser() : null

  try {
    const ticket = await payload.findByID({
      collection: 'tickets',
      id,
      depth: 2,
      ...scopedLocalArgs(user),
    })
    if (!ticket) notFound()
    return <TicketDetail ticket={ticket} />
  } catch {
    notFound()
  }
}
