import { describe, expect, it } from 'vitest'
import { AVATAR_TONES, avatarToneFor, initialsFor } from '@/lib/avatar'

describe('initialsFor', () => {
  it('takes the first letter of the first and last word', () => {
    expect(initialsFor('Ada Okonkwo')).toBe('AO')
    expect(initialsFor('Greta Lindqvist')).toBe('GL')
  })

  it('uses a single letter for a one-word name', () => {
    expect(initialsFor('Prince')).toBe('P')
  })

  it('skips the middle names rather than running past two letters', () => {
    expect(initialsFor('Jean Claude Van Damme')).toBe('JD')
  })

  it('collapses extra whitespace', () => {
    expect(initialsFor('  Chen   Wei  ')).toBe('CW')
  })

  it('uppercases', () => {
    expect(initialsFor('ada okonkwo')).toBe('AO')
  })

  it('falls back to ? for an empty or missing name', () => {
    expect(initialsFor('')).toBe('?')
    expect(initialsFor('   ')).toBe('?')
    expect(initialsFor(null)).toBe('?')
    expect(initialsFor(undefined)).toBe('?')
  })

  it('keeps an astral-plane first character whole', () => {
    expect(initialsFor('\u{1D400}lpha Beta')).toBe('\u{1D400}B')
  })
})

describe('avatarToneFor', () => {
  it('is stable for the same seed', () => {
    const first = avatarToneFor('68f0c2a1b3d4e5f601234567')
    for (let i = 0; i < 10; i += 1) {
      expect(avatarToneFor('68f0c2a1b3d4e5f601234567')).toBe(first)
    }
  })

  it('only ever returns an approved tone', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(AVATAR_TONES).toContain(avatarToneFor(`member-${i}`))
    }
  })

  it('spreads across every tone rather than collapsing onto one', () => {
    const seen = new Set(
      Array.from({ length: 500 }, (_, i) => avatarToneFor(`68f0c2a1b3d4e5f6012345${i}`)),
    )
    expect(seen.size).toBe(AVATAR_TONES.length)
  })

  it('handles a missing seed without throwing', () => {
    expect(AVATAR_TONES).toContain(avatarToneFor(null))
    expect(AVATAR_TONES).toContain(avatarToneFor(undefined))
    expect(AVATAR_TONES).toContain(avatarToneFor(''))
  })
})
