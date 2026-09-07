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
 */
describe('W4: ConfirmDialog (pure presentational)', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog isOpen={false} onClose={() => {}} onConfirm={() => {}} title="T" message="M" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders title, message and buttons when open', () => {
    render(
      <ConfirmDialog
        isOpen
        onClose={() => {}}
        onConfirm={() => {}}
        title="Delete ticket"
        message={'This cannot be undone.\nReally?'}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Delete ticket' })).toBeInTheDocument()
    expect(screen.getByText(/This cannot be undone\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('shows Processing… and disables actions while loading', () => {
    render(
      <ConfirmDialog
        isOpen
        isLoading
        onClose={() => {}}
        onConfirm={() => {}}
        title="T"
        message="M"
      />,
    )
    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('supports custom button labels', () => {
    render(
      <ConfirmDialog
        isOpen
        confirmText="Borrar"
        cancelText="Cancelar"
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
