import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'

import { clearDiscoveryCacheForTests } from '@/lib/oidc/discovery'
import { clearJwkSetCacheForTests } from '@/lib/oidc/verify'
import {
  APP_ROLES,
  deriveActorTypeFromRoles,
  deriveRolesForTokenPayload,
  extractRawGroups,
  mapRawGroupsToRoles,
} from '@/lib/oidc/roles'
import { isAgentActive, upsertOidcUser, isConfiguredAgentClientId } from '@/lib/oidc/upsert'
import { verifyAccessToken } from '@/lib/oidc/verify'
import { resolveOidcActor } from '@/lib/oidc/actor'
import { generateCodeChallengeS256, generateCodeVerifier, generateNonce, generateState } from '@/lib/oidc/pkce'

/**
 * SPC-006 M2 unit matrix (API-contract pattern, t10/t13/t15 lineage): every
 * external boundary (IdP HTTP, Payload store) is stubbed — NO real IdP, no
 * MongoDB. jose crypto is REAL (HS256/RS256 sign → jwtVerify), which lets
 * the accept/reject matrix exercise genuine signature/claims validation.
 */

// ─── env harness ─────────────────────────────────────────────────────────────

const ENV_KEYS = [
  'OIDC_ENABLED',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_GROUPS_CLAIM',
  'OIDC_ROLE_MAP',
  'OIDC_SUPERADMIN_GROUP',
  'OIDC_AGENT_CLIENT_IDS',
  'OIDC_AGENT_CLIENT_ID_CLAIM',
  'OIDC_AUDIENCE',
  'OIDC_VERIFY_MODE',
  'OIDC_CLOCK_SKEW_SECONDS',
  'NEXT_PUBLIC_SERVER_URL',
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
})

function enableOidc(overrides: Record<string, string> = {}): void {
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
}

let jwksKeys: unknown[] = []
let discoveryCalls = 0

async function stubDiscoveryFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input)
  if (url.endsWith('/.well-known/openid-configuration')) {
    discoveryCalls++
    return Response.json(DISCOVERY)
  }
  if (url.endsWith('/jwks')) {
    return Response.json({ keys: jwksKeys })
  }
  throw new Error(`unexpected fetch in tests: ${url}`)
}

// ─── RS256 helpers (real crypto) ─────────────────────────────────────────────

const { generateKeyPair, exportJWK } = await import('jose')

let keyPair: Awaited<ReturnType<typeof generateKeyPair>> | null = null

async function ensureKeyPair(): Promise<Awaited<ReturnType<typeof generateKeyPair>>> {
  if (!keyPair) {
    keyPair = await generateKeyPair('RS256', { extractable: true })
    jwksKeys = [await exportJWK(keyPair.publicKey)]
  }
  return keyPair
}

async function signToken(
  claims: Record<string, unknown>,
  opts: { kid?: string } = {},
): Promise<string> {
  const kp = await ensureKeyPair()
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', ...(opts.kid ? { kid: opts.kid } : {}) })
    .setIssuedAt()
    .sign(kp.privateKey)
}

/** Load the discovery stub into global fetch and prewarm nothing. */
function useDiscoveryFetch(): void {
  globalThis.fetch = stubDiscoveryFetch as typeof fetch
}

// ─── §7 roles mapping (pure) ─────────────────────────────────────────────────

