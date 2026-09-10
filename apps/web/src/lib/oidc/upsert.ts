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
 *
 * NOTE on generated types: this module treats user documents as
 * `Record<string, unknown>` shapes rather than the generated `User`
 * interface. `User` (payload-types.ts) cannot name OIDC docs that lack an
 * email while the local strategy coexists (OD-1), and `payload.create/update`
 * on `User` types rejects partial data. The upsert is the boundary that
 * guarantees the returned document carries id + the fields the strategy
 * contract needs; runtime field validation is Payload's (config-truth).
 */

import type { Payload } from 'payload'

import type { AppRole } from './env'
import { getAgentClientIds } from './env'
import { deriveActorTypeFromRoles, deriveRolesForTokenPayload } from './roles'
import type { ActorClaims } from './verify'

export interface OidcUpsertResult {
  doc: Record<string, unknown> & { id: number | string }
  created: boolean
}

/** Loose create/update argument shape (see module NOTE on generated types). */
type UpsertPayload = Pick<Payload, 'create' | 'find' | 'update'> & Record<string, unknown>

type LooseFindArgs = {
  collection: 'users'
  depth: number
  limit?: number
  overrideAccess: true
  where: Record<string, unknown>
}
type LooseWriteArgs = {
  collection: 'users'
  data: Record<string, unknown>
  depth: number
  id?: number | string
  overrideAccess: true
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
  const store = payload as unknown as UpsertPayload
  const find = (args: LooseFindArgs) => store.find(args as never)
  const create = (args: LooseWriteArgs) => store.create(args as never)
  const update = (args: LooseWriteArgs) => store.update(args as never)

  const { iss, sub, isAgent } = claims
  const where = { and: [{ identityIss: { equals: iss } }, { identitySub: { equals: sub } }] }

  // Find by the identity pair (exact values as emitted, §8).
  const existing = await find({ collection: 'users', depth: 0, limit: 2, overrideAccess: true, where })
  const doc = existing.docs[0] as unknown as Record<string, unknown> & { id: number | string } | undefined

  if (isAgent) {
    const clientId = claims.clientIdClaim ?? sub
    if (doc) {
      // Mirror doc exists: refresh the login stamp; `active` is NOT touched
      // (operator's kill-switch, AC-11 — checked by the strategy caller).
      const updated = await update({
        collection: 'users',
        data: { lastLoginAt: new Date().toISOString(), lastChannel: claims.channel ?? 'mcp' },
        depth: 0,
        id: doc.id,
        overrideAccess: true,
      })
      return { doc: updated as unknown as Record<string, unknown> & { id: number | string }, created: false }
    }
    const created = await create({
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
  const { roles, rawGroups } = deriveRolesForTokenPayload(claims.payload)
  const actorType = deriveActorTypeFromRoles(roles)
  const email = typeof claims.payload['email'] === 'string' ? claims.payload['email'] : undefined
  const name =
    (typeof claims.payload['name'] === 'string' && claims.payload['name']) ||
    (typeof claims.payload['preferred_username'] === 'string'
      ? claims.payload['preferred_username']
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
    const updated = await update({
      collection: 'users',
      data,
      depth: 0,
      id: doc.id,
      overrideAccess: true,
    })
    return { doc: updated as unknown as Record<string, unknown> & { id: number | string }, created: false }
  }

  try {
    const created = await create({
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
      const retry = await find({ collection: 'users', depth: 0, limit: 1, overrideAccess: true, where })
      const raced = retry.docs[0] as unknown as Record<string, unknown> & { id: number | string } | undefined
      if (raced) {
        return { doc: raced, created: false }
      }
    }
    throw err
  }
}

/** Kill-switch evaluation (§6/AC-11): active !== false must hold to pass. */
export function isAgentActive(doc: Record<string, unknown>): boolean {
  return doc['active'] !== false
}

/** Helper for tests/tools: is this client_id configured as an agent? */
export function isConfiguredAgentClientId(clientId: string | null): boolean {
  return clientId !== null && getAgentClientIds().includes(clientId)
}

export type { AppRole }
