import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { VersionRow } from '@/components/history/VersionRow'
import type { HistoryDoc } from '@/app/api/history/types'

/**
 * W4 — Synchronous client components (T1, RTL + jsdom per the official
 * Next.js unit-testing setup): presentational components rendered against
 * props only — no server dependencies, no data fetching (their data layer
 * is covered by T2/T3; async server-component pages remain T4 territory).
 *
 * ConfirmDialog was rebuilt on the Radix-based Dialog primitive in the
 * upstream UI rebuild (PR#9-#11 port): the props are now open/loading/
 * confirmLabel/cancelLabel (formerly isOpen/isLoading/confirmText/
 * cancelText) and the Radix Dialog renders in a PORTAL, so assertions go
 * through screen (document scope), not the container.
 */
describe('W4: ConfirmDialog (design-system rebuild)', () => {
  it('renders the dialog content when open', () => {
    render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Delete ticket"
        message={'This cannot be undone.\nReally?'}
        confirmLabel="Confirm"
      />,
    )
    expect(screen.getByText('Delete ticket')).toBeInTheDocument()
    expect(screen.getByText(/This cannot be undone\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('renders nothing while closed (Radix Portal stays empty)', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        onClose={() => {}}
        onConfirm={() => {}}
        title="T"
        message="M"
        confirmLabel="Confirm"
      />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('disables actions while loading (spinner replaces the label, aria-busy set)', () => {
    render(
      <ConfirmDialog
        open
        loading
        onClose={() => {}}
        onConfirm={() => {}}
        title="T"
        message="M"
        confirmLabel="Confirm"
      />,
    )
    const confirm = screen.getByRole('button', { name: /Confirm/ })
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('supports custom button labels', () => {
    render(
      <ConfirmDialog
        open
        confirmLabel="Borrar"
        cancelLabel="Cancelar"
        onClose={() => {}}
        onConfirm={() => {}}
        title="T"
        message="M"
      />,
    )
    expect(screen.getByRole('button', { name: 'Borrar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })
})

const doc: HistoryDoc = {
  id: 'ver_0001',
  collection: 'tickets',
  parent: 'tick_0001',
  parentLabel: 'PCF-1 · Ship SPC-003',
  actor: { type: 'user', label: 'master@local.test' },
  autosave: false,
  createdAt: '2026-09-07T05:00:00.000Z',
  updatedAt: '2026-09-07T06:00:00.000Z',
}

describe('W4: VersionRow (presentational skeleton, collapsed state)', () => {
  it('renders the meta line of the audit-trail row', () => {
    render(<VersionRow doc={doc} onRestore={async () => true} />)
    // meta: parent label present; the row starts collapsed
    expect(screen.getByText(/PCF-1 · Ship SPC-003/)).toBeInTheDocument()
  })
})
