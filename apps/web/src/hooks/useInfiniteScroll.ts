'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

interface UseInfiniteScrollOptions {
  /**
   * IntersectionObserver intersection RATIO, between 0 and 1 — the fraction of
   * the sentinel that must be visible before loading the next page. 0 (the
   * default) fires as soon as a single pixel crosses the root bounds.
   *
   * Upstream d7747b6 port: this was previously typed and documented as
   * "pixels from bottom" while being hard-coded to 0 at the observer, so the
   * mismatch was invisible. Distance from the bottom is what `rootMargin`
   * expresses; a ratio is what IntersectionObserver's `threshold` means, and
   * values above 1 make the constructor throw a RangeError.
   */
  threshold?: number
  /** Distance from the root bounds at which to pre-load, e.g. '100px'. */
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
  const { threshold = 0, rootMargin = '100px' } = options
  // Guard the observer contract: a caller still passing the old pixel-style
  // value would otherwise throw a RangeError and kill infinite scroll outright.
  const safeThreshold = Math.min(1, Math.max(0, threshold))
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
        // Was hard-coded to 0, so the documented `threshold` option was
        // silently ignored. Spotted by Brian Tafoya (@btafoya); upstream
        // d7747b6 port.
        threshold: safeThreshold,
      }
    )

    observer.observe(sentinel)

    return () => {
      observer.disconnect()
    }
  }, [handleLoadMore, hasMore, rootMargin, safeThreshold])

  return {
    sentinelRef,
    isLoading,
    setIsLoading,
  }
}
