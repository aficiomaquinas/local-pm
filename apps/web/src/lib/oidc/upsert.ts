/**
 * SPC-006 §8 — user upsert keyed by the `(identityIss, identitySub)` pair.
 *
 * Identity is the PAIR (ADR-002); email becomes an attribute and keeps
 * Payload's native unique handling for local-strategy users. The upsert is
 * the enforcement point for uniqueness of the pair (find-then-create with a
 * duplicate-key retry — §8 and §17 "Upsert race" mitigation; a compound
 * unique index is desirable but expressibility in Payload 3.88 is [unverified]).
 *
 * Agents (§6/§8): synthetic email `<client_id>@clients.local`, name =
 * client_id, `active` is the operator's local kill-switch (AC-11).
 */

import type { Payload } from 'payload'

import type { AppRole } from './env'
import { getAgentClientIds } from './env'
import { deriveActorTypeFromRoles } from './roles'
import type { ActorClaims } from './verify'

export interface OidcUpsertResult {
  doc: Record<string, unknown> & { id: number | string }
  created: boolean
}

function isDuplicateKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  return /duplicate key|E11000/i.test(msg)
}

/**
 * Upsert the users mirror document for a validated token. Never throws on
 * the happy path; throws upward only on unexpected store failures (strategy
 * caller fails closed).
 */
export async function upsertOidcUser(payload: Payload, claims: ActorClaims): Promise<OidcUpsertResult> {
  const { iss, sub, isAgent } = claims

  // Find by the identity pair (exact values as emitted, §8).
  const existing = await payload.find({
    collection: 'users',
    where: { and: [{ identityIss: { equals: iss } }, { identitySub: { equals: sub } }] },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  })
  const doc = existing.docs[0]

  // Kill-switch (AC-11): an agent whose mirror doc is active:false never
  // authenticates. Signal to the caller by returning the doc; the strategy
  // checks `active` before accepting.
  if (isAgent) {
    const clientId = claims.clientIdClaim ?? sub
    if (doc) {
      return { doc: doc as unknown as Record<string, unknown> & { id: number | string }, created: false }
    }
    const created = await payload.create({
      collection: 'users',
      data: {
        name: clientId,
        email: `${clientId.replace(/[^a-zA-Z0-9._-]/g, '_')}@clients.local`,
        actorType: 'agent',
        active: true,
        identityIss: iss,
        identitySub: sub,
        roles: ['agent'],
        rawGroups: [],
        lastLoginAt: new Date().toISOString(),
      },
      depth: 0,
      overrideAccess: true,
    })
    return { doc: created as unknown as Record<string, unknown> & { id: number | string }, created: true }
  }

  // Human path: derive roles from the groups claim (§7) and persist.
  const { deriveRolesForTokenPayload } = await import('./roles')
  const { roles, rawGroups } = deriveRolesForTokenPayload(claims.payload)
  const actorType = deriveActorTypeFromRoles(roles)
  const email = typeof claims.payload['email'] === 'string' ? (claims.payload['email'] as string) : undefined
  const name =
    (typeof claims.payload['name'] === 'string' && (claims.payload['name'] as string)) ||
    (typeof claims.payload['preferred_username'] === 'string'
      ? (claims.payload['preferred_username'] as string)
      : undefined)

  const data: Record<string, unknown> = {
    actorType,
    roles,
    rawGroups,
    lastLoginAt: new Date().toISOString(),
  }
  if (email !== undefined) data['email'] = email
  if (name !== undefined) data['name'] = name

  if (doc) {
    // OD-1 open: existing local users keep their password; we only refresh
    // OIDC-derived attributes. active is NOT reset here (operator's switch).
    const updated = await payload.update({
      collection: 'users',
      id: doc.id,
      data,
      depth: 0,
      overrideAccess: true,
    })
    return { doc: updated as unknown as Record<string, unknown> & { id: number | string }, created: false }
  }

  try {
    const created = await payload.create({
      collection: 'users',
      data: { ...data, identityIss: iss, identitySub: sub, active: true },
      depth: 0,
      overrideAccess: true,
    })
    return { doc: created as unknown as Record<string, unknown> & { id: number | string }, created: true }
  } catch (err) {
    // §8: guarded upsert — a concurrent first login may have created the same
    // identity pair between find and create; retry the find once.
    if (isDuplicateKeyError(err)) {
      const retry = await payload.find({
        collection: 'users',
        where: { and: [{ identityIss: { equals: iss } }, { identitySub: { equals: sub } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const raced = retry.docs[0]
      if (raced) {
        return { doc: raced as Record<string, unknown> & { id: number | string }, created: false }
      }
    }
    throw err
  }
}

/** Agent kill-switch evaluation (§6): active !== false must hold to pass. */
export function isAgentActive(doc: Record<string, unknown>): boolean {
  return doc['active'] !== false
}

/** Helper for tests/tools: is this client_id configured as an agent? */
export function isConfiguredAgentClientId(clientId: string | null): boolean {
  return clientId !== null && getAgentClientIds().includes(clientId)
}
