import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { InitiativeDetail } from '@/components/initiatives/InitiativeDetail'
import { rollupProjects } from '@/lib/initiative-stats'
import { projectRefsOf } from '@/lib/initiative'
import { accessOpen, requireUser } from '@/lib/rbac'
import type { Initiative } from '@/payload-types'

export const dynamic = 'force-dynamic'

interface InitiativePageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: InitiativePageProps) {
  const { id } = await params
  try {
    const payload = await getPayload({ config })
    const initiative = await payload.findByID({ collection: 'initiatives', id, depth: 0 })
    return { title: `${initiative.name} · local-pm` }
  } catch {
    return { title: 'Initiative · local-pm' }
  }
}

export default async function InitiativePage({ params }: InitiativePageProps) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = accessOpen() ? await requireUser() : null

  try {
    const initiative = (await payload.findByID({
      collection: 'initiatives',
      id,
      depth: 1,
      ...(accessOpen() ? {} : { user: user ?? undefined, overrideAccess: false as const }),
    })) as Initiative
    if (!initiative) notFound()

    const projects = projectRefsOf(initiative)
    const rollups = await rollupProjects(payload, projects)

    return <InitiativeDetail initiative={initiative} projectRollups={rollups} />
  } catch {
    notFound()
  }
}
