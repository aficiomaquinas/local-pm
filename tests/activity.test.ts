import { describe, it, expect } from 'vitest'
import {
  diffTicket,
  describeEvent,
  displayValue,
  groupActivity,
  isCommentAction,
  hiddenAlongsideComments,
} from '@/lib/activity'

const base = {
  id: 't1',
  title: 'Fix login redirect',
  status: { id: 's-todo', name: 'Todo' },
  priority: 'MEDIUM',
  assignee: null,
  project: 'p1',
  team: null,
  dueDate: null,
  labels: [],
  blockedBy: [],
  subtasks: [],
}

describe('diffTicket', () => {
  it('reports a create as a single event carrying no field', () => {
    expect(diffTicket(null, base)).toEqual([{ action: 'created', field: null, from: null, to: null }])
  })

  it('names both sides of a status change in human words', () => {
    const events = diffTicket(base, { ...base, status: { id: 's-doing', name: 'In Progress' } })
    expect(events).toEqual([
      { action: 'changed', field: 'status', from: 'Todo', to: 'In Progress' },
    ])
  })

  it('records one event per changed field', () => {
    const events = diffTicket(base, {
      ...base,
      status: { id: 's-done', name: 'Done' },
      priority: 'URGENT',
    })
    expect(events.map((e) => e.field)).toEqual(['status', 'priority'])
  })

  it('ignores a save that changed nothing it tracks', () => {
    expect(diffTicket(base, { ...base, sortOrder: 99 })).toEqual([])
  })

  it('ignores sortOrder, so dragging a card does not flood the feed', () => {
    const events = diffTicket({ ...base, sortOrder: 1 }, { ...base, sortOrder: 2 })
    expect(events).toEqual([])
  })

  it('does not fire on a field the update never mentioned', () => {
    const events = diffTicket(base, { id: 't1', status: 'DONE' })
    expect(events.map((e) => e.field)).toEqual(['status'])
  })

  it('compares relationships by id, whether populated or not', () => {
    const before = { ...base, assignee: 'm1' }
    const after = { ...base, assignee: { id: 'm1', name: 'Alex' } }
    expect(diffTicket(before, after)).toEqual([])
  })

  it('reads a name off a populated relationship', () => {
    const events = diffTicket(base, { ...base, assignee: { id: 'm1', name: 'Alex' } })
    expect(events).toEqual([
      { action: 'changed', field: 'assignee', from: null, to: 'Alex' },
    ])
  })

  it('treats an unassignment as a cleared value', () => {
    const events = diffTicket({ ...base, assignee: { id: 'm1', name: 'Alex' } }, base)
    expect(events).toEqual([
      { action: 'changed', field: 'assignee', from: 'Alex', to: null },
    ])
  })

  it('summarises labels by name rather than by object', () => {
    const events = diffTicket(base, { ...base, labels: [{ name: 'bug' }, { name: 'ui' }] })
    expect(events[0].to).toBe('bug, ui')
  })

  it('reduces subtasks to a completion count', () => {
    const events = diffTicket(base, {
      ...base,
      subtasks: [{ title: 'a', completed: true }, { title: 'b', completed: false }],
    })
    expect(events[0]).toMatchObject({ field: 'subtasks', to: '1/2 done' })
  })

  it('notices a subtask being ticked off', () => {
    const before = { ...base, subtasks: [{ title: 'a', completed: false }] }
    const after = { ...base, subtasks: [{ title: 'a', completed: true }] }
    expect(diffTicket(before, after)[0]).toMatchObject({ from: '0/1 done', to: '1/1 done' })
  })

  it('compares a due date by day, not by timestamp', () => {
    const before = { ...base, dueDate: '2026-09-20T09:00:00.000Z' }
    const after = { ...base, dueDate: '2026-09-20T17:30:00.000Z' }
    expect(diffTicket(before, after)).toEqual([])
  })

  it('records a real due date move', () => {
    const before = { ...base, dueDate: '2026-09-20T09:00:00.000Z' }
    const after = { ...base, dueDate: '2026-09-25T09:00:00.000Z' }
    expect(diffTicket(before, after)[0]).toMatchObject({ from: '2026-09-20', to: '2026-09-25' })
  })

  it('reports a description edit without leaking its contents', () => {
    const events = diffTicket(base, { ...base, description: { root: { children: [] } } })
    expect(events).toEqual([
      { action: 'changed', field: 'description', from: null, to: null },
    ])
  })
})

