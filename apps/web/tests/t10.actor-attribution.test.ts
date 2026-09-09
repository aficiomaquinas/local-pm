import { describe, it, expect } from 'vitest'
import { attributeActor, ACTOR_ATTRIBUTION_FIELDS } from '@/hooks/actorAttribution'
import { Tickets } from '@/collections/Tickets'
import { Projects } from '@/collections/Projects'
import { Teams } from '@/collections/Teams'

/**
 * T1 (SPC-005 §5.1) — actor attribution hook: user, agent and no-auth
 * (anonymous) requests stamp the doc with actorType/actorId/actorLabel.
 * Pure hook invocation with a stubbed `req` — no Payload runtime.
 */

type ReqUser = Record<string, unknown> | null | undefined

function runHook(user: ReqUser) {
  const data: Record<string, unknown> = { title: 'x' }
  const out = attributeActor({
    data,
    req: { user } as unknown as Parameters<typeof attributeActor>[0]['req'],
    operation: 'update',
  } as unknown as Parameters<typeof attributeActor>[0]) as Record<string, unknown>
  return out
}

describe('T1: attributeActor hook (SPC-005 D-2)', () => {
  it('master user (actorType superadmin bridge vocabulary) → type user, label user:<email>', () => {
    const out = runHook({ id: 'u_1', email: 'master@local-pm.local', actorType: 'superadmin' })
    expect(out.actorType).toBe('user')
    expect(out.actorId).toBe('u_1')
    expect(out.actorLabel).toBe('user:master@local-pm.local')
  })

  it('explicit user actorType → user', () => {
    const out = runHook({ id: 'u_2', email: 'h@x', actorType: 'user' })
    expect(out.actorType).toBe('user')
    expect(out.actorId).toBe('u_2')
  })

  it('agent identity → agent', () => {
    const out = runHook({ id: 'a_1', email: 'agent@x', actorType: 'agent' })
    expect(out.actorType).toBe('agent')
    expect(out.actorId).toBe('a_1')
    expect(out.actorLabel).toBe('agent')
  })

  it('no user → anonymous (never demotes a user to anonymous, never upgrades anon)', () => {
    const out = runHook(null)
    expect(out.actorType).toBe('anonymous')
    expect(out.actorId).toBeNull()
    expect(out.actorLabel).toBe('anonymous')
  })

  it('legacy isAgent marker → agent', () => {
    expect(runHook({ id: 'a_2', isAgent: true }).actorType).toBe('agent')
  })

  it('ALWAYS overwrites client-sent values (no forged attribution)', () => {
    const data: Record<string, unknown> = { title: 'x', actorType: 'user', actorLabel: 'forged' }
    const out = attributeActor({
      data,
      req: { user: null } as never,
      operation: 'create',
    } as never) as Record<string, unknown>
    expect(out.actorType).toBe('anonymous')
    expect(out.actorLabel).toBe('anonymous')
  })
})

describe('T1: attribution field + wiring on the three collections (SPC-005 D-1)', () => {
  const collections = [
    { slug: Tickets.slug, config: Tickets },
    { slug: Projects.slug, config: Projects },
    { slug: Teams.slug, config: Teams },
  ]

  const fieldNames = ACTOR_ATTRIBUTION_FIELDS.map((f) => f.name)

  it('declares actorType select / actorId relationship / actorLabel text', () => {
    expect(fieldNames).toEqual(['actorType', 'actorId', 'actorLabel'])
    const [type, id, label] = ACTOR_ATTRIBUTION_FIELDS
    expect(type.type).toBe('select')
    expect(id.type).toBe('relationship')
    expect(label.type).toBe('text')
  })

  for (const { slug, config } of collections) {
    it(`${slug}: carries the three attribution fields`, () => {
      const names = (config.fields as Array<Record<string, unknown>>).map(
        (f) => f.name as string | undefined,
      )
      for (const n of fieldNames) expect(names, slug).toContain(n)
    })

    it(`${slug}: attributeActor is the FIRST beforeChange hook`, () => {
      const hooks = config.hooks?.beforeChange as unknown[]
      expect(hooks[0]).toBe(attributeActor)
    })

    it(`${slug}: retention Option B — maxPerDoc is 1000`, () => {
      expect((config.versions as { maxPerDoc?: number }).maxPerDoc).toBe(1000)
    })
  }

  it('restore needs no special casing: restoreVersion is NOT in the attribution hook (D-3)', () => {
    // The hook must not branch on operation — assert it stamps identically
    // for create and update (restore runs an update under the hood).
    const asCreate = attributeActor({
      data: {},
      req: { user: { id: 'u', actorType: 'user' } } as never,
      operation: 'create',
    } as never) as Record<string, unknown>
    const asUpdate = attributeActor({
      data: {},
      req: { user: { id: 'u', actorType: 'user' } } as never,
      operation: 'update',
    } as never) as Record<string, unknown>
    expect(asCreate.actorType).toBe(asUpdate.actorType)
  })
})
