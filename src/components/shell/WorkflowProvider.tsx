'use client'

import { createContext, useCallback, useContext, useMemo } from 'react'
import type { Status } from '@/payload-types'

interface WorkflowRegistry {
  statuses: Status[]
  statusesForProject: (projectId: string | null | undefined) => Status[]
  statusById: (id: string | null | undefined) => Status | undefined
}

const WorkflowContext = createContext<WorkflowRegistry | null>(null)

export function WorkflowProvider({
  statuses,
  children,
}: {
  statuses: Status[]
  children: React.ReactNode
}) {
  const globals = useMemo(() => statuses.filter((entry) => !entry.project), [statuses])

  const statusesForProject = useCallback(
    (projectId: string | null | undefined) => {
      if (!projectId) return globals
      const scoped = statuses.filter((entry) => {
        const project = entry.project
        if (!project) return false
        return (typeof project === 'string' ? project : project.id) === projectId
      })
      return [...globals, ...scoped].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    },
    [globals, statuses],
  )

  const byId = useMemo(() => new Map(statuses.map((entry) => [entry.id, entry])), [statuses])

  const statusById = useCallback(
    (id: string | null | undefined) => (id ? byId.get(id) : undefined),
    [byId],
  )

  const value = useMemo<WorkflowRegistry>(
    () => ({ statuses, statusesForProject, statusById }),
    [statuses, statusesForProject, statusById],
  )

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
}

export function useWorkflow(): WorkflowRegistry {
  const ctx = useContext(WorkflowContext)
  if (!ctx) throw new Error('useWorkflow must be used inside <WorkflowProvider>')
  return ctx
}
