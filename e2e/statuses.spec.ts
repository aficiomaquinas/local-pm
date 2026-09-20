import { test, expect } from '@playwright/test'
import { seedProject, createTicket, getTicket, type SeedRefs, statusKeyOf } from './helpers'

let refs: SeedRefs

test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'statuses')

  const res = await request.post('/api/statuses', {
    data: {
      name: 'In Review',
      type: 'STARTED',
      order: 2500,
      project: refs.projectId,
    },
  })
  if (!res.ok()) {
    throw new Error(`Failed to create status: ${res.status()} ${await res.text()}`)
  }
  await createTicket(request, refs, { title: 'Anchors the board', status: 'TODO' })
})

test('a status added to a project appears as a board column', async ({ page }) => {
  await page.goto(`/board?project=${refs.projectId}`)

  await expect(page.getByRole('heading', { name: 'In Review', level: 2 })).toBeVisible()
  await expect(page.locator('[data-column-status="in_review"]')).toBeVisible()
})

test('a project status joins the global workflow, in order', async ({ page }) => {
  await page.goto(`/board?project=${refs.projectId}`)

  const headings = page.locator('section[aria-label$="column"] h2')
  await expect(headings).toHaveText(['Todo', 'In Progress', 'In Review', 'Done'])
})

test('a ticket can be moved into a custom status from the card menu', async ({ page, request }) => {
  const ticket = await (
    await createTicket(request, refs, { title: 'Needs review', status: 'TODO' })
  ).json()
  const id = ticket.doc.id

  await page.goto(`/board?project=${refs.projectId}`)

  const card = page.locator(`[data-ticket-id="${id}"]`)
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Actions for Needs review' }).click()
  await page.getByRole('menuitem', { name: 'Move to In Review' }).click()

  await expect
    .poll(async () => await statusKeyOf(request, (await getTicket(request, id)).status), {
      timeout: 15_000,
    })
    .toBe('in_review')
})

test('the key is derived from the name and must be unique within a workflow', async ({
  request,
}) => {
  const duplicate = await request.post('/api/statuses', {
    data: { name: 'In Review', type: 'STARTED', order: 2600, project: refs.projectId },
  })

  expect(duplicate.ok()).toBe(false)
  expect(await duplicate.text()).toContain('in_review')
})
