import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'

import { clearDiscoveryCacheForTests } from '@/lib/oidc/discovery'
import { clearJwkSetCacheForTests, verifyAccessToken } from '@/lib/oidc/verify'

/**
 * REQ-006 (deny-by-default amendment to SPC-006 §6/§13) — audience
 * enforcement in jwks verify mode. Standalone file (o1 lineage) so the
 * REQ-006 cases never share in-file state with the M2 matrix.
 *
 * The pre-REQ-006 contract skipped `aud` validation when OIDC_AUDIENCE was
 * unset (`...(audience ? { audience } : {})`): a token from the right issuer
 * with the right key but minted for ANOTHER audience passed verification.
 * The amended contract: OIDC_AUDIENCE is REQUIRED in jwks mode — an unset
 * audience is a configuration ERROR that fail-fasts before any network I/O,
 * and `aud` is always validated. Introspection mode is unchanged (the AS
 * decides `aud` truth server-side, RFC 7662).
 */

// ─── env harness (o1 lineage) ────────────────────────────────────────────────

const ENV_KEYS = [
  'OIDC_ENABLED',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_AUDIENCE',
  'OIDC_VERIFY_MODE',
  'OIDC_AGENT_CLIENT_IDS',
  'OIDC_CLOCK_SKEW_SECONDS',
] as const

let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = {}
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  clearDiscoveryCacheForTests()
  clearJwkSetCacheForTests()
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  vi.restoreAllMocks()
})

function enableJwks(overrides: Record<string, string> = {}): void {
  process.env['OIDC_ENABLED'] = 'true'
  process.env['OIDC_ISSUER'] = 'https://idp.local.test'
  process.env['OIDC_CLIENT_ID'] = 'local-pm-web'
  process.env['OIDC_CLIENT_SECRET'] = 'web-secret'
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v
}

// ─── discovery stub (scripted fetch, never real network) ────────────────────

const DISCOVERY = {
  issuer: 'https://idp.local.test',
  authorization_endpoint: 'https://idp.local.test/authorize',
  token_endpoint: 'https://idp.local.test/token',
  jwks_uri: 'https://idp.local.test/jwks',
  // Present so the introspection-mode case reaches the (stubbed) endpoint
  // instead of failing on discovery shape.
  introspection_endpoint: 'https://idp.local.test/introspect',
}

let jwksKeys: unknown[] = []
let discoveryCalls = 0

function useFetchStub(extraRoutes: (url: string) => Response | null = () => null): void {
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    if (url.endsWith('/.well-known/openid-configuration')) {
      discoveryCalls++
      return Response.json(DISCOVERY)
    }
    if (url.endsWith('/jwks')) {
      return Response.json({ keys: jwksKeys })
    }
    const extra = extraRoutes(url)
    if (extra) return extra
    throw new Error(`unexpected fetch in tests: ${url}`)
  }) as typeof fetch
}

// ─── RS256 helpers (real crypto, o1 lineage) ─────────────────────────────────

const keyPair = await generateKeyPair('RS256', { extractable: true })
jwksKeys = [await exportJWK(keyPair.publicKey)]

async function signToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .sign(keyPair.privateKey)
}

// ─── REQ-006 matrix ──────────────────────────────────────────────────────────

describe('REQ-006: jwks mode requires OIDC_AUDIENCE (fail-fast, deny-by-default)', () => {
  it('unset audience → rejected BEFORE any network I/O, with an actionable config error logged', async () => {
    enableJwks() // no OIDC_AUDIENCE — jwks mode (default)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useFetchStub()
    const token = await signToken({ iss: DISCOVERY.issuer, sub: 'u', exp: 9999999999 })
    expect((await verifyAccessToken(token)).ok).toBe(false)
    // Fail-fast: the misconfiguration short-circuits before discovery.
    expect(discoveryCalls).toBe(0)
    // The error is a config error, not a per-token failure: it says how to fix.
    expect(errorSpy).toHaveBeenCalledTimes(1)
    // The call is console.error('[oidc] verify:', <message>) — assert the
    // full joined output carries the actionable config guidance.
    const logged = errorSpy.mock.calls[0].map(String).join(' ')
    expect(logged).toContain('OIDC_AUDIENCE is required in jwks verify mode')
  })

  it('audience configured + token aud mismatch → rejected', async () => {
    enableJwks({ OIDC_AUDIENCE: 'urn:local-pm:api' })
    useFetchStub()
    const wrong = await signToken({ iss: DISCOVERY.issuer, sub: 'u', exp: 9999999999, aud: 'other-api' })
    expect((await verifyAccessToken(wrong)).ok).toBe(false)
  })

  it('audience configured + token WITHOUT any aud claim → rejected', async () => {
    enableJwks({ OIDC_AUDIENCE: 'urn:local-pm:api' })
    useFetchStub()
    const noAud = await signToken({ iss: DISCOVERY.issuer, sub: 'u', exp: 9999999999 })
    expect((await verifyAccessToken(noAud)).ok).toBe(false)
  })

  it('audience configured + matching aud → accepted (single string)', async () => {
    enableJwks({ OIDC_AUDIENCE: 'urn:local-pm:api' })
    useFetchStub()
    const right = await signToken({ iss: DISCOVERY.issuer, sub: 'u', exp: 9999999999, aud: 'urn:local-pm:api' })
    const r = await verifyAccessToken(right)
    expect(r.ok).toBe(true)
  })

  it('multi-audience token: expected value among the aud array → accepted (RFC 8707 shape)', async () => {
    enableJwks({ OIDC_AUDIENCE: 'urn:local-pm:api' })
    useFetchStub()
    const multi = await signToken({
      iss: DISCOVERY.issuer,
      sub: 'u',
      exp: 9999999999,
      aud: ['other-api', 'urn:local-pm:api'],
    })
    expect((await verifyAccessToken(multi)).ok).toBe(true)
  })

  it('introspection mode: unset audience does NOT fail (RFC 7662 — the AS decides aud truth)', async () => {
    enableJwks({ OIDC_VERIFY_MODE: 'introspection' }) // no OIDC_AUDIENCE
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useFetchStub((url) => {
      if (url === 'https://idp.local.test/introspect') {
        return Response.json({ active: true, sub: 'user-introspect', iss: DISCOVERY.issuer })
      }
      return null
    })
    const r = await verifyAccessToken('the-opaque-token')
    expect(r.ok).toBe(true)
    expect(errorSpy).not.toHaveBeenCalled()
    if (r.ok) expect(r.claims.sub).toBe('user-introspect')
  })
})
