'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Ticket } from '@/payload-types'

export interface TicketDependencies {
  blockers: Ticket[]
  blocking: Ticket[]
  loading: boolean
  refresh: () => void
}

export function useTicketDependencies(ticket: Ticket): TicketDependencies {
  const [blockers, setBlockers] = useState<Ticket[]>([])
  const [blocking, setBlocking] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  const blockedByIds = (ticket.blockedBy ?? [])
    .map((b) => (typeof b === 'string' ? b : b?.id))
    .filter((id): id is string => Boolean(id))
  const blockedByKey = blockedByIds.join(',')

  useEffect(() => {
    const controller = new AbortController()

    const run = async () => {
      setLoading(true)
      try {
        const ids = blockedByKey ? blockedByKey.split(',') : []

        const blockersRequest = ids.length
          ? fetch(
              `/api/tickets?where[id][in]=${encodeURIComponent(ids.join(','))}&limit=${ids.length}&depth=0`,
              { signal: controller.signal },
            ).then((r) => (r.ok ? r.json() : { docs: [] }))
          : Promise.resolve({ docs: [] })

        const blockingRequest = fetch(
          `/api/tickets?where[blockedBy][equals]=${encodeURIComponent(ticket.id)}&limit=50&depth=0`,
          { signal: controller.signal },
        ).then((r) => (r.ok ? r.json() : { docs: [] }))

        const [blockersData, blockingData] = await Promise.all([blockersRequest, blockingRequest])

        const byId = new Map<string, Ticket>(
          ((blockersData.docs ?? []) as Ticket[]).map((t) => [t.id, t]),
        )
        setBlockers(ids.map((id) => byId.get(id)).filter((t): t is Ticket => Boolean(t)))
        setBlocking((blockingData.docs ?? []) as Ticket[])
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        setBlockers([])
        setBlocking([])
      } finally {
        setLoading(false)
      }
    }

    void run()
    return () => controller.abort()
  }, [ticket.id, blockedByKey, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return { blockers, blocking, loading, refresh }
}
