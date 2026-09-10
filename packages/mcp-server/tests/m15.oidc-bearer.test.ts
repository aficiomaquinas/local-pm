import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
// M13/M14 harness FIRST (registers the SDK class captures on import), then
// everything else.
import { getMcpHarness, type McpHarness } from './helpers/captureServer.js'
import { makeListEnvelope } from './helpers/payloadFixtures.js'
// Module caches (token + discovery) are process-wide; reset them per case.
import { clearMcpTokenCacheForTests } from '../src/auth.js'
import { clearMcpDiscoveryCacheForTests } from '../src/discovery.js'

/**
 * SPC-006 §10 / M5: MCP bearer authentication contract tests. fetch is
 * stubbed for discovery + token endpoint + API — no IdP, no network.
 * The module reads OIDC_* env lazily at each apiRequest, so tests arrange
 * process.env per case. AC-12, token cache margin, single 401 retry and
 * the X-LocalPM-Channel stamp are the assertions.
 */

const ISSUER = 'https://idp.local.test'
const DISCOVERY = {
  issuer: ISSUER,
  token_endpoint: `${ISSUER}/token`,
}

interface ApiCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  status: number
  responseBody: unknown
}

let harness: McpHarness
let apiCalls: ApiCall[]
let grantBodies: Array<string | null>
let tokenCalls: number
let tokenResponseBody: Record<string, unknown>
let apiStatus: number

function recordFetch(url: string, init?: RequestInit): Response {
  const headers: Record<string, string> = {}
  if (init?.headers) for (const [k, v] of new Headers(init.headers).entries()) headers[k] = v
  const body = bodyOf(init)
  const isToken = url === DISCOVERY.token_endpoint
  const isDiscovery = url.endsWith('/.well-known/openid-configuration')
  if (isDiscovery) return Response.json(DISCOVERY)
  if (isToken) {
    tokenCalls++
    grantBodies.push(body)
    return Response.json(tokenResponseBody)
  }
  const call: ApiCall = { url, method: (init?.method ?? 'GET').toUpperCase(), headers, body, status: apiStatus, responseBody: makeListEnvelope([]) }
  apiCalls.push(call)
  return Response.json(call.responseBody, { status: apiStatus })
}

function enableAgent(env: Partial<Record<string, string>> = {}): void {
  process.env['OIDC_ENABLED'] = 'true'
  process.env['OIDC_ISSUER'] = ISSUER
  process.env['OIDC_CLIENT_ID'] = 'rover'
  process.env['OIDC_CLIENT_SECRET'] = 'rover-secret'
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

function disableAgent(): void {
  delete process.env['OIDC_ENABLED']
  delete process.env['OIDC_ISSUER']
  delete process.env['OIDC_CLIENT_ID']
  delete process.env['OIDC_CLIENT_SECRET']
  delete process.env['OIDC_SCOPE_MCP']
}

beforeAll(async () => {
  disableAgent()
  harness = await getMcpHarness()
})

beforeEach(() => {
  apiCalls = []
  grantBodies = []
  tokenCalls = 0
  apiStatus = 200
  tokenResponseBody = { access_token: 'token-1', expires_in: 3600 }
  clearMcpTokenCacheForTests()
  clearMcpDiscoveryCacheForTests()
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => recordFetch(String(input), init)))
})

/** Record a fetch body regardless of its runtime type (string|URLSearchParams). */
function bodyOf(init?: RequestInit): string | null {
  if (typeof init?.body === 'string') return init.body
  if (init?.body instanceof URLSearchParams) return init.body.toString()
  return null
}

afterEach(() => {
  disableAgent()
  vi.unstubAllGlobals()
})

/** The recorded Authorization headers of API calls (as sent). */
function authHeaders(): Array<string | undefined> {
  return apiCalls.map((c) => c.headers['authorization'])
}

