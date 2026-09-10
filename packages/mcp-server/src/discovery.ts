/**
 * SPC-006 §13 env readers + §5 discovery for the MCP server (agent side).
 *
 * Mirrors the web app's lib/oidc/env.ts contract but self-contained: the
 * MCP package has no dependency on apps/web. Values are read lazily at call
 * time so tests can set/restore process.env freely.
 *
 * The agent-side env set is deliberately narrow (§10): OIDC_ENABLED,
 * OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_SCOPE_MCP,
 * OIDC_DISCOVERY_TTL_SECONDS.
 */

/** OIDC provider metadata (only the fields the MCP client consumes). */
export interface OidcDiscovery {
  issuer: string
  token_endpoint: string
}

interface CacheEntry {
  fetchedAt: number
  discovery: OidcDiscovery
}

const cache = new Map<string, CacheEntry>()

export function clearMcpDiscoveryCacheForTests(): void {
  cache.clear()
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]
  return typeof v === 'string' ? v.trim() : ''
}

export function getMcpDiscoveryTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = readEnv(env, 'OIDC_DISCOVERY_TTL_SECONDS')
  if (!raw) return 3600
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 3600
}

/**
 * Fetch (or reuse) the issuer's provider metadata. Lazy + cached in-process
 * (§17: boot never depends on the IdP being up). Per-issuer binding check
 * (OIDC Core §3.1.2.3): the document's issuer must match the configured one.
 * `issuer` is a parameter (not read from env here) so callers can drive the
 * flow from an explicit config object; tests inject fetch.
 */
export async function fetchDiscovery(
  issuer: string,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<OidcDiscovery> {
  if (!issuer) throw new Error('OIDC_ISSUER is not configured')
  const ttlMs = getMcpDiscoveryTtlSeconds(env) * 1000
  const hit = cache.get(issuer)
  if (hit && Date.now() - hit.fetchedAt < ttlMs) return hit.discovery

  const wellKnown = `${issuer}/.well-known/openid-configuration`
  const res = await fetchImpl(wellKnown, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`OIDC discovery failed: HTTP ${res.status} for ${wellKnown}`)
  }
  const meta = (await res.json()) as Partial<OidcDiscovery>
  if (!meta.issuer || !meta.token_endpoint) {
    throw new Error(`OIDC discovery document missing required metadata (${wellKnown})`)
  }
  const normalized = meta.issuer.replace(/\/+$/, '')
  if (normalized !== issuer) {
    throw new Error(`OIDC discovery issuer mismatch: expected ${issuer}, got ${normalized}`)
  }
  const discovery: OidcDiscovery = { issuer, token_endpoint: meta.token_endpoint }
  cache.set(issuer, { fetchedAt: Date.now(), discovery })
  return discovery
}
