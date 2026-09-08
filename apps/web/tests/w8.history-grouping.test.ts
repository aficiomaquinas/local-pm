import { describe, it, expect } from 'vitest'
import { groupHistoryFeed, isCreationRow, type HistoryGroup } from '@/components/history/grouping'
import type { HistoryDoc } from '@/app/api/history/types'

/**
 * W8 — history feed grouping (BUG-2, T1 per SPC-003 §7.2): the pure
 * (docs → groups) fold the client now renders. Pins the contract: one group
 * per (collection, parent), versions newest-first inside, 'Created' attached
 * to exactly the group's oldest version, and heterogeneous feeds keeping one
 * group per parent — never a flat list of unrelated "created" cards.
 */

function doc(overrides: Partial<HistoryDoc> & { id: string }): HistoryDoc {
  return {
    collection: 'tickets',
    parent: 'tick_1',
    parentLabel: 'PCF-1 · Ship SPC-003',
    autosave: false,
    createdAt: '2026-09-07T05:00:00.000Z',
    updatedAt: '2026-09-07T06:00:00.000Z',
    diff: { status: ['TODO', 'DONE'] },
    ...overrides,
  } as HistoryDoc
}

describe('W8: groupHistoryFeed (BUG-2 grouping)', () => {
  it('N versions of one parent → 1 group, newest-first order preserved', () => {
    const feed = [
      doc({ id: 'v3', updatedAt: '2026-09-07T10:00:00.000Z' }),
      doc({ id: 'v2', updatedAt: '2026-09-07T08:00:00.000Z' }),
      doc({ id: 'v1', updatedAt: '2026-09-07T06:00:00.000Z' }),
    ]
    const groups = groupHistoryFeed(feed)

    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('tickets:tick_1')
    expect(groups[0].docs.map((d) => d.id)).toEqual(['v3', 'v2', 'v1'])
    expect(groups[0].parentLabel).toBe('PCF-1 · Ship SPC-003')
  })

  it('different parents → separate groups even within one collection', () => {
    const feed = [
      doc({ id: 'va2', parent: 'tick_a', updatedAt: '2026-09-07T10:00:00.000Z' }),
      doc({ id: 'vb2', parent: 'tick_b', updatedAt: '2026-09-07T09:00:00.000Z' }),
      doc({ id: 'va1', parent: 'tick_a', updatedAt: '2026-09-07T06:00:00.000Z' }),
    ]
    const groups = groupHistoryFeed(feed)

    expect(groups.map((g) => g.key)).toEqual(['tickets:tick_a', 'tickets:tick_b'])
    expect(groups[0].docs.map((d) => d.id)).toEqual(['va2', 'va1'])
    expect(groups[1].docs.map((d) => d.id)).toEqual(['vb2'])
  })

  it('same parent id across collections never merges (key = collection:parent)', () => {
    const feed = [
      doc({ id: 'vt', collection: 'tickets', parent: 'x1' }),
      doc({ id: 'vp', collection: 'projects', parent: 'x1' }),
    ]
    const groups = groupHistoryFeed(feed)
    expect(groups.map((g) => g.key)).toEqual(['tickets:x1', 'projects:x1'])
  })

  it('creation = the OLDEST version (empty diff), even though the feed is newest-first', () => {
    const feed = [
      doc({ id: 'v3', diff: { status: ['IN_PROGRESS', 'DONE'] }, updatedAt: '2026-09-07T10:00:00.000Z' }),
      doc({ id: 'v2', diff: { status: ['TODO', 'IN_PROGRESS'] }, updatedAt: '2026-09-07T08:00:00.000Z' }),
      doc({ id: 'v1', diff: {}, updatedAt: '2026-09-07T06:00:00.000Z' }), // creation: diff vs {}
    ]
    const groups = groupHistoryFeed(feed)

    expect(groups[0].creation?.id).toBe('v1')
  })

  it('missing predecessor: first-seen row (null diff) becomes the creation candidate', () => {
    const feed = [doc({ id: 'vOnly', diff: null })]
    const groups = groupHistoryFeed(feed)
    expect(groups[0].creation?.id).toBe('vOnly')
  })

  it('isCreationRow: null/undefined/{} diff → true; any real delta → false', () => {
    expect(isCreationRow(doc({ id: 'a', diff: null }))).toBe(true)
    expect(isCreationRow(doc({ id: 'b', diff: {} }))).toBe(true)
    expect(isCreationRow(doc({ id: 'c', diff: { title: ['A', 'B'] } }))).toBe(false)
  })

  it('empty feed → no groups', () => {
    expect(groupHistoryFeed([])).toEqual([])
  })

  it('group carries collection + parent for the collapsible header', () => {
    const groups: HistoryGroup[] = groupHistoryFeed([doc({ id: 'v1', collection: 'teams', parent: 'team_9', parentLabel: 'Platform' })])
    expect(groups[0].collection).toBe('teams')
    expect(groups[0].parent).toBe('team_9')
    expect(groups[0].parentLabel).toBe('Platform')
  })
})
