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
 * REQ-006 deny-by-default — the JWKS-mode audience contract (SPC-006 §13
 * amendment): `OIDC_AUDIENCE` is REQUIRED in jwks mode. Skipping the `aud`
 * check when unconfigured (the pre-REQ-006 `...(audience ? { audience } : {})`
 * spread) let any token signed by the right issuer key but minted for ANOTHER
 * audience pass verification — jose only validates `aud` when an audience
 * option is supplied. Config errors must be loud, not silent security skips:
 * this throws at first verification, before any network call, and the catch
 * below fail-closes (`{ ok: false }`, §4) after logging the actionable error.
 *
 * Introspection mode is NOT affected (RFC 7662: the AS itself decides `aud`
 * truth server-side, `active` gates acceptance).
 */
class MissingAudienceConfigError extends Error {}

function requireJwksAudience(): string {
  const audience = getAudience()
  if (!audience) {
    throw new MissingAudienceConfigError(
      'OIDC_AUDIENCE is required in jwks verify mode (REQ-006 deny-by-default): ' +
        'without it token `aud` claims are not validated and any audience is accepted. ' +
        'Set OIDC_AUDIENCE (for dex/static clients: the client_id, e.g. local-pm-web; ' +
        'for RFC 8707 resource-indicator IdPs: the resource/audience URI minted into the token). ' +
        'Alternatively set OIDC_VERIFY_MODE=introspection.',
    )
  }
  return audience
}

/**
 * Verify an access token in `jwks` mode: signature via issuer JWKS + claims
 * iss/aud/exp/nbf with clock-skew tolerance — `aud` is ALWAYS validated
 * (OIDC_AUDIENCE required, REQ-006). Any failure → `{ ok: false }`.
 */
async function verifyJwks(token: string): Promise<VerifyResult> {
  try {
    // Config validation FIRST (REQ-006): a missing audience must fail fast
    // without touching the network.
    const audience = requireJwksAudience()
    const discovery = await fetchDiscovery()
    const jwks = getJwkSet(discovery.jwks_uri)
    const options = {
      issuer: discovery.issuer,
      audience,
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
  } catch (err) {
    if (err instanceof MissingAudienceConfigError) {
      // A configuration error is not a bad token: surface the actionable
      // fix instead of blending in with per-request verification noise.
      console.error('[oidc] verify:', (err as Error).message)
    }
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
