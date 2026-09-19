import { test, expect } from '@playwright/test'
import { seedProject, createTicket, getTicket, dragTo, type SeedRefs } from './helpers'

/**
 * The drag regression, end to end (aficiomaquinas).
 *
 * Two defects this pins:
 *   1. dropping onto empty column space PATCHed `sortOrder: 0`, because
 *      `overId` is the column id and `findIndex` returned -1;
 *   2. a drop that confirmed the live preview was read as a no-op, so no PATCH
 *      was sent at all and the next refetch silently reverted the card.
 *
 * Both are only visible if the assertion survives a RELOAD — the optimistic
 * client state looks correct either way.
 */

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

  // It starts in TODO.
  await expect(page.locator('[data-testid="column-TODO"]').locator(`[data-ticket-id="${ticket.id}"]`)).toBeVisible()

  await dragTo(page, `[data-ticket-id="${ticket.id}"]`, '[data-testid="column-IN_PROGRESS"]')

  // Optimistic move landed in the DOM.
  await expect(
    page.locator('[data-testid="column-IN_PROGRESS"]').locator(`[data-ticket-id="${ticket.id}"]`),
  ).toBeVisible()

  // The PATCH actually reached the server: this is what the bug broke.
  await expect
    .poll(async () => (await getTicket(request, ticket.id)).status, { timeout: 15_000 })
    .toBe('IN_PROGRESS')

  // And it survives a reload rather than being reverted by the refetch.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(
    page.locator('[data-testid="column-IN_PROGRESS"]').locator(`[data-ticket-id="${ticket.id}"]`),
  ).toBeVisible()
})

test('a card dropped on empty column space does not collapse to sortOrder 0', async ({
  page,
  request,
}) => {
  // Two cards already sitting in the destination column. If the drop writes
  // sortOrder 0 (the original bug) the moved card stacks on top of them.
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

  // Release low in the column, on empty space below both cards — the append
  // case, which is exactly where `overId` is the COLUMN id and the original
  // `findIndex(...) + 1` evaluated to 0.
  await dragTo(page, `[data-ticket-id="${mover.id}"]`, '[data-testid="column-DONE"]', 0.95)

  await expect
    .poll(async () => (await getTicket(request, mover.id)).status, { timeout: 15_000 })
    .toBe('DONE')

  const moved = await getTicket(request, mover.id)
  const a = await getTicket(request, resident1.id)

  // The regression itself: the card must not land on 0 underneath the others.
  expect(moved.sortOrder).toBeGreaterThan(0)
  // And it must sit after the card that was already at the top of the column.
  expect(moved.sortOrder).toBeGreaterThan(a.sortOrder ?? 0)

  // NOTE: only the dragged ticket is PATCHed — the board renumbers the rest of
  // the column optimistically but does not persist siblings. That is
  // pre-existing upstream behaviour, unchanged here, so two tickets in one
  // column can share a sortOrder on the server. Asserting sibling uniqueness
  // would be testing a guarantee the app has never made.
})
