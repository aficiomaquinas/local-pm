import { describe, it, expect } from 'vitest'
import { SiteSettings } from '@/globals/SiteSettings'
import {
  normalizeSoftDeleteBehavior,
  isSoftDeleteBehavior,
  SITE_SETTINGS_SLUG,
} from '@/globals/contract'
import { resolveDataManagementActor } from '@/access/dataManagementActor'

/**
 * T1 (SPC-005 options panel) — site-settings global contract: superadmin-only
 * writes, open reads, visible default, and the silent-mode feed filter.
 */

describe('T1: site-settings global (soft-delete toggle)', () => {
  it('slug + one toggle field with visible default', () => {
    expect(SiteSettings.slug).toBe(SITE_SETTINGS_SLUG)
    expect(SiteSettings.slug).toBe('site-settings')
    const field = SiteSettings.fields.find(
      (f) => (f as { name?: string }).name === 'softDeleteBehavior',
    ) as {
      type: string
      defaultValue: string
      options: Array<{ value: string }>
    }
    expect(field.type).toBe('select')
    expect(field.defaultValue).toBe('visible')
    expect(field.options.map((o) => o.value)).toEqual(['visible', 'silent'])
  })

  it('update access: superadmin/human → true; agent + anonymous → false', () => {
    const access = SiteSettings.access!
    const update = access.update as (args: { req: unknown }) => boolean
    expect(update({ req: { user: { actorType: 'superadmin' } } })).toBe(true)
    expect(update({ req: { user: { actorType: 'human' } } })).toBe(true)
    expect(update({ req: { user: { actorType: 'agent' } } })).toBe(false)
    expect(update({ req: { user: null } })).toBe(false)
    expect(update({ req: {} })).toBe(false)
  })

  it('read access: open (the mode name renders in the UI)', () => {
    const read = SiteSettings.access!.read as (args: { req: unknown }) => boolean
    expect(read({ req: { user: null } })).toBe(true)
  })

  it('resolveDataManagementActor matches the extracted SPC-004 vocabulary', () => {
    expect(resolveDataManagementActor(null)).toBeNull()
    expect(resolveDataManagementActor({ actorType: 'superadmin' })).toBe('user')
    expect(resolveDataManagementActor({ actorType: 'agent' })).toBe('agent')
    expect(resolveDataManagementActor({ roles: ['agent'] })).toBe('agent')
    expect(resolveDataManagementActor({})).toBe('user')
  })
})

describe('T1: soft-delete behavior normalization (silent-mode filter input)', () => {
  it('known values pass through; unknown/missing fall back to visible', () => {
    expect(normalizeSoftDeleteBehavior('silent')).toBe('silent')
    expect(normalizeSoftDeleteBehavior('visible')).toBe('visible')
    expect(normalizeSoftDeleteBehavior('bogus')).toBe('visible')
    expect(normalizeSoftDeleteBehavior(undefined)).toBe('visible')
  })

  it('type guard', () => {
    expect(isSoftDeleteBehavior('silent')).toBe(true)
    expect(isSoftDeleteBehavior('nope')).toBe(false)
  })
})
