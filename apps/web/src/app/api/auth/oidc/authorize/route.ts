/**
 * SPC-006 §5 — GET /api/auth/oidc/authorize
 *
 * Discovery (lazy, cached) → generate code_verifier + S256 code_challenge +
 * state + nonce → stash all three in short-lived HTTP-only cookies (10 min)
 * → 302 to the authorization_endpoint with response_type=code, client_id,
 * redirect_uri, scope, state, nonce, code_challenge_method=S256.
 * PKCE with S256 is mandatory even for this confidential client — OAuth 2.1
 * makes it required for the code flow and it costs nothing server-side
 * [R5][R10]. Fail-closed: any discovery/config failure → 503 (§17).
 *
 * Inert by default: OIDC_ENABLED=false (optionality principle) → 404.
 */


import {
  OIDC_NONCE_COOKIE,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  serializeShortCookie,
} from '@/lib/oidc/cookies'
import { fetchDiscovery } from '@/lib/oidc/discovery'
import { getClientId, getRedirectUri, getScope, isOidcEnabled } from '@/lib/oidc/env'
import { generateCodeChallengeS256, generateCodeVerifier, generateNonce, generateState } from '@/lib/oidc/pkce'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  // Optionality principle: no flag → this endpoint does not exist.
  if (!isOidcEnabled()) {
    return new Response('Not Found', { status: 404 })
  }
  try {
    const clientId = getClientId()
    if (!clientId) {
      return new Response('OIDC is enabled but OIDC_CLIENT_ID is not configured', { status: 503 })
    }

    const discovery = await fetchDiscovery()

    const verifier = generateCodeVerifier()
    const challenge = generateCodeChallengeS256(verifier)
    const state = generateState()
    const nonce = generateNonce()

    const params = new URLSearchParams({
      client_id: clientId,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      nonce,
      redirect_uri: getRedirectUri(),
      response_type: 'code',
      scope: getScope(),
      state,
    })

    const headers = new Headers({
      // No caching of an authorization redirect (RFC 9700 hygiene [R10]).
      'Cache-Control': 'no-store',
      Location: `${discovery.authorization_endpoint}?${params.toString()}`,
    })
    headers.append('Set-Cookie', serializeShortCookie({ name: OIDC_STATE_COOKIE, value: state }))
    headers.append('Set-Cookie', serializeShortCookie({ name: OIDC_NONCE_COOKIE, value: nonce }))
    headers.append('Set-Cookie', serializeShortCookie({ name: OIDC_VERIFIER_COOKIE, value: verifier }))

    return new Response(null, { headers, status: 302 })
  } catch (err) {
    // Fail-closed (§17): IdP down / bad config → 503, app keeps serving.
    console.error('[oidc] authorize failed:', err instanceof Error ? err.message : err)
    return new Response('OIDC authorization is unavailable', { status: 503 })
  }
}
