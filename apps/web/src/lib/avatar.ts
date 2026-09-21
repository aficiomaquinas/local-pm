import type { Tone } from './status'

export const AVATAR_TONES: Tone[] = ['accent', 'info', 'success', 'warning', 'danger', 'neutral']

export function initialsFor(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'

  const first = Array.from(words[0])[0] ?? ''
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function avatarToneFor(seed: string | null | undefined): Tone {
  const key = seed ?? ''
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}
