'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export type ShortcutScope = 'global' | 'board' | 'list' | 'item' | 'dialog'

export interface Shortcut {
  id: string

  keys: string

  description: string

  group: string
  scope: ShortcutScope
  run: (event: KeyboardEvent) => void

  allowInInput?: boolean

  hidden?: boolean
}

interface Registry {
  register: (shortcut: Shortcut) => () => void

  shortcuts: Shortcut[]

  format: (keys: string) => string
}

const ShortcutContext = createContext<Registry | null>(null)

const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

export function formatKeys(keys: string): string {
  const mod = isMac() ? '⌘' : 'Ctrl'
  return keys
    .split(' ')
    .map((chord) =>
      chord
        .split('+')
        .map((part) => {
          if (part === 'mod') return mod
          if (part === 'shift') return isMac() ? '⇧' : 'Shift'
          if (part === 'alt') return isMac() ? '⌥' : 'Alt'
          if (part === 'enter') return '↵'
          if (part === 'backspace') return isMac() ? '⌫' : 'Backspace'
          if (part === 'escape') return 'Esc'
          if (part === 'slash') return '/'
          if (part === 'backslash') return '\\'
          return part.length === 1 ? part.toUpperCase() : part
        })
        .join(isMac() ? '' : '+'),
    )
    .join(' then ')
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable ||
    el.closest('[contenteditable="true"]') !== null ||
    el.getAttribute('role') === 'textbox'
  )
}

function chordFrom(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('mod')
  if (e.altKey) parts.push('alt')

  if (e.shiftKey && e.key.length > 1) parts.push('shift')

  let key = e.key
  if (key === ' ') key = 'space'
  else if (key === 'Escape') key = 'escape'
  else if (key === 'Enter') key = 'enter'
  else if (key === 'Backspace') key = 'backspace'
  else if (key === '/') key = 'slash'
  else if (key === '\\') key = 'backslash'
  else if (key.length === 1) key = key.toLowerCase()

  parts.push(key)
  return parts.join('+')
}

const CHORD_WINDOW_MS = 1000

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const registry = useRef(new Map<string, Shortcut>())
  const [version, setVersion] = useState(0)
  const pending = useRef<{ prefix: string; at: number } | null>(null)

  const register = useCallback((shortcut: Shortcut) => {
    registry.current.set(shortcut.id, shortcut)
    setVersion((v) => v + 1)
    return () => {
      registry.current.delete(shortcut.id)
      setVersion((v) => v + 1)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const all = Array.from(registry.current.values())
      const chord = chordFrom(e)
      const editable = isEditableTarget(e.target)
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey

      const prefix = pending.current
      if (prefix && Date.now() - prefix.at < CHORD_WINDOW_MS) {
        pending.current = null
        const combined = `${prefix.prefix} ${chord}`
        const match = all.find((s) => s.keys === combined)
        if (match) {
          e.preventDefault()
          match.run(e)
        }

        return
      }
      pending.current = null

      if (!editable && !hasModifier && all.some((s) => s.keys.startsWith(`${chord} `))) {
        pending.current = { prefix: chord, at: Date.now() }
        e.preventDefault()
        return
      }

      const match = all.find((s) => s.keys === chord)
      if (!match) return
      if (editable && !match.allowInInput && !hasModifier) return

      e.preventDefault()
      match.run(e)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const value = useMemo<Registry>(
    () => ({
      register,

      shortcuts: (() => {
        void version
        return Array.from(registry.current.values())
      })(),
      format: formatKeys,
    }),
    [register, version],
  )

  return <ShortcutContext.Provider value={value}>{children}</ShortcutContext.Provider>
}

export function useShortcutRegistry(): Registry {
  const ctx = useContext(ShortcutContext)
  if (!ctx) throw new Error('useShortcutRegistry must be used inside <ShortcutProvider>')
  return ctx
}

export function useShortcut(
  spec: Omit<Shortcut, 'run'> & { run: (event: KeyboardEvent) => void; enabled?: boolean },
) {
  const { register } = useShortcutRegistry()
  const runRef = useRef(spec.run)
  runRef.current = spec.run

  const { id, keys, description, group, scope, allowInInput, hidden, enabled = true } = spec

  useEffect(() => {
    if (!enabled) return
    return register({
      id,
      keys,
      description,
      group,
      scope,
      allowInInput,
      hidden,
      run: (event) => runRef.current(event),
    })
  }, [register, id, keys, description, group, scope, allowInInput, hidden, enabled])
}
