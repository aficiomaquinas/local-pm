import { test, expect, type APIRequestContext } from '@playwright/test'
import { seedProject, createTicket, type SeedRefs } from './helpers'

let refs: SeedRefs
let otherRefs: SeedRefs

async function makeInitiative(request: APIRequestContext, data: Record<string, unknown> = {}) {
  const res = await request.post('/api/initiatives', {
    data: { name: `E2E initiative ${Date.now()}-${Math.random()}`, ...data },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).doc as { id: string; name: string; projects?: unknown }
}

async function getInitiative(request: APIRequestContext, id: string) {
  const res = await request.get(`/api/initiatives/${id}?depth=0`)
  return res.json()
}

async function makeTicket(
  request: APIRequestContext,
  fields: Record<string, unknown>,
  target: SeedRefs = refs,
) {
  const res = await createTicket(request, target, fields)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).doc as { id: string; title: string }
}

test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'initiatives')
  otherRefs = await seedProject(request, 'initiatives-other')
})

test.describe('initiative membership', () => {
  test('an initiative holds several projects and a project sits in several initiatives', async ({
    request,
  }) => {
    const first = await makeInitiative(request, { projects: [refs.projectId, otherRefs.projectId] })
    const second = await makeInitiative(request, { projects: [refs.projectId] })

    expect((await getInitiative(request, first.id)).projects).toEqual([
      refs.projectId,
      otherRefs.projectId,
    ])
    expect((await getInitiative(request, second.id)).projects).toEqual([refs.projectId])
  })

  test('the same project listed twice is stored once', async ({ request }) => {
    const initiative = await makeInitiative(request, {
      projects: [refs.projectId, refs.projectId, otherRefs.projectId],
    })

    expect((await getInitiative(request, initiative.id)).projects).toEqual([
      refs.projectId,
      otherRefs.projectId,
    ])
  })

  test('a project that does not exist is rejected rather than stored', async ({ request }) => {
    const res = await request.post('/api/initiatives', {
      data: { name: 'E2E bad project', projects: ['507f1f77bcf86cd799439011'] },
    })

    expect(res.ok()).toBeFalsy()
    expect(await res.text()).toContain('could not be found')
  })

  test('an initiative needs a name', async ({ request }) => {
    const res = await request.post('/api/initiatives', { data: { name: '   ' } })
    expect(res.ok()).toBeFalsy()
  })

  test('deleting a project drops it out of every initiative that held it', async ({ request }) => {
    const doomed = await seedProject(request, 'initiatives-doomed')
    const initiative = await makeInitiative(request, {
      projects: [refs.projectId, doomed.projectId],
    })

    const deleted = await request.delete(`/api/projects/${doomed.projectId}`)
    expect(deleted.ok(), await deleted.text()).toBeTruthy()

    await expect
      .poll(async () => (await getInitiative(request, initiative.id)).projects, { timeout: 15_000 })
      .toEqual([refs.projectId])
  })

  test('deleting an initiative leaves its projects alone', async ({ request }) => {
    const initiative = await makeInitiative(request, { projects: [refs.projectId] })

    const deleted = await request.delete(`/api/initiatives/${initiative.id}`)
    expect(deleted.ok(), await deleted.text()).toBeTruthy()

    const project = await request.get(`/api/projects/${refs.projectId}?depth=0`)
    expect(project.ok()).toBeTruthy()
  })
})