describe('SPC-006 §7: claims→roles mapping (pure functions)', () => {
  it('vocabulary is exactly superadmin|human|agent', () => {
    expect(APP_ROLES).toEqual(['superadmin', 'human', 'agent'])
  })

  it('extractRawGroups: string, array, space-separated, absent', () => {
    expect(extractRawGroups({ groups: 'admins' })).toEqual(['admins'])
    expect(extractRawGroups({ groups: ['admins', 'staff'] })).toEqual(['admins', 'staff'])
    expect(extractRawGroups({ groups: 'a b' })).toEqual(['a', 'b'])
    expect(extractRawGroups({})).toEqual([])
    expect(extractRawGroups({ roles: ['x'] }, 'roles')).toEqual(['x'])
  })

  it('mapRawGroupsToRoles: only explicit mappings grant superadmin', () => {
    process.env['OIDC_ROLE_MAP'] = JSON.stringify({ 'idp-admins': 'superadmin', 'idp-staff': 'human' })
    expect(mapRawGroupsToRoles(['idp-admins'])).toEqual(['superadmin'])
    expect(mapRawGroupsToRoles(['idp-admins', 'idp-staff']).sort()).toEqual(['human', 'superadmin'])
    expect(mapRawGroupsToRoles(['unmapped-group'])).toEqual([])
  })

  it('OIDC_SUPERADMIN_GROUP sugar maps the single value', () => {
    process.env['OIDC_SUPERADMIN_GROUP'] = 'wheel'
    expect(mapRawGroupsToRoles(['wheel'])).toEqual(['superadmin'])
    expect(mapRawGroupsToRoles(['other'])).toEqual([])
  })

  it('fail-safe: nothing mappable → ["human"], never superadmin by absence', () => {
    const { roles, rawGroups } = deriveRolesForTokenPayload({ groups: ['unknown'] })
    expect(roles).toEqual(['human'])
    expect(rawGroups).toEqual(['unknown'])
    expect(deriveRolesForTokenPayload({}).roles).toEqual(['human'])
  })

  it('bridge reconciliation: superadmin ∈ roles → superadmin actorType, else human', () => {
    expect(deriveActorTypeFromRoles(['superadmin'])).toBe('superadmin')
    expect(deriveActorTypeFromRoles(['human'])).toBe('human')
  })
})

// ─── §4 step 1: token verification accept/reject matrix ─────────────────────

