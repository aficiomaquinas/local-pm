/**
 * SPC-006 §13 — OIDC configuration reader (ADR-002 D1).
 *
 * Single source of truth for every `OIDC_*` env var. All values are read
 * lazily at call time (not at module import) so tests can set/restore env
 * freely and so a restart picks up changes (strategies do not hot-reload,
 * [R1]). Every accessor returns a defaulted value — this module never throws.
 *
 * References (SPC-006 §19): [R1] payloadcms.com/docs/authentication/custom-strategies
 * (no hot reload); [R5] startwithidentity.com OIDC+Next.js recipe (discovery
 * caching, PKCE); [R7] npmjs.com/package/jose (JWKS).
 */

const PREFIX = 'OIDC_'

function read(name: string): string {
  const v = process.env[`${PREFIX}${name}`]
  return typeof v === 'string' ? v.trim() : ''
}

function readInt(name: string, fallback: number): number {
  const raw = read(name)
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function readJson<T>(name: string, fallback: T): T {
  const raw = read(name)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    // Fail-safe: a malformed JSON blob must not take the app down (§13).
    return fallback
  }
}

/** Feature flag. `false` (default) = today's behavior, byte for byte. */
export function isOidcEnabled(): boolean {
  return read('ENABLED').toLowerCase() === 'true'
}

export function getIssuer(): string {
  return read('ISSUER').replace(/\/+$/, '')
}

export function getClientId(): string {
  return read('CLIENT_ID')
}

export function getClientSecret(): string {
  return read('CLIENT_SECRET')
}

/** Default: `${NEXT_PUBLIC_SERVER_URL}/api/auth/oidc/callback` (§13). */
export function getRedirectUri(): string {
  const explicit = read('REDIRECT_URI')
  if (explicit) return explicit
  const base = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3010'
  return `${base.replace(/\/+$/, '')}/api/auth/oidc/callback`
}

export function getScope(): string {
  return read('SCOPE') || 'openid profile email'
}

export function getGroupsClaim(): string {
  return read('GROUPS_CLAIM') || 'groups'
}

export type AppRole = 'superadmin' | 'human' | 'agent'

/** `OIDC_ROLE_MAP` — JSON: claim value → AppRole (§7). */
export function getRoleMap(): Record<string, AppRole> {
  return readJson<Record<string, AppRole>>('ROLE_MAP', {})
}

/** Single-value sugar: this claim value alone maps to `superadmin` (§7). */
export function getSuperadminGroup(): string {
  return read('SUPERADMIN_GROUP')
}

/** JSON array of client_ids recognized as agents (§6). */
export function getAgentClientIds(): string[] {
  const v = readJson<string[] | Record<string, unknown>>('AGENT_CLIENT_IDS', [])
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  // Tolerate object forms { "client-id": true } without failing.
  return Object.entries(v)
    .filter(([, enabled]) => enabled === true || enabled === 'true')
    .map(([k]) => k)
}

export type AgentClientIdClaim = 'azp' | 'client_id' | 'cid'

/** Precedence override for the agent client-id claim (§6). Default `azp` [R8]. */
export function getAgentClientIdClaim(): AgentClientIdClaim {
  const v = read('AGENT_CLIENT_ID_CLAIM')
  if (v === 'client_id' || v === 'cid') return v
  return 'azp'
}

/** Expected `aud` for agent tokens (jwks mode); empty = skip aud check (§13). */
export function getAudience(): string {
  return read('AUDIENCE')
}

export type VerifyMode = 'jwks' | 'introspection'

/** `jwks` (default) | `introspection` (RFC 7662 [R14]). */
export function getVerifyMode(): VerifyMode {
  return read('VERIFY_MODE') === 'introspection' ? 'introspection' : 'jwks'
}

/** Discovery-provided when verify mode is introspection; override here (§6). */
export function getIntrospectionUrl(): string {
  return read('INTROSPECTION_URL')
}

export function getClockSkewSeconds(): number {
  return readInt('CLOCK_SKEW_SECONDS', 60)
}

export function getDiscoveryTtlSeconds(): number {
  return readInt('DISCOVERY_TTL_SECONDS', 3600)
}

export function getJwksCacheSeconds(): number {
  return readInt('JWKS_CACHE_SECONDS', 600)
}

export type CookieSecure = 'auto' | 'true' | 'false'

/**
 * `auto` (default) = `Secure` unless `NEXT_PUBLIC_SERVER_URL` is loopback http
 * (RFC 8252 §7.3 legitimizes http loopback redirects [R15]; ADR-001 perimeter).
 */
export function getCookieSecure(): CookieSecure {
  const v = read('COOKIE_SECURE')
  if (v === 'true' || v === 'false') return v
  return 'auto'
}

/**
 * Resolved `secure` flag for auth cookies per OD-5: insecure only on loopback
 * http (localhost / 127.0.0.1), forced `true` everywhere else.
 */
export function resolveCookieSecureFlag(): boolean {
  const mode = getCookieSecure()
  if (mode === 'true') return true
  if (mode === 'false') return false
  const base = process.env.NEXT_PUBLIC_SERVER_URL || ''
  const m = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.exec(base)
  return !m
}

/** Optional scope for the MCP agent's client_credentials grant (§10). */
export function getScopeMcp(): string {
  return read('SCOPE_MCP')
}