test.describe('initiative rollup in the app', () => {
  test('progress rolls the tickets of every member project into one number', async ({
    page,
    request,
  }) => {
    const rollupRefs = await seedProject(request, 'initiatives-rollup-a')
    const secondRefs = await seedProject(request, 'initiatives-rollup-b')

    await makeTicket(request, { title: 'Rollup A done', status: 'DONE' }, rollupRefs)
    await makeTicket(request, { title: 'Rollup A open', status: 'TODO' }, rollupRefs)
    await makeTicket(request, { title: 'Rollup B done', status: 'DONE' }, secondRefs)
    await makeTicket(request, { title: 'Rollup B open', status: 'TODO' }, secondRefs)

    const initiative = await makeInitiative(request, {
      name: 'E2E rollup initiative',
      projects: [rollupRefs.projectId, secondRefs.projectId],
    })

    await page.goto(`/initiatives/${initiative.id}`)

    const progress = page.getByRole('progressbar', { name: 'Initiative progress' })
    await expect(progress).toBeVisible()
    await expect(progress).toHaveAttribute('aria-valuenow', '50')
    await expect(page.getByText('2 of 4 done')).toBeVisible()
  })

  test('a project can be removed from an initiative and put back with undo', async ({
    page,
    request,
  }) => {
    const initiative = await makeInitiative(request, {
      name: 'E2E undo initiative',
      projects: [refs.projectId],
    })

    await page.goto(`/initiatives/${initiative.id}?tab=projects`)

    const projectLink = page.getByRole('link', { name: `E2E initiatives ${refs.prefix}` })
    await expect(projectLink).toBeVisible()

    await page
      .getByRole('button', { name: /^Remove .* from this initiative$/ })
      .first()
      .click()

    await expect
      .poll(async () => (await getInitiative(request, initiative.id)).projects, { timeout: 15_000 })
      .toEqual([])

    await page.getByRole('button', { name: 'Undo', exact: true }).click()

    await expect
      .poll(async () => (await getInitiative(request, initiative.id)).projects, { timeout: 15_000 })
      .toEqual([refs.projectId])
  })

  test('an initiative with no projects offers a way to add the first one', async ({
    page,
    request,
  }) => {
    const initiative = await makeInitiative(request, { name: 'E2E empty initiative' })

    await page.goto(`/initiatives/${initiative.id}?tab=projects`)

    await expect(page.getByText('No projects in this initiative')).toBeVisible()
    await expect(page.getByLabel('Add a project')).toBeVisible()
  })

  test('a project added through the picker appears in the list and in its progress', async ({
    page,
    request,
  }) => {
    const added = await seedProject(request, 'initiatives-added')
    await makeTicket(request, { title: 'Added done', status: 'DONE' }, added)
    await makeTicket(request, { title: 'Added open', status: 'TODO' }, added)

    const initiative = await makeInitiative(request, { name: 'E2E adding initiative' })

    await page.goto(`/initiatives/${initiative.id}?tab=projects`)
    await page.getByLabel('Add a project').click()
    await page.getByPlaceholder('Search projects').fill(added.prefix)
    await page.getByRole('option', { name: new RegExp(added.prefix) }).first().click()

    await expect
      .poll(async () => (await getInitiative(request, initiative.id)).projects, { timeout: 15_000 })
      .toEqual([added.projectId])

    const row = page.getByRole('link', { name: `E2E initiatives-added ${added.prefix}` })
    await expect(row).toBeVisible()

    await expect(
      page.getByRole('progressbar', { name: /E2E initiatives-added .* progress/ }),
    ).toHaveAttribute('aria-valuenow', '50')
  })

  test('the project page names the initiatives it belongs to', async ({ page, request }) => {
    const linked = await seedProject(request, 'initiatives-backlink')
    const initiative = await makeInitiative(request, {
      name: 'E2E backlink initiative',
      projects: [linked.projectId],
    })

    await page.goto(`/projects/${linked.projectId}`)

    await expect(
      page.getByRole('link', { name: new RegExp(initiative.name, 'i') }),
    ).toBeVisible()
  })
})

test.describe('initiative navigation', () => {
  test('the list is reachable from the sidebar and opens an initiative', async ({
    page,
    request,
  }) => {
    const initiative = await makeInitiative(request, { name: 'E2E navigable initiative' })

    await page.goto('/board')
    await page.getByRole('link', { name: 'Initiatives' }).first().click()
    await expect(page).toHaveURL(/\/initiatives$/)

    await page.getByRole('searchbox', { name: /Search initiatives/i }).fill(initiative.name)
    await page.getByRole('link', { name: initiative.name }).click()

    await expect(page).toHaveURL(new RegExp(`/initiatives/${initiative.id}$`))
    await expect(page.getByRole('heading', { level: 1 })).toContainText(initiative.name)
  })

  test('the status filter goes into the URL and survives a reload', async ({ page, request }) => {
    await makeInitiative(request, { name: 'E2E filtered active', status: 'ACTIVE' })
    await makeInitiative(request, { name: 'E2E filtered planned', status: 'PLANNED' })

    await page.goto('/initiatives?status=ACTIVE')

    await expect(page.getByRole('link', { name: 'E2E filtered active' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'E2E filtered planned' })).toHaveCount(0)
  })

  test('an initiative can be created from the form', async ({ page, request }) => {
    const name = `E2E created ${Date.now()}`

    await page.goto('/initiatives/new')
    await page.getByLabel('Name').fill(name)
    await page.getByRole('button', { name: 'Create initiative' }).click()

    await expect(page).toHaveURL(/\/initiatives\/[a-f0-9]{24}$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)

    const saved = await request.get(
      `/api/initiatives?depth=0&where[name][equals]=${encodeURIComponent(name)}`,
    )
    expect((await saved.json()).totalDocs).toBe(1)
  })
})
