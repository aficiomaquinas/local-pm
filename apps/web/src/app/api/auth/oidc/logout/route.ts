/**
 * SPC-006 §5 — GET/POST /api/auth/oidc/logout
 *
 * Clear the Payload session cookie server-side (HTTP-only cookies are
 * untouchable from JS [R4]) → if discovery exposes end_session_endpoint,
 * redirect there with post_logout_redirect_uri and id_token_hint [R6];
 * otherwise land on `/`.
 *
 * The app holds no IdP tokens server-side (§11), so `id_token_hint` is not
 * available — only `post_logout_redirect_uri` is sent. Best effort: if the
 * IdP is unreachable, the local logout still succeeds (fail-open on the
 * redirect target only, never on the cookie clearing).
 *
 * Inert by default: OIDC_ENABLED=false (optionality principle) → 404.
 */

import { getPayload } from 'payload'
import config from '@payload-config'

import { buildExpiredSessionCookie } from '@/lib/oidc/session'
import { fetchDiscovery } from '@/lib/oidc/discovery'
import { getRedirectUri, isOidcEnabled } from '@/lib/oidc/env'

export const dynamic = 'force-dynamic'

async function logoutResponse(): Promise<Response> {
  const headers = new Headers({ 'Cache-Control': 'no-store' })
  try {
    const payload = await getPayload({ config })
    const sanitized = payload.collections['users'].config
    headers.append(
      'Set-Cookie',
      buildExpiredSessionCookie({ auth: sanitized.auth, cookiePrefix: payload.config.cookiePrefix }),
    )
  } catch {
    // No Payload instance (e.g. static build): still try to clear the
    // conventional cookie name so the browser ends up logged out.
    headers.append('Set-Cookie', 'local-pm-token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
  }

  try {
    const discovery = await fetchDiscovery()
    if (discovery.end_session_endpoint) {
      const params = new URLSearchParams({ post_logout_redirect_uri: getRedirectUri() })
      headers.set('Location', `${discovery.end_session_endpoint}?${params.toString()}`)
      return new Response(null, { headers, status: 302 })
    }
  } catch {
    // IdP unreachable → local logout already done; land on `/`.
  }
  headers.set('Location', '/')
  return new Response(null, { headers, status: 302 })
}

export async function GET(): Promise<Response> {
  if (!isOidcEnabled()) return new Response('Not Found', { status: 404 })
  return logoutResponse()
}

export async function POST(): Promise<Response> {
  if (!isOidcEnabled()) return new Response('Not Found', { status: 404 })
  return logoutResponse()
}
