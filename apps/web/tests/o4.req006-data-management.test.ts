import { describe, it, expect } from 'vitest'
import { dataManagementAccess } from '@/access/dataManagementPolicy'

/**
 * REQ-006 (deny-by-default amendment to SPC-004 §4e / SPC-006 §9) —
 * dataManagementAccess truth table. Standalone file (o3 lineage) so the
 * REQ-006 boundary cases never share a file with the structural wiring
 * assertions.
 *
 * Case-shape honesty: `isMasterUser` resolves the master-user identity by
 * ABSENCE of agent markers (actorPolicy.ts:35-43 — unmarked → 'user', so the
 * REQ-006 fix is semantic: the grant now derives from the master identity
 * instead of an unconditional `return true`). The reachability facts that
 * make the boundary real are encoded in each case:
 *   - the ONLY local user is the one-shot first-register master (E-7,
 *     Users.ts defaultValue actorType:'human', roles:['human']);
 *   - OIDC mirror docs ALWAYS carry a roles array (deriveRolesForTokenPayload
 *     never returns empty — minimum ['human']);
 *   - an agent-marked principal without a roles array is the residual
 *     role-less case the old `return true` wrongly let through.
 */

type Req = { req: { user?: Record<string, unknown> | null } | undefined }

function reqWith(user: Record<string, unknown> | null): Req {
  return { req: { user } }
}

describe('REQ-006: dataManagementAccess deny-by-default truth table', () => {
  it('anonymous → false (unchanged)', () => {
    expect(dataManagementAccess(reqWith(null) as never)).toBe(false)
    expect(dataManagementAccess({ req: undefined } as never)).toBe(false)
  })

  it('agent via bridge actorType → false, even with superadmin in roles (REQ-002/ADR-002)', () => {
    expect(
      dataManagementAccess(reqWith({ actorType: 'agent', roles: ['superadmin'] }) as never),
    ).toBe(false)
  })

  it('agent via legacy roles array → false (unchanged)', () => {
    expect(dataManagementAccess(reqWith({ roles: ['agent'] }) as never)).toBe(false)
  })

  it('role string claim: superadmin → true, anything else → false (unchanged)', () => {
    expect(dataManagementAccess(reqWith({ role: 'superadmin' }) as never)).toBe(true)
    expect(dataManagementAccess(reqWith({ role: 'human' }) as never)).toBe(false)
  })

  it('roles array claim: [superadmin] → true (AC-8), [human] → false (superadmin gate)', () => {
    expect(dataManagementAccess(reqWith({ actorType: 'superadmin', roles: ['superadmin'] }) as never)).toBe(true)
    expect(dataManagementAccess(reqWith({ roles: ['superadmin'] }) as never)).toBe(true)
    expect(
      dataManagementAccess(reqWith({ actorType: 'human', roles: ['human'], identityIss: 'https://idp', identitySub: 'sub-1' }) as never),
    ).toBe(false)
  })

  it('REQ-006 role-less: agent-marked principal with NO roles array → false (was the true-leak)', () => {
    expect(dataManagementAccess(reqWith({ actorType: 'agent' }) as never)).toBe(false)
    expect(dataManagementAccess(reqWith({ isAgent: true }) as never)).toBe(false)
  })

  it('REQ-006 role-less: master identity (no roles array, no role claims) → true (operator lock-out regression)', () => {
    // Shapes genuinely WITHOUT any roles/role marker: the grant resolves
    // through the master-user identity (isMasterUser), not a blanket true.
    expect(dataManagementAccess(reqWith({ email: 'master@local.test' }) as never)).toBe(true)
    expect(dataManagementAccess(reqWith({ email: 'master@local.test', name: 'Ops' }) as never)).toBe(true)
    expect(dataManagementAccess(reqWith({ id: 1, email: 'master@local.test', actorType: 'human' }) as never)).toBe(true)
  })

  it('REQ-006: local master with schema-default roles [human] (NO identity pair) → true — live E2E regression (browser/REST verified)', () => {
    // FIRST-REGISTER REALITY (Users.ts defaults): the seeded master doc is
    // { actorType:'human', roles:['human'] } — pre-REQ-006 the roles-array
    // branch denied this shape outright: the operator was LOCKED OUT of
    // Data Management (verified live: GET /api/exports → 403 on the E2E
    // stack). The discriminator: no OIDC identity pair on the doc.
    expect(
      dataManagementAccess(reqWith({ id: 1, email: 'master@local.test', actorType: 'human', roles: ['human'] }) as never),
    ).toBe(true)
    expect(dataManagementAccess(reqWith({ email: 'master@local.test', roles: ['human'] }) as never)).toBe(true)
  })

  it('REQ-006: OIDC human mirror (roles [human] + identity pair) → false — claims-only, no superadmin marker', () => {
    // Mirror docs ALWAYS carry identityIss/identitySub (SPC-006 §8 upsert);
    // identitySub alone is the discriminator the ACL reads.
    expect(
      dataManagementAccess(
        reqWith({ email: 'ops@local.test', actorType: 'human', roles: ['human'], identityIss: 'https://idp', identitySub: 'sub-1' }) as never,
      ),
    ).toBe(false)
    expect(
      dataManagementAccess(reqWith({ roles: [], identitySub: 'sub-2', identityIss: 'https://idp' }) as never),
    ).toBe(false)
  })
})
