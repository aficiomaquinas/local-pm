'use client'

import { useEffect, useState } from 'react'
import type { EntityCollection } from './useEntityQuery'

export function useEntityDoc<T extends { id: string }>(
  collection: EntityCollection,
  id: string | null | undefined,
  seed?: T | null,
  depth = 0,
): T | null {
  const [doc, setDoc] = useState<T | null>(seed ?? null)

  useEffect(() => {
    if (!id) {
      setDoc(null)
      return
    }
    if (seed && seed.id === id) {
      setDoc(seed)
      return
    }

    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/${collection}/${id}?depth=${depth}`, {
          signal: controller.signal,
        })
        if (!response.ok) return
        setDoc((await response.json()) as T)
      } catch {}
    })()

    return () => controller.abort()
  }, [collection, id, seed, depth])

  return doc?.id === id ? doc : null
}
