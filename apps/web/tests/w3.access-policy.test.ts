import { describe, it, expect } from 'vitest'
import {
  resolveActorType,
  isMasterUser,
  isAgent,
  actorLabel,
} from '@/access/actorPolicy'
import { resolveCollectionFilter } from '@/app/api/history/feed'

/**
 * W3 — Pure access-control predicates (T1): the `(req.user)` truth table for
 * SPC-001's two-identity policy — master user, agent (by actorType, legacy
 * roles array, legacy isAgent flag) and the deny-by-default anonymous case.
 * Trivial today, valuable the day REQ-002 lands (SPC-003 §7.2).
 */
describe('W3: access-control predicates (actorPolicy truth table)', () => {
  it('no user → anonymous: neither master nor agent', () => {
    expect(resolveActorType(null)).toBeNull()
    expect(resolveActorType(undefined)).toBeNull()
    expect(isMasterUser(null)).toBe(false)
    expect(isAgent(null)).toBe(false)
  })

  it('actorType=user → master user', () => {
    const user = { actorType: 'user' }
    expect(resolveActorType(user)).toBe('user')
    expect(isMasterUser(user)).toBe(true)
    expect(isAgent(user)).toBe(false)
  })

  it('actorType=agent → agent (barred from the audit trail)', () => {
    const user = { actorType: 'agent' }
    expect(resolveActorType(user)).toBe('agent')
    expect(isMasterUser(user)).toBe(false)
    expect(isAgent(user)).toBe(true)
  })

  it('legacy roles array: roles=["agent"] → agent', () => {
    const user = { roles: ['agent'] }
    expect(resolveActorType(user)).toBe('agent')
    expect(isAgent(user)).toBe(true)
    expect(isMasterUser(user)).toBe(false)
  })

  it('legacy roles array with other values → master user', () => {
    const user = { roles: ['admin'] }
    expect(resolveActorType(user)).toBe('user')
    expect(isMasterUser(user)).toBe(true)
  })

  it('legacy isAgent flag: true → agent', () => {
    expect(resolveActorType({ isAgent: true })).toBe('agent')
    expect(isAgent({ isAgent: true })).toBe(true)
    expect(isAgent({ isAgent: false })).toBe(false)
  })

  it('plain user object without markers → master user (documented default)', () => {
    const user = { email: 'ops@local.test' }
    expect(resolveActorType(user)).toBe('user')
    expect(isMasterUser(user)).toBe(true)
  })

  it('actorLabel renders the human-readable identity', () => {
    expect(actorLabel(null)).toBe('anonymous')
    expect(actorLabel({ actorType: 'agent' })).toBe('agent')
    expect(actorLabel({ actorType: 'user', email: 'ops@local.test' })).toBe(
      'user:ops@local.test',
    )
  })
})

/**
 * W1-extension — resolveCollectionFilter (pure helper extracted by SPC-001,
 * already a standalone function: no new extraction): the /api/history
 * collection parameter parsing.
 */
describe('W1-extension: resolveCollectionFilter', () => {
  it('null/empty/all → every collection', () => {
    expect(resolveCollectionFilter(null)).toEqual(['projects', 'teams', 'tickets'])
    expect(resolveCollectionFilter('')).toEqual(['projects', 'teams', 'tickets'])
    expect(resolveCollectionFilter('all')).toEqual(['projects', 'teams', 'tickets'])
  })

  it('a known slug filters to exactly that collection', () => {
    expect(resolveCollectionFilter('tickets')).toEqual(['tickets'])
  })

  it('an unknown slug filters to nothing (feed throws upstream)', () => {
    expect(resolveCollectionFilter('bogus')).toEqual([])
  })
})
