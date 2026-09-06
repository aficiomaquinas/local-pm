'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Pencil,
  Save,
  Trash2,
  Calendar,
  Users,
  FileText,
  Loader2,
  ChevronDown,
  Maximize2,
  Minimize2,
  ExternalLink,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { PROJECT_COLORS, TicketStatus } from '@/types/enums'
import { RichTextEditor, RichTextDisplay } from '@/components/ui/RichTextEditor'
import type { Team, Ticket } from '@/payload-types'

interface TeamDetailModalProps {
  isOpen: boolean
  onClose: () => void
  team: Team
  onUpdate: (team: Team) => void
  onDelete: (teamId: string) => void
  onTicketClick?: (ticket: Ticket) => void
}

export function TeamDetailModal({
  isOpen,
  onClose,
  team: initialTeam,
  onUpdate,
  onDelete,
  onTicketClick,
}: TeamDetailModalProps) {
  const router = useRouter()
  const [team, setTeam] = useState(initialTeam)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isLoadingTickets, setIsLoadingTickets] = useState(false)
  const [ticketPagination, setTicketPagination] = useState({
    page: 1,
    hasNextPage: false,
    totalDocs: 0,
  })
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Form state
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState<string>(team.description as unknown as string || '')
  const [color, setColor] = useState(team.color || '#6366f1')

  useEffect(() => {
    if (isOpen) {
      setTeam(initialTeam)
      setName(initialTeam.name)
      setDescription(initialTeam.description as unknown as string || '')
      setColor(initialTeam.color || '#6366f1')
      loadTickets()
    }
  }, [isOpen, initialTeam])

  const loadTickets = async () => {
    setIsLoadingTickets(true)
    try {
      const response = await fetch(`/api/tickets?where[team][equals]=${initialTeam.id}&limit=20&page=1&depth=1`)
      const data = await response.json()
      setTickets(data.docs || [])
      setTicketPagination({
        page: data.page || 1,
        hasNextPage: data.hasNextPage || false,
        totalDocs: data.totalDocs || 0,
      })
    } catch (error) {
      console.error('Failed to load tickets:', error)
    } finally {
      setIsLoadingTickets(false)
    }
  }

  const loadMoreTickets = async () => {
    if (!ticketPagination.hasNextPage || isLoadingMore) return

    setIsLoadingMore(true)
    try {
      const nextPage = ticketPagination.page + 1
      const response = await fetch(`/api/tickets?where[team][equals]=${initialTeam.id}&limit=20&page=${nextPage}&depth=1`)
      const data = await response.json()

      if (data.docs && data.docs.length > 0) {
        setTickets((prev) => [...prev, ...data.docs])
        setTicketPagination({
          page: data.page || nextPage,
          hasNextPage: data.hasNextPage || false,
          totalDocs: data.totalDocs || 0,
        })
      }
    } catch (error) {
      console.error('Failed to load more tickets:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const ticketStats = {
    total: tickets.length,
    todo: tickets.filter(t => t.status === TicketStatus.TODO).length,
    inProgress: tickets.filter(t => t.status === TicketStatus.IN_PROGRESS).length,
    done: tickets.filter(t => t.status === TicketStatus.DONE).length,
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch(`/api/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || null, color }),
      })

      if (!response.ok) throw new Error('Failed to update team')

      const updated = await response.json()
      const updatedTeam = updated.doc || updated
      setTeam(updatedTeam)
      onUpdate(updatedTeam)
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save team:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = () => {
    onDelete(team.id)
    onClose()
  }

  const handleCancel = () => {
    setName(team.name)
    setDescription(team.description as unknown as string || '')
    setColor(team.color || '#6366f1')
    setIsEditing(false)
  }

  const handleViewOnBoard = () => {
    onClose()
    router.push(`/board?team=${team.id}`)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (!isOpen) return null

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm ${isFullScreen ? '' : 'p-4'}`}>
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className={`relative bg-card border border-border/50 overflow-hidden transition-all duration-200 ${
          isFullScreen
            ? 'w-full h-full max-w-none rounded-none border-none'
            : 'w-full max-w-2xl mx-4 max-h-[90vh] rounded-xl'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#18181b] border-b border-[#27272a] px-6 py-4 flex items-center justify-between z-10">
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
            {isEditing ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-lg font-semibold bg-[#1f1f23] border border-[#27272a] rounded-md px-3 py-1 text-white focus:outline-none focus:border-indigo-500"
              />
            ) : (
              <h2 className="text-lg font-semibold text-white">{team.name}</h2>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  title={isFullScreen ? 'Exit full screen' : 'Full screen'}
                >
                  {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className={`overflow-y-auto ${isFullScreen ? 'h-[calc(100vh-73px)]' : 'max-h-[calc(90vh-73px)]'}`}>
          <div className={`p-6 ${isFullScreen ? 'max-w-7xl mx-auto' : ''}`}>
            {isFullScreen ? (
              /* Fullscreen: Two-column layout */
              <div className="flex gap-8">
                {/* Left Column - Main Content */}
                <div className="flex-1 min-w-0 space-y-6 overflow-hidden">
                  {/* Description */}
                  <div className="bg-[#1f1f23] rounded-lg p-4 overflow-hidden">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                      <FileText className="w-3 h-3" />
                      Description
                    </div>
                    <div className="overflow-hidden break-words">
                      {isEditing ? (
                        <RichTextEditor
                          value={description}
                          onChange={setDescription}
                          placeholder="Describe the team's responsibilities, goals, and expertise..."
                        />
                      ) : (
                        <RichTextDisplay content={team.description as unknown as string || ''} />
                      )}
                    </div>
                  </div>

                  {/* Statistics */}
                  <div className="bg-[#1f1f23] rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-400 mb-4">Assigned Tickets</h3>
                    {isLoadingTickets ? (
                      <div className="text-sm text-gray-500">Loading...</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">Total Assigned</span>
                          <span className="text-sm font-medium text-white">{ticketStats.total}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">Todo</span>
                          <span className="text-sm font-medium text-gray-400">{ticketStats.todo}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">In Progress</span>
                          <span className="text-sm font-medium text-blue-400">{ticketStats.inProgress}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">Done</span>
                          <span className="text-sm font-medium text-green-400">{ticketStats.done}</span>
                        </div>

                        {ticketStats.total > 0 && (
                          <div className="pt-2">
                            <div className="h-2 bg-[#27272a] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 transition-all"
                                style={{ width: `${(ticketStats.done / ticketStats.total) * 100}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {Math.round((ticketStats.done / ticketStats.total) * 100)}% complete
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Assigned Tickets */}
                  <div className="bg-[#1f1f23] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-medium text-gray-400">
                        Assigned Tickets {ticketPagination.totalDocs > 0 && `(${ticketPagination.totalDocs})`}
                      </h3>
                      <button
                        onClick={handleViewOnBoard}
                        className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View on Board
                      </button>
                    </div>
                    {isLoadingTickets ? (
                      <div className="text-sm text-gray-500">Loading...</div>
                    ) : tickets.length === 0 ? (
                      <p className="text-sm text-gray-500">No tickets assigned to this team.</p>
                    ) : (
                      <div className="space-y-2">
                        {tickets.map((ticket) => {
                          const project = typeof ticket.project === 'object' ? ticket.project : null
                          return (
                            <div
                              key={ticket.id}
                              onClick={() => onTicketClick?.(ticket)}
                              className={`flex items-center gap-3 p-2 bg-[#27272a] rounded-md ${
                                onTicketClick ? 'cursor-pointer hover:bg-[#3f3f46] transition-colors' : ''
                              }`}
                            >
                              {project && (
                                <span
                                  className="text-xs font-medium px-2 py-0.5 rounded"
                                  style={{
                                    backgroundColor: `${project.color}20`,
                                    color: project.color as string,
                                  }}
                                >
                                  {ticket.ticketId}
                                </span>
                              )}
                              <span className="flex-1 text-sm text-white truncate">
                                {ticket.title}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                ticket.status === TicketStatus.TODO ? 'bg-gray-500/20 text-gray-400' :
                                ticket.status === TicketStatus.IN_PROGRESS ? 'bg-blue-500/20 text-blue-400' :
                                'bg-green-500/20 text-green-400'
                              }`}>
                                {ticket.status === TicketStatus.TODO ? 'Todo' :
                                 ticket.status === TicketStatus.IN_PROGRESS ? 'In Progress' : 'Done'}
                              </span>
                            </div>
                          )
                        })}

                        {ticketPagination.hasNextPage && (
                          <button
                            onClick={loadMoreTickets}
                            disabled={isLoadingMore}
                            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-gray-400 hover:text-white bg-[#27272a] hover:bg-[#3f3f46] rounded-md transition-colors disabled:opacity-50"
                          >
                            {isLoadingMore ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Loading...
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3 h-3" />
                                Load more ({ticketPagination.totalDocs - tickets.length} remaining)
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - Metadata */}
                <div className="w-80 shrink-0 space-y-6">
                  {/* Color */}
                  {isEditing && (
                    <div className="bg-[#1f1f23] rounded-lg p-4">
                      <label className="block text-xs text-gray-500 mb-2">Color</label>
                      <div className="grid grid-cols-6 gap-2">
                        {PROJECT_COLORS.map((colorOption) => (
                          <button
                            key={colorOption}
                            type="button"
                            onClick={() => setColor(colorOption)}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${
                              color === colorOption ? 'border-white scale-110' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: colorOption }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="bg-[#1f1f23] rounded-lg p-4">
                    <div className="space-y-3 text-xs text-gray-500">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        <span>Created {formatDate(team.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        <span>Updated {formatDate(team.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Normal: Single-column layout */
              <>
                {/* Description */}
                <div className="bg-[#1f1f23] rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                    <FileText className="w-3 h-3" />
                    Description
                  </div>
                  {isEditing ? (
                    <RichTextEditor
                      value={description}
                      onChange={setDescription}
                      placeholder="Describe the team's responsibilities, goals, and expertise..."
                    />
                  ) : (
                    <RichTextDisplay content={team.description as unknown as string || ''} />
                  )}
                </div>

                {/* Color */}
                {isEditing && (
                  <div className="bg-[#1f1f23] rounded-lg p-4 mb-6">
                    <label className="block text-xs text-gray-500 mb-2">Color</label>
                    <div className="grid grid-cols-6 gap-2">
                      {PROJECT_COLORS.map((colorOption) => (
                        <button
                          key={colorOption}
                          type="button"
                          onClick={() => setColor(colorOption)}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${
                            color === colorOption ? 'border-white scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: colorOption }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Statistics */}
                <div className="bg-[#1f1f23] rounded-lg p-4 mb-6">
                  <h3 className="text-sm font-medium text-gray-400 mb-4">Assigned Tickets</h3>
                  {isLoadingTickets ? (
                    <div className="text-sm text-gray-500">Loading...</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Total Assigned</span>
                        <span className="text-sm font-medium text-white">{ticketStats.total}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Todo</span>
                        <span className="text-sm font-medium text-gray-400">{ticketStats.todo}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">In Progress</span>
                        <span className="text-sm font-medium text-blue-400">{ticketStats.inProgress}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Done</span>
                        <span className="text-sm font-medium text-green-400">{ticketStats.done}</span>
                      </div>

                      {ticketStats.total > 0 && (
                        <div className="pt-2">
                          <div className="h-2 bg-[#27272a] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 transition-all"
                              style={{ width: `${(ticketStats.done / ticketStats.total) * 100}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {Math.round((ticketStats.done / ticketStats.total) * 100)}% complete
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Assigned Tickets */}
                <div className="bg-[#1f1f23] rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-400">
                      Assigned Tickets {ticketPagination.totalDocs > 0 && `(${ticketPagination.totalDocs})`}
                    </h3>
                    <button
                      onClick={handleViewOnBoard}
                      className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View on Board
                    </button>
                  </div>
                  {isLoadingTickets ? (
                    <div className="text-sm text-gray-500">Loading...</div>
                  ) : tickets.length === 0 ? (
                    <p className="text-sm text-gray-500">No tickets assigned to this team.</p>
                  ) : (
                    <div className="space-y-2">
                      {tickets.map((ticket) => {
                        const project = typeof ticket.project === 'object' ? ticket.project : null
                        return (
                          <div
                            key={ticket.id}
                            onClick={() => onTicketClick?.(ticket)}
                            className={`flex items-center gap-3 p-2 bg-[#27272a] rounded-md ${
                              onTicketClick ? 'cursor-pointer hover:bg-[#3f3f46] transition-colors' : ''
                            }`}
                          >
                            {project && (
                              <span
                                className="text-xs font-medium px-2 py-0.5 rounded"
                                style={{
                                  backgroundColor: `${project.color}20`,
                                  color: project.color as string,
                                }}
                              >
                                {ticket.ticketId}
                              </span>
                            )}
                            <span className="flex-1 text-sm text-white truncate">
                              {ticket.title}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              ticket.status === TicketStatus.TODO ? 'bg-gray-500/20 text-gray-400' :
                              ticket.status === TicketStatus.IN_PROGRESS ? 'bg-blue-500/20 text-blue-400' :
                              'bg-green-500/20 text-green-400'
                            }`}>
                              {ticket.status === TicketStatus.TODO ? 'Todo' :
                               ticket.status === TicketStatus.IN_PROGRESS ? 'In Progress' : 'Done'}
                            </span>
                          </div>
                        )
                      })}

                      {ticketPagination.hasNextPage && (
                        <button
                          onClick={loadMoreTickets}
                          disabled={isLoadingMore}
                          className="w-full flex items-center justify-center gap-2 py-2 text-xs text-gray-400 hover:text-white bg-[#27272a] hover:bg-[#3f3f46] rounded-md transition-colors disabled:opacity-50"
                        >
                          {isLoadingMore ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              Load more ({ticketPagination.totalDocs - tickets.length} remaining)
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Timestamps */}
                <div className="border-t border-[#27272a] pt-4 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Created {formatDate(team.createdAt)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Updated {formatDate(team.updatedAt)}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
