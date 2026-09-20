import type { APIRequestContext, Page } from '@playwright/test'

export interface SeedRefs {
  projectId: string
  prefix: string
  teamId: string
}

export async function seedProject(request: APIRequestContext, label: string): Promise<SeedRefs> {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const prefix =
    'E' + Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * 26)]).join('')

  const projectRes = await request.post('/api/projects', {
    data: {
      name: `E2E ${label} ${prefix}`,
      prefix,
      status: 'ACTIVE',
      ticketCounter: 0,
    },
  })
  if (!projectRes.ok()) {
    throw new Error(`Failed to create project: ${projectRes.status()} ${await projectRes.text()}`)
  }
  const project = await projectRes.json()

  const teamRes = await request.post('/api/teams', {
    data: { name: `E2E Team ${prefix}` },
  })
  if (!teamRes.ok()) {
    throw new Error(`Failed to create team: ${teamRes.status()} ${await teamRes.text()}`)
  }
  const team = await teamRes.json()

  return { projectId: project.doc.id, prefix, teamId: team.doc.id }
}

let statusCache: { id: string; key: string; name: string }[] | null = null

export async function loadStatuses(request: APIRequestContext, refresh = false) {
  if (statusCache && !refresh) return statusCache
  const res = await request.get('/api/statuses?limit=200&depth=0')
  const body = await res.json()
  statusCache = (body.docs ?? []) as { id: string; key: string; name: string }[]
  return statusCache
}

function matchStatus(
  statuses: { id: string; key: string; name: string }[],
  value: string,
) {
  const needle = value.trim().toLowerCase()
  return (
    statuses.find((s) => s.id === value) ??
    statuses.find((s) => s.key.toLowerCase() === needle) ??
    statuses.find((s) => s.name.toLowerCase() === needle)
  )
}

export async function statusId(request: APIRequestContext, value: string) {
  let match = matchStatus(await loadStatuses(request), value)
  if (!match) match = matchStatus(await loadStatuses(request, true), value)
  if (!match) throw new Error(`Unknown status "${value}" in e2e helpers`)
  return match.id
}

export async function statusKeyOf(request: APIRequestContext, statusValue: unknown) {
  if (!statusValue) return null
  if (typeof statusValue === 'object') return (statusValue as { key?: string }).key ?? null

  const cached = await loadStatuses(request)
  const hit = cached.find((s) => s.id === statusValue)
  if (hit) return hit.key

  const fresh = await loadStatuses(request, true)
  return fresh.find((s) => s.id === statusValue)?.key ?? null
}

export async function createTicket(
  request: APIRequestContext,
  refs: SeedRefs,
  fields: Record<string, unknown>,
) {
  const { status, ...rest } = fields
  const res = await request.post('/api/tickets', {
    data: {
      title: 'E2E ticket',
      priority: 'NO_PRIORITY',
      project: refs.projectId,
      team: refs.teamId,
      status: await statusId(request, (status as string) ?? 'TODO'),
      ...rest,
    },
  })
  return res
}

export async function getTicket(request: APIRequestContext, id: string) {
  const res = await request.get(`/api/tickets/${id}?depth=0`)
  return res.json()
}

export async function dragTo(
  page: Page,
  sourceSelector: string,
  targetSelector: string,
  dropAtHeightFraction = 0.5,
) {
  const source = page.locator(sourceSelector).first()
  const target = page.locator(targetSelector).first()

  await source.scrollIntoViewIfNeeded()
  const from = await source.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('drag source or target not visible')

  const startX = from.x + from.width / 2
  const startY = from.y + from.height / 2
  const endX = to.x + to.width / 2
  const endY = to.y + Math.min(Math.max(to.height * dropAtHeightFraction, 8), to.height - 8)

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 12, startY + 12, { steps: 5 })
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(
      startX + ((endX - startX) * i) / 12,
      startY + ((endY - startY) * i) / 12,
      { steps: 3 },
    )
  }
  await page.mouse.move(endX, endY, { steps: 5 })
  await page.mouse.up()
}
