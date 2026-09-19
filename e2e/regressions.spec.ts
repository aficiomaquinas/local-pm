import { test, expect } from '@playwright/test'
import { seedProject, createTicket, getTicket, type SeedRefs } from './helpers'

/**
 * End-to-end coverage for the fixes ported from community forks.
 * Each block names the defect it pins. See CREDITS.md.
 */

let refs: SeedRefs

test.beforeAll(async ({ request }) => {
  refs = await seedProject(request, 'regressions')
})

test.describe('atomic ticket-ID allocation (ArsNovaSingers)', () => {
  test('sequential creates get sequential ids', async ({ request }) => {
    const first = await createTicket(request, refs, { title: 'Sequential one' })
    const second = await createTicket(request, refs, { title: 'Sequential two' })

    expect(first.ok()).toBeTruthy()
    expect(second.ok()).toBeTruthy()

    const a = (await first.json()).doc.ticketId
    const b = (await second.json()).doc.ticketId

    expect(a).toMatch(new RegExp(`^${refs.prefix}-\\d+$`))
    expect(b).toMatch(new RegExp(`^${refs.prefix}-\\d+$`))
    expect(a).not.toBe(b)
  })

  test('20 CONCURRENT creates all get distinct ids', async ({ request }) => {
    // The original read-then-write allocator handed the same number to
    // callers that raced. This is the regression that fix exists for.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        createTicket(request, refs, { title: `Concurrent ${i}` }),
      ),
    )

    const ids: string[] = []
    for (const res of results) {
      expect(res.ok()).toBeTruthy()
      ids.push((await res.json()).doc.ticketId)
    }

    expect(new Set(ids).size).toBe(ids.length)
  })
})

test.describe('blockedBy dependency cycle guard (ArsNovaSingers)', () => {
  test('rejects a direct A -> B -> A cycle', async ({ request }) => {
    const aRes = await createTicket(request, refs, { title: 'Cycle A' })
    const bRes = await createTicket(request, refs, { title: 'Cycle B' })
    const a = (await aRes.json()).doc
    const b = (await bRes.json()).doc

    // A blocked by B is fine.
    const ok = await request.patch(`/api/tickets/${a.id}`, { data: { blockedBy: [b.id] } })
    expect(ok.ok()).toBeTruthy()

    // B blocked by A would close the loop.
    const cycle = await request.patch(`/api/tickets/${b.id}`, { data: { blockedBy: [a.id] } })
    expect(cycle.ok()).toBeFalsy()
    expect(await cycle.text()).toContain('cycle')
  })

  test('rejects a ticket blocking itself', async ({ request }) => {
    const res = await createTicket(request, refs, { title: 'Self blocker' })
    const t = (await res.json()).doc

    const self = await request.patch(`/api/tickets/${t.id}`, { data: { blockedBy: [t.id] } })
    expect(self.ok()).toBeFalsy()
    expect(await self.text()).toContain('cannot block itself')
  })

  test('still allows a legitimate deep chain', async ({ request }) => {
    const mk = async (title: string) => (await (await createTicket(request, refs, { title })).json()).doc
    const one = await mk('Chain 1')
    const two = await mk('Chain 2')
    const three = await mk('Chain 3')

    expect((await request.patch(`/api/tickets/${two.id}`, { data: { blockedBy: [one.id] } })).ok()).toBeTruthy()
    expect((await request.patch(`/api/tickets/${three.id}`, { data: { blockedBy: [two.id] } })).ok()).toBeTruthy()
  })
})

test.describe('rich-text XSS sanitization (btafoya, fixed for SSR)', () => {
  const PAYLOADS = [
    '<img src=x onerror="window.__xss=1">',
    '<script>window.__xss=1</script>',
    '<a href="javascript:window.__xss=1">click</a>',
    '<svg onload="window.__xss=1"></svg>',
  ]

  let probeId: string

  test.beforeAll(async ({ request }) => {
    const res = await createTicket(request, refs, {
      title: 'XSS probe',
      description: PAYLOADS.join(''),
    })
    expect(res.ok()).toBeTruthy()
    probeId = (await res.json()).doc.id

    // The payload must really be stored raw, or these tests would pass for
    // the wrong reason: sanitization happens on OUTPUT, not on write.
    const stored = await getTicket(request, probeId)
    expect(stored.description).toContain('onerror')
  })

  test('rendered description is stripped of script, handlers and javascript: URLs', async ({
    page,
  }) => {
    await page.goto(`/board?project=${refs.projectId}`)
    await page.waitForLoadState('networkidle')

    // Descriptions render through RichTextDisplay inside the detail modal.
    await page.locator(`[data-ticket-id="${probeId}"]`).click()

    const body = page.locator('.rich-text-content').first()
    await expect(body).toBeVisible()

    const html = (await body.innerHTML()).toLowerCase()
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onload')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<svg')
  })

  test('no payload executes anywhere in the flow', async ({ page }) => {
    // Note: the raw description does travel to the client inside the RSC
    // flight payload, but as JSON-escaped DATA in a script *string* — it is
    // never parsed as markup. What matters is that nothing executes and that
    // what reaches the DOM is sanitized, both asserted here.
    await page.goto(`/board?project=${refs.projectId}`)
    await page.waitForLoadState('networkidle')
    await page.locator(`[data-ticket-id="${probeId}"]`).click()
    await expect(page.locator('.rich-text-content').first()).toBeVisible()

    const fired = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)
    expect(fired).toBeUndefined()
  })

  test('dangerous markup never reaches the DOM as live elements', async ({ page }) => {
    await page.goto(`/board?project=${refs.projectId}`)
    await page.waitForLoadState('networkidle')
    await page.locator(`[data-ticket-id="${probeId}"]`).click()
    await expect(page.locator('.rich-text-content').first()).toBeVisible()

    // Query the live DOM rather than the response text, so the RSC data
    // island is correctly excluded.
    const live = await page.evaluate(() => ({
      handlers: document.querySelectorAll('[onerror], [onload]').length,
      scripts: document.querySelectorAll('.rich-text-content script').length,
      jsHrefs: Array.from(document.querySelectorAll('a[href]')).filter((a) =>
        (a.getAttribute('href') || '').toLowerCase().startsWith('javascript:'),
      ).length,
    }))

    expect(live).toEqual({ handlers: 0, scripts: 0, jsHrefs: 0 })
  })
})

test.describe('infinite scroll threshold (btafoya, units corrected)', () => {
  test('projects list mounts its observer without a RangeError', async ({ page }) => {
    // Passing the old pixel-valued default (100) straight to
    // IntersectionObserver throws "threshold values must be between 0 and 1",
    // which would kill the list. Any such error surfaces on the console here.
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    expect(errors.filter((e) => /threshold|IntersectionObserver/i.test(e))).toEqual([])
  })
})
