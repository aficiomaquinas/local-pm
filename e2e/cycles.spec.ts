import { test, expect, type APIRequestContext } from '@playwright/test'
import { seedProject, createTicket, getTicket, type SeedRefs } from './helpers'

let refs: SeedRefs

async function enableCycles(
  request: APIRequestContext,
  projectId: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await request.patch(`/api/projects/${projectId}`, {
    data: {
      cycles: {
        enabled: true,
        lengthWeeks: 2,
        startDay: 1,
        rollover: 'NEXT',
        automation: 'MANUAL',
        upcomingCount: 2,
        ...overrides,
      },
    },
  })
  if (!res.ok()) {
    throw new Error(`Failed to enable cycles: ${res.status()} ${await res.text()}`)
  }
}

async function reconcile(request: APIRequestContext, projectId: string) {
  const res = await request.post('/api/cycles/reconcile', {
    data: { project: projectId },
  })
  if (!res.ok()) {
    throw new Error(`Failed to reconcile: ${res.status()} ${await res.text()}`)
  }
  return res.json()
}

async function listCycles(request: APIRequestContext, projectId: string) {
  const res = await request.get(
    `/api/cycles?where[project][equals]=${projectId}&sort=number&limit=100&depth=0`,
  )
  const body = await res.json()
  return (body.docs ?? []) as {
    id: string
    name: string
    number: number
    startsAt: string
    endsAt: string
    completedAt: string | null
    rolledOver: number | null
  }[]
}

test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'cycles')
})

