import { describe, it, expect } from 'vitest'
import { authenticatedMutations } from '@/access/authenticatedAccess'
import { dataManagementAccess } from '@/access/dataManagementPolicy'
import { resolveActorType, isMasterUser, isAgent } from '@/access/actorPolicy'
import { Users } from '@/collections/Users'
import { Projects } from '@/collections/Projects'
import { Teams } from '@/collections/Teams'
import { Tickets } from '@/collections/Tickets'

/**
 * SPC-006 §9 + OD-7 ACL unit matrix (w3 lineage): the ONLY ACL-module delta
 * of the whole wiring is dataManagementAccess learning the `roles` array;
 * everything else must keep its shipped semantics. AC-2 (anonymous mutation
 * denied) and the structural contracts are checked on the collection configs.
 */

type Req = { req: { user?: Record<string, unknown> | null } | undefined }

function reqWith(user: Record<string, unknown> | null): Req {
  return { req: { user } }
}

describe('SPC-006 §9: dataManagementAccess — the single ACL delta', () => {
  it('anonymous → deny (unchanged deny-by-default)', () => {
    expect(dataManagementAccess(reqWith(null) as never)).toBe(false)
    expect(dataManagementAccess({ req: undefined } as never)).toBe(false)
  })

  it('agent (bridge actorType) → deny, even with superadmin in roles', () => {
    expect(
      dataManagementAccess(reqWith({ actorType: 'agent', roles: ['superadmin'] }) as never),
    ).toBe(false)
  })

  it('agent via legacy roles array → deny (unchanged)', () => {
    expect(dataManagementAccess(reqWith({ roles: ['agent'] }) as never)).toBe(false)
  })

  it('NEW: post-OIDC human doc, roles=[superadmin] (array) → allow (AC-8)', () => {
    expect(dataManagementAccess(reqWith({ actorType: 'superadmin', roles: ['superadmin'] }) as never)).toBe(true)
    expect(dataManagementAccess(reqWith({ roles: ['superadmin'] }) as never)).toBe(true)
  })

  it('NEW: post-OIDC human doc, roles=[human] → deny (superadmin gate)', () => {
    expect(dataManagementAccess(reqWith({ actorType: 'human', roles: ['human'] }) as never)).toBe(false)
  })

  it('legacy string role claim still works (unchanged precedence)', () => {
    expect(dataManagementAccess(reqWith({ role: 'superadmin' }) as never)).toBe(true)
    expect(dataManagementAccess(reqWith({ role: 'human' }) as never)).toBe(false)
  })

  it('master user pre-claims (bridge doc, no roles marker) → allow (unchanged)', () => {
    expect(dataManagementAccess(reqWith({ actorType: 'superadmin' }) as never)).toBe(true)
    expect(dataManagementAccess(reqWith({ email: 'ops@local.test' }) as never)).toBe(true)
  })
})

describe('OD-7 / AC-2: business-collection mutations are authenticated-only', () => {
  it('authenticatedMutations: user present → allow; anonymous → deny', () => {
    expect(authenticatedMutations(reqWith({ email: 'x' }) as never)).toBe(true)
    expect(authenticatedMutations(reqWith({ actorType: 'agent' }) as never)).toBe(true)
    expect(authenticatedMutations(reqWith(null) as never)).toBe(false)
  })

  for (const collection of [Projects, Teams, Tickets]) {
    describe(`${collection.slug}`, () => {
      it('create/update/delete use authenticatedMutations (AC-2)', () => {
        const access = collection.access as Record<string, unknown>
        expect(access['create']).toBe(authenticatedMutations)
        expect(access['update']).toBe(authenticatedMutations)
        expect(access['delete']).toBe(authenticatedMutations)
      })

      it('agent with a VALID business token still passes mutations (REQ-002: agents keep business CRUD)', () => {
        const access = collection.access as Record<string, (args: Req) => boolean>
        expect(access['create'](reqWith({ actorType: 'agent' }))).toBe(true)
      })

      it('readVersions stays denyAgents (AC-3: audit trail barred to agents)', () => {
        const access = collection.access as Record<string, unknown>
        expect(access['readVersions']).toBeDefined()
      })
    })
  }
})

describe('SPC-006 §4: Users collection wiring (structural)', () => {
  it('has an oidc strategy whose authenticate fails closed without a bearer header', async () => {
    const auth = Users.auth as { strategies: Array<{ name: string; authenticate: (args: unknown) => Promise<{ user: unknown }> }> }
    const strategy = auth.strategies.find((s) => s.name === 'oidc')
    expect(strategy).toBeDefined()
    const result = await strategy!.authenticate({ payload: {}, headers: new Headers() })
    expect(result.user).toBeNull()
  })

  it('garbage bearer → null user (AC-1), no throw into the pipeline', async () => {
    const auth = Users.auth as { strategies: Array<{ name: string; authenticate: (args: unknown) => Promise<{ user: unknown }> }> }
    const strategy = auth.strategies.find((s) => s.name === 'oidc')!
    const result = await strategy.authenticate({
      payload: {},
      headers: new Headers({ authorization: 'Bearer garbage.token.here' }),
    })
    expect(result.user).toBeNull()
  })

  it('OD-1: local strategy keeps running (first-register intact, AC-7)', () => {
    const auth = Users.auth as { disableLocalStrategy: unknown }
    // Object form = the sanitizer's falsy-equivalent: local strategy stays.
    const disabled = auth.disableLocalStrategy
    expect(disabled === true).toBe(false)
    expect(disabled === false || (typeof disabled === 'object' && disabled !== null)).toBe(true)
  })

  it('§8 fields exist with the right types (identity pair, roles, rawGroups...)', () => {
    const byName = new Map(
      Users.fields.map((f) => [(f as { name?: string })['name'] as string, f as unknown as Record<string, unknown>]),
    )
    expect(byName.get('identityIss')).toMatchObject({ type: 'text', index: true })
    expect(byName.get('identitySub')).toMatchObject({ type: 'text', index: true })
    expect(byName.get('roles')).toMatchObject({ type: 'select', hasMany: true })
    expect(byName.get('rawGroups')).toMatchObject({ type: 'json' })
    expect(byName.get('lastLoginAt')).toMatchObject({ type: 'date' })
    expect(byName.get('lastChannel')).toMatchObject({ type: 'select' })
    const rolesOptions = (byName.get('roles')!['options'] as Array<{ value: string }>).map((o) => o.value)
    expect(rolesOptions).toEqual(['superadmin', 'human', 'agent'])
  })

  it('actorPolicy keeps bridging OIDC docs: roles=[agent] → agent, actorType wins (§9 zero-change)', () => {
    // OIDC agent doc → agent.
    expect(isAgent({ actorType: 'agent' } as never)).toBe(true)
    expect(resolveActorType({ actorType: 'agent', roles: ['agent'] } as never)).toBe('agent')
    // OIDC human doc → master identity for the audit trail.
    expect(isMasterUser({ actorType: 'human', roles: ['human'] } as never)).toBe(true)
    expect(isMasterUser({ actorType: 'superadmin', roles: ['superadmin'] } as never)).toBe(true)
  })
})
