import { test, expect } from '@playwright/test'
import { seedProject, createTicket, type SeedRefs } from './helpers'

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

    await request.patch(`/api/tickets/${ticket.id}`, { data: { status: 'IN_PROGRESS' } })

    const entries = await activityFor(request, ticket.id)
    const change = entries.find((e) => e.field === 'status')
    expect(change).toMatchObject({ action: 'changed', from: 'Todo', to: 'In Progress' })
  })

  test('records one entry per field when several change at once', async ({ request }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Many at once', status: 'TODO' })).json()
    ).doc

    await request.patch(`/api/tickets/${ticket.id}`, {
      data: { status: 'DONE', priority: 'URGENT', title: 'Renamed' },
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
    await request.patch(`/api/tickets/${ticket.id}`, { data: { status: 'DONE' } })
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
    await request.patch(`/api/tickets/${ticket.id}`, { data: { status: 'IN_PROGRESS' } })

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
