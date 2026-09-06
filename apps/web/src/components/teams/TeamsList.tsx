'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, MoreHorizontal, Pencil, Trash2, Users, Eye, Loader2 } from 'lucide-react'
import { TeamModal } from './TeamModal'
import { TeamDetailModal } from './TeamDetailModal'
import { TicketDetailModal } from '@/components/kanban/TicketDetailModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'

import type { Team, Project, Ticket } from '@/payload-types'

interface PaginationInfo {
  page: number
  totalPages: number
  hasNextPage: boolean
}

interface TeamsListProps {
  initialTeams: Team[]
  initialPagination?: PaginationInfo
}

export function TeamsList({ initialTeams, initialPagination }: TeamsListProps) {
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [viewingTeam, setViewingTeam] = useState<Team | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Pagination state
  const [pagination, setPagination] = useState<PaginationInfo>(
    initialPagination || { page: 1, totalPages: 1, hasNextPage: false }
  )

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    team: Team
    ticketCount: number
  } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Ticket detail modal state
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [projects, setProjects] = useState<Project[]>([])

  // Load more teams for infinite scroll
  const loadMoreTeams = useCallback(async () => {
    if (!pagination.hasNextPage) return

    try {
      const nextPage = pagination.page + 1
      const response = await fetch(`/api/teams?page=${nextPage}&limit=20&sort=-createdAt`)
      const data = await response.json()

      if (data.docs && data.docs.length > 0) {
        setTeams((prev) => [...prev, ...data.docs])
        setPagination({
          page: data.page,
          totalPages: data.totalPages,
          hasNextPage: data.hasNextPage,
        })
      }
    } catch (error) {
      console.error('Failed to load more teams:', error)
    }
  }, [pagination])

  const { sentinelRef, isLoading: isLoadingMore } = useInfiniteScroll(
    loadMoreTeams,
    pagination.hasNextPage
  )

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    // Load projects for ticket detail modal
    const loadProjects = async () => {
      try {
        const response = await fetch('/api/projects?limit=100')
        const data = await response.json()
        setProjects(data.docs || [])
      } catch (error) {
        console.error('Failed to load projects:', error)
      }
    }
    loadProjects()
  }, [])

  const handleCreateTeam = () => {
    setEditingTeam(null)
    setIsModalOpen(true)
  }

  const handleViewTeam = (team: Team) => {
    setViewingTeam(team)
    setMenuOpen(null)
  }

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team)
    setIsModalOpen(true)
    setMenuOpen(null)
  }

  const handleInitiateDelete = async (team: Team) => {
    setMenuOpen(null)

    // Fetch ticket count for this team
    try {
      const response = await fetch(`/api/tickets?where[team][equals]=${team.id}&limit=0`)
      const data = await response.json()
      const ticketCount = data.totalDocs || 0

      setDeleteConfirm({ team, ticketCount })
    } catch (error) {
      console.error('Failed to fetch ticket count:', error)
      setDeleteConfirm({ team, ticketCount: -1 })
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return

    setIsDeleting(true)
    try {
      const { team } = deleteConfirm

      // Delete the team (tickets will be orphaned, not deleted)
      await fetch(`/api/teams/${team.id}`, { method: 'DELETE' })
      setTeams((prev) => prev.filter((t) => t.id !== team.id))
      setDeleteConfirm(null)
    } catch (error) {
      console.error('Failed to delete team:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleTeamSaved = (savedTeam: Team) => {
    if (editingTeam) {
      setTeams((prev) =>
        prev.map((t) => (t.id === savedTeam.id ? savedTeam : t))
      )
    } else {
      setTeams((prev) => [savedTeam, ...prev])
    }
    setIsModalOpen(false)
    setEditingTeam(null)
  }

  const handleTeamUpdated = (updatedTeam: Team) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === updatedTeam.id ? updatedTeam : t))
    )
    setViewingTeam(updatedTeam)
  }

  const handleTeamDeleted = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId)
    if (team) {
      handleInitiateDelete(team)
    }
    setViewingTeam(null)
  }

  const handleTicketClick = (ticket: Ticket) => {
    setSelectedTicket(ticket)
  }

  const handleTicketUpdate = (updatedTicket: Ticket) => {
    setSelectedTicket(updatedTicket)
  }

  const handleTicketDelete = async (ticketId: string) => {
    try {
      await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' })
      setSelectedTicket(null)
    } catch (error) {
      console.error('Failed to delete ticket:', error)
    }
  }

  const getDeleteMessage = () => {
    if (!deleteConfirm) return ''
    const { team, ticketCount } = deleteConfirm

    if (ticketCount === -1) {
      return `Are you sure you want to delete "${team.name}"?\n\nTickets assigned to this team will become unassigned.`
    }

    if (ticketCount === 0) {
      return `Are you sure you want to delete "${team.name}"?\n\nNo tickets are assigned to this team.`
    }

    return `Are you sure you want to delete "${team.name}"?\n\n${ticketCount} ticket${ticketCount === 1 ? ' is' : 's are'} assigned to this team and will become unassigned.`
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Teams</h1>
        <button
          onClick={handleCreateTeam}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Team
        </button>
      </div>

      {/* Teams Grid */}
      {teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Users className="w-12 h-12 text-gray-500 mb-4" />
          <h2 className="text-lg font-medium text-white mb-2">No teams yet</h2>
          <p className="text-gray-400 mb-4">Create your first team to organize work</p>
          <button
            onClick={handleCreateTeam}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Team
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => (
              <div
                key={team.id}
                onClick={() => handleViewTeam(team)}
                className="bg-[#18181b] border border-[#27272a] rounded-lg p-4 hover:border-[#3f3f46] transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${team.color}20` }}
                    >
                      <Users
                        className="w-5 h-5"
                        style={{ color: team.color as string }}
                      />
                    </div>
                    <div>
                      <h3 className="text-white font-medium">{team.name}</h3>
                      <span className="text-xs text-gray-500">
                      </span>
                    </div>
                  </div>

                  <div className="relative" ref={menuOpen === team.id ? menuRef : null}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpen(menuOpen === team.id ? null : team.id)
                      }}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {menuOpen === team.id && (
                      <div className="absolute right-0 top-full mt-1 bg-[#27272a] border border-[#3f3f46] rounded-md shadow-lg py-1 z-10 min-w-[120px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewTeam(team)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3f3f46] transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditTeam(team)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3f3f46] transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleInitiateDelete(team)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-[#3f3f46] transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            ))}
          </div>

          {/* Infinite scroll sentinel and loading indicator */}
          <div ref={sentinelRef} className="h-4" />
          {isLoadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          )}
        </>
      )}

      <TeamModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        team={editingTeam}
        onSave={handleTeamSaved}
      />

      {viewingTeam && (
        <TeamDetailModal
          isOpen={!!viewingTeam}
          onClose={() => setViewingTeam(null)}
          team={viewingTeam}
          onUpdate={handleTeamUpdated}
          onDelete={handleTeamDeleted}
          onTicketClick={handleTicketClick}
        />
      )}

      {selectedTicket && (
        <TicketDetailModal
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          ticket={selectedTicket}
          projects={projects}
          teams={teams}
          allTickets={[]}
          onUpdate={handleTicketUpdate}
          onDelete={handleTicketDelete}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Team"
        message={getDeleteMessage()}
        confirmText="Delete Team"
        isDestructive={true}
        isLoading={isDeleting}
      />
    </div>
  )
}
