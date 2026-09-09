import type { Metadata } from 'next'
import { OptionsPanel } from '@/components/settings/OptionsPanel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Options · Local PM',
  description: 'Operator settings (superadmin): soft delete behavior',
}

// SPC-005 options panel (action-plan item 3): minimal superadmin settings
// surface, History-adjacent (same shell/layout as the History page). The
// ACL itself is enforced server-side by the site-settings global's update
// access — this page only renders the toggle; unauthorized saves 403.
export default function OptionsPage() {
  return <OptionsPanel />
}
