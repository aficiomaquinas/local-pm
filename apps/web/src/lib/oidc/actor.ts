/**
 * SPC-006 §4 — resolve a verified token to a `users` document (the strategy
 * entry point D-1 consumes).
 *
 * Pipeline (§4 resolution order):
 *   1. `verifyAccessToken` (lib/oidc/verify.ts): signature via the issuer
 *      JWKS (or RFC 7662 introspection, §6), claims iss/aud/exp/nbf with
 *      `OIDC_CLOCK_SKEW_SECONDS` tolerance. Any failure → null (fail-closed;
 *      never throws into the request pipeline).
 *   2. Classify: the client-id claim (§6: azp → client_id → cid, env-
 *      overridable) matching `OIDC_AGENT_CLIENT_IDS` → agent path; otherwise
 *      the human path keyed by `(iss, sub)`.
 *   3. Upsert the mirror document (lib/oidc/upsert.ts, §8) and return it with
 *      `collection`/`_strategy` attached, as the strategy contract requires
 *      (mirrors payload's own JWT strategy shape).
 *
 * Kill-switches (both fail-closed):
 *   - OIDC_ENABLED=false → null (the strategy is inert without the flag).
 *   - agent mirror doc `active: false` → null (§6, AC-11): a still
 *     cryptographically valid token yields 401-equivalent after the mirror
 *     doc is deactivated.
 */

import type { Payload } from 'payload'

import { isOidcEnabled } from './env'
import { isAgentActive, upsertOidcUser } from './upsert'
import { verifyAccessToken } from './verify'

export interface OidcActor extends Record<string, unknown> {
  id: number | string
  collection: 'users'
  _strategy: 'oidc'
  actorType: 'superadmin' | 'human' | 'agent'
  active: boolean
  lastChannel?: 'webui' | 'rest' | 'mcp'
}

/**
 * Best-effort channel stamp (§9): the MCP server sends `X-LocalPM-Channel:
 * mcp` (§10); the strategy copies it into the returned user's `lastChannel`
 * at login time only.
 */
function channelFromHeaders(headers: Headers): 'webui' | 'rest' | 'mcp' {
  const raw = (headers.get('x-localpm-channel') ?? '').toLowerCase()
  if (raw === 'mcp') return 'mcp'
  if (raw === 'rest') return 'rest'
  return 'webui'
}

export async function resolveOidcActor(
  payload: Payload,
  token: string,
  headers: Headers = new Headers(),
): Promise<OidcActor | null> {
  if (!isOidcEnabled()) return null

  const verified = await verifyAccessToken(token)
  if (!verified.ok) return null

  const claims = verified.claims
  const doc = await upsertOidcUser(payload, claims)

  // Kill-switch (§6, AC-11) applies to every identity: an operator-set
  // active:false on the mirror doc short-circuits authentication.
  if (!isAgentActive(doc.doc)) return null

  const actorType =
    claims.isAgent
      ? 'agent'
      : doc.doc['actorType'] === 'superadmin'
        ? 'superadmin'
        : 'human'

  return {
    ...(doc.doc as unknown as OidcActor),
    id: doc.doc.id,
    collection: 'users',
    _strategy: 'oidc',
    actorType,
    active: doc.doc['active'] !== false,
    lastChannel: channelFromHeaders(headers),
  }
}
