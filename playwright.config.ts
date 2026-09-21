import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()
const PORT = Number(process.env.E2E_PORT ?? 3020)
const BASE_URL = `http://127.0.0.1:${PORT}`
function withDatabase(uri: string, dbName: string): string {
  const [base, query] = uri.split('?')
  const trimmed = base.replace(/\/[^/]*$/, '')
  return `${trimmed}/${dbName}${query ? `?${query}` : ''}`
}

const SOURCE_URI = process.env.DATABASE_URI ?? 'mongodb://localhost:27018/local-pm'
const E2E_DATABASE_URI =
  process.env.E2E_DATABASE_URI ?? withDatabase(SOURCE_URI, 'local-pm-e2e-' + PORT)

if (E2E_DATABASE_URI === SOURCE_URI) {
  throw new Error(
    'Refusing to run E2E against the same database as DATABASE_URI. Set E2E_DATABASE_URI explicitly.',
  )
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  outputDir: 'test-results-' + PORT,
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
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NEXT_DIST_DIR: '.next-e2e-' + PORT,
      DATABASE_URI: E2E_DATABASE_URI,
      PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? 'e2e-secret-not-for-production',
      NEXT_PUBLIC_SERVER_URL: BASE_URL,
      LOCAL_PM_REQUIRE_AUTH: 'false',
      MONGO_SERVER_SELECTION_TIMEOUT_MS: '30000',
    },
  },
})
