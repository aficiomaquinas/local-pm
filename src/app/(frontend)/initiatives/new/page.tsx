import { InitiativeForm } from '@/components/initiatives/InitiativeForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New initiative · local-pm' }

export default function NewInitiativePage() {
  return <InitiativeForm initiative={null} />
}
