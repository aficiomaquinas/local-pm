/**
 * SPC-006 §4 — OIDC session hand-off: mint a Payload-format JWT and build
 * the standard `<cookiePrefix>-token` cookie.
 *
 * The mandate (§4 "Session shape"): after a human OIDC login the app keeps
 * using Payload's native session cookie; the browser never sees an OIDC
 * token. The callback cannot use `payload.login()` (OIDC-provisioned users
 * have no password), so it signs the exact JWT the local strategy signs —
 * `{ id, collection: 'users', email, sid }` — with `payload.secret` (HS256
 * via jose) and sets the `<cookiePrefix>-token` HTTP-only cookie with
 * `getCookieExpiration(auth.tokenExpiration)`. The community precedent for
 * this mechanism is the Payload-era Passport/OIDC thread [R9]; in Payload 3
 * `extractJWT` reads exactly this cookie name
 * (`${payload.config.cookiePrefix}-token`) and `JWTAuthentication` verifies
 * the token with `jwtVerify(token, new TextEncoder().encode(payload.secret))`
 * then resolves the user by `decodedPayload.id` + `decodedPayload.collection`.
 *
 * Payload 3.88 sanitizes `auth.useSessions: true` by default: the JWT must
 * carry a `sid` claim backed by a `sessions[]` entry on the user doc or
 * `JWTAuthentication` returns `{ user: null }`. `createUserSession` creates
 * that entry so the minted cookie is a first-class session.
 *
 * Cookie hardening: `Secure` per `OIDC_COOKIE_SECURE=auto` (§13/§17 — drop
 * `Secure` only on loopback http, RFC 8252 §7.3 [R15]); `HttpOnly`/`Path=/`
 * come from Payload's own `generatePayloadCookie`, which serializes
 * `HttpOnly=true` and `Path=/`.
 */

import type { SanitizedCollectionConfig } from 'payload'
import { SignJWT } from 'jose'
import { generatePayloadCookie } from 'payload'

import { resolveCookieSecureFlag } from './env'

/** A user's session rows as Payload stores them (auth/sessions.js). */
export interface UserSessionRow {
  id: string
  createdAt: Date | string
  expiresAt: Date | string
}

/**
 * Mint the Payload-format JWT and compute the backing session entry
 * (mirrors payload/dist/auth/sessions.js `addSessionToUser`): expired
 * sessions are dropped, the new row carries `sid` + tokenExpiration expiry.
 * `secret` is `payload.secret`; `tokenExpiration` the sanitized
 * `auth.tokenExpiration` (default 7200s). Persisting `sessions` onto the
 * user doc is the caller's job (payload.create/update with overrideAccess).
 */
export async function createUserSession(args: {
  email: string
  id: number | string
  secret: string
  tokenExpiration: number
  existingSessions?: UserSessionRow[]
}): Promise<{ sessions: UserSessionRow[]; token: string }> {
  const sid = crypto.randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + args.tokenExpiration * 1000)

  const sessions: UserSessionRow[] = [
    ...(args.existingSessions ?? []).filter((s) => new Date(s.expiresAt) > now),
    { id: sid, createdAt: now, expiresAt },
  ]

  const token = await new SignJWT({ id: args.id, collection: 'users', email: args.email, sid })
    .setProtectedHeader({ typ: 'JWT', alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(new TextEncoder().encode(args.secret))

  return { sessions, token }
}

function authWithSecureFlag(auth: SanitizedCollectionConfig['auth']): SanitizedCollectionConfig['auth'] {
  return {
    ...auth,
    // OD-5 (§13): `auto` = Secure everywhere except loopback http.
    cookies: { ...auth.cookies, secure: resolveCookieSecureFlag() },
  }
}

/**
 * Serialized `Set-Cookie` for the Payload session cookie (§4 session shape):
 * `name=<prefix>-token; Expires=<tokenExpiration>; HttpOnly=true; Path=/;
 * SameSite=Lax[; Secure]`.
 */
export function buildSessionCookie(args: {
  auth: SanitizedCollectionConfig['auth']
  cookiePrefix: string
  token: string
}): string {
  return generatePayloadCookie({
    collectionAuthConfig: authWithSecureFlag(args.auth),
    cookiePrefix: args.cookiePrefix,
    returnCookieAsObject: false as const,
    token: args.token,
  })
}

/** Serialized `Set-Cookie` clearing the Payload session cookie (§5 logout). */
export function buildExpiredSessionCookie(args: {
  auth: SanitizedCollectionConfig['auth']
  cookiePrefix: string
}): string {
  return generatePayloadCookie({
    collectionAuthConfig: authWithSecureFlag(args.auth),
    cookiePrefix: args.cookiePrefix,
    returnCookieAsObject: false as const,
    token: '',
  })
}
