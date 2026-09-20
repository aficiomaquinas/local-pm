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

  await expect(page).toHaveURL(/\/tickets\/new/)

  // Scoped to the form: Next's route announcer is a page-level role="alert".
  const form = page.locator('#ticket-form')
  const submit = page.getByRole('button', { name: 'Create ticket' })
  await expect(submit).toBeEnabled()
  await expect(form.getByRole('alert')).toHaveCount(0)

  await submit.click()

  const summary = form.getByRole('alert').filter({ hasText: 'There is a problem' })
  await expect(summary).toBeVisible()
  await expect(summary).toBeFocused()

  await expect(summary).toContainText('Enter a title for this ticket.')
  await expect(page.locator('#ticket-form-title')).toHaveAttribute('aria-invalid', 'true')
})

test('skip to main content is the first tabbable element', async ({ page }) => {
  await page.goto('/board')
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toHaveText('Skip to main content')
})

test('the project filter listbox is keyboard-operable and writes to the URL', async ({ page }) => {
  await page.goto('/board')

  const trigger = page.locator('#board-project-filter')
  await expect(trigger).toHaveAttribute('aria-label', 'Filter by project')

  await trigger.focus()
  await page.keyboard.press('Enter')

  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible()

  const option = page.getByRole('option', { name: `E2E a11y ${refs.prefix}` })
  await option.click()

  await expect(page).toHaveURL(new RegExp(`project=${refs.projectId}`))
  await expect(trigger).toContainText(`E2E a11y ${refs.prefix}`)

  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('the due date accepts both typing and a calendar pick', async ({ page }) => {
  await page.goto('/tickets/new')

  const input = page.getByRole('textbox', { name: 'Due date' })
  await input.fill('2030-04-17')
  await input.blur()
  await expect(input).toHaveValue('2030-04-17')

  await page.getByRole('button', { name: 'Choose a date from the calendar' }).click()
  const today = page.getByRole('button', { name: 'Today' })
  await expect(today).toBeVisible()
  await today.click()

  const expected = new Date()
  const iso = `${expected.getFullYear()}-${`${expected.getMonth() + 1}`.padStart(2, '0')}-${`${expected.getDate()}`.padStart(2, '0')}`
  await expect(input).toHaveValue(iso)

  await page.getByRole('button', { name: 'Clear the date' }).click()
  await expect(input).toHaveValue('')
})
