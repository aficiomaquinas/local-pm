'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { bringBelowHeader } from '@/lib/scroll'

const HASH = /^#comment-([A-Za-z0-9_-]{1,64})$/
const FIND_TIMEOUT_MS = 6000
const FIND_INTERVAL_MS = 100
const SETTLE_MS = 2000
const RETRIES = [120, 400, 900]

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
  const settled = useRef<string | null>(null)
  const arrived = useRef(false)

  useEffect(() => {
    setTarget(fromHash())
    const onHash = () => {
      const next = fromHash()
      if (next !== settled.current) settled.current = null
      setTarget(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!target || !loaded || settled.current === target) return

    let active = true
    let element: HTMLElement | null = null
    const timers: number[] = []

    const onAssetLoad = (event: Event) => {
      if (active && element && event.target instanceof HTMLImageElement) {
        bringBelowHeader(element)
      }
    }

    const stop = () => {
      if (!active) return
      active = false
      for (const timer of timers) window.clearTimeout(timer)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('keydown', stop)
      document.removeEventListener('load', onAssetLoad, true)
    }

    const hold = (el: HTMLElement) => {
      element = el
      settled.current = target

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const behavior: ScrollBehavior = arrived.current && !reduced ? 'smooth' : 'auto'
      arrived.current = true

      bringBelowHeader(el, behavior)
      el.focus({ preventScroll: true })

      for (const delay of RETRIES) {
        timers.push(window.setTimeout(() => active && bringBelowHeader(el), delay))
      }
      timers.push(window.setTimeout(stop, SETTLE_MS))

      window.addEventListener('wheel', stop, { passive: true })
      window.addEventListener('touchstart', stop, { passive: true })
      window.addEventListener('keydown', stop)
      document.addEventListener('load', onAssetLoad, true)
    }

    const deadline = Date.now() + FIND_TIMEOUT_MS
    const find = () => {
      if (!active) return
      const el = document.getElementById(`comment-${target}`)
      if (el) {
        hold(el)
        return
      }
      if (Date.now() < deadline) timers.push(window.setTimeout(find, FIND_INTERVAL_MS))
    }

    find()

    return stop
  }, [target, loaded])

  const clear = useCallback(() => {
    settled.current = null
    setTarget(null)
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    }
  }, [])

  return { target, ready: loaded, clear }
}
