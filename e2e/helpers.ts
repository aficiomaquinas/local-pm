import type { APIRequestContext, Page } from '@playwright/test'

export interface SeedRefs {
  projectId: string
  prefix: string
  teamId: string
}

/** Create a throwaway project + team for one spec, with a unique prefix. */
export async function seedProject(request: APIRequestContext, label: string): Promise<SeedRefs> {
  // Prefix must be 2-6 UPPERCASE LETTERS (no digits) per the Projects schema,
  // and unique per run; ticket ids are `${prefix}-${n}`.
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

export async function createTicket(
  request: APIRequestContext,
  refs: SeedRefs,
  fields: Record<string, unknown>,
) {
  const res = await request.post('/api/tickets', {
    data: {
      title: 'E2E ticket',
      status: 'TODO',
      priority: 'NO_PRIORITY',
      project: refs.projectId,
      team: refs.teamId,
      ...fields,
    },
  })
  return res
}

export async function getTicket(request: APIRequestContext, id: string) {
  const res = await request.get(`/api/tickets/${id}?depth=0`)
  return res.json()
}

/**
 * Drive a dnd-kit drag with real mouse events.
 *
 * dnd-kit's PointerSensor has an 8px activation distance, and it needs several
 * intermediate moves to register a drag rather than a click — a single
 * mouse.move() to the destination is silently treated as a click.
 */
export async function dragTo(
  page: Page,
  sourceSelector: string,
  targetSelector: string,
  /**
   * Where to release within the target, as a fraction of its height.
   * Use a value near 1 to land on EMPTY space below the existing cards, which
   * is the "append to column" case; the default aims mid-column.
   */
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
  // Keep a small inset so the pointer stays inside the droppable.
  const endY = to.y + Math.min(Math.max(to.height * dropAtHeightFraction, 8), to.height - 8)

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // Cross the activation distance first, then travel in steps.
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
