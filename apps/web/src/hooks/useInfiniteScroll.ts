'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

interface UseInfiniteScrollOptions {
  threshold?: number // pixels from bottom to trigger load
  rootMargin?: string
}

interface UseInfiniteScrollReturn {
  sentinelRef: React.RefObject<HTMLDivElement | null>
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
}

export function useInfiniteScroll(
  onLoadMore: () => Promise<void>,
  hasMore: boolean,
  options: UseInfiniteScrollOptions = {}
): UseInfiniteScrollReturn {
  const { threshold = 100, rootMargin = '100px' } = options
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const loadingRef = useRef(false)

  const handleLoadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return

    loadingRef.current = true
    setIsLoading(true)

    try {
      await onLoadMore()
    } finally {
      loadingRef.current = false
      setIsLoading(false)
    }
  }, [onLoadMore, hasMore])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting && hasMore && !loadingRef.current) {
          handleLoadMore()
        }
      },
      {
        rootMargin,
        threshold: 0,
      }
    )

    observer.observe(sentinel)

    return () => {
      observer.disconnect()
    }
  }, [handleLoadMore, hasMore, rootMargin])

  return {
    sentinelRef,
    isLoading,
    setIsLoading,
  }
}
