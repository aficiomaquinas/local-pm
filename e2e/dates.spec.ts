import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { seedProject, createTicket, getTicket, type SeedRefs } from './helpers'

let refs: SeedRefs

test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'dates')
})

async function makeTicket(request: APIRequestContext, fields: Record<string, unknown>) {
  const res = await createTicket(request, refs, fields)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).doc as { id: string; ticketId: string }
}

async function makeProject(request: APIRequestContext, fields: Record<string, unknown>) {
  const seeded = await seedProject(request, 'dates-project')
  const res = await request.patch(`/api/projects/${seeded.projectId}`, { data: fields })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).doc as { id: string; name: string }
}

async function commitDate(page: Page, label: string, value: string, recordId: string) {
  const field = page.getByRole('textbox', { name: label })
  await field.fill(value)
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes(recordId)),
    field.press('Enter'),
  ])
}

test.describe('ticket dates', () => {
  test('a ticket stores a start date alongside its due date', async ({ request }) => {
    const ticket = await makeTicket(request, {
      title: 'Runs over a fortnight',
      startDate: '2026-03-02',
      dueDate: '2026-03-16',
    })

    const saved = await getTicket(request, ticket.id)
    expect(saved.startDate.slice(0, 10)).toBe('2026-03-02')
    expect(saved.dueDate.slice(0, 10)).toBe('2026-03-16')
  })

  test('a start date after the due date is refused with a usable message', async ({ request }) => {
    const res = await createTicket(request, refs, {
      title: 'Backwards',
      startDate: '2026-03-16',
      dueDate: '2026-03-02',
    })

    expect(res.ok()).toBeFalsy()
    expect(await res.text()).toContain('Choose a due date on or after 2026-03-16')
  })

  test('a patch is checked against the dates already stored', async ({ request }) => {
    const ticket = await makeTicket(request, {
      title: 'Pull the due date back',
      startDate: '2026-03-10',
      dueDate: '2026-03-20',
    })

    const res = await request.patch(`/api/tickets/${ticket.id}`, {
      data: { dueDate: '2026-03-01' },
    })
    expect(res.ok()).toBeFalsy()
    expect(await res.text()).toContain('on or after 2026-03-10')

    const saved = await getTicket(request, ticket.id)
    expect(saved.dueDate.slice(0, 10)).toBe('2026-03-20')
  })

  test('clearing the start date frees an otherwise impossible due date', async ({ request }) => {
    const ticket = await makeTicket(request, {
      title: 'Start date removed',
      startDate: '2026-03-10',
      dueDate: '2026-03-20',
    })

    const res = await request.patch(`/api/tickets/${ticket.id}`, {
      data: { startDate: null, dueDate: '2026-03-01' },
    })
    expect(res.ok(), await res.text()).toBeTruthy()

    const saved = await getTicket(request, ticket.id)
    expect(saved.startDate).toBeFalsy()
    expect(saved.dueDate.slice(0, 10)).toBe('2026-03-01')
  })

  test('the same day at both ends is a valid one-day ticket', async ({ request }) => {
    const ticket = await makeTicket(request, {
      title: 'One day only',
      startDate: '2026-03-10',
      dueDate: '2026-03-10',
    })

    const saved = await getTicket(request, ticket.id)
    expect(saved.startDate.slice(0, 10)).toBe('2026-03-10')
  })

  test('the activity trail records the start date by name', async ({ request }) => {
    const ticket = await makeTicket(request, { title: 'Trail check' })

    const res = await request.patch(`/api/tickets/${ticket.id}`, {
      data: { startDate: '2026-04-01' },
    })
    expect(res.ok(), await res.text()).toBeTruthy()

    const entries = await request.get(
      `/api/activity?where[ticket][equals]=${ticket.id}&sort=createdAt&limit=50&depth=0`,
    )
    const docs = (await entries.json()).docs as { field: string | null; to: string | null }[]
    expect(docs.some((d) => d.field === 'startDate' && d.to === '2026-04-01')).toBeTruthy()
  })
})

