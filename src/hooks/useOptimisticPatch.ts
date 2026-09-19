'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function useOptimisticPatch<T extends { id: string }>({
  collection,
  record,
  onApply,
}: {
  collection: 'tickets' | 'projects' | 'teams'
  record: T

  onApply: (next: T) => void
}) {
  const { toast } = useToast()
  const [state, setState] = useState<SaveState>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordRef = useRef(record)
  recordRef.current = record

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    },
    [],
  )

  const patch = useCallback(
    async (changes: Partial<T>, label: string) => {
      const previous = recordRef.current
      const optimistic = { ...previous, ...changes }

      onApply(optimistic)
      setState('saving')

      try {
        const response = await fetch(`/api/${collection}/${previous.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        })

        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.errors?.[0]?.message || `${response.status} ${response.statusText}`)
        }
        const saved = await response.json()
        onApply((saved.doc ?? saved) as T)
        setState('saved')
        if (resetTimer.current) clearTimeout(resetTimer.current)
        resetTimer.current = setTimeout(() => setState('idle'), 2000)
        return true
      } catch (error) {
        onApply(previous)
        setState('error')
        toast({
          tone: 'error',
          title: `Couldn't save ${label}`,
          description: error instanceof Error ? error.message : 'The change has been undone.',
        })
        return false
      }
    },
    [collection, onApply, toast],
  )

  return { patch, state }
}

export function saveStateLabel(state: SaveState): string | null {
  if (state === 'saving') return 'Saving…'
  if (state === 'saved') return 'Saved'
  if (state === 'error') return 'Not saved'
  return null
}
