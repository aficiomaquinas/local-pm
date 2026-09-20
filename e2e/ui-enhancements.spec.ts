import { test, expect } from '@playwright/test'
import { seedProject, createTicket, type SeedRefs } from './helpers'

let refs: SeedRefs
let ticket: { id: string; ticketId: string; title: string }
test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'UX')
  const response = await createTicket(request, refs, { title: 'A clear next step' })
  expect(response.ok(), 'The test ticket must be created successfully').toBe(true)
  ticket = (await response.json()).doc
})

test('ticket keys work in board search, reloads, and global search', async ({ page }) => {
  await page.goto('/board?project=' + refs.projectId)
  await page.getByRole('searchbox', { name: 'Search tickets on this board' }).fill(ticket.ticketId)
  await expect(page.locator('[data-ticket-id="' + ticket.id + '"]')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Updating' })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('[data-ticket-id="' + ticket.id + '"]')).toBeVisible()
  await page.getByRole('button', { name: /Search or jump/ }).click()
  await page
    .getByRole('combobox', { name: 'Search commands, tickets, projects and teams' })
    .fill(ticket.ticketId)
  await page.getByRole('option', { name: new RegExp(ticket.title) }).click()
  await expect(page).toHaveURL(new RegExp('/tickets/' + ticket.id))
})

test('creating from a filtered board returns to that board and keeps the team', async ({
  page,
}) => {
  await page.goto('/board?project=' + refs.projectId + '&team=' + refs.teamId)
  await page.getByRole('button', { name: /New ticket/ }).click()
  await page.waitForURL(/\/tickets\/new/)
  await expect(page.getByRole('combobox', { name: 'Team', exact: true })).toContainText('E2E Team')
  await page.getByRole('textbox', { name: 'Title', exact: false }).fill('Created with context')
  await page.getByRole('button', { name: /Create ticket/ }).click()
  await expect(page).toHaveURL(
    new RegExp('/board\\?project=' + refs.projectId + '&team=' + refs.teamId),
  )
  await expect(page.getByText('Created with context', { exact: true })).toBeVisible()
})

test('saved views survive reload and restore the search and project', async ({ page }) => {
  await page.goto('/board?project=' + refs.projectId + '&q=' + ticket.ticketId)
  await page.getByRole('button', { name: 'Saved views', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save or manage views' }).click()
  await page.getByRole('textbox', { name: 'View name' }).fill('My launch')
  await page.getByRole('button', { name: 'Save current view' }).click()
  await page.getByRole('button', { name: 'Clear all' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Saved views', exact: true }).click()
  await page.getByRole('menuitem', { name: 'My launch' }).click()
  await expect(page).toHaveURL(new RegExp('project=' + refs.projectId))
  await expect(page.getByRole('searchbox', { name: 'Search tickets on this board' })).toHaveValue(
    ticket.ticketId,
  )
})

test('unfinished tickets can be restored after client navigation and discarded', async ({
  page,
}) => {
  await page.goto('/tickets/new?project=' + refs.projectId)
  await page.getByRole('textbox', { name: 'Title' }).fill('Keep this idea')
  await expect(page.getByText('Draft saved in this tab')).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Main', exact: true })
    .getByRole('link', { name: /Board/ })
    .click()
  await page.goto('/tickets/new?project=' + refs.projectId)
  await page.getByRole('button', { name: 'Restore draft' }).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Keep this idea')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(page).toHaveURL(/\/board/)
  await page.goto('/tickets/new?project=' + refs.projectId)
  await expect(page.getByRole('button', { name: 'Restore draft' })).toHaveCount(0)
})

test('list errors have a working retry and short searches reach the server', async ({ page }) => {
  await page.goto('/projects')
  let fail = true
  await page.route('**/api/projects?*', async (route) => {
    if (fail) await route.fulfill({ status: 503, body: '{}' })
    else await route.continue()
  })
  await page.getByRole('searchbox', { name: 'Search projects by name' }).fill('E')
  await expect(page.getByText("Couldn't load projects", { exact: true })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText("Couldn't load projects", { exact: true })).toBeHidden()
  await expect(page.getByRole('link', { name: 'E2E UX ' + refs.prefix, exact: true })).toBeVisible()
})

test('Back restores project sort and a ticket list keeps filters on reload', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Project', exact: true }).click()
  await expect(page).toHaveURL(/sort=name/)
  await page.getByRole('button', { name: 'Project', exact: true }).click()
  await expect(page).toHaveURL(/sort=-name/)
  await page.goBack()
  await expect(page.getByRole('columnheader', { name: 'Project', exact: true })).toHaveAttribute(
    'aria-sort',
    'ascending',
  )
  await page.goto('/projects/' + refs.projectId + '?tab=tickets')
  await page.getByRole('searchbox', { name: 'Search these tickets' }).fill(ticket.ticketId)
  await expect(page).toHaveURL(/ticketQ=/)
  await page.reload()
  await expect(page.getByRole('searchbox', { name: 'Search these tickets' })).toHaveValue(
    ticket.ticketId,
  )
  await expect(page.getByRole('link', { name: ticket.title, exact: true })).toBeVisible()
})

test('failed board search offers retry without pretending there are no results', async ({
  page,
}) => {
  await page.goto('/board?project=' + refs.projectId)
  let fail = true
  await page.route('**/api/tickets?*', async (route) => {
    if (fail) await route.fulfill({ status: 503, body: '{}' })
    else await route.continue()
  })
  await page.getByRole('searchbox', { name: 'Search tickets on this board' }).fill(ticket.ticketId)
  await expect(page.getByText('Could not update the board', { exact: true })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.locator('[data-ticket-id="' + ticket.id + '"]')).toBeVisible()
})

test('getting-started guide and mobile navigation are keyboard accessible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/board?project=' + refs.projectId)
  await page.getByRole('button', { name: 'Getting started', exact: true }).click()
  const guide = page.getByRole('dialog', { name: 'Make room for your best work' })
  await expect(guide).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Make room for your best work' })).toBeFocused()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const nav = page.getByRole('dialog', { name: 'Navigation', exact: true })
  await expect(nav).toBeVisible()
  for (let index = 0; index < 10; index++) {
    await page.keyboard.press('Tab')
    await expect(nav.locator(':focus')).toHaveCount(1)
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused()
  await expect(page.locator('#board-project-filter')).toBeHidden()
  await page.getByRole('button', { name: /Filters/ }).click()
  await expect(page.locator('#board-project-filter')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.getByRole('button', { name: /Filters/ }).click()
  await page.screenshot({ path: test.info().outputPath('board-mobile.png') })
})

test('desktop board renders with the guide available', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/board?project=' + refs.projectId)
  await expect(page.locator('[data-ticket-id="' + ticket.id + '"]')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('board-desktop.png') })
  await page.getByRole('button', { name: /Change theme/ }).click()
  await page.getByRole('menuitem', { name: 'Dark', exact: true }).click()
  await page.screenshot({ path: test.info().outputPath('board-dark.png') })
})

test('a ticket deep link opens even when current filters hide its card', async ({ page }) => {
  await page.goto('/board?project=' + refs.projectId + '&q=no-matching-title&ticket=' + ticket.id)
  await expect(page.getByRole('dialog', { name: ticket.title })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/q=no-matching-title/)
})

test.describe('touch layout', () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 740 } })
  test('primary controls fit a small touch screen', async ({ page }) => {
    await page.goto('/board?project=' + refs.projectId)
    const create = page.getByRole('button', { name: /New ticket/ })
    await expect(create).toBeVisible()
    const box = await create.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    await page.screenshot({ path: test.info().outputPath('board-touch.png') })
  })
})
