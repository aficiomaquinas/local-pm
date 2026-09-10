/**
 * SPC-006 §5 — OIDC discovery, lazy + in-process cached (§17 risk mitigation).
 *
 * Boot never depends on the IdP being up: the first OIDC request triggers the
 * fetch of `{OIDC_ISSUER}/.well-known/openid-configuration`, cached for
 * `OIDC_DISCOVERY_TTL_SECONDS` (default 3600). `clearDiscoveryCacheForTests`
 * exists because this module is a process-wide singleton.
 *
 * References (SPC-006 §19): [R5] startwithidentity.com OIDC+Next.js recipe
 * (discovery caching); [R6] blog.antosubash.com openid-client 6 (discovery,
 * end_session_endpoint).
 */

import { getDiscoveryTtlSeconds, getIssuer } from './env'

/** OIDC Provider Metadata (only the fields this wiring consumes). */
export interface OidcDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  userinfo_endpoint?: string
  introspection_endpoint?: string
  end_session_endpoint?: string
}

interface CacheEntry {
  fetchedAt: number
  discovery: OidcDiscovery
}

const cache = new Map<string, CacheEntry>()

export function clearDiscoveryCacheForTests(): void {
  cache.clear()
}

/**
 * Fetch (or reuse) the issuer's provider metadata. Throws on failure —
 * callers translate into fail-closed responses (503 on auth surfaces, §17).
 */
export async function fetchDiscovery(issuerOverride?: string): Promise<OidcDiscovery> {
  const issuer = issuerOverride ?? getIssuer()
  if (!issuer) throw new Error('OIDC_ISSUER is not configured')

  const ttlMs = getDiscoveryTtlSeconds() * 1000
  const hit = cache.get(issuer)
  if (hit && Date.now() - hit.fetchedAt < ttlMs) return hit.discovery

  const wellKnown = `${issuer}/.well-known/openid-configuration`
  const res = await fetch(wellKnown, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`OIDC discovery failed: HTTP ${res.status} for ${wellKnown}`)
  }
  const meta = (await res.json()) as Partial<OidcDiscovery>
  if (!meta.issuer || !meta.authorization_endpoint || !meta.token_endpoint || !meta.jwks_uri) {
    throw new Error(`OIDC discovery document missing required metadata (${wellKnown})`)
  }
  // Per-issuer binding check (OIDC Core §3.1.2.3 — issuer must match [R8]).
  const normalized = meta.issuer.replace(/\/+$/, '')
  if (normalized !== issuer) {
    throw new Error(`OIDC discovery issuer mismatch: expected ${issuer}, got ${normalized}`)
  }
  const discovery: OidcDiscovery = {
    issuer,
    authorization_endpoint: meta.authorization_endpoint,
    token_endpoint: meta.token_endpoint,
    jwks_uri: meta.jwks_uri,
    userinfo_endpoint: meta.userinfo_endpoint,
    introspection_endpoint: meta.introspection_endpoint,
    end_session_endpoint: meta.end_session_endpoint,
  }
  cache.set(issuer, { fetchedAt: Date.now(), discovery })
  return discovery
}
