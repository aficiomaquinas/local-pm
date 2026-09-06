'use client'

import { Plus, Filter, X } from 'lucide-react'
import type { Project, Team } from '@/payload-types'

interface KanbanHeaderProps {
  projects: Project[]
  teams: Team[]
  selectedProjectId: string | null
  selectedTeamId: string | null
  onProjectChange: (projectId: string | null) => void
  onTeamChange: (teamId: string | null) => void
  onCreateTicket: () => void
}

export function KanbanHeader({
  projects,
  teams,
  selectedProjectId,
  selectedTeamId,
  onProjectChange,
  onTeamChange,
  onCreateTicket,
}: KanbanHeaderProps) {
  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const selectedTeam = teams.find((t) => t.id === selectedTeamId)

  const hasFilters = selectedProjectId || selectedTeamId

  return (
    <div className="flex items-center justify-between px-8 py-5 border-b border-border/50 bg-background/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Board</h1>

        <div className="h-6 w-px bg-border/50" />

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Filter by:</span>
          </div>

          {/* Project Filter */}
          <div className="relative">
            <select
              value={selectedProjectId || ''}
              onChange={(e) => onProjectChange(e.target.value || null)}
              className="appearance-none bg-secondary/50 hover:bg-secondary border border-border/50 rounded-md pl-3 pr-8 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer min-w-[140px]"
            >
              <option value="">All Projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* Team Filter */}
          <div className="relative">
            <select
              value={selectedTeamId || ''}
              onChange={(e) => onTeamChange(e.target.value || null)}
              className="appearance-none bg-secondary/50 hover:bg-secondary border border-border/50 rounded-md pl-3 pr-8 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer min-w-[120px]"
            >
              <option value="">All Teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={() => {
                onProjectChange(null)
                onTeamChange(null)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Active Filters Display */}
        {hasFilters && (
          <div className="flex items-center gap-2 mr-2">
            {selectedProject && (
              <span
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border shadow-sm transition-all hover:shadow-md"
                style={{
                  backgroundColor: `${selectedProject.color}10`,
                  color: selectedProject.color as string,
                  borderColor: `${selectedProject.color}20`,
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: selectedProject.color as string }} />
                {selectedProject.name}
                <button
                  onClick={() => onProjectChange(null)}
                  className="hover:opacity-70 ml-1 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedTeam && (
              <span
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border shadow-sm transition-all hover:shadow-md"
                style={{
                  backgroundColor: `${selectedTeam.color}10`,
                  color: selectedTeam.color as string,
                  borderColor: `${selectedTeam.color}20`,
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: selectedTeam.color as string }} />
                {selectedTeam.name}
                <button
                  onClick={() => onTeamChange(null)}
                  className="hover:opacity-70 ml-1 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Create Button */}
        <button
          onClick={onCreateTicket}
          className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-semibold px-4 py-2 rounded-md shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 text-white" />
          New Ticket
        </button>
      </div>
    </div>
  )
}