describe('SPC-006 §4/§17: verification matrix (real jose crypto, stubbed JWKS HTTP)', () => {
  it('valid token → ok with sub/iss claims', async () => {
    enableOidc({ OIDC_AUDIENCE: 'local-pm-api' })
    useDiscoveryFetch()
    const token = await signToken({
      iss: DISCOVERY.issuer,
      aud: 'local-pm-api',
      sub: 'user-1',
      groups: ['idp-admins'],
    })
    const r = await verifyAccessToken(token)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.claims.sub).toBe('user-1')
      expect(r.claims.iss).toBe(DISCOVERY.issuer)
    }
  })

  it('tampered signature → fail-closed', async () => {
    enableOidc()
    useDiscoveryFetch()
    const token = await signToken({ iss: DISCOVERY.issuer, sub: 'u', exp: 9999999999 })
    const parts = token.split('.')
    const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ iss: DISCOVERY.issuer, sub: 'evil', exp: 9999999999 })).toString('base64url')}.${parts[2]}`
    expect((await verifyAccessToken(tampered)).ok).toBe(false)
  })

  it('issuer pointing elsewhere → fail-closed', async () => {
    enableOidc()
    useDiscoveryFetch()
    const token = await signToken({ iss: 'https://evil.test', sub: 'u', exp: 9999999999 })
    expect((await verifyAccessToken(token)).ok).toBe(false)
  })

  it('expired beyond skew → rejected; within skew → accepted (AC-10)', async () => {
    enableOidc({ OIDC_CLOCK_SKEW_SECONDS: '60' })
    useDiscoveryFetch()
    const now = Math.floor(Date.now() / 1000)
    const beyond = await signToken({ iss: DISCOVERY.issuer, sub: 'u', exp: now - 120 })
    expect((await verifyAccessToken(beyond)).ok).toBe(false)
    const within = await signToken({ iss: DISCOVERY.issuer, sub: 'u', exp: now - 30 })
    expect((await verifyAccessToken(within)).ok).toBe(true)
  })

  it('audience mismatch → rejected; match → accepted', async () => {
    enableOidc({ OIDC_AUDIENCE: 'local-pm-api' })
    useDiscoveryFetch()
    const wrong = await signToken({ iss: DISCOVERY.issuer, sub: 'u', exp: 9999999999, aud: 'other-api' })
    expect((await verifyAccessToken(wrong)).ok).toBe(false)
    const right = await signToken({ iss: DISCOVERY.issuer, sub: 'u', exp: 9999999999, aud: 'local-pm-api' })
    expect((await verifyAccessToken(right)).ok).toBe(true)
  })

  it('unknown kid forces a JWKS refetch (§17 rotation) and recovers', async () => {
    enableOidc()
    useDiscoveryFetch()
    // First verification primes the JWKS cache with the key WITHOUT kid.
    const kp = await ensureKeyPair()
    const t1 = await signToken({ iss: DISCOVERY.issuer, sub: 'u', exp: 9999999999 })
    expect((await verifyAccessToken(t1)).ok).toBe(true)
    // Now the token carries an unknown kid → jose refetches; the refetched
    // JWKS now includes the same key under that kid → verify succeeds.
    jwksKeys = [{ ...(await exportJWK(kp.publicKey)), kid: 'rotated' }]
    const t2 = await new SignJWT({ iss: DISCOVERY.issuer, sub: 'u', exp: 9999999999 })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'rotated' })
      .setIssuedAt()
      .sign(kp.privateKey)
    expect((await verifyAccessToken(t2)).ok).toBe(true)
    expect(discoveryCalls).toBeGreaterThanOrEqual(1)
  })
})

// ─── §6: agent vs human classification ──────────────────────────────────────

describe('SPC-006 §6: agent/human classification', () => {
  it('client-id claim in OIDC_AGENT_CLIENT_IDS → isAgent', async () => {
    enableOidc({ OIDC_AGENT_CLIENT_IDS: '["local-pm-agent-rover"]' })
    useDiscoveryFetch()
    const token = await signToken({ iss: DISCOVERY.issuer, sub: 'rover', exp: 9999999999, azp: 'local-pm-agent-rover' })
    const r = await verifyAccessToken(token)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.claims.isAgent).toBe(true)
  })

  it('OIDC_AGENT_CLIENT_ID_CLAIM=client_id overrides the azp precedence', async () => {
    enableOidc({ OIDC_AGENT_CLIENT_IDS: '["agent-x"]', OIDC_AGENT_CLIENT_ID_CLAIM: 'client_id' })
    useDiscoveryFetch()
    const token = await signToken({ iss: DISCOVERY.issuer, sub: 'agent-x', exp: 9999999999, client_id: 'agent-x' })
    const r = await verifyAccessToken(token)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.claims.isAgent).toBe(true)
  })

  it('a human token can never be promoted to agent by claim fiddling', async () => {
    enableOidc({ OIDC_AGENT_CLIENT_IDS: '["local-pm-agent-rover"]' })
    useDiscoveryFetch()
    // azp belongs to a NON-registered client → human path.
    const token = await signToken({ iss: DISCOVERY.issuer, sub: 'u', exp: 9999999999, azp: 'some-other-client' })
    const r = await verifyAccessToken(token)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.claims.isAgent).toBe(false)
  })
})

// ─── §8: upsert against a stubbed Payload store ──────────────────────────────

function stubPayloadStore(initialDocs: Array<Record<string, unknown>> = []) {
  const docs = [...initialDocs]
  const calls: Array<{ op: string; args: Record<string, unknown> }> = []
  return {
    calls,
    docs,
    find: async (args: Record<string, unknown>) => {
      calls.push({ op: 'find', args })
      // Identity-pair filter emulation: return the current docs; tests key
      // them by identityIss/identitySub.
      return { docs: docs.map((d) => ({ ...d })), totalDocs: docs.length }
    },
    create: async (args: Record<string, unknown>) => {
      calls.push({ op: 'create', args })
      const data = args['data'] as Record<string, unknown>
      if (docs.some((d) => d['identitySub'] === data['identitySub'] && d['identityIss'] === data['identityIss'])) {
        throw Object.assign(new Error('E11000 duplicate key error collection'), { name: 'MongoServerError' })
      }
      const doc = { ...data, id: `u${docs.length + 1}`, createdAt: 't', updatedAt: 't' }
      docs.push(doc)
      return doc
    },
    update: async (args: Record<string, unknown>) => {
      calls.push({ op: 'update', args })
      const id = args['id']
      const idx = docs.findIndex((d) => d['id'] === id)
      if (idx === -1) throw new Error(`not found: ${id}`)
      docs[idx] = { ...docs[idx], ...(args['data'] as Record<string, unknown>) }
      return docs[idx]
    },
  }
}

async function humanClaims(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'user-1',
    iss: DISCOVERY.issuer,
    payload: { iss: DISCOVERY.issuer, sub: 'user-1', groups: ['idp-admins'], ...overrides },
    clientIdClaim: null,
    isAgent: false,
  }
}

describe('SPC-006 §8: upsert by (iss, sub) pair', () => {
  it('first login creates the mirror doc with derived roles (OD-2 superadmin)', async () => {
    enableOidc({ OIDC_ROLE_MAP: '{"idp-admins":"superadmin"}' })
    const store = stubPayloadStore()
    const r = await upsertOidcUser(store as never, await humanClaims())
    expect(r.created).toBe(true)
    expect(r.doc['actorType']).toBe('superadmin')
    expect(r.doc['roles']).toEqual(['superadmin'])
    expect(r.doc['rawGroups']).toEqual(['idp-admins'])
    expect(r.doc['identityIss']).toBe(DISCOVERY.issuer)
    expect(r.doc['identitySub']).toBe('user-1')
  })

  it('second login UPDATES the same doc (roles re-derived; active untouched)', async () => {
    enableOidc({ OIDC_ROLE_MAP: '{"idp-admins":"superadmin"}' })
    const store = stubPayloadStore()
    await upsertOidcUser(store as never, await humanClaims())
    // Demoted at the IdP → roles shrink on next login, active untouched.
    const r2 = await upsertOidcUser(store as never, await humanClaims({ groups: ['staff'] }))
    expect(r2.created).toBe(false)
    expect(r2.doc['roles']).toEqual(['human'])
    expect(r2.doc['actorType']).toBe('human')
    const update = store.calls.find((c) => c.op === 'update')
    expect(update).toBeDefined()
    expect((update!.args['data'] as Record<string, unknown>)['active']).toBeUndefined()
  })

  it('duplicate-key race → guarded retry re-finds instead of throwing (§8/§17)', async () => {
    enableOidc({ OIDC_ROLE_MAP: '{"idp-admins":"superadmin"}' })
    const store = stubPayloadStore()
    // Simulate the raced doc existing only AFTER the initial find: create
    // throws duplicate, then the retry find returns the raced doc.
    const raced = {
      id: 'race-1',
      identityIss: DISCOVERY.issuer,
      identitySub: 'user-1',
      active: true,
    }
    const originalFind = store.find.bind(store)
    let firstFind = true
    store.find = async (args: Record<string, unknown>) => {
      if (firstFind) {
        firstFind = false
        return { docs: [], totalDocs: 0 }
      }
      return originalFind({ ...args, docsOverride: undefined }) as never
    }
    store.docs.push(raced)
    const r = await upsertOidcUser(store as never, await humanClaims())
    expect(r.created).toBe(false)
    expect(r.doc['id']).toBe('race-1')
  })

  it('agent upsert: synthetic email, name=client_id, roles=[agent]', async () => {
    enableOidc({ OIDC_AGENT_CLIENT_IDS: '["rover"]' })
    const store = stubPayloadStore()
    const r = await upsertOidcUser(store as never, {
      sub: 'rover',
      iss: DISCOVERY.issuer,
      payload: { iss: DISCOVERY.issuer, sub: 'rover', azp: 'rover' },
      clientIdClaim: 'rover',
      isAgent: true,
    })
    expect(r.created).toBe(true)
    expect(r.doc['email']).toBe('rover@clients.local')
    expect(r.doc['name']).toBe('rover')
    expect(r.doc['actorType']).toBe('agent')
    expect(r.doc['roles']).toEqual(['agent'])
  })

  it('kill-switch predicate: active:false → isAgentActive false (AC-11)', () => {
    expect(isAgentActive({ active: true })).toBe(true)
    expect(isAgentActive({ active: false })).toBe(false)
    expect(isAgentActive({})).toBe(true)
  })

  it('isConfiguredAgentClientId guards the null claim', () => {
    process.env['OIDC_AGENT_CLIENT_IDS'] = '["x"]'
    expect(isConfiguredAgentClientId('x')).toBe(true)
    expect(isConfiguredAgentClientId(null)).toBe(false)
  })
})

// ─── §4 D-1: strategy resolution (fail-closed + kill-switch) ────────────────

describe('SPC-006 §4: resolveOidcActor (strategy entry)', () => {
  it('flag off → null even with a valid token (optionality, AC-7 foundation)', async () => {
    enableOidc()
    process.env['OIDC_ENABLED'] = 'false'
    useDiscoveryFetch()
    const token = await signToken({ iss: DISCOVERY.issuer, sub: 'u', exp: 9999999999 })
    const store = stubPayloadStore()
    expect(await resolveOidcActor(store as never, token)).toBeNull()
    expect(store.calls).toHaveLength(0)
  })

  it('garbage token → null, store never touched (AC-1)', async () => {
    enableOidc()
    useDiscoveryFetch()
    const store = stubPayloadStore()
    expect(await resolveOidcActor(store as never, 'not-a-jwt')).toBeNull()
    expect(await resolveOidcActor(store as never, '')).toBeNull()
    expect(store.calls).toHaveLength(0)
  })

  it('valid agent token + active:false mirror doc → null (AC-11)', async () => {
    enableOidc({ OIDC_AGENT_CLIENT_IDS: '["rover"]' })
    useDiscoveryFetch()
    const store = stubPayloadStore([
      { id: 'a1', identityIss: DISCOVERY.issuer, identitySub: 'rover', active: false, actorType: 'agent' },
    ])
    const token = await signToken({ iss: DISCOVERY.issuer, sub: 'rover', exp: 9999999999, azp: 'rover' })
    expect(await resolveOidcActor(store as never, token)).toBeNull()
  })

  it('valid agent token + active mirror doc → agent user with _strategy/collection', async () => {
    enableOidc({ OIDC_AGENT_CLIENT_IDS: '["rover"]' })
    useDiscoveryFetch()
    const store = stubPayloadStore()
    const token = await signToken({ iss: DISCOVERY.issuer, sub: 'rover', exp: 9999999999, azp: 'rover' })
    const actor = await resolveOidcActor(store as never, token)
    expect(actor).not.toBeNull()
    expect(actor!['collection']).toBe('users')
    expect(actor!['_strategy']).toBe('oidc')
    expect(actor!['actorType']).toBe('agent')
  })

  it('human superadmin token → actorType superadmin, roles [superadmin] (AC-8 path)', async () => {
    enableOidc({ OIDC_ROLE_MAP: '{"idp-admins":"superadmin"}' })
    useDiscoveryFetch()
    const store = stubPayloadStore()
    const token = await signToken({ iss: DISCOVERY.issuer, sub: 'user-1', exp: 9999999999, groups: ['idp-admins'] })
    const actor = await resolveOidcActor(store as never, token)
    expect(actor).not.toBeNull()
    expect(actor!['actorType']).toBe('superadmin')
    expect(actor!['roles']).toEqual(['superadmin'])
  })

  it('X-LocalPM-Channel: mcp stamps lastChannel at login (§9, AC-5 support)', async () => {
    enableOidc({ OIDC_AGENT_CLIENT_IDS: '["rover"]' })
    useDiscoveryFetch()
    const store = stubPayloadStore()
    const token = await signToken({ iss: DISCOVERY.issuer, sub: 'rover', exp: 9999999999, azp: 'rover' })
    const actor = await resolveOidcActor(store as never, token, new Headers({ 'X-LocalPM-Channel': 'mcp' }))
    expect(actor!['lastChannel']).toBe('mcp')
  })
})

// ─── §6: introspection verify mode (RFC 7662 [R14], AC-10) ──────────────────

describe('SPC-006 §6: introspection mode', () => {
  function useIntrospectionFetch(activeBody: Record<string, unknown>) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/.well-known/openid-configuration')) {
        return Response.json({ ...DISCOVERY, introspection_endpoint: 'https://idp.local.test/introspect' })
      }
      if (url === 'https://idp.local.test/introspect') {
        // RFC 7662: the request must carry the token + client credentials.
        const params = new URLSearchParams(typeof init?.body === 'string' ? init.body : String(init?.body ?? ''))
        expect(params.get('token')).toBe('the-opaque-token')
        expect(params.get('client_id')).toBe('local-pm-web')
        expect(params.get('client_secret')).toBe('web-secret')
        return Response.json(activeBody)
      }
      throw new Error(`unexpected fetch: ${url}`)
    }) as typeof fetch
  }

  it('active:true token → accepted with introspection metadata as claims', async () => {
    enableOidc({ OIDC_VERIFY_MODE: 'introspection', OIDC_GROUPS_CLAIM: 'groups' })
    useIntrospectionFetch({ active: true, sub: 'user-9', iss: DISCOVERY.issuer, groups: ['idp-admins'] })
    const r = await verifyAccessToken('the-opaque-token')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.claims.sub).toBe('user-9')
      expect(r.claims.iss).toBe(DISCOVERY.issuer)
    }
  })

  it('active:false (revoked at the IdP) → rejected immediately (AC-10)', async () => {
    enableOidc({ OIDC_VERIFY_MODE: 'introspection' })
    useIntrospectionFetch({ active: false })
    expect((await verifyAccessToken('the-opaque-token')).ok).toBe(false)
  })

  it('introspection endpoint missing and no OIDC_INTROSPECTION_URL → fail-closed', async () => {
    enableOidc({ OIDC_VERIFY_MODE: 'introspection' })
    globalThis.fetch = (async () => Response.json(DISCOVERY)) as typeof fetch
    expect((await verifyAccessToken('the-opaque-token')).ok).toBe(false)
  })

  it('missing client credentials → fail-closed (nothing to introspect with)', async () => {
    enableOidc({ OIDC_VERIFY_MODE: 'introspection' })
    process.env['OIDC_CLIENT_SECRET'] = ''
    useIntrospectionFetch({ active: true })
    expect((await verifyAccessToken('the-opaque-token')).ok).toBe(false)
  })
})

// ─── §5: PKCE primitives ─────────────────────────────────────────────────────

describe('SPC-006 §5: PKCE (RFC 7636)', () => {
  it('verifier length/charset; challenge is BASE64URL(SHA256(verifier))', () => {
    const v = generateCodeVerifier()
    expect(v).toMatch(/^[A-Za-z0-9\-._~]{64}$/)
    expect(generateCodeChallengeS256(v)).toMatch(/^[A-Za-z0-9\-_]{43}$/)
    expect(generateCodeChallengeS256('a')).not.toBe(generateCodeChallengeS256('b'))
    expect(() => generateCodeVerifier(10)).toThrow()
  })

  it('state and nonce are unguessable per run', () => {
    expect(generateState()).not.toBe(generateState())
    expect(generateNonce()).not.toBe(generateNonce())
  })
})
