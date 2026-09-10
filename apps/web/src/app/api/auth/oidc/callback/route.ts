/**
 * SPC-006 §5 — GET /api/auth/oidc/callback
 *
 * Validate `state` against the cookie (CSRF) → token exchange (server-to-
 * server, application/x-www-form-urlencoded, grant_type=authorization_code
 * + code + redirect_uri + client_id/secret + code_verifier) [R5][R6] →
 * validate the ID token per §4 step 1 PLUS the `nonce` match and the
 * `azp`/`aud` checks of OIDC Core §3.1.3.7 [R8] → upsert the user by
 * (iss, sub) (§8) → derive roles (§7) → set the Payload session cookie
 * (§4 session shape) → delete the PKCE/state/nonce cookies → 302 /admin.
 *
 * The browser never sees an OIDC token [R5]: every token stays on the
 * server; the response carries only the standard Payload session cookie.
 * Exact redirect-URI matching is enforced at the issuer (pre-registered);
 * no wildcard, no open redirectors [R10].
 *
 * Fail-closed ordering: `state` is checked BEFORE any token exchange — a
 * mismatch → 400 and no network call to the token endpoint.
 *
 * Inert by default: OIDC_ENABLED=false (optionality principle) → 404.
 */

import { getPayload } from 'payload'
import config from '@payload-config'

import {
  OIDC_NONCE_COOKIE,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  expireShortCookie,
  readCookie,
} from '@/lib/oidc/cookies'
import { fetchDiscovery } from '@/lib/oidc/discovery'
import { getClientId, getClientSecret, getRedirectUri, isOidcEnabled } from '@/lib/oidc/env'
import { buildSessionCookie, createUserSession } from '@/lib/oidc/session'
import { upsertOidcUser } from '@/lib/oidc/upsert'
import { verifyAccessToken } from '@/lib/oidc/verify'

export const dynamic = 'force-dynamic'

function redirect(uri: string, extraHeaders: string[] = []): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store', Location: uri })
  for (const h of extraHeaders) headers.append('Set-Cookie', h)
  return new Response(null, { headers, status: 302 })
}

export async function GET(req: Request): Promise<Response> {
  if (!isOidcEnabled()) {
    return new Response('Not Found', { status: 404 })
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const idpError = url.searchParams.get('error')

  if (idpError) {
    return redirect(`/?error=${encodeURIComponent(idpError)}`)
  }
  if (!code || !state) {
    return new Response('Bad Request: missing code/state', { status: 400 })
  }

  // CSRF: state must match the stashed cookie exactly (§5; RFC 9700 [R10]).
  // Checked BEFORE any token exchange — a mismatch never reaches the IdP.
  const expectedState = readCookie(req, OIDC_STATE_COOKIE)
  if (!expectedState || state !== expectedState) {
    return new Response('Bad Request: state mismatch', { status: 400 })
  }

  const verifier = readCookie(req, OIDC_VERIFIER_COOKIE)
  const nonce = readCookie(req, OIDC_NONCE_COOKIE)
  if (!verifier || !nonce) {
    return new Response('Bad Request: expired login flow (missing PKCE/nonce cookies)', { status: 400 })
  }

  try {
    const discovery = await fetchDiscovery()
    const clientId = getClientId()
    const clientSecret = getClientSecret()
    if (!clientId || !clientSecret) {
      return new Response('OIDC is enabled but client credentials are not configured', { status: 503 })
    }

    // Server-to-server token exchange [R5][R6].
    const tokenRes = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: getRedirectUri(),
      }),
    })
    if (!tokenRes.ok) {
      console.error('[oidc] token exchange failed:', tokenRes.status)
      return new Response('OIDC token exchange failed', { status: 502 })
    }
    const tokens = (await tokenRes.json()) as { id_token?: string }
    if (typeof tokens.id_token !== 'string' || !tokens.id_token) {
      return new Response('OIDC token response missing id_token', { status: 502 })
    }

    // ID token validation — signature/iss/exp per §4 step 1...
    const verified = await verifyAccessToken(tokens.id_token)
    if (!verified.ok) {
      return new Response('Unauthorized: ID token validation failed', { status: 401 })
    }
    const claims = verified.claims

    // ...PLUS the ID-token-specific checks (§5, OIDC Core §3.1.3.7 [R8]):
    // nonce binding and aud/azp.
    const tokenNonce = claims.payload['nonce']
    if (typeof tokenNonce !== 'string' || tokenNonce !== nonce) {
      return new Response('Unauthorized: nonce mismatch', { status: 401 })
    }
    const aud = claims.payload['aud']
    const audiences = Array.isArray(aud)
      ? aud.filter((a): a is string => typeof a === 'string')
      : typeof aud === 'string'
        ? [aud]
        : []
    const azp = typeof claims.payload['azp'] === 'string' ? claims.payload['azp'] : null
    if (audiences.length > 1 && !azp) {
      // OIDC Core §3.1.3.7 item 3: multiple audiences ⇒ azp MUST be present.
      return new Response('Unauthorized: azp required for multiple audiences', { status: 401 })
    }
    if (azp && azp !== clientId) {
      // OIDC Core §3.1.3.7 item 8: azp, when present, must be this client.
      return new Response('Unauthorized: azp mismatch', { status: 401 })
    }

    // Identity = the validated (iss, sub) pair → upsert + roles (§7/§8).
    const payload = await getPayload({ config })
    const { doc } = await upsertOidcUser(payload, { ...claims, isAgent: false })
    if (doc['active'] === false) {
      return new Response('Unauthorized: account disabled', { status: 401 })
    }

    // Session hand-off (§4 session shape): Payload-format JWT + cookie.
    const sanitized = payload.collections['users']!.config
    const { token, sessions } = await createUserSession({
      email: typeof doc['email'] === 'string' ? (doc['email'] as string) : '',
      id: doc.id,
      secret: payload.secret,
      tokenExpiration: sanitized.auth.tokenExpiration,
      existingSessions: Array.isArray(doc['sessions']) ? (doc['sessions'] as never[]) : [],
    })
    await payload.update({
      collection: 'users',
      id: doc.id,
      data: { sessions } as never,
      depth: 0,
      overrideAccess: true,
    })

    const cookie = buildSessionCookie({
      auth: sanitized.auth,
      cookiePrefix: payload.config.cookiePrefix,
      token,
    })

    // Success: land on /admin, flow cookies consumed and deleted (§5).
    return redirect('/admin', [
      cookie,
      expireShortCookie(OIDC_STATE_COOKIE),
      expireShortCookie(OIDC_NONCE_COOKIE),
      expireShortCookie(OIDC_VERIFIER_COOKIE),
    ])
  } catch (err) {
    console.error('[oidc] callback failed:', err instanceof Error ? err.message : err)
    return redirect('/?error=oidc_callback_failed')
  }
}
