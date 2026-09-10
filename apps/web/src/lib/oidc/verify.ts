/**
 * SPC-006 §6 — verify mode: `jwks` (default, local RS256 verification via the
 * issuer JWKS) or `introspection` (RFC 7662, server-side truth per request).
 *
 * References (SPC-006 §19): [R7] npmjs.com/package/jose (jwtVerify,
 * createRemoteJWKSet); [R8] openid.net OIDC Core (iss/aud/exp/nbf claims);
 * [R14] rfc-editor.org/info/rfc7662 (introspection contract: POST token +
 * client credentials, `active` flag decides).
 */

import { createRemoteJWKSet, jwtVerify } from 'jose'

import { fetchDiscovery } from './discovery'
import {
  getAgentClientIdClaim,
  getAgentClientIds,
  getAudience,
  getClockSkewSeconds,
  getClientId,
  getClientSecret,
  getIntrospectionUrl,
  getVerifyMode,
} from './env'

export interface ActorClaims {
  /** Token `sub` — the stable subject id. */
  sub: string
  /** Token `iss` — exactly as emitted (persisted as identityIss, §8). */
  iss: string
  /** Decoded payload (validated) for role extraction. */
  payload: Record<string, unknown>
  /** Resolved client-id claim value (`azp`/`client_id`/`cid`), when present. */
  clientIdClaim: string | null
  /** True when the token resolves to an agent (client-id in the list, §6). */
  isAgent: boolean
  /** Best-effort channel stamp (§9): webui | rest | mcp, from the request. */
  channel?: 'webui' | 'rest' | 'mcp'
}

/** Fail-closed result type: any verification failure → `{ user: null }` (§4). */
export type VerifyResult = { ok: true; claims: ActorClaims } | { ok: false }

const jwkSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwkSet(jwksUri: string) {
  let set = jwkSets.get(jwksUri)
  if (!set) {
    // Proactive refetch window (OIDC_JWKS_CACHE_SECONDS, §13); jose also
    // refetches on unknown kid (coolDownPagesPerSecond/purgeSignature —
    // flagged [unverified] in the spec, safe default: jose handles kid miss).
    set = createRemoteJWKSet(new URL(jwksUri), {
      cooldownDuration: 0,
      cacheMaxAge: 60_000,
    })
    jwkSets.set(jwksUri, set)
  }
  return set
}

export function clearJwkSetCacheForTests(): void {
  jwkSets.clear()
}

function extractClientIdClaim(payload: Record<string, unknown>): string | null {
  // Precedence azp → client_id → cid [R8]; overridable via env (§6).
  const override = getAgentClientIdClaim()
  const candidates: Array<[string, unknown]> = []
  if (override === 'client_id') candidates.push(['client_id', payload['client_id']])
  else if (override === 'cid') candidates.push(['cid', payload['cid']])
  else candidates.push(['azp', payload['azp']])
  // Fallbacks always available (issuer naming varies — §6 [unverified]).
  if (override !== 'azp') candidates.push(['azp', payload['azp']])
  if (override !== 'client_id') candidates.push(['client_id', payload['client_id']])
  if (override !== 'cid') candidates.push(['cid', payload['cid']])
  for (const [, v] of candidates) {
    if (typeof v === 'string' && v) return v
  }
  return null
}

/**
 * Verify an access token in `jwks` mode: signature via issuer JWKS + claims
 * iss/aud/exp/nbf with clock-skew tolerance. Any failure → `{ ok: false }`.
 */
async function verifyJwks(token: string): Promise<VerifyResult> {
  try {
    const discovery = await fetchDiscovery()
    const jwks = getJwkSet(discovery.jwks_uri)
    const audience = getAudience()
    const options = {
      issuer: discovery.issuer,
      ...(audience ? { audience } : {}),
      clockTolerance: getClockSkewSeconds(),
    }
    const { payload } = await jwtVerify(token, jwks, options)
    const iss = typeof payload.iss === 'string' ? payload.iss : discovery.issuer
    const sub = typeof payload.sub === 'string' ? payload.sub : ''
    if (!sub) return { ok: false }
    const clientIdClaim = extractClientIdClaim(payload)
    const isAgent = clientIdClaim !== null && getAgentClientIds().includes(clientIdClaim)
    return {
      ok: true,
      claims: { sub, iss, payload: payload as Record<string, unknown>, clientIdClaim, isAgent },
    }
  } catch {
    // Fail-closed: bad signature, wrong iss/aud, expired beyond skew, ...
    return { ok: false }
  }
}

/**
 * Verify an access token in `introspection` mode (RFC 7662 [R14]): POST the
 * token to the introspection endpoint with this app's client credentials;
 * `active !== true` → rejected. Instant revocation, no clock skew.
 */
async function verifyIntrospection(token: string): Promise<VerifyResult> {
  try {
    const discovery = await fetchDiscovery()
    const endpoint = getIntrospectionUrl() || discovery.introspection_endpoint
    if (!endpoint) return { ok: false }
    const clientId = getClientId()
    const clientSecret = getClientSecret()
    if (!clientId || !clientSecret) return { ok: false }

    const body = new URLSearchParams({ token, client_id: clientId, client_secret: clientSecret })
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    })
    if (!res.ok) return { ok: false }
    const meta = (await res.json()) as Record<string, unknown>
    if (meta['active'] !== true) return { ok: false }
    const sub = typeof meta['sub'] === 'string' ? meta['sub'] : ''
    if (!sub) return { ok: false }
    const payload = meta as Record<string, unknown>
    const iss = typeof payload['iss'] === 'string' ? payload['iss'] : discovery.issuer
    const clientIdClaim = extractClientIdClaim(payload)
    const isAgent = clientIdClaim !== null && getAgentClientIds().includes(clientIdClaim)
    return { ok: true, claims: { sub, iss, payload, clientIdClaim, isAgent } }
  } catch {
    return { ok: false }
  }
}

/** Mode dispatch (§6 table): jwks (default) | introspection [R14]. */
export async function verifyAccessToken(token: string): Promise<VerifyResult> {
  const mode = getVerifyMode()
  return mode === 'introspection' ? verifyIntrospection(token) : verifyJwks(token)
}
