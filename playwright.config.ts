import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

/**
 * E2E configuration.
 *
 * The suite creates, mutates and deletes records, so it MUST NOT be pointed at
 * a working database. `E2E_DATABASE_URI` defaults to a separate `local-pm-e2e`
 * database derived from `DATABASE_URI`, and the server under test runs on its
 * own port so a dev server on 3010 can stay up alongside it.
 */

const PORT = Number(process.env.E2E_PORT ?? 3020)
const BASE_URL = `http://127.0.0.1:${PORT}`

/** Swap the database name in a Mongo URI, preserving any query string. */
function withDatabase(uri: string, dbName: string): string {
  const [base, query] = uri.split('?')
  const trimmed = base.replace(/\/[^/]*$/, '')
  return `${trimmed}/${dbName}${query ? `?${query}` : ''}`
}

const SOURCE_URI = process.env.DATABASE_URI ?? 'mongodb://localhost:27018/local-pm'
const E2E_DATABASE_URI = process.env.E2E_DATABASE_URI ?? withDatabase(SOURCE_URI, 'local-pm-e2e')

if (E2E_DATABASE_URI === SOURCE_URI) {
  throw new Error(
    'Refusing to run E2E against the same database as DATABASE_URI. Set E2E_DATABASE_URI explicitly.',
  )
}

export default defineConfig({
  testDir: './e2e',
  // Serial: the suite asserts on sequential ticket IDs and on board ordering,
  // both of which are shared mutable state.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx cross-env NODE_OPTIONS=--no-deprecation next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      DATABASE_URI: E2E_DATABASE_URI,
      PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? 'e2e-secret-not-for-production',
      NEXT_PUBLIC_SERVER_URL: BASE_URL,
      // The default posture: the API is open. A dedicated spec flips this on
      // via the access unit tests rather than restarting the server.
      LOCAL_PM_REQUIRE_AUTH: 'false',
      MONGO_SERVER_SELECTION_TIMEOUT_MS: '30000',
    },
  },
})
