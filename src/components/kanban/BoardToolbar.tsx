'use client'

import { useEffect, useRef } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/shortcuts'
import { useEntityDoc } from '@/hooks/useEntityDoc'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Badge'
import { Kbd } from '@/components/ui/Kbd'
import { ProjectSelect, TeamSelect } from '@/components/ui/EntityPickers'
import type { Project, Team } from '@/payload-types'

export interface BoardFilters {
  projectId: string | null
  teamId: string | null
  query: string
}

export function BoardToolbar({
  filters,
  onChange,
  resultCount,
  onCreateTicket,
}: {
  filters: BoardFilters
  onChange: (next: Partial<BoardFilters>) => void
  resultCount: number
  onCreateTicket: () => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)

  const selectedProject = useEntityDoc<Project>('projects', filters.projectId)
  const selectedTeam = useEntityDoc<Team>('teams', filters.teamId)
  const hasFilters = Boolean(filters.projectId || filters.teamId || filters.query)

  useShortcut({
    id: 'board.search',
    keys: 'slash',
    description: 'Focus the board search',
    group: 'Board',
    scope: 'board',
    run: () => searchRef.current?.focus(),
  })

  useShortcut({
    id: 'board.create',
    keys: 'c',
    description: 'Create a ticket',
    group: 'Board',
    scope: 'board',
    run: onCreateTicket,
  })

  useEffect(() => {
    const el = searchRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && filters.query) {
        e.stopPropagation()
        onChange({ query: '' })
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [filters.query, onChange])

  return (
    <div className="flex flex-none flex-col gap-3 border-b border-border-subtle px-6 py-3 max-md:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-1 shrink-0 text-xl font-semibold text-text">Board</h1>

        <label className="relative flex h-8 min-w-44 flex-1 items-center gap-2 rounded-sm border border-border bg-surface px-2.5 md:max-w-72">
          <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
          <span className="sr-only">Search tickets on this board</span>
          <input
            ref={searchRef}
            type="search"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="Search tickets"
            className="min-w-0 flex-1 bg-transparent text-base text-text outline-none max-sm:text-md"
          />
          <Kbd raw="/" className="max-sm:hidden" />
        </label>

        <ProjectSelect
          id="board-project-filter"
          aria-label="Filter by project"
          value={filters.projectId ?? ''}
          allLabel="All projects"
          className="w-44 max-sm:w-full"
          onChange={(next) => onChange({ projectId: next || null })}
        />

        <TeamSelect
          id="board-team-filter"
          aria-label="Filter by team"
          value={filters.teamId ?? ''}
          allLabel="All teams"
          className="w-40 max-sm:w-full"
          onChange={(next) => onChange({ teamId: next || null })}
        />

        <Button
          variant="primary"
          icon={Plus}
          onClick={onCreateTicket}
          className="ml-auto max-sm:w-full"
          shortcut="c"
        >
          New ticket
        </Button>
      </div>

      <div className={cn('flex flex-wrap items-center gap-2', !hasFilters && 'hidden')}>
        <span className="text-xs text-text-muted tabular" aria-live="polite">
          {resultCount} {resultCount === 1 ? 'ticket' : 'tickets'}
        </span>

        {selectedProject && (
          <Chip
            tone="accent"
            onRemove={() => onChange({ projectId: null })}
            removeLabel={`Remove project filter ${selectedProject.name}`}
          >
            Project: {selectedProject.name}
          </Chip>
        )}
        {selectedTeam && (
          <Chip
            tone="accent"
            onRemove={() => onChange({ teamId: null })}
            removeLabel={`Remove team filter ${selectedTeam.name}`}
          >
            Team: {selectedTeam.name}
          </Chip>
        )}
        {filters.query && (
          <Chip tone="accent" onRemove={() => onChange({ query: '' })} removeLabel="Clear the search">
            Search: {filters.query}
          </Chip>
        )}

        <Button
          variant="ghost"
          size="sm"
          icon={X}
          onClick={() => onChange({ projectId: null, teamId: null, query: '' })}
        >
          Clear all
        </Button>
      </div>
    </div>
  )
}