describe('displayValue', () => {
  it('falls back to the raw value for a choice it does not know', () => {
    expect(displayValue('status', 'ARCHIVED')).toBe('ARCHIVED')
  })

  it('treats an empty string as no value', () => {
    expect(displayValue('title', '')).toBeNull()
  })
})

describe('describeEvent', () => {
  it('phrases a creation', () => {
    expect(describeEvent({ action: 'created' })).toBe('created this ticket')
  })

  it('phrases a change with both sides', () => {
    expect(describeEvent({ action: 'changed', field: 'status', from: 'Todo', to: 'Done' })).toBe(
      'changed status from Todo to Done',
    )
  })

  it('phrases a first-time set', () => {
    expect(describeEvent({ action: 'changed', field: 'assignee', from: null, to: 'Alex' })).toBe(
      'set assignee to Alex',
    )
  })

  it('keeps the old value when something is cleared', () => {
    expect(describeEvent({ action: 'changed', field: 'dueDate', from: '2026-09-20', to: null })).toBe(
      'cleared due date (was 2026-09-20)',
    )
  })

  it('phrases a description edit without values', () => {
    expect(describeEvent({ action: 'changed', field: 'description' })).toBe(
      'updated the description',
    )
  })
})

describe('groupActivity', () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 8, 20, 12, minutes)).toISOString()

  it('collapses a burst by one person into a single group', () => {
    const groups = groupActivity([
      { id: '1', actorId: 'm1', createdAt: at(0) },
      { id: '2', actorId: 'm1', createdAt: at(1) },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].map((e) => e.id)).toEqual(['1', '2'])
  })

  it('starts a new group when somebody else acts', () => {
    const groups = groupActivity([
      { id: '1', actorId: 'm1', createdAt: at(0) },
      { id: '2', actorId: 'm2', createdAt: at(1) },
    ])
    expect(groups).toHaveLength(2)
  })

  it('starts a new group once the burst window has passed', () => {
    const groups = groupActivity([
      { id: '1', actorId: 'm1', createdAt: at(0) },
      { id: '2', actorId: 'm1', createdAt: at(30) },
    ])
    expect(groups).toHaveLength(2)
  })

  it('groups anonymous changes together rather than splitting every one', () => {
    const groups = groupActivity([
      { id: '1', actorId: null, createdAt: at(0) },
      { id: '2', actorId: null, createdAt: at(1) },
    ])
    expect(groups).toHaveLength(1)
  })

  it('does not merge an anonymous change into a named one', () => {
    const groups = groupActivity([
      { id: '1', actorId: 'm1', createdAt: at(0) },
      { id: '2', actorId: null, createdAt: at(1) },
    ])
    expect(groups).toHaveLength(2)
  })

  it('returns nothing for an empty feed', () => {
    expect(groupActivity([])).toEqual([])
  })
})

describe('comment events', () => {
  it('phrases every comment action', () => {
    expect(describeEvent({ action: 'commented' })).toBe('commented')
    expect(describeEvent({ action: 'replied' })).toBe('replied in a thread')
    expect(describeEvent({ action: 'edited' })).toBe('edited a comment')
    expect(describeEvent({ action: 'resolved' })).toBe('resolved a thread')
    expect(describeEvent({ action: 'reopened' })).toBe('reopened a thread')
    expect(describeEvent({ action: 'deleted' })).toBe('deleted a comment')
  })

  it('knows which actions belong to the comment thread', () => {
    for (const action of ['commented', 'replied', 'edited', 'resolved', 'reopened', 'deleted']) {
      expect(isCommentAction(action)).toBe(true)
    }
    expect(isCommentAction('created')).toBe(false)
    expect(isCommentAction('changed')).toBe(false)
  })

  it('hides only the events the comment itself already shows', () => {
    expect(hiddenAlongsideComments('commented')).toBe(true)
    expect(hiddenAlongsideComments('replied')).toBe(true)

    expect(hiddenAlongsideComments('edited')).toBe(false)
    expect(hiddenAlongsideComments('resolved')).toBe(false)
    expect(hiddenAlongsideComments('reopened')).toBe(false)
    expect(hiddenAlongsideComments('deleted')).toBe(false)
    expect(hiddenAlongsideComments('changed')).toBe(false)
  })

  it('groups a comment event with a field change by the same person', () => {
    const at = (m: number) => new Date(Date.UTC(2026, 8, 20, 12, m)).toISOString()
    const groups = groupActivity([
      { id: '1', actorId: 'm1', createdAt: at(0) },
      { id: '2', actorId: 'm1', createdAt: at(1) },
    ])
    expect(groups).toHaveLength(1)
  })
})
