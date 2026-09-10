import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SPC-006 M4 contract tests for the Next route handlers (§5): fetch is
 * STUBBED for discovery/token endpoints — no IdP, no network (API-contract
 * pattern of t10/t13/t15). Handlers are imported dynamically so the env can
 * be arranged per test (module-level flag reads happen inside each request).
 */

const ENV_KEYS = [
  'OIDC_ENABLED',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
  'OIDC_SCOPE',
  'NEXT_PUBLIC_SERVER_URL',
  'PAYLOAD_SECRET',
  'OIDC_COOKIE_SECURE',
] as const

let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = {}
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  vi.resetModules()
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  vi.unstubAllGlobals()
})

function enableOidc(overrides: Record<string, string> = {}): void {
  process.env['OIDC_ENABLED'] = 'true'
  process.env['OIDC_ISSUER'] = 'https://idp.local.test'
  process.env['OIDC_CLIENT_ID'] = 'local-pm-web'
  process.env['OIDC_CLIENT_SECRET'] = 'web-secret'
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v
}

const DISCOVERY = {
  issuer: 'https://idp.local.test',
  authorization_endpoint: 'https://idp.local.test/authorize',
  token_endpoint: 'https://idp.local.test/token',
  jwks_uri: 'https://idp.local.test/jwks',
  end_session_endpoint: 'https://idp.local.test/end-session',
}

interface RecordedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