describe('SPC-006 §10: MCP bearer auth', () => {
  it('OIDC_ENABLED unset/false (default) → requests stay credential-free (optionality)', async () => {
    disableAgent()
    const result = await harness.callTool('list_projects', {})
    expect(result.isError).toBeFalsy()
    expect(apiCalls.length).toBeGreaterThan(0)
    expect(tokenCalls).toBe(0)
    expect(authHeaders().every((h) => h === undefined)).toBe(true)
  })

  it('flag on + credentials → Bearer token on every request + X-LocalPM-Channel: mcp', async () => {
    enableAgent()
    const result = await harness.callTool('list_projects', {})
    expect(result.isError).toBeFalsy()
    expect(tokenCalls).toBe(1)
    expect(apiCalls.length).toBeGreaterThan(0)
    expect(authHeaders().every((h) => h === 'Bearer token-1')).toBe(true)
    expect(apiCalls.every((c) => c.headers['x-localpm-channel'] === 'mcp')).toBe(true)
  })

  it('AC-12: flag on, credentials missing → fails LOUDLY (isError), never silent-anonymous', async () => {
    enableAgent({ OIDC_CLIENT_ID: undefined, OIDC_CLIENT_SECRET: undefined, OIDC_ISSUER: undefined })
    const result = await harness.callTool('list_projects', {})
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('OIDC')
    expect(apiCalls).toHaveLength(0) // nothing left the process anonymously
  })

  it('token cached across calls (single client_credentials grant)', async () => {
    enableAgent()
    await harness.callTool('list_projects', {})
    await harness.callTool('list_projects', {})
    await harness.callTool('list_projects', {})
    expect(tokenCalls).toBe(1)
    expect(apiCalls.length).toBe(3)
  })

  it('60s margin: a token inside its last minute is refreshed, not used', async () => {
    enableAgent()
    // expires_in=30 is below the 60 s margin → `Math.max(expires_in - 60, 1)`
    // caps the cache lifetime at ~1 s: the token is minted but never reused
    // once that window lapses (§10 — never present a token in its last minute).
    tokenResponseBody = { access_token: 'token-1', expires_in: 30 }
    await harness.callTool('list_projects', {})
    expect(tokenCalls).toBe(1)
    await new Promise((r) => setTimeout(r, 1100))
    await harness.callTool('list_projects', {})
    expect(tokenCalls).toBe(2)
  })

  it('401 → invalidate + exactly ONE retry with a fresh token, then success', async () => {
    enableAgent()
    let listCalls = 0
    const original = recordFetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/projects')) {
          listCalls++
          if (listCalls === 1) {
            // First attempt: expired/revoked token at the API.
            return Response.json({ message: 'Unauthorized' }, { status: 401 })
          }
          return Response.json(makeListEnvelope([]))
        }
        return original(url, init)
      }),
    )
    const result = await harness.callTool('list_projects', {})
    expect(result.isError).toBeFalsy()
    expect(listCalls).toBe(2)
    // Two grants total: initial + post-401 refetch.
    expect(tokenCalls).toBe(2)
  })

  it('401 twice → single retry, then the error surfaces (no infinite loop)', async () => {
    enableAgent()
    let listCalls = 0
    const original = recordFetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/projects')) {
          listCalls++
          return Response.json({ message: 'Unauthorized' }, { status: 401 })
        }
        return original(url, init)
      }),
    )
    const result = await harness.callTool('list_projects', {})
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('401')
    expect(listCalls).toBe(2)
    expect(tokenCalls).toBe(2)
  })

  it('OIDC_SCOPE_MCP is forwarded on the grant when set (§13)', async () => {
    enableAgent({ OIDC_SCOPE_MCP: 'tickets:write' })
    await harness.callTool('list_projects', {})
    expect(grantBodies[0]).toContain('scope=tickets%3Awrite')
  })

  it('grant shape: client_credentials + the agent client credentials (§6/§10)', async () => {
    enableAgent()
    await harness.callTool('list_projects', {})
    const params = new URLSearchParams(grantBodies[0] ?? '')
    expect(params.get('grant_type')).toBe('client_credentials')
    expect(params.get('client_id')).toBe('rover')
    expect(params.get('client_secret')).toBe('rover-secret')
  })
})