test.describe('project dates', () => {
  test('a project stores a start and a target date', async ({ request }) => {
    const project = await makeProject(request, {
      startDate: '2026-05-04',
      targetDate: '2026-08-28',
    })

    const res = await request.get(`/api/projects/${project.id}?depth=0`)
    const saved = await res.json()
    expect(saved.startDate.slice(0, 10)).toBe('2026-05-04')
    expect(saved.targetDate.slice(0, 10)).toBe('2026-08-28')
  })

  test('a target date before the start date is refused', async ({ request }) => {
    const seeded = await seedProject(request, 'dates-backwards')

    const res = await request.patch(`/api/projects/${seeded.projectId}`, {
      data: { startDate: '2026-08-28', targetDate: '2026-05-04' },
    })
    expect(res.ok()).toBeFalsy()
    expect(await res.text()).toContain('Choose a target date on or after 2026-08-28')
  })
})

test.describe('the dates on screen', () => {
  test('the ticket form saves a start date and the detail view shows it back', async ({
    page,
    request,
  }) => {
    const ticket = await makeTicket(request, { title: 'Edited through the form' })

    await page.goto(`/tickets/${ticket.id}/edit`)
    await page.getByRole('textbox', { name: 'Start date' }).fill('2026-06-01')
    await page.getByRole('textbox', { name: 'Start date' }).press('Enter')
    await page.getByRole('textbox', { name: 'Due date' }).fill('2026-06-30')
    await page.getByRole('textbox', { name: 'Due date' }).press('Enter')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page).toHaveURL(new RegExp(`/tickets/${ticket.id}$`))
    await expect(page.getByRole('textbox', { name: 'Start date' })).toHaveValue('2026-06-01')

    const saved = await getTicket(request, ticket.id)
    expect(saved.startDate.slice(0, 10)).toBe('2026-06-01')
  })

  test('the ticket form blocks a reversed range before it reaches the server', async ({
    page,
    request,
  }) => {
    const ticket = await makeTicket(request, { title: 'Reversed in the form' })

    await page.goto(`/tickets/${ticket.id}/edit`)
    await page.getByRole('textbox', { name: 'Start date' }).fill('2026-06-30')
    await page.getByRole('textbox', { name: 'Start date' }).press('Enter')
    await page.getByRole('textbox', { name: 'Due date' }).fill('2026-06-01')
    await page.getByRole('textbox', { name: 'Due date' }).press('Enter')

    await expect(page.getByText('Choose a due date on or after 2026-06-30')).toBeVisible()

    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: 'There is a problem' })).toBeVisible()

    const saved = await getTicket(request, ticket.id)
    expect(saved.startDate).toBeFalsy()
  })

  test('editing the start date on the ticket detail saves in place', async ({ page, request }) => {
    const ticket = await makeTicket(request, { title: 'Inline start date' })

    await page.goto(`/tickets/${ticket.id}`)
    await commitDate(page, 'Start date', '2026-07-07', ticket.id)

    await expect
      .poll(async () => (await getTicket(request, ticket.id)).startDate?.slice(0, 10))
      .toBe('2026-07-07')
  })

  test('the project detail edits both dates and reports the span', async ({ page, request }) => {
    const seeded = await seedProject(request, 'dates-ui')

    await page.goto(`/projects/${seeded.projectId}`)
    await commitDate(page, 'Start date', '2026-09-01', seeded.projectId)
    await commitDate(page, 'Target date', '2026-09-10', seeded.projectId)

    await expect(page.getByText('10 days planned')).toBeVisible()

    const res = await request.get(`/api/projects/${seeded.projectId}?depth=0`)
    const saved = await res.json()
    expect(saved.targetDate.slice(0, 10)).toBe('2026-09-10')
  })

  test('a reversed project range is undone in place and explained', async ({ page, request }) => {
    const seeded = await seedProject(request, 'dates-ui-reversed')
    const res = await request.patch(`/api/projects/${seeded.projectId}`, {
      data: { startDate: '2026-09-10' },
    })
    expect(res.ok(), await res.text()).toBeTruthy()

    await page.goto(`/projects/${seeded.projectId}`)
    await commitDate(page, 'Target date', '2026-09-01', seeded.projectId)

    await expect(page.getByText('Choose a target date on or after 2026-09-10')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Target date' })).toHaveValue('')
  })

  test('the projects list carries a target date column', async ({ page, request }) => {
    const project = await makeProject(request, { targetDate: '2026-11-05' })

    await page.goto(`/projects?q=${encodeURIComponent(project.name)}`)
    await expect(page.getByRole('columnheader', { name: 'Target' })).toBeVisible()
    await expect(page.getByRole('cell', { name: '5th Nov' })).toBeVisible()
  })
})
