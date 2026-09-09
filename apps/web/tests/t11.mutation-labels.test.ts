import { describe, it, expect } from 'vitest'
import {
  humanFieldName,
  deltaFieldPaths,
  mutationInfo,
  isSoftDeleteSnapshot,
} from '@/components/history/mutationLabel'
import { detectRestoredFrom, groupHistoryFeed } from '@/components/history/grouping'
import type { HistoryDoc } from '@/app/api/history/types'

/**
 * T1 (SPC-005, action-plan item 2) — mutation label translation: deltas →
 * operator language. 'Created' ONLY on the group's first version, 'Updated
 * (n fields: …)' with human field names, 'Restored to <date>', and
 * 'Soft-deleted' for deleted: true snapshots.
 */

function doc(overrides: Partial<HistoryDoc> & { id: string }): HistoryDoc {
  return {
    collection: 'tickets',
    parent: 'tick_1',
    parentLabel: 'PCF-1 · Ship',
    autosave: false,
    createdAt: '2026-09-08T05:00:00.000Z',
    updatedAt: '2026-09-08T06:00:00.000Z',
    diff: null,
    version: {},
    ...overrides,
  } as HistoryDoc
}

describe('T1: delta → human field names', () => {
  it('maps schema paths to labels', () => {
    expect(humanFieldName('status')).toBe('Status')
    expect(humanFieldName('priority')).toBe('Priority')
    expect(humanFieldName('title')).toBe('Title')
    expect(humanFieldName('project')).toBe('Project')
    expect(humanFieldName('team')).toBe('Team')
    expect(humanFieldName('dueDate')).toBe('Due Date')
    expect(humanFieldName('labels')).toBe('Labels')
    expect(humanFieldName('subtasks')).toBe('Subtasks')
    expect(humanFieldName('blockedBy')).toBe('Blocked By')
  })

  it('falls back to the raw path for unknown fields', () => {
    expect(humanFieldName('customField')).toBe('customField')
  })

  it('deltaFieldPaths: top-level keys minus _t; null-safe', () => {
    expect(deltaFieldPaths({ status: ['TODO', 'DONE'], priority: ['LOW', 'HIGH'], _t: 'a' })).toEqual([
      'status',
      'priority',
    ])
    expect(deltaFieldPaths(null)).toEqual([])
    expect(deltaFieldPaths(undefined)).toEqual([])
    expect(deltaFieldPaths({})).toEqual([])
  })
})

describe('T1: mutationInfo (delta → operator language)', () => {
  it('creation row → Created (no fields)', () => {
    const m = mutationInfo(doc({ id: 'v1', diff: {} }), true, null)
    expect(m.kind).toBe('created')
    expect(m.label).toBe('Created')
    expect(m.fields).toEqual([])
  })

  it('update with 2 fields → "Updated (2 fields: Status, Priority)"', () => {
    const d = doc({
      id: 'v2',
      diff: { status: ['TODO', 'DONE'], priority: ['LOW', 'HIGH'] },
    })
    const m = mutationInfo(d, false, null)
    expect(m.kind).toBe('updated')
    expect(m.label).toBe('Updated (2 fields: Status, Priority)')
  })

  it('single-field update uses singular "field"', () => {
    const m = mutationInfo(doc({ id: 'v2', diff: { title: ['A', 'B'] } }), false, null)
    expect(m.label).toBe('Updated (1 field: Title)')
  })

  it('non-creation row with no delta → plain Updated (not Created)', () => {
    const m = mutationInfo(doc({ id: 'v2', diff: null }), false, null)
    expect(m.kind).toBe('updated')
    expect(m.label).toBe('Updated')
  })

  it('restored entry wins over field list: "Restored to <date>"', () => {
    const d = doc({ id: 'v3', diff: { status: ['DONE', 'TODO'] } })
    const m = mutationInfo(d, false, '2026-09-08T05:00:00.000Z')
    expect(m.kind).toBe('restored')
    expect(m.label).toBe('Restored to Sep 8, 2026, 05:00 UTC')
    // fields carry the HUMAN names (translated list; noise excluded).
    expect(m.fields).toEqual(['Status'])
  })

  it('excludes attribution/timestamp noise from the label list', () => {
    const d = doc({
      id: 'v2',
      diff: {
        status: ['TODO', 'DONE'],
        actorType: ['anonymous', 'user'],
        actorId: [null, 'u_1'],
        actorLabel: ['anonymous', 'user:m@x'],
        updatedAt: ['2026-09-08T05:00:00.000Z', '2026-09-08T06:00:00.000Z'],
      },
    })
    const m = mutationInfo(d, false, null)
    expect(m.label).toBe('Updated (1 field: Status)')
  })

  it('soft-deleted snapshot → Soft-deleted', () => {
    const d = doc({ id: 'v4', diff: { deleted: [false, true] }, version: { deleted: true } })
    expect(isSoftDeleteSnapshot(d)).toBe(true)
    const m = mutationInfo(d, false, null)
    expect(m.kind).toBe('soft-deleted')
    expect(m.label).toBe('Soft-deleted')
  })

  it('a CREATION whose snapshot has deleted:true is still Created (fresh doc created deleted is not a delete event)', () => {
    const d = doc({ id: 'v1', diff: {}, version: { deleted: true } })
    const m = mutationInfo(d, true, null)
    expect(m.kind).toBe('created')
  })
})

describe('T1: detectRestoredFrom (snapshot-equality restore detection)', () => {
  const v1 = doc({
    id: 'v1',
    updatedAt: '2026-09-08T05:00:00.000Z',
    version: { title: 'T', status: 'TODO' },
  })
  const v2 = doc({
    id: 'v2',
    updatedAt: '2026-09-08T07:00:00.000Z',
    diff: { status: ['TODO', 'DONE'] },
    version: { title: 'T', status: 'DONE' },
  })
  // Restore of v1: identical snapshot, different actor + newer date.
  const v3 = doc({
    id: 'v3',
    updatedAt: '2026-09-08T09:00:00.000Z',
    diff: { status: ['DONE', 'TODO'] },
    version: { title: 'T', status: 'TODO', actorType: 'user', actorLabel: 'user:m@x' },
  })

  it('identical older snapshot → the matched version updatedAt (attribution ignored)', () => {
    expect(detectRestoredFrom(v3, [v3, v2, v1])).toBe('2026-09-08T05:00:00.000Z')
  })

  it('no matching older snapshot → null (plain update)', () => {
    expect(detectRestoredFrom(v2, [v3, v2, v1])).toBeNull()
  })

  it('grouping still works and marks the oldest as creation', () => {
    const groups = groupHistoryFeed([v3, v2, v1])
    expect(groups).toHaveLength(1)
    expect(groups[0].creation?.id).toBe('v1')
  })
})