test('a project with cycles off shows the settings route out, not an empty list', async ({
  page,
}) => {
  await page.goto(`/cycles?project=${refs.projectId}`)

  await expect(page.getByRole('heading', { name: 'Cycles', level: 1 })).toBeVisible()
  await expect(page.getByText(/Cycles are off for/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open cycle settings' })).toBeVisible()
})

test('enabling cycles provisions the active cycle plus the upcoming ones', async ({ request }) => {
  await enableCycles(request, refs.projectId)
  await reconcile(request, refs.projectId)

  const cycles = await listCycles(request, refs.projectId)
  expect(cycles).toHaveLength(3)
  expect(cycles.map((c) => c.number)).toEqual([1, 2, 3])

  for (let i = 1; i < cycles.length; i += 1) {
    const previousEnd = new Date(cycles[i - 1].endsAt).getTime()
    const start = new Date(cycles[i].startsAt).getTime()
    expect(start - previousEnd).toBe(86_400_000)
  }

  const first = cycles[0]
  const span =
    (new Date(first.endsAt).getTime() - new Date(first.startsAt).getTime()) / 86_400_000 + 1
  expect(span).toBe(14)
  expect(new Date(first.startsAt).getUTCDay()).toBe(1)
})

test('reconciling twice creates nothing new', async ({ request }) => {
  const before = await listCycles(request, refs.projectId)
  await reconcile(request, refs.projectId)
  const after = await listCycles(request, refs.projectId)

  expect(after).toHaveLength(before.length)
  expect(after.map((c) => c.id).sort()).toEqual(before.map((c) => c.id).sort())
})

test('the cycles page lists the active cycle and links to its detail', async ({ page, request }) => {
  const [active] = await listCycles(request, refs.projectId)

  await page.goto(`/cycles?project=${refs.projectId}`)

  const row = page.locator(`[data-cycle-id="${active.id}"]`)
  await expect(row).toBeVisible()
  await expect(row).toHaveAttribute('data-cycle-state', 'active')

  await row.getByRole('link', { name: active.name }).click()
  await expect(page).toHaveURL(new RegExp(`/cycles/${active.id}$`))
  await expect(page.getByRole('heading', { name: active.name, level: 1 })).toBeVisible()
})

test('closing a cycle moves unfinished work on and leaves finished work behind', async ({
  request,
}) => {
  const cycles = await listCycles(request, refs.projectId)
  const active = cycles[0]
  const next = cycles[1]

  const open = await (
    await createTicket(request, refs, {
      title: 'Still open at the end of the cycle',
      status: 'TODO',
      cycle: active.id,
    })
  ).json()

  const finished = await (
    await createTicket(request, refs, {
      title: 'Finished inside the cycle',
      status: 'DONE',
      cycle: active.id,
    })
  ).json()

  const res = await request.post(`/api/cycles/${active.id}/close`)
  expect(res.ok()).toBeTruthy()

  const body = await res.json()
  expect(body.report.rolledOver).toBe(1)

  await expect
    .poll(async () => (await getTicket(request, open.doc.id)).cycle, { timeout: 15_000 })
    .toBe(next.id)

  expect((await getTicket(request, finished.doc.id)).cycle).toBe(active.id)

  const closed = (await listCycles(request, refs.projectId)).find((c) => c.id === active.id)
  expect(closed?.completedAt).toBeTruthy()
  expect(closed?.rolledOver).toBe(1)
})

test('a rollover is recorded in the ticket activity trail', async ({ request }) => {
  const tickets = await request.get(
    `/api/tickets?where[title][equals]=${encodeURIComponent('Still open at the end of the cycle')}&limit=1&depth=0`,
  )
  const [ticket] = (await tickets.json()).docs

  await expect
    .poll(
      async () => {
        const res = await request.get(
          `/api/activity?where[ticket][equals]=${ticket.id}&where[field][equals]=cycle&limit=10&depth=0`,
        )
        return (await res.json()).totalDocs
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0)
})

test('an elapsed cycle closes itself when the project is set to automatic', async ({ request }) => {
  const scoped = await seedProject(request, 'cycles-auto')
  await enableCycles(request, scoped.projectId, { automation: 'AUTOMATIC' })

  const past = await request.post('/api/cycles', {
    data: {
      name: 'Already over',
      number: 1,
      project: scoped.projectId,
      startsAt: '2026-01-05T00:00:00.000Z',
      endsAt: '2026-01-18T00:00:00.000Z',
    },
  })
  expect(past.ok()).toBeTruthy()
  const elapsed = (await past.json()).doc

  const stranded = await (
    await createTicket(request, scoped, {
      title: 'Left over from an old cycle',
      status: 'TODO',
      cycle: elapsed.id,
    })
  ).json()

  await reconcile(request, scoped.projectId)

  const cycles = await listCycles(request, scoped.projectId)
  const closed = cycles.find((c) => c.id === elapsed.id)
  expect(closed?.completedAt).toBeTruthy()

  const landedIn = (await getTicket(request, stranded.doc.id)).cycle
  expect(landedIn).not.toBe(elapsed.id)
  expect(landedIn).toBeTruthy()

  const destination = cycles.find((c) => c.id === landedIn)
  expect(destination?.completedAt).toBeFalsy()
})

test('rolling over to the backlog clears the cycle instead of advancing it', async ({ request }) => {
  const scoped = await seedProject(request, 'cycles-backlog')
  await enableCycles(request, scoped.projectId, { rollover: 'BACKLOG' })
  await reconcile(request, scoped.projectId)

  const [active] = await listCycles(request, scoped.projectId)
  const open = await (
    await createTicket(request, scoped, {
      title: 'Goes back to the backlog',
      status: 'TODO',
      cycle: active.id,
    })
  ).json()

  const res = await request.post(`/api/cycles/${active.id}/close`)
  expect(res.ok()).toBeTruthy()

  await expect
    .poll(async () => (await getTicket(request, open.doc.id)).cycle, { timeout: 15_000 })
    .toBeNull()
})

test('leaving unfinished work in place is honoured', async ({ request }) => {
  const scoped = await seedProject(request, 'cycles-none')
  await enableCycles(request, scoped.projectId, { rollover: 'NONE' })
  await reconcile(request, scoped.projectId)

  const [active] = await listCycles(request, scoped.projectId)
  const open = await (
    await createTicket(request, scoped, {
      title: 'Stays where it is',
      status: 'TODO',
      cycle: active.id,
    })
  ).json()

  const res = await request.post(`/api/cycles/${active.id}/close`)
  expect(res.ok()).toBeTruthy()
  expect((await res.json()).report.rolledOver).toBe(0)

  expect((await getTicket(request, open.doc.id)).cycle).toBe(active.id)
})

test('a cycle cannot end before it starts', async ({ request }) => {
  const res = await request.post('/api/cycles', {
    data: {
      name: 'Backwards',
      number: 999,
      project: refs.projectId,
      startsAt: '2026-10-10T00:00:00.000Z',
      endsAt: '2026-10-01T00:00:00.000Z',
    },
  })

  expect(res.ok()).toBeFalsy()
  expect(await res.text()).toContain('cannot end before it starts')
})

test('cycle numbers are unique within a project', async ({ request }) => {
  const res = await request.post('/api/cycles', {
    data: {
      name: 'Duplicate',
      number: 1,
      project: refs.projectId,
      startsAt: '2026-10-05T00:00:00.000Z',
      endsAt: '2026-10-18T00:00:00.000Z',
    },
  })

  expect(res.ok()).toBeFalsy()
  expect(await res.text()).toContain('already has a cycle numbered 1')
})

test('deleting a cycle releases its tickets rather than deleting them', async ({ request }) => {
  const scoped = await seedProject(request, 'cycles-delete')
  await enableCycles(request, scoped.projectId)
  await reconcile(request, scoped.projectId)

  const [active] = await listCycles(request, scoped.projectId)
  const ticket = await (
    await createTicket(request, scoped, {
      title: 'Survives its cycle',
      status: 'TODO',
      cycle: active.id,
    })
  ).json()

  const res = await request.delete(`/api/cycles/${active.id}`)
  expect(res.ok()).toBeTruthy()

  await expect
    .poll(async () => (await getTicket(request, ticket.doc.id)).cycle, { timeout: 15_000 })
    .toBeNull()
  expect((await getTicket(request, ticket.doc.id)).title).toBe('Survives its cycle')
})

test('the board can be filtered to one cycle, and the filter lives in the URL', async ({
  page,
  request,
}) => {
  const scoped = await seedProject(request, 'cycles-board')
  await enableCycles(request, scoped.projectId)
  await reconcile(request, scoped.projectId)

  const [active] = await listCycles(request, scoped.projectId)

  const inCycle = await (
    await createTicket(request, scoped, {
      title: 'Committed to the cycle',
      status: 'TODO',
      cycle: active.id,
    })
  ).json()

  const outOfCycle = await (
    await createTicket(request, scoped, { title: 'Not in any cycle', status: 'TODO' })
  ).json()

  await page.goto(`/board?project=${scoped.projectId}&cycle=${active.id}`)

  await expect(page.locator(`[data-ticket-id="${inCycle.doc.id}"]`)).toBeVisible()
  await expect(page.locator(`[data-ticket-id="${outOfCycle.doc.id}"]`)).toHaveCount(0)

  await expect(page.getByRole('button', { name: `Remove cycle filter ${active.name}` })).toBeVisible()
})

test('the cycles page is reachable from the sidebar', async ({ page }) => {
  await page.goto('/board')
  await page.getByRole('link', { name: 'Cycles' }).first().click()
  await expect(page).toHaveURL(/\/cycles/)
  await expect(page.getByRole('heading', { name: 'Cycles', level: 1 })).toBeVisible()
})
