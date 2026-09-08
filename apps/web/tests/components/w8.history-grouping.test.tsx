import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { HistoryClient } from '@/components/history/HistoryClient'
import type { HistoryResponse } from '@/app/api/history/types'

/**
 * W8b — HistoryClient renders the grouped feed (BUG-2, jsdom): given N
 * versions of the same parent plus another ticket's version, the UI must
 * show one collapsible group per ticket (not a flat list of unrelated
 * "created" cards), the leading group expanded by default, the rest
 * collapsed, and 'created' as a group-level mark — not repeated per row.
 */

vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({
    ok: true,
    json: async () => ({ docs: [] }),
  })),
)

function doc(id: string, parent: string, updatedAt: string, diff: Record<string, unknown> | null) {
  return {
    id,
    collection: 'tickets' as const,
    parent,
    parentLabel: parent === 'tick_a' ? 'PCF-1 · Ship SPC-003' : 'PCF-2 · Other ticket',
    autosave: false,
    createdAt: updatedAt,
    updatedAt,
    diff,
  }
}

const initialData: HistoryResponse = {
  docs: [
    doc('va3', 'tick_a', '2026-09-07T10:00:00.000Z', { status: ['IN_PROGRESS', 'DONE'] }),
    doc('vb1', 'tick_b', '2026-09-07T09:00:00.000Z', null),
    doc('va2', 'tick_a', '2026-09-07T08:00:00.000Z', { status: ['TODO', 'IN_PROGRESS'] }),
    doc('va1', 'tick_a', '2026-09-07T06:00:00.000Z', {}),
  ],
  page: 1,
  limit: 20,
  totalDocs: 4,
}

describe('W8b: HistoryClient grouped render (BUG-2)', () => {
  it('renders one collapsible group per ticket, leading group expanded by default', async () => {
    render(<HistoryClient initialData={initialData} />)

    // Two group headers (one per parent) with their collection badges.
    // (HistoryFilters also mentions 'tickets', so assert ≥ 2, not exact.)
    await waitFor(() => expect(screen.getAllByText('tickets').length).toBeGreaterThanOrEqual(2))
    // Expanded group: its label shows in the header AND in each of its 3
    // version rows → 4 occurrences.
    expect(screen.getAllByText('PCF-1 · Ship SPC-003')).toHaveLength(4)
    // Collapsed group: header only — a rendered version row would add a 2nd.
    expect(screen.getAllByText('PCF-2 · Other ticket')).toHaveLength(1)

    // Leading group (tick_a) expanded: its three version rows render — each
    // collapsible row carries a Restore control (rows start collapsed, so
    // their internals are not in the DOM yet).
    expect(screen.getAllByTitle('Restore this version')).toHaveLength(3)

    // Second group (tick_b) collapsed: its version row is NOT rendered
    // (only its group header restore-less button exists).
    expect(screen.getAllByText('1 version')).toHaveLength(1)
  })

  it('shows version counts and group-level creation marks', () => {
    render(<HistoryClient initialData={initialData} />)

    // 3 versions in the first group, 1 in the second.
    expect(screen.getByText('3 versions')).toBeInTheDocument()
    expect(screen.getByText('1 version')).toBeInTheDocument()

    // 'created' marks: one per group header (2) + one on the expanded
    // group's creation row (va1) = 3 — never one per version row
    // (the old bug: every row carried its own independent created badge).
    expect(screen.getAllByText('created')).toHaveLength(3)
  })
})