/** Scripted fetch: discovery always answers; extra responses shift in order. */
function stubFetch(...extra: Array<{ match: RegExp; status: number; body: unknown }>) {
  const calls: RecordedCall[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers: Record<string, string> = {}
    if (init?.headers) {
      for (const [k, v] of new Headers(init.headers).entries()) headers[k] = v
    }
    let body: string | null = null
    if (typeof init?.body === 'string') body = init.body
    else if (init?.body instanceof URLSearchParams) body = init.body.toString()
    calls.push({ url, method: (init?.method ?? 'GET').toUpperCase(), headers, body })
    if (url.endsWith('/.well-known/openid-configuration')) return Response.json(DISCOVERY)
    const hit = extra.find((e) => e.match.test(url))
    if (hit) return Response.json(hit.body, { status: hit.status })
    throw new Error(`unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

function getCookie(headers: Headers, name: string): string | null {
  const raw = headers.getSetCookie()
  for (const c of raw) {
    if (c.startsWith(`${name}=`)) return c
  }
  return null
}

// ─── /authorize ──────────────────────────────────────────────────────────────

describe('GET /api/auth/oidc/authorize (§5)', () => {
  it('flag off → 404 (optionality principle: endpoint does not exist)', async () => {
    process.env['OIDC_ENABLED'] = 'false'
    stubFetch()
    const { GET } = await import('@/app/api/auth/oidc/authorize/route')
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('302 to authorization_endpoint with code+S256+state+nonce and 10-min HttpOnly cookies', async () => {
    enableOidc()
    stubFetch()
    const { GET } = await import('@/app/api/auth/oidc/authorize/route')
    const res = await GET()
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(DISCOVERY.authorization_endpoint)
    expect(location.searchParams.get('response_type')).toBe('code')
    expect(location.searchParams.get('client_id')).toBe('local-pm-web')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9\-_]{43}$/)
    expect(location.searchParams.get('state')).toBeTruthy()
    expect(location.searchParams.get('nonce')).toBeTruthy()
    expect(location.searchParams.get('scope')).toContain('openid')

    for (const name of ['oidc_state', 'oidc_nonce', 'oidc_verifier']) {
      const cookie = getCookie(res.headers, name)
      expect(cookie).toBeTruthy()
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Max-Age=600')
    }
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('discovery down → 503 fail-closed (§17: IdP unavailable at boot)', async () => {
    enableOidc()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 })),
    )
    const { GET } = await import('@/app/api/auth/oidc/authorize/route')
    const res = await GET()
    expect(res.status).toBe(503)
  })
})

// ─── /callback (contract level: state gate, exchange shape, nonce) ──────────

function callbackRequest(query: string, cookies: Record<string, string>): Request {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
  return new Request(`https://app.local.test/api/auth/oidc/callback?${query}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  })
}

describe('GET /api/auth/oidc/callback (§5, contract level)', () => {
  it('flag off → 404', async () => {
    process.env['OIDC_ENABLED'] = 'false'
    stubFetch()
    const { GET } = await import('@/app/api/auth/oidc/callback/route')
    const res = await GET(callbackRequest('code=c&state=s', {}))
    expect(res.status).toBe(404)
  })

  it('state mismatch → 400 BEFORE any token exchange (CSRF, no IdP call)', async () => {
    enableOidc()
    const { calls } = stubFetch()
    const { GET } = await import('@/app/api/auth/oidc/callback/route')
    const res = await GET(callbackRequest('code=c&state=evil', { oidc_state: 'good' }))
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0) // nothing reached the IdP
  })

  it('missing verifier cookie → 400 (expired flow), no token exchange', async () => {
    enableOidc()
    const { calls } = stubFetch()
    const { GET } = await import('@/app/api/auth/oidc/callback/route')
    const res = await GET(callbackRequest('code=c&state=good', { oidc_state: 'good' }))
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('IdP error response → redirect away with the error surfaced', async () => {
    enableOidc()
    stubFetch()
    const { GET } = await import('@/app/api/auth/oidc/callback/route')
    const res = await GET(callbackRequest('error=access_denied', {}))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=access_denied')
  })

  it('token exchange is server-to-server urlencoded with code_verifier; nonce mismatch → 401', async () => {
    enableOidc()
    // id_token signed with a throwaway HS key whose JWKS won't validate
    // RS256 — put a VALID RS256 id_token instead by reusing the core helper.
    const { SignJWT, generateKeyPair, exportJWK } = await import('jose')
    const kp = await generateKeyPair('RS256', { extractable: true })
    const jwk = await exportJWK(kp.publicKey)
    const nonce = 'expected-nonce'
    const idToken = await new SignJWT({
      iss: DISCOVERY.issuer,
      sub: 'user-1',
      nonce,
      aud: 'local-pm-web',
      groups: [],
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime(9999999999)
      .sign(kp.privateKey)

    // JWKS serves the real key; discovery + token endpoint stubbed.
    const calls: RecordedCall[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const headers: Record<string, string> = {}
      if (init?.headers) for (const [k, v] of new Headers(init.headers).entries()) headers[k] = v
      let body: string | null = null
      if (typeof init?.body === 'string') body = init.body
      else if (init?.body instanceof URLSearchParams) body = init.body.toString()
      calls.push({ url, method: (init?.method ?? 'GET').toUpperCase(), headers, body })
      if (url.endsWith('/.well-known/openid-configuration')) return Response.json(DISCOVERY)
      if (url === DISCOVERY.token_endpoint) {
        return Response.json({ access_token: 'at', id_token: idToken, token_type: 'Bearer' })
      }
      if (url === DISCOVERY.jwks_uri) return Response.json({ keys: [jwk] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    // Make the STASHED nonce differ from the token's nonce → 401 after a
    // successful exchange (proves the ordering: exchange happened, ID token
    // rejected on nonce binding).
    const { GET } = await import('@/app/api/auth/oidc/callback/route')
    const res = await GET(
      callbackRequest('code=c&state=good', {
        oidc_state: 'good',
        oidc_verifier: 'v'.repeat(64),
        oidc_nonce: 'DIFFERENT',
      }),
    )
    expect(res.status).toBe(401)
    const exchange = calls.find((c) => c.url === DISCOVERY.token_endpoint)
    expect(exchange).toBeDefined()
    expect(exchange!.headers['content-type']).toBe('application/x-www-form-urlencoded')
    const params = new URLSearchParams(exchange!.body!)
    expect(params.get('grant_type')).toBe('authorization_code')
    expect(params.get('code')).toBe('c')
    expect(params.get('code_verifier')).toBe('v'.repeat(64))
    expect(params.get('client_id')).toBe('local-pm-web')
    expect(params.get('client_secret')).toBe('web-secret')
    // Default redirect URI = ${NEXT_PUBLIC_SERVER_URL}/api/auth/oidc/callback (§13).
    expect(params.get('redirect_uri')).toBe('http://localhost:3010/api/auth/oidc/callback')
  })
})

// ─── /logout ────────────────────────────────────────────────────────────────

describe('GET/POST /api/auth/oidc/logout (§5, AC-9)', () => {
  it('flag off → 404', async () => {
    process.env['OIDC_ENABLED'] = 'false'
    stubFetch()
    const mod = await import('@/app/api/auth/oidc/logout/route')
    expect((await mod.GET()).status).toBe(404)
    expect((await mod.POST()).status).toBe(404)
  })

  it('clears the session cookie and redirects to end_session_endpoint when exposed', async () => {
    enableOidc()
    stubFetch()
    const { GET } = await import('@/app/api/auth/oidc/logout/route')
    const res = await GET()
    // getPayload is unavailable in the unit environment → the handler falls
    // back to clearing the conventional cookie name; the contract under test
    // is: SOME Set-Cookie clears the session + 302 to the IdP end session.
    expect(res.status).toBe(302)
    const setCookies = res.headers.getSetCookie()
    expect(setCookies.length).toBeGreaterThan(0)
    expect(setCookies.some((c) => c.includes('Max-Age=0') || c.includes('Expires=Thu, 01 Jan 1970'))).toBe(true)
    expect(res.headers.get('location')!.startsWith(DISCOVERY.end_session_endpoint)).toBe(true)
    expect(res.headers.get('location')).toContain('post_logout_redirect_uri=')
  })

  it('IdP unreachable → local logout still succeeds, lands on /', async () => {
    enableOidc()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 })),
    )
    const { GET } = await import('@/app/api/auth/oidc/logout/route')
    const res = await GET()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
  })
})

// ─── §13: env defaults (exact spec contract) ────────────────────────────────

describe('SPC-006 §13: env readers', () => {
  it('defaults: scope, groups claim, verify mode, skew, ttl, cookie secure auto', async () => {
    const env = await import('@/lib/oidc/env')
    expect(env.getScope()).toBe('openid profile email')
    expect(env.getGroupsClaim()).toBe('groups')
    expect(env.getVerifyMode()).toBe('jwks')
    expect(env.getClockSkewSeconds()).toBe(60)
    expect(env.getDiscoveryTtlSeconds()).toBe(3600)
    expect(env.getJwksCacheSeconds()).toBe(600)
    expect(env.getCookieSecure()).toBe('auto')
    expect(env.isOidcEnabled()).toBe(false)
  })

  it('redirect URI defaults to ${NEXT_PUBLIC_SERVER_URL}/api/auth/oidc/callback', async () => {
    process.env['NEXT_PUBLIC_SERVER_URL'] = 'https://pm.lan'
    const env = await import('@/lib/oidc/env')
    expect(env.getRedirectUri()).toBe('https://pm.lan/api/auth/oidc/callback')
    expect(env.resolveCookieSecureFlag()).toBe(true) // https → Secure
  })

  it('OIDC_COOKIE_SECURE=auto drops Secure ONLY on loopback http (OD-5/RFC 8252)', async () => {
    const env = await import('@/lib/oidc/env')
    process.env['NEXT_PUBLIC_SERVER_URL'] = 'http://localhost:3010'
    expect(env.resolveCookieSecureFlag()).toBe(false)
    process.env['NEXT_PUBLIC_SERVER_URL'] = 'http://127.0.0.1:3010'
    expect(env.resolveCookieSecureFlag()).toBe(false)
    process.env['NEXT_PUBLIC_SERVER_URL'] = 'http://pm.lan'
    expect(env.resolveCookieSecureFlag()).toBe(true)
    process.env['OIDC_COOKIE_SECURE'] = 'true'
    expect(env.resolveCookieSecureFlag()).toBe(true)
  })

  it('malformed JSON env blobs fall back (fail-safe, §13)', async () => {
    process.env['OIDC_ROLE_MAP'] = '{not json'
    process.env['OIDC_AGENT_CLIENT_IDS'] = '[broken'
    const env = await import('@/lib/oidc/env')
    expect(env.getRoleMap()).toEqual({})
    expect(env.getAgentClientIds()).toEqual([])
  })
})

// ─── §4 session hand-off (Payload-format JWT + cookie) ──────────────────────

describe('SPC-006 §4: session hand-off helpers', () => {
  it('createUserSession mints {id, collection, email, sid} JWT + one fresh session row', async () => {
    const { createUserSession } = await import('@/lib/oidc/session')
    const { jwtVerify } = await import('jose')
    const { sessions, token } = await createUserSession({
      email: 'ops@local.test',
      id: 'u1',
      secret: 'test-secret',
      tokenExpiration: 7200,
      existingSessions: [{ id: 'old', createdAt: 't', expiresAt: '2000-01-01T00:00:00Z' }],
    })
    const { payload } = await jwtVerify(token, new TextEncoder().encode('test-secret'))
    expect(payload['id']).toBe('u1')
    expect(payload['collection']).toBe('users')
    expect(payload['email']).toBe('ops@local.test')
    expect(typeof payload['sid']).toBe('string')
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(payload['sid'])
    // The expired row was pruned.
    expect(sessions.some((s) => s.id === 'old')).toBe(false)
  })

  it('cookies: HttpOnly + Path=/ + SameSite; Secure per loopback rule (OD-5)', async () => {
    process.env['NEXT_PUBLIC_SERVER_URL'] = 'http://localhost:3010'
    const { buildSessionCookie, buildExpiredSessionCookie } = await import('@/lib/oidc/session')
    const auth = {
      tokenExpiration: 7200,
      cookies: { sameSite: 'Lax', secure: false },
      strategies: [],
      disableLocalStrategy: false,
    } as never
    const cookie = buildSessionCookie({ auth, cookiePrefix: 'local-pm', token: 'T' })
    expect(cookie).toContain('local-pm-token=T')
    expect(cookie).toContain('HttpOnly=true')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toContain('Secure=true')
    const expired = buildExpiredSessionCookie({ auth, cookiePrefix: 'local-pm' })
    expect(expired).toContain('local-pm-token=')
    expect(expired).toMatch(/Expires=/)
  })
})
