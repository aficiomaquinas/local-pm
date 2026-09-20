import { test, expect } from '@playwright/test'
import { seedProject, createTicket, type SeedRefs, statusId } from './helpers'

let refs: SeedRefs

test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'activity')
})

async function activityFor(request: import('@playwright/test').APIRequestContext, ticketId: string) {
  const res = await request.get(
    `/api/activity?where[ticket][equals]=${ticketId}&sort=createdAt&limit=200&depth=0`,
  )
  expect(res.ok()).toBeTruthy()
  return (await res.json()).docs as {
    id: string
    action: string
    field: string | null
    from: string | null
    to: string | null
  }[]
}

async function newComment(
  request: import('@playwright/test').APIRequestContext,
  data: Record<string, unknown>,
) {
  const res = await request.post('/api/comments', { data })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).doc
}

test.describe('the activity collection', () => {
  test('records the creation of a ticket', async ({ request }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Born here', status: 'TODO' })).json()
    ).doc

    const entries = await activityFor(request, ticket.id)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ action: 'created', field: null })
  })

  test('records a status change with both sides in readable words', async ({ request }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Move me', status: 'TODO' })).json()
    ).doc

    await request.patch(`/api/tickets/${ticket.id}`, { data: { status: await statusId(request, 'IN_PROGRESS') } })

    const entries = await activityFor(request, ticket.id)
    const change = entries.find((e) => e.field === 'status')
    expect(change).toMatchObject({ action: 'changed', from: 'Todo', to: 'In Progress' })
  })

  test('records one entry per field when several change at once', async ({ request }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Many at once', status: 'TODO' })).json()
    ).doc

    await request.patch(`/api/tickets/${ticket.id}`, {
      data: { status: await statusId(request, 'DONE'), priority: 'URGENT', title: 'Renamed' },
    })

    const fields = (await activityFor(request, ticket.id))
      .filter((e) => e.action === 'changed')
      .map((e) => e.field)
    expect(fields).toEqual(expect.arrayContaining(['status', 'priority', 'title']))
  })

  test('does not record a board drag, which only moves sortOrder', async ({ request }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Just reordered', status: 'TODO' })).json()
    ).doc

    await request.patch(`/api/tickets/${ticket.id}`, { data: { sortOrder: 42 } })

    const entries = await activityFor(request, ticket.id)
    expect(entries.filter((e) => e.action === 'changed')).toHaveLength(0)
  })

  test('is append-only: the API refuses to write or delete an entry', async ({ request }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Immutable', status: 'TODO' })).json()
    ).doc
    const entries = await activityFor(request, ticket.id)

    const created = await request.post('/api/activity', {
      data: { ticket: ticket.id, action: 'changed', field: 'status', from: 'a', to: 'b' },
    })
    expect(created.ok()).toBeFalsy()

    const patched = await request.patch(`/api/activity/${entries[0].id}`, {
      data: { to: 'tampered' },
    })
    expect(patched.ok()).toBeFalsy()

    const deleted = await request.delete(`/api/activity/${entries[0].id}`)
    expect(deleted.ok()).toBeFalsy()

    const after = await activityFor(request, ticket.id)
    expect(after).toHaveLength(entries.length)
    expect(after[0].to).toBe(entries[0].to)
  })

  test('deleting a ticket takes its history with it', async ({ request }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Temporary', status: 'TODO' })).json()
    ).doc
    await request.patch(`/api/tickets/${ticket.id}`, { data: { status: await statusId(request, 'DONE') } })
    expect((await activityFor(request, ticket.id)).length).toBeGreaterThan(0)

    await request.delete(`/api/tickets/${ticket.id}`)
    expect(await activityFor(request, ticket.id)).toHaveLength(0)
  })
})

