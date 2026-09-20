'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const HASH = /^#comment-([A-Za-z0-9_-]{1,64})$/

function fromHash(): string | null {
  if (typeof window === 'undefined') return null
  return HASH.exec(window.location.hash)?.[1] ?? null
}

export interface CommentPermalink {
  target: string | null
  ready: boolean
  clear: () => void
}

export function useCommentPermalink(loaded: boolean): CommentPermalink {
  const [target, setTarget] = useState<string | null>(null)
  const scrolled = useRef<string | null>(null)

  useEffect(() => {
    setTarget(fromHash())
    const onHash = () => {
      const next = fromHash()
      if (next !== scrolled.current) scrolled.current = null
      setTarget(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!target || !loaded || scrolled.current === target) return

    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(`comment-${target}`)
      if (!el) return
      scrolled.current = target

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
      el.focus({ preventScroll: true })
    })

    return () => cancelAnimationFrame(frame)
  }, [target, loaded])

  const clear = useCallback(() => {
    scrolled.current = null
    setTarget(null)
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    }
  }, [])

  return { target, ready: loaded, clear }
}
