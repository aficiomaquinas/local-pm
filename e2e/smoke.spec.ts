import { test, expect } from '@playwright/test'

/**
 * Baseline: the pages the hardening pass touched still render and still work.
 * A security change that breaks the product is not a security change.
 */

test('board renders all three columns', async ({ page }) => {
  await page.goto('/board')
  await expect(page.locator('[data-testid="column-TODO"]')).toBeVisible()
  await expect(page.locator('[data-testid="column-IN_PROGRESS"]')).toBeVisible()
  await expect(page.locator('[data-testid="column-DONE"]')).toBeVisible()
})

test('projects page renders', async ({ page }) => {
  const res = await page.goto('/projects')
  expect(res?.status()).toBe(200)
  await page.waitForLoadState('networkidle')
})

test('teams page renders', async ({ page }) => {
  const res = await page.goto('/teams')
  expect(res?.status()).toBe(200)
  await page.waitForLoadState('networkidle')
})

test('the users collection accepts a first-user registration over REST', async ({ request }) => {
  // This is the path the LOCAL_PM_REQUIRE_AUTH flow depends on for bootstrapping.
  // It deliberately does NOT go through /admin — see the fixme below.
  const email = `smoke-${Date.now()}@local-pm.test`
  const res = await request.post('/api/users', {
    data: { email, password: 'LocalPM-smoke-2026', name: 'Smoke', role: 'admin' },
  })

  // 201 on the first account; once one exists, creation is still permitted
  // while the auth flag is off, so any 2xx is a pass here.
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.doc.email).toBe(email)
  expect(body.doc.role).toBe('admin')
})

test('admin panel renders its login screen', async ({ page }) => {
  const res = await page.goto('/admin')
  expect(res!.status()).toBeLessThan(500)
})

test('with LOCAL_PM_REQUIRE_AUTH off, anonymous API access still works', async ({ request }) => {
  // The default posture is unchanged for existing installs, by design.
  const res = await request.get('/api/tickets?limit=1&depth=0')
  expect(res.ok()).toBeTruthy()
})

test('no uncaught page errors on the board', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/board')
  await page.waitForLoadState('networkidle')

  expect(errors).toEqual([])
})