test.describe('the activity feed in the ticket page', () => {
  test('shows what changed, and the History tab filters to it', async ({ page, request }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Watch me change', status: 'TODO' })).json()
    ).doc
    await request.patch(`/api/tickets/${ticket.id}`, { data: { status: await statusId(request, 'IN_PROGRESS') } })

    await page.goto(`/tickets/${ticket.id}`)

    const feed = page.getByTestId('ticket-feed')
    await expect(feed.getByText('changed status from Todo to In Progress')).toBeVisible()
    await expect(feed.getByText('created this ticket')).toBeVisible()

    await page.getByRole('tab', { name: /History/ }).click()
    await expect(feed.getByText('changed status from Todo to In Progress')).toBeVisible()
    await expect(page).toHaveURL(/feed=history/)
  })

  test('the Comments tab hides the history but keeps the comments', async ({ page, request }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Filter me', status: 'TODO' })).json()
    ).doc
    await request.patch(`/api/tickets/${ticket.id}`, { data: { priority: 'URGENT' } })
    await request.post('/api/comments', {
      data: { ticket: ticket.id, body: 'A human wrote this.' },
    })

    await page.goto(`/tickets/${ticket.id}`)
    const feed = page.getByTestId('ticket-feed')
    await expect(feed.getByText('A human wrote this.')).toBeVisible()

    await page.getByRole('tab', { name: /Comments/ }).click()
    await expect(feed.getByText('A human wrote this.')).toBeVisible()
    await expect(feed.getByText('created this ticket')).toHaveCount(0)
  })

  test('a filtered feed is addressable, so the tab survives a reload', async ({
    page,
    request,
  }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Shareable', status: 'TODO' })).json()
    ).doc

    await page.goto(`/tickets/${ticket.id}?feed=history`)
    await expect(page.getByRole('tab', { name: /History/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  test('the board peek panel carries the same history', async ({ page, request }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Peek at me', status: 'TODO' })).json()
    ).doc
    await request.patch(`/api/tickets/${ticket.id}`, { data: { priority: 'HIGH' } })

    await page.goto(`/board?project=${refs.projectId}&ticket=${ticket.id}`)
    await expect(page.getByText('changed priority from No Priority to High')).toBeVisible()
  })
})

test.describe('the comment thread in the history', () => {
  test('records a comment, and keeps its text', async ({ request }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Talk about me' })).json()
    ).doc
    await newComment(request, { ticket: ticket.id, body: 'First thoughts' })

    const entry = (await activityFor(request, ticket.id)).find((e) => e.action === 'commented')
    expect(entry).toBeTruthy()
    expect(entry?.to).toContain('First thoughts')
  })

  test('tells a reply apart from a comment that opens a thread', async ({ request }) => {
    const ticket = (await (await createTicket(request, refs, { title: 'Threaded' })).json()).doc
    const root = await newComment(request, { ticket: ticket.id, body: 'Opening' })
    await newComment(request, { ticket: ticket.id, body: 'Answering', parent: root.id })

    const actions = (await activityFor(request, ticket.id)).map((e) => e.action)
    expect(actions).toContain('commented')
    expect(actions).toContain('replied')
  })

  test('records an edit with the text on both sides', async ({ request }) => {
    const ticket = (await (await createTicket(request, refs, { title: 'Edited' })).json()).doc
    const comment = await newComment(request, { ticket: ticket.id, body: 'Before the edit' })

    await request.patch(`/api/comments/${comment.id}`, { data: { body: 'After the edit' } })

    const entry = (await activityFor(request, ticket.id)).find((e) => e.action === 'edited')
    expect(entry?.from).toContain('Before the edit')
    expect(entry?.to).toContain('After the edit')
  })

  test('records resolving and reopening a thread', async ({ request }) => {
    const ticket = (await (await createTicket(request, refs, { title: 'Resolvable' })).json()).doc
    const comment = await newComment(request, { ticket: ticket.id, body: 'Settle this' })

    await request.patch(`/api/comments/${comment.id}`, { data: { resolved: true } })
    await request.patch(`/api/comments/${comment.id}`, { data: { resolved: false } })

    const actions = (await activityFor(request, ticket.id)).map((e) => e.action)
    expect(actions).toContain('resolved')
    expect(actions).toContain('reopened')
  })

  test('does not record an edit when the body did not change', async ({ request }) => {
    const ticket = (await (await createTicket(request, refs, { title: 'Untouched' })).json()).doc
    const comment = await newComment(request, { ticket: ticket.id, body: 'Same text' })

    await request.patch(`/api/comments/${comment.id}`, { data: { body: 'Same text' } })

    const edits = (await activityFor(request, ticket.id)).filter((e) => e.action === 'edited')
    expect(edits).toHaveLength(0)
  })

  test('keeps the text of a deleted comment, which is the point of an audit trail', async ({
    request,
  }) => {
    const ticket = (await (await createTicket(request, refs, { title: 'Deleted' })).json()).doc
    const comment = await newComment(request, { ticket: ticket.id, body: 'Regrettable remark' })

    await request.delete(`/api/comments/${comment.id}`)

    const entry = (await activityFor(request, ticket.id)).find((e) => e.action === 'deleted')
    expect(entry?.from).toContain('Regrettable remark')
  })

  test('records a deletion for the reply that went with the thread', async ({ request }) => {
    const ticket = (await (await createTicket(request, refs, { title: 'Cascade' })).json()).doc
    const root = await newComment(request, { ticket: ticket.id, body: 'Thread root' })
    await newComment(request, { ticket: ticket.id, body: 'Doomed reply', parent: root.id })

    await request.delete(`/api/comments/${root.id}`)

    const deleted = (await activityFor(request, ticket.id)).filter((e) => e.action === 'deleted')
    expect(deleted).toHaveLength(2)
    expect(deleted.map((e) => e.from).join(' ')).toContain('Doomed reply')
  })
})

test.describe('comment history in the feed', () => {
  test('History shows the comment events, All does not repeat the comment itself', async ({
    page,
    request,
  }) => {
    const ticket = (await (await createTicket(request, refs, { title: 'Feed split' })).json()).doc
    const comment = await newComment(request, { ticket: ticket.id, body: 'Original wording' })
    await request.patch(`/api/comments/${comment.id}`, { data: { body: 'Revised wording' } })

    await page.goto(`/tickets/${ticket.id}`)
    const feed = page.getByTestId('ticket-feed')

    await expect(feed.getByText('Revised wording').first()).toBeVisible()
    await expect(feed.locator('[data-activity-field="edited"]')).toBeVisible()
    await expect(feed.locator('[data-activity-field="commented"]')).toHaveCount(0)

    await page.getByRole('tab', { name: /History/ }).click()
    await expect(feed.locator('[data-activity-field="commented"]')).toBeVisible()
    await expect(feed.locator('[data-activity-field="edited"]')).toBeVisible()
  })

  test('a deleted comment leaves a trace in the history', async ({ page, request }) => {
    const ticket = (await (await createTicket(request, refs, { title: 'Gone' })).json()).doc
    const comment = await newComment(request, { ticket: ticket.id, body: 'Say it and delete it' })
    await request.delete(`/api/comments/${comment.id}`)

    await page.goto(`/tickets/${ticket.id}?feed=history`)

    const deleted = page.locator('[data-activity-field="deleted"]')
    await expect(deleted).toBeVisible()
    await expect(deleted).toContainText('deleted a comment')
    await expect(deleted).toContainText('Say it and delete it')
  })
})
