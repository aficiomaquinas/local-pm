'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)

  const measure = useCallback(() => {
    const element = ref.current
    if (!element) return
    const next = Math.round(element.getBoundingClientRect().width)
    if (next > 0) setWidth(next)
  }, [])

  useEffect(() => {
    measure()

    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [measure])

  return { ref, width }
}
