import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { requireAuthEnabled, readAccess, writeAccess, deleteAccess } from '@/lib/access'
import type { Access } from 'payload'

const call = (fn: Access, user: unknown) =>
  (fn as (args: { req: { user: unknown } }) => unknown)({ req: { user } })

let original: string | undefined

beforeEach(() => {
  original = process.env.LOCAL_PM_REQUIRE_AUTH
})

afterEach(() => {
  if (original === undefined) delete process.env.LOCAL_PM_REQUIRE_AUTH
  else process.env.LOCAL_PM_REQUIRE_AUTH = original
})

describe('requireAuthEnabled', () => {
  it('is off unless the flag is exactly "true"', () => {
    delete process.env.LOCAL_PM_REQUIRE_AUTH
    expect(requireAuthEnabled()).toBe(false)

    process.env.LOCAL_PM_REQUIRE_AUTH = 'false'
    expect(requireAuthEnabled()).toBe(false)

    process.env.LOCAL_PM_REQUIRE_AUTH = 'TRUE'
    expect(requireAuthEnabled()).toBe(false)

    process.env.LOCAL_PM_REQUIRE_AUTH = 'true'
    expect(requireAuthEnabled()).toBe(true)
  })
})

describe('with the flag off — existing installs must not change behaviour', () => {
  beforeEach(() => {
    process.env.LOCAL_PM_REQUIRE_AUTH = 'false'
  })

  it('allows anonymous read, write and delete', () => {
    expect(call(readAccess, null)).toBe(true)
    expect(call(writeAccess, null)).toBe(true)
    expect(call(deleteAccess, null)).toBe(true)
  })
})

describe('with the flag on', () => {
  beforeEach(() => {
    process.env.LOCAL_PM_REQUIRE_AUTH = 'true'
  })

  it('denies anonymous requests outright', () => {
    expect(call(readAccess, null)).toBe(false)
    expect(call(writeAccess, null)).toBe(false)
    expect(call(deleteAccess, null)).toBe(false)
  })

  it('allows any authenticated user to read and write', () => {
    const member = { id: 'u1', role: 'member' }
    expect(call(readAccess, member)).toBe(true)
    expect(call(writeAccess, member)).toBe(true)
  })

  it('restricts delete to admins', () => {
    expect(call(deleteAccess, { id: 'u1', role: 'member' })).toBe(false)
    expect(call(deleteAccess, { id: 'u2', role: 'agent' })).toBe(false)
    expect(call(deleteAccess, { id: 'u3', role: 'admin' })).toBe(true)
  })

  it('denies delete when the user carries no role at all (fail closed)', () => {
    expect(call(deleteAccess, { id: 'u4' })).toBe(false)
  })
})
