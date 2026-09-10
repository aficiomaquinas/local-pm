/**
 * SPC-006 §10 — MCP agent bearer token (client credentials, RFC 6749 §4.4).
 *
 * The MCP server authenticates AS ITSELF (its own client_credentials token)
 * — never as a relay of user tokens (the MCP token-passthrough anti-pattern
 * [R12]). One MCP server = one agent identity = clean attribution
 * (REQ-002.2).
 *
 * Lazy on first call: discovery → token endpoint grant_type=
 * client_credentials (+ scope when OIDC_SCOPE_MCP is set) → cache with a
 * 60 s safety margin (expires_in − 60); re-fetch when expired, and exactly
 * once after any 401 from the API (single retry, then surface the error).
 *
 * Fail loudly (AC-12): with OIDC_ENABLED=true and the agent credentials
 * unset, the first apiRequest throws a missing-config error — never
 * silently anonymous. With OIDC_ENABLED unset/false (default) this module
 * is inert and apiRequest stays credential-free: today's behavior, byte for
 * byte (optionality principle).
 */

import { fetchDiscovery } from './discovery.js'

export interface McpOidcConfig {
  enabled: boolean
  issuer: string
  clientId: string
  clientSecret: string
}

interface CachedToken {
  token: string
  expiresAt: number
}

let cached: CachedToken | null = null

/** Test hook: the cache is module state (process-wide singleton). */
export function clearMcpTokenCacheForTests(): void {
  cached = null
}

/** Read the agent's OIDC config from the MCP process env. */
export function readMcpOidcConfig(env: NodeJS.ProcessEnv = process.env): McpOidcConfig {
  return {
    enabled: (env['OIDC_ENABLED'] ?? '').trim().toLowerCase() === 'true',
    issuer: (env['OIDC_ISSUER'] ?? '').trim().replace(/\/+$/, ''),
    clientId: (env['OIDC_CLIENT_ID'] ?? '').trim(),
    clientSecret: (env['OIDC_CLIENT_SECRET'] ?? '').trim(),
  }
}

/**
 * Client-credentials grant against the discovery-provided token endpoint.
 * `fetchImpl` is injected (tests stub it — no live network).
 */
export async function fetchMcpToken(
  config: McpOidcConfig,
  fetchImpl: typeof fetch,
): Promise<{ token: string; expiresAt: number }> {
  const discovery = await fetchDiscovery(config.issuer, fetchImpl)
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'client_credentials',
  })
  const scope = (process.env['OIDC_SCOPE_MCP'] ?? '').trim()
  if (scope) body.set('scope', scope)

  const res = await fetchImpl(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`MCP OIDC token request failed: ${res.status} - ${text}`)
  }
  const json = (await res.json()) as { access_token?: unknown; expires_in?: unknown }
  if (typeof json.access_token !== 'string' || !json.access_token) {
    throw new Error('MCP OIDC token response missing access_token')
  }
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600
  // §10: 60 s safety margin — never present a token in its last minute.
  const expiresAt = Date.now() + Math.max(expiresIn - 60, 1) * 1000
  return { token: json.access_token, expiresAt }
}

/** Valid cached token, or a fresh one via the client_credentials grant. */
export async function getMcpBearerToken(
  config: McpOidcConfig,
  fetchImpl: typeof fetch,
): Promise<string> {
  if (!config.enabled) {
    // Optionality: the flag is off — apiRequest must stay credential-free.
    throw new Error('MCP OIDC is disabled (OIDC_ENABLED!=true): no bearer token')
  }
  if (!config.issuer || !config.clientId || !config.clientSecret) {
    // AC-12: fail LOUDLY on first tool call — missing agent config must not
    // degrade into silent anonymous requests.
    throw new Error(
      'MCP OIDC is enabled but incomplete: set OIDC_ISSUER, OIDC_CLIENT_ID and ' +
        'OIDC_CLIENT_SECRET in the MCP process env (SPC-006 §10 / AC-12)',
    )
  }
  if (cached && Date.now() < cached.expiresAt) return cached.token
  const { token, expiresAt } = await fetchMcpToken(config, fetchImpl)
  cached = { token, expiresAt }
  return token
}

/** Drop the cached token (after a 401 so the single retry fetches fresh). */
export function invalidateMcpToken(): void {
  cached = null
}
