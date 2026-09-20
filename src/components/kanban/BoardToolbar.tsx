'use client'

import { useEffect, useRef } from 'react'
import { FolderKanban, Plus, Search, Users, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/shortcuts'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { projectIcon } from '@/components/ui/EntityMark'
import type { Project, Team } from '@/payload-types'

export interface BoardFilters {
  projectId: string | null
  teamId: string | null
  query: string
}

export function BoardToolbar({
  projects,
  teams,
  filters,
  onChange,
  resultCount,
  onCreateTicket,
}: {
  projects: Project[]
  teams: Team[]
  filters: BoardFilters
  onChange: (next: Partial<BoardFilters>) => void
  resultCount: number
  onCreateTicket: () => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  const selectedProject = projects.find((p) => p.id === filters.projectId)
  const selectedTeam = teams.find((t) => t.id === filters.teamId)
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
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-text">Board</h1>

        <label className="relative flex h-8 min-w-48 flex-1 items-center gap-2 rounded-sm border border-border bg-surface px-2.5 md:max-w-80">
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
          <kbd className="hidden shrink-0 font-sans text-xs text-text-muted can-hover:inline">/</kbd>
        </label>

        <div className="flex items-center gap-2 max-sm:w-full">
          <Select
            id="board-project-filter"
            aria-label="Filter by project"
            value={filters.projectId ?? ''}
            onValueChange={(next) => onChange({ projectId: next || null })}
            className="w-40 max-sm:w-auto max-sm:flex-1"
            options={[
              { value: '', label: 'All projects', icon: FolderKanban },
              ...projects.map((project) => ({
                value: project.id,
                label: project.name,
                icon: projectIcon(project.icon),
                swatch: project.color,
              })),
            ]}
          />

          <Select
            id="board-team-filter"
            aria-label="Filter by team"
            value={filters.teamId ?? ''}
            onValueChange={(next) => onChange({ teamId: next || null })}
            className="w-36 max-sm:w-auto max-sm:flex-1"
            options={[
              { value: '', label: 'All teams', icon: Users },
              ...teams.map((team) => ({
                value: team.id,
                label: team.name,
                icon: Users,
                swatch: team.color,
              })),
            ]}
          />
        </div>

        <Button variant="primary" icon={Plus} onClick={onCreateTicket} className="ml-auto" shortcut="C">
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
          <Chip
            tone="accent"
            onRemove={() => onChange({ query: '' })}
            removeLabel="Clear the search"
          >
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
