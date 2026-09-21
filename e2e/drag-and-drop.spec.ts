import { test, expect } from '@playwright/test'
import { seedProject, createTicket, getTicket, dragTo, type SeedRefs, statusKeyOf } from './helpers'

let refs: SeedRefs

test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'drag')
})

test('moving a card to another column persists across a reload', async ({ page, request }) => {
  const created = await createTicket(request, refs, {
    title: 'Drag me across',
    status: 'TODO',
    sortOrder: 0,
  })
  expect(created.ok()).toBeTruthy()
  const ticket = (await created.json()).doc

  await page.goto(`/board?project=${refs.projectId}`)
  await page.waitForLoadState('networkidle')

  const card = page.locator(`[data-ticket-id="${ticket.id}"]`)
  await expect(card).toBeVisible()

  await expect(page.locator('[data-testid="column-TODO"]').locator(`[data-ticket-id="${ticket.id}"]`)).toBeVisible()

  await dragTo(page, `[data-ticket-id="${ticket.id}"]`, '[data-testid="column-IN_PROGRESS"]')

  await expect(
    page.locator('[data-testid="column-IN_PROGRESS"]').locator(`[data-ticket-id="${ticket.id}"]`),
  ).toBeVisible()

  await expect
    .poll(async () => await statusKeyOf(request, (await getTicket(request, ticket.id)).status), { timeout: 15_000 })
    .toBe('in_progress')

  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(
    page.locator('[data-testid="column-IN_PROGRESS"]').locator(`[data-ticket-id="${ticket.id}"]`),
  ).toBeVisible()
})

test('a failed save returns the card to its origin instead of silently reverting later', async ({
  page,
  request,
}) => {
  const ticket = (await (await createTicket(request, refs, {
    title: 'Save will fail',
    status: 'TODO',
    sortOrder: 0,
  })).json()).doc

  await page.goto(`/board?project=${refs.projectId}`)
  await page.waitForLoadState('networkidle')

  await page.route(`**/api/tickets/${ticket.id}`, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"errors":[]}' }),
  )

  await dragTo(page, `[data-ticket-id="${ticket.id}"]`, '[data-testid="column-DONE"]')

  await expect(
    page.locator('[data-testid="column-TODO"]').locator(`[data-ticket-id="${ticket.id}"]`),
  ).toBeVisible({ timeout: 15_000 })

  expect(await statusKeyOf(request, (await getTicket(request, ticket.id)).status)).toBe('todo')
})

test('a card dropped on empty column space does not collapse to sortOrder 0', async ({
  page,
  request,
}) => {
  const resident1 = (await (await createTicket(request, refs, {
    title: 'Resident one',
    status: 'DONE',
    sortOrder: 0,
  })).json()).doc
  const resident2 = (await (await createTicket(request, refs, {
    title: 'Resident two',
    status: 'DONE',
    sortOrder: 1,
  })).json()).doc
  const mover = (await (await createTicket(request, refs, {
    title: 'Mover',
    status: 'TODO',
    sortOrder: 0,
  })).json()).doc

  await page.goto(`/board?project=${refs.projectId}`)
  await page.waitForLoadState('networkidle')

  await dragTo(page, `[data-ticket-id="${mover.id}"]`, '[data-testid="column-DONE"]', 0.95)

  await expect
    .poll(async () => await statusKeyOf(request, (await getTicket(request, mover.id)).status), { timeout: 15_000 })
    .toBe('done')

  const moved = await getTicket(request, mover.id)
  const a = await getTicket(request, resident1.id)

  expect(moved.sortOrder).toBeGreaterThan(0)
  expect(moved.sortOrder).toBeGreaterThan(a.sortOrder ?? 0)

})
