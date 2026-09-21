import { test, expect } from '@playwright/test'
import { seedProject, createTicket, getTicket, type SeedRefs } from './helpers'

let refs: SeedRefs
let labelName: string
let labelId: string

test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'labels')
  labelName = `shared-${refs.prefix.toLowerCase()}`

  const res = await request.post('/api/labels', {
    data: { name: labelName, color: 'GREEN' },
  })
  if (!res.ok()) {
    throw new Error(`Failed to create label: ${res.status()} ${await res.text()}`)
  }
  labelId = (await res.json()).doc.id
})

test('the same label can be carried by tickets in different projects', async ({ request }) => {
  const other = await seedProject(request, 'labels-elsewhere')

  const here = await (
    await createTicket(request, refs, { title: 'Labelled here', labels: [labelId] })
  ).json()
  const there = await (
    await createTicket(request, other, { title: 'Labelled there', labels: [labelId] })
  ).json()

  const found = await request.get(
    `/api/tickets?where[labels][equals]=${labelId}&limit=50&depth=0`,
  )
  const ids = ((await found.json()).docs ?? []).map((doc: { id: string }) => doc.id)

  expect(ids).toContain(here.doc.id)
  expect(ids).toContain(there.doc.id)
})

test('a label added on the ticket page shows on its board card', async ({ page, request }) => {
  const created = await (await createTicket(request, refs, { title: 'Needs a label' })).json()
  const id = created.doc.id

  await page.goto(`/tickets/${id}`)

  await page.getByRole('combobox', { name: 'Add a label' }).click()
  await page.getByPlaceholder('Search or create a label').fill(labelName)
  await page.getByRole('option', { name: labelName, exact: true }).click()

  await expect(page.getByRole('button', { name: `Remove label ${labelName}` })).toBeVisible()

  await expect
    .poll(
      async () => {
        const doc = await getTicket(request, id)
        return (doc.labels ?? []).map(String)
      },
      { timeout: 15_000 },
    )
    .toEqual([labelId])

  await page.goto(`/board?project=${refs.projectId}`)
  const card = page.locator(`[data-ticket-id="${id}"]`)
  await expect(card).toBeVisible()
  await expect(card.getByText(labelName, { exact: true })).toBeVisible()
})

test('typing a name that does not exist offers to create the label', async ({ page, request }) => {
  const created = await (await createTicket(request, refs, { title: 'Invents a label' })).json()
  const id = created.doc.id
  const fresh = `invented-${refs.prefix.toLowerCase()}`

  await page.goto(`/tickets/${id}`)

  await page.getByRole('combobox', { name: 'Add a label' }).click()
  await page.getByPlaceholder('Search or create a label').fill(fresh)
  await page.getByRole('option', { name: `Create label “${fresh}”` }).click()

  await expect(page.getByRole('button', { name: `Remove label ${fresh}` })).toBeVisible()

  const found = await request.get(`/api/labels?where[key][equals]=${fresh.replace(/-/g, '_')}&depth=0`)
  expect((await found.json()).totalDocs).toBe(1)
})

test('a label removed from a ticket leaves the label itself alone', async ({ page, request }) => {
  const created = await (
    await createTicket(request, refs, { title: 'Loses a label', labels: [labelId] })
  ).json()
  const id = created.doc.id

  await page.goto(`/tickets/${id}`)
  await page.getByRole('button', { name: `Remove label ${labelName}` }).click()

  await expect
    .poll(async () => (await getTicket(request, id)).labels?.length ?? 0, { timeout: 15_000 })
    .toBe(0)

  const stillThere = await request.get(`/api/labels/${labelId}?depth=0`)
  expect(stillThere.ok()).toBe(true)
})

test('the key is derived from the name and must be unique', async ({ request }) => {
  const duplicate = await request.post('/api/labels', {
    data: { name: labelName.toUpperCase() },
  })

  expect(duplicate.ok()).toBe(false)
  expect(await duplicate.text()).toContain(labelName.replace(/-/g, '_'))
})
