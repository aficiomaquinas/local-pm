'use client'

import { useEffect, useRef, useState } from 'react'
export function useTicketDraft<T>(
  key: string | null,
  value: T,
  dirty: boolean,
  valid: (value: unknown) => value is T,
) {
  const [recovered, setRecovered] = useState<T | null>(null)
  const [ready, setReady] = useState(false)
  const [saved, setSaved] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const stopped = useRef(false)
  const validate = useRef(valid)
  validate.current = valid

  useEffect(() => {
    if (!key) return
    try {
      const raw = sessionStorage.getItem(key)
      if (raw) {
        const draft: unknown = JSON.parse(raw)
        if (validate.current(draft)) setRecovered(draft)
      }
    } catch {
      setUnavailable(true)
    }
    setReady(true)
  }, [key])

  useEffect(() => {
    if (!key || !ready || recovered || stopped.current) return
    if (!dirty) {
      try {
        sessionStorage.removeItem(key)
      } catch {}
      setSaved(false)
      return
    }
    setSaved(false)
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(key, JSON.stringify(value))
        setSaved(true)
        setUnavailable(false)
      } catch {
        setUnavailable(true)
      }
    }, 400)
    const flush = () => {
      if (!stopped.current) {
        try {
          sessionStorage.setItem(key, JSON.stringify(value))
        } catch {}
      }
    }
    window.addEventListener('pagehide', flush)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [key, value, dirty, ready, recovered])

  const clear = () => {
    stopped.current = true
    if (key) {
      try {
        sessionStorage.removeItem(key)
      } catch {}
    }
    setRecovered(null)
    setSaved(false)
  }
  const dismiss = () => {
    if (key) {
      try {
        sessionStorage.removeItem(key)
      } catch {}
    }
    setRecovered(null)
  }
  return { recovered, saved, unavailable, dismiss, clear }
}
