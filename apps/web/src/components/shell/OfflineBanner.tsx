'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      className="flex flex-none items-center justify-center gap-2 border-b border-warning-border bg-warning-subtle px-4 py-1.5 text-base text-warning-text"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      You&rsquo;re offline — changes won&rsquo;t save until you reconnect.
    </div>
  )
}
