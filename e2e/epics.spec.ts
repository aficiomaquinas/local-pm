import { test, expect, type APIRequestContext } from '@playwright/test'
import { seedProject, createTicket, getTicket, type SeedRefs } from './helpers'

let refs: SeedRefs
let otherRefs: SeedRefs

async function makeTicket(
  request: APIRequestContext,
  fields: Record<string, unknown>,
  target: SeedRefs = refs,
) {
  const res = await createTicket(request, target, fields)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).doc as { id: string; ticketId: string; title: string }
}

test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'epics')
  otherRefs = await seedProject(request, 'epics-other')
})

test.describe('epic links', () => {
  test('a ticket rolls up into an epic in the same project', async ({ request }) => {
    const epic = await makeTicket(request, { title: 'Checkout rewrite', isEpic: true })
    const child = await makeTicket(request, { title: 'Ship the cart page', epic: epic.id })

    const saved = await getTicket(request, child.id)
    expect(saved.epic).toBe(epic.id)
  })

  test('a ticket cannot be its own epic', async ({ request }) => {
    const epic = await makeTicket(request, { title: 'Self referential', isEpic: true })

    const res = await request.patch(`/api/tickets/${epic.id}`, { data: { epic: epic.id } })
    expect(res.ok()).toBeFalsy()
    expect(await res.text()).toContain('cannot be its own epic')
  })

  test('a plain ticket is rejected as an epic parent', async ({ request }) => {
    const plain = await makeTicket(request, { title: 'Not an epic' })
    const child = await makeTicket(request, { title: 'Wants a parent' })

    const res = await request.patch(`/api/tickets/${child.id}`, { data: { epic: plain.id } })
    expect(res.ok()).toBeFalsy()
    expect(await res.text()).toContain('not an epic')
  })

  test('an epic and its tickets have to share a project', async ({ request }) => {
    const epic = await makeTicket(request, { title: 'Scoped epic', isEpic: true })
    const outsider = await makeTicket(request, { title: 'Different project' }, otherRefs)

    const res = await request.patch(`/api/tickets/${outsider.id}`, { data: { epic: epic.id } })
    expect(res.ok()).toBeFalsy()
    expect(await res.text()).toContain('same project')
  })

  test('epics do not nest', async ({ request }) => {
    const outer = await makeTicket(request, { title: 'Outer epic', isEpic: true })
    const inner = await makeTicket(request, { title: 'Inner epic', isEpic: true })

    const res = await request.patch(`/api/tickets/${inner.id}`, { data: { epic: outer.id } })
    expect(res.ok()).toBeFalsy()
    expect(await res.text()).toContain('one level deep')

    const child = await makeTicket(request, { title: 'Ordinary child', epic: outer.id })
    const promote = await request.patch(`/api/tickets/${child.id}`, { data: { isEpic: true } })
    expect(promote.ok()).toBeFalsy()
  })

  test('an epic keeps its flag while tickets still roll up into it', async ({ request }) => {
    const epic = await makeTicket(request, { title: 'Still populated', isEpic: true })
    const child = await makeTicket(request, { title: 'Holds the epic open', epic: epic.id })

    const blocked = await request.patch(`/api/tickets/${epic.id}`, { data: { isEpic: false } })
    expect(blocked.ok()).toBeFalsy()
    expect(await blocked.text()).toContain('rolling up into it')

    const removed = await request.patch(`/api/tickets/${child.id}`, { data: { epic: null } })
    expect(removed.ok(), await removed.text()).toBeTruthy()

    const demoted = await request.patch(`/api/tickets/${epic.id}`, { data: { isEpic: false } })
    expect(demoted.ok(), await demoted.text()).toBeTruthy()
  })

  test('deleting an epic releases its tickets instead of orphaning them', async ({ request }) => {
    const epic = await makeTicket(request, { title: 'Doomed epic', isEpic: true })
    const child = await makeTicket(request, { title: 'Survives its epic', epic: epic.id })

    const deleted = await request.delete(`/api/tickets/${epic.id}`)
    expect(deleted.ok(), await deleted.text()).toBeTruthy()

    await expect
      .poll(async () => (await getTicket(request, child.id)).epic, { timeout: 15_000 })
      .toBeFalsy()

    const survivor = await getTicket(request, child.id)
    expect(survivor.title).toBe('Survives its epic')
  })

  test('the epic change lands in the activity feed by name', async ({ request }) => {
    const epic = await makeTicket(request, { title: 'Tracked epic', isEpic: true })
    const child = await makeTicket(request, { title: 'Tracked child' })

    const res = await request.patch(`/api/tickets/${child.id}`, { data: { epic: epic.id } })
    expect(res.ok(), await res.text()).toBeTruthy()

    await expect
      .poll(
        async () => {
          const feed = await request.get(
            `/api/activity?where[ticket][equals]=${child.id}&where[field][equals]=epic&depth=0`,
          )
          return ((await feed.json()).docs ?? []) as { to?: string }[]
        },
        { timeout: 15_000 },
      )
      .toContainEqual(expect.objectContaining({ to: `${epic.ticketId} · Tracked epic` }))
  })
})

