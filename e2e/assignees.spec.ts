import { test, expect, type APIRequestContext } from '@playwright/test'
import { seedProject, createTicket, getTicket, type SeedRefs } from './helpers'

let refs: SeedRefs
let memberId: string
let memberName: string

async function createMember(
  request: APIRequestContext,
  data: Record<string, unknown>,
) {
  return request.post('/api/members', { data })
}

test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'assignees')
  memberName = `Assignee Person ${refs.prefix}`
  const res = await createMember(request, { name: memberName, team: refs.teamId })
  expect(res.ok()).toBeTruthy()
  memberId = (await res.json()).doc.id
})

test.describe('the members collection', () => {
  test('creates a person and reads them back', async ({ request }) => {
    const res = await request.get(`/api/members/${memberId}?depth=0`)
    expect(res.ok()).toBeTruthy()

    const member = await res.json()
    expect(member.name).toBe(memberName)
    expect(member.active).toBe(true)
  })

  test('requires a name', async ({ request }) => {
    const res = await createMember(request, { email: 'nameless@example.com' })
    expect(res.ok()).toBeFalsy()
  })

  test('refuses to link one login account to two people', async ({ request }) => {
    const userRes = await request.post('/api/users', {
      data: {
        email: `link-${Date.now()}@local-pm.test`,
        password: 'LocalPM-assignee-2026',
        name: 'Link Target',
        role: 'admin',
      },
    })
    expect(userRes.ok()).toBeTruthy()
    const userId = (await userRes.json()).doc.id

    const first = await createMember(request, { name: `First ${refs.prefix}`, user: userId })
    expect(first.ok()).toBeTruthy()

    const second = await createMember(request, { name: `Second ${refs.prefix}`, user: userId })
    expect(second.ok()).toBeFalsy()
    expect(second.status()).toBe(400)

    const body = await second.json()
    expect(JSON.stringify(body)).toContain('already linked')
  })
})

test.describe('assigning a ticket', () => {
  test('a ticket can be created with an assignee and unassigned again', async ({ request }) => {
    const created = await createTicket(request, refs, {
      title: 'Assigned at creation',
      assignee: memberId,
    })
    expect(created.ok()).toBeTruthy()
    const ticket = (await created.json()).doc

    expect(await getTicket(request, ticket.id).then((t) => t.assignee)).toBe(memberId)

    const cleared = await request.patch(`/api/tickets/${ticket.id}`, {
      data: { assignee: null },
    })
    expect(cleared.ok()).toBeTruthy()
    expect(await getTicket(request, ticket.id).then((t) => t.assignee)).toBeFalsy()
  })

  test('tickets can be filtered by assignee', async ({ request }) => {
    const mine = await createTicket(request, refs, {
      title: 'Filterable mine',
      assignee: memberId,
    })
    const theirs = await createTicket(request, refs, { title: 'Filterable nobody' })
    expect(mine.ok()).toBeTruthy()
    expect(theirs.ok()).toBeTruthy()

    const res = await request.get(
      `/api/tickets?depth=0&limit=100&where[assignee][equals]=${memberId}&where[project][equals]=${refs.projectId}`,
    )
    expect(res.ok()).toBeTruthy()

    const titles = (await res.json()).docs.map((t: { title: string }) => t.title)
    expect(titles).toContain('Filterable mine')
    expect(titles).not.toContain('Filterable nobody')
  })

  test('deleting a person leaves their tickets, unassigned', async ({ request }) => {
    const temp = await createMember(request, { name: `Temp ${refs.prefix}` })
    const tempId = (await temp.json()).doc.id

    const created = await createTicket(request, refs, {
      title: 'Survives its assignee',
      assignee: tempId,
    })
    const ticketId = (await created.json()).doc.id

    const deleted = await request.delete(`/api/members/${tempId}`)
    expect(deleted.ok()).toBeTruthy()

    const after = await getTicket(request, ticketId)
    expect(after.title).toBe('Survives its assignee')
    expect(after.assignee).toBeFalsy()
  })
})

test.describe('the assignee in the UI', () => {
  test('the card shows the assignee, and unassigned cards say so', async ({ page, request }) => {
    const assigned = await createTicket(request, refs, {
      title: 'Card with an assignee',
      assignee: memberId,
      status: 'TODO',
    })
    const unassigned = await createTicket(request, refs, {
      title: 'Card with nobody',
      status: 'TODO',
    })
    const assignedId = (await assigned.json()).doc.id
    const unassignedId = (await unassigned.json()).doc.id

    await page.goto(`/board?project=${refs.projectId}`)

    const assignedCard = page.locator(`[data-ticket-id="${assignedId}"]`)
    await expect(assignedCard).toBeVisible()
    await expect(assignedCard.getByRole('img', { name: memberName })).toBeVisible()

    const unassignedCard = page.locator(`[data-ticket-id="${unassignedId}"]`)
    await expect(unassignedCard.getByRole('img', { name: 'Unassigned' })).toBeVisible()
  })

  test('the board filters by assignee, and the chip clears it', async ({ page, request }) => {
    const mine = await createTicket(request, refs, {
      title: 'Board filter mine',
      assignee: memberId,
      status: 'TODO',
    })
    const nobody = await createTicket(request, refs, {
      title: 'Board filter nobody',
      status: 'TODO',
    })
    const mineId = (await mine.json()).doc.id
    const nobodyId = (await nobody.json()).doc.id

    await page.goto(`/board?project=${refs.projectId}&assignee=${memberId}`)

    await expect(page.locator(`[data-ticket-id="${mineId}"]`)).toBeVisible()
    await expect(page.locator(`[data-ticket-id="${nobodyId}"]`)).toHaveCount(0)

    await page.getByRole('button', { name: `Remove assignee filter ${memberName}` }).click()

    await expect(page.locator(`[data-ticket-id="${nobodyId}"]`)).toBeVisible()
    expect(new URL(page.url()).searchParams.get('assignee')).toBeNull()
  })

  test('the assignee filter is addressable — reload keeps it', async ({ page }) => {
    await page.goto(`/board?project=${refs.projectId}&assignee=${memberId}`)
    await expect(
      page.getByRole('button', { name: `Remove assignee filter ${memberName}` }),
    ).toBeVisible()

    await page.reload()
    await expect(
      page.getByRole('button', { name: `Remove assignee filter ${memberName}` }),
    ).toBeVisible()
  })

  test('the team page lists its members', async ({ page }) => {
    await page.goto(`/teams/${refs.teamId}`)
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible()
    await expect(page.getByText(memberName, { exact: true })).toBeVisible()
  })
})

test.describe('my tickets', () => {
  test('asks a signed-out visitor to sign in rather than showing an empty list', async ({
    page,
  }) => {
    const res = await page.goto('/my-tickets')
    expect(res?.status()).toBe(200)

    await expect(page.getByRole('heading', { level: 1, name: 'My tickets' })).toBeVisible()
    await expect(page.getByText('Sign in to see your tickets')).toBeVisible()
  })

  test('is reachable from the sidebar', async ({ page }) => {
    await page.goto('/board')
    await page.getByRole('link', { name: 'My tickets' }).first().click()
    await expect(page).toHaveURL(/\/my-tickets$/)
  })
})
