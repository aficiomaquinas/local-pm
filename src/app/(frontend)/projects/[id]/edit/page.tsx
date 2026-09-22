import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ProjectForm } from '@/components/projects/ProjectForm'
import { requireUser, authRequired, scopedLocalArgs } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

interface EditProjectPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: EditProjectPageProps) {
  const { id } = await params
  try {
    const payload = await getPayload({ config })
    const project = await payload.findByID({ collection: 'projects', id, depth: 0 })
    return { title: `Edit ${project.name} · local-pm` }
  } catch {
    return { title: 'Edit project · local-pm' }
  }
}

export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = authRequired() ? await requireUser() : null

  try {
    const project = await payload.findByID({
      collection: 'projects',
      id,
      depth: 0,
      ...scopedLocalArgs(user),
    })
    if (!project) notFound()
    return <ProjectForm project={project} />
  } catch {
    notFound()
  }
}