test.describe('epic rollup in the ticket view', () => {
  test('an epic shows its tickets and their rollup progress', async ({ page, request }) => {
    const epic = await makeTicket(request, { title: 'Rollup epic', isEpic: true })
    await makeTicket(request, { title: 'Rollup done', epic: epic.id, status: 'DONE' })
    await makeTicket(request, { title: 'Rollup open', epic: epic.id, status: 'TODO' })

    await page.goto(`/tickets/${epic.id}`)

    const progress = page.getByRole('progressbar', { name: 'Epic progress' })
    await expect(progress).toBeVisible()
    await expect(progress).toHaveAttribute('aria-valuenow', '50')
    await expect(page.getByText('1 of 2 done')).toBeVisible()

    await expect(page.getByRole('link', { name: 'Rollup done' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Rollup open' })).toBeVisible()
  })

  test('a ticket can be taken out of its epic and put back with undo', async ({
    page,
    request,
  }) => {
    const epic = await makeTicket(request, { title: 'Reversible epic', isEpic: true })
    const child = await makeTicket(request, { title: 'Reversible child', epic: epic.id })

    await page.goto(`/tickets/${epic.id}`)
    await expect(page.getByRole('link', { name: 'Reversible child' })).toBeVisible()

    await page
      .getByRole('button', { name: `Remove ${child.ticketId} from this epic` })
      .click()

    await expect(page.getByRole('link', { name: 'Reversible child' })).toBeHidden()
    await expect
      .poll(async () => (await getTicket(request, child.id)).epic, { timeout: 15_000 })
      .toBeFalsy()

    await page.getByRole('button', { name: 'Undo', exact: true }).click()

    await expect
      .poll(async () => (await getTicket(request, child.id)).epic, { timeout: 15_000 })
      .toBe(epic.id)
  })

  test('a plain ticket links back to the epic it belongs to', async ({ page, request }) => {
    const epic = await makeTicket(request, { title: 'Parent epic', isEpic: true })
    const child = await makeTicket(request, { title: 'Child with a parent', epic: epic.id })

    await page.goto(`/tickets/${child.id}`)

    const section = page.getByRole('heading', { name: 'Part of an epic' })
    await expect(section).toBeVisible()
    await expect(page.getByRole('link', { name: 'Parent epic' })).toHaveAttribute(
      'href',
      `/tickets/${epic.id}`,
    )
  })

  test('a plain ticket can be promoted to an epic from its detail view', async ({
    page,
    request,
  }) => {
    const ticket = await makeTicket(request, { title: 'Promote me' })

    await page.goto(`/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Make this an epic' }).click()

    await expect(page.getByRole('heading', { name: 'Epic', exact: true })).toBeVisible()
    await expect
      .poll(async () => (await getTicket(request, ticket.id)).isEpic, { timeout: 15_000 })
      .toBe(true)
  })
})

test.describe('epics on the board', () => {
  test('cards mark epics and the tickets that roll up into them', async ({ page, request }) => {
    const epic = await makeTicket(request, { title: 'Board epic', isEpic: true })
    const child = await makeTicket(request, { title: 'Board child', epic: epic.id })

    await page.goto(`/board?project=${refs.projectId}`)

    await expect(
      page.locator(`[data-ticket-id="${epic.id}"]`).getByText('Epic', { exact: true }),
    ).toBeVisible()
    await expect(
      page.locator(`[data-ticket-id="${child.id}"]`).getByText(epic.ticketId, { exact: true }),
    ).toBeVisible()
  })
})
