import { InitiativesList } from '@/components/initiatives/InitiativesList'
import { getPayload } from 'payload'
import config from '@payload-config'
import { accessOpen, requireUser } from '@/lib/rbac'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Initiatives · local-pm' }

const PAGE_SIZE = 20

export default async function InitiativesPage() {
  const payload = await getPayload({ config })
  const user = accessOpen() ? await requireUser() : null

  const result = await payload.find({
    collection: 'initiatives',
    limit: PAGE_SIZE,
    page: 1,
    depth: 1,
    sort: '-createdAt',
    ...(accessOpen() ? {} : { user: user ?? undefined, overrideAccess: false as const }),
  })

  return (
    <InitiativesList
      initialInitiatives={result.docs}
      initialPagination={{
        page: result.page ?? 1,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        totalDocs: result.totalDocs,
      }}
    />
  )
}
