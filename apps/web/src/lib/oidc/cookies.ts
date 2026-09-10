/**
 * SPC-006 §5 — short-lived HTTP-only cookies for the human OIDC flow:
 * `oidc_state` (CSRF), `oidc_nonce`, `oidc_verifier` (PKCE). All three are
 * stashed by /authorize with a 10-minute expiry and are deleted by the
 * callback as soon as they are consumed. `Secure` follows
 * OIDC_COOKIE_SECURE=auto (§13) — dropped only on loopback http [R15].
 */

import { resolveCookieSecureFlag } from './env'

export const OIDC_STATE_COOKIE = 'oidc_state'
export const OIDC_NONCE_COOKIE = 'oidc_nonce'
export const OIDC_VERIFIER_COOKIE = 'oidc_verifier'

/** 10 minutes (§5). */
export const STATE_COOKIE_MAX_AGE = 600

interface ShortCookieArgs {
  maxAge?: number
  name: string
  value: string
}

export function serializeShortCookie({ maxAge = STATE_COOKIE_MAX_AGE, name, value }: ShortCookieArgs): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  if (resolveCookieSecureFlag()) parts.push('Secure')
  return parts.join('; ')
}

/** Expire one of the short-lived cookies (callback/logout cleanup). */
export function expireShortCookie(name: string): string {
  const parts = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (resolveCookieSecureFlag()) parts.push('Secure')
  return parts.join('; ')
}

/** Read a cookie value from a Request's Cookie header. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim()
  }
  return null
}
