import { test, expect } from '@playwright/test'
import { seedProject, createTicket, getTicket, type SeedRefs } from './helpers'

let refs: SeedRefs

test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'a11y')
})

test.describe('WCAG 2.5.7 — a board move without dragging', () => {
  test('the card menu moves a ticket between columns, and it persists', async ({
    page,
    request,
  }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Move me by menu', status: 'TODO' })).json()
    ).doc

    await page.goto(`/board?project=${refs.projectId}`)
    const card = page.locator(`[data-ticket-id="${ticket.id}"]`)
    await expect(card).toBeVisible()

    await card.getByRole('button', { name: /^Actions for/ }).click()
    await page.getByRole('menuitem', { name: 'Move to In Progress' }).click()

    await expect(
      page.locator('[data-testid="column-IN_PROGRESS"]').locator(`[data-ticket-id="${ticket.id}"]`),
    ).toBeVisible()

    await expect
      .poll(async () => (await getTicket(request, ticket.id)).status, { timeout: 15_000 })
      .toBe('IN_PROGRESS')
  })

  test('the move is announced by name, with both positions', async ({ page, request }) => {
    const ticket = (
      await (await createTicket(request, refs, { title: 'Announce me', status: 'TODO' })).json()
    ).doc

    await page.goto(`/board?project=${refs.projectId}`)
    const card = page.locator(`[data-ticket-id="${ticket.id}"]`)
    await expect(card).toBeVisible()

    await card.getByRole('button', { name: /^Actions for/ }).click()
    await page.getByRole('menuitem', { name: 'Move to Done' }).click()

    const live = page.locator('[role="status"]', { hasText: 'moved to' }).first()
    await expect(live).toContainText(ticket.ticketId)
    await expect(live).toContainText('Done')
    await expect(live).toContainText('Todo')
  })
})

test('a card can be lifted, moved and dropped with the keyboard alone', async ({
  page,
  request,
}) => {
  const ticket = (
    await (await createTicket(request, refs, { title: 'Keyboard drag', status: 'TODO' })).json()
  ).doc

  await page.goto(`/board?project=${refs.projectId}`)
  const card = page.locator(`[data-ticket-id="${ticket.id}"]`)
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: /^Reorder/ }).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')

  await expect
    .poll(async () => (await getTicket(request, ticket.id)).status, { timeout: 15_000 })
    .toBe('IN_PROGRESS')
})

test('a ticket detail view is addressable, and Back closes it', async ({ page, request }) => {
  const ticket = (
    await (await createTicket(request, refs, { title: 'Addressable ticket' })).json()
  ).doc

  await page.goto(`/board?project=${refs.projectId}&ticket=${ticket.id}`)
  const panel = page.getByRole('dialog', { name: 'Addressable ticket' })
  await expect(panel).toBeVisible()

  await page.goto(`/board?project=${refs.projectId}`)
  await page.locator(`[data-ticket-id="${ticket.id}"]`).click()
  await expect(page.getByRole('dialog', { name: 'Addressable ticket' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`ticket=${ticket.id}`))

  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Addressable ticket' })).toBeHidden()
})

test('the create form reports errors inline and in a summary, and never blocks submit', async ({
  page,
}) => {
  await page.goto('/board')
  await page.getByRole('button', { name: /New ticket/ }).click()

  const dialog = page.getByRole('dialog', { name: 'New ticket' })
  const submit = dialog.getByRole('button', { name: 'Create ticket' })

  await expect(submit).toBeEnabled()

  await expect(dialog.getByRole('alert')).toHaveCount(0)

  await submit.click()

  const summary = dialog.getByRole('alert').filter({ hasText: 'There is a problem' })
  await expect(summary).toBeVisible()

  await expect(summary).toBeFocused()

  await expect(summary).toContainText('Enter a title for this ticket.')
  await expect(dialog.locator('#ticket-form-title')).toHaveAttribute('aria-invalid', 'true')
})

test('skip to main content is the first tabbable element', async ({ page }) => {
  await page.goto('/board')
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toHaveText('Skip to main content')
})
