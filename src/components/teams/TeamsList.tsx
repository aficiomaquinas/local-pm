'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MoreHorizontal, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/shortcuts'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { EntityMark } from '@/components/ui/EntityMark'
import { Menu } from '@/components/ui/Menu'
import { RowSkeletonList, useDelayedFlag } from '@/components/ui/Skeleton'
import { DensityControl, Table, Td, Th, Tr, useDensity } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import { TeamFormDialog } from './TeamFormDialog'
import type { Team } from '@/payload-types'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300
const MIN_SEARCH = 3

type SortKey = 'name' | '-name' | 'createdAt' | '-createdAt'

interface Pagination {
  page: number
  totalPages: number
  hasNextPage: boolean
  totalDocs: number
}

export function TeamsList({
  initialTeams,
  initialPagination,
}: {
  initialTeams: Team[]
  initialPagination?: Pagination
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [density, setDensity] = useDensity()

  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [pagination, setPagination] = useState<Pagination>(
    initialPagination ?? { page: 1, totalPages: 1, hasNextPage: false, totalDocs: initialTeams.length },
  )
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('-createdAt')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ team: Team; ticketCount: number } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  const fetchedFor = useRef<string | null>(null)
  const showSkeleton = useDelayedFlag(loading)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setQuery(params.get('q') ?? '')
    const urlSort = params.get('sort')
    if (urlSort) setSort(urlSort as SortKey)
  }, [])

  const syncUrl = useCallback((next: { q: string; sort: SortKey }, push: boolean) => {
    const params = new URLSearchParams()
    if (next.q) params.set('q', next.q)
    if (next.sort !== '-createdAt') params.set('sort', next.sort)
    const qs = params.toString()
    const url = qs ? `?${qs}` : window.location.pathname
    if (push) window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  }, [])

  const buildParams = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort })
      if (query.trim().length >= MIN_SEARCH) params.set('where[name][like]', query.trim())
      return params
    },
    [sort, query],
  )

  useEffect(() => {
    const signature = buildParams(1).toString()
    if (fetchedFor.current === null) {
      fetchedFor.current = signature
      return
    }
    if (signature === fetchedFor.current) return
    fetchedFor.current = signature

    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/teams?${buildParams(1)}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
        const data = await response.json()
        setTeams(data.docs ?? [])
        setPagination({
          page: data.page ?? 1,
          totalPages: data.totalPages ?? 1,
          hasNextPage: data.hasNextPage ?? false,
          totalDocs: data.totalDocs ?? 0,
        })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'The request failed.')
      } finally {
        setLoading(false)
      }
    }

    const timer = setTimeout(run, query ? SEARCH_DEBOUNCE_MS : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [buildParams, query])

  useShortcut({
    id: 'teams.search',
    keys: 'slash',
    description: 'Focus the team search',
    group: 'Teams',
    scope: 'list',
    run: () => searchRef.current?.focus(),
  })
  useShortcut({
    id: 'teams.create',
    keys: 'c',
    description: 'Create a team',
    group: 'Teams',
    scope: 'list',
    run: () => {
      setEditing(null)
      setFormOpen(true)
    },
  })

  const setFilters = (next: Partial<{ q: string; sort: SortKey }>, push = true) => {
    const merged = { q: next.q ?? query, sort: next.sort ?? sort }
    if (next.q !== undefined) setQuery(next.q)
    if (next.sort !== undefined) setSort(next.sort)
    syncUrl(merged, push)
  }

  const toggleSort = (key: 'name' | 'createdAt') => {
    setFilters({ sort: sort === key ? (`-${key}` as SortKey) : (key as SortKey) })
  }
  const sortDirection = (key: string): 'asc' | 'desc' | null =>
    sort === key ? 'asc' : sort === `-${key}` ? 'desc' : null

  const loadMore = async () => {
    if (!pagination.hasNextPage || loadingMore) return
    setLoadingMore(true)
    try {
      const response = await fetch(`/api/teams?${buildParams(pagination.page + 1)}`)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const data = await response.json()
      setTeams((prev) => [...prev, ...(data.docs ?? [])])
      setPagination({
        page: data.page,
        totalPages: data.totalPages,
        hasNextPage: data.hasNextPage,
        totalDocs: data.totalDocs,
      })
    } catch (err) {
      toast({
        tone: 'error',
        title: "Couldn't load more teams",
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setLoadingMore(false)
    }
  }

  const startDelete = async (team: Team) => {
    try {
      const response = await fetch(`/api/tickets?where[team][equals]=${team.id}&limit=0`)
      const data = await response.json()
      setPendingDelete({ team, ticketCount: data.totalDocs ?? 0 })
    } catch {
      setPendingDelete({ team, ticketCount: -1 })
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/teams/${pendingDelete.team.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      setTeams((prev) => prev.filter((t) => t.id !== pendingDelete.team.id))
      setPagination((p) => ({ ...p, totalDocs: Math.max(0, p.totalDocs - 1) }))
      setPendingDelete(null)
      toast({ title: `${pendingDelete.team.name} deleted`, tone: 'info' })
    } catch (err) {
      toast({
        tone: 'error',
        title: "Couldn't delete that team",
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none flex-col gap-3 border-b border-border-subtle px-6 py-3 max-md:px-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-text">Teams</h1>

          <label className="relative flex h-8 min-w-48 flex-1 items-center gap-2 rounded-sm border border-border bg-surface px-2.5 md:max-w-80">
            <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
            <span className="sr-only">Search teams by name</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setFilters({ q: e.target.value }, false)}
              placeholder="Search teams"
              className="min-w-0 flex-1 bg-transparent text-base text-text outline-none max-sm:text-md"
            />
            <kbd className="hidden shrink-0 font-sans text-xs text-text-muted can-hover:inline">/</kbd>
          </label>

          <Button
            variant="primary"
            icon={Plus}
            shortcut="C"
            className="ml-auto"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            New team
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted tabular" aria-live="polite">
            {pagination.totalDocs} {pagination.totalDocs === 1 ? 'team' : 'teams'}
          </span>
          {query && (
            <>
              <Chip tone="accent" onRemove={() => setFilters({ q: '' })} removeLabel="Clear the search">
                Search: {query}
              </Chip>
              <Button variant="ghost" size="sm" icon={X} onClick={() => setFilters({ q: '' })}>
                Clear all
              </Button>
            </>
          )}
          <div className="ml-auto">
            <DensityControl value={density} onChange={setDensity} />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <EmptyState
            kind="error"
            title="Couldn't load teams"
            description={error}
            action={{ label: 'Retry', onClick: () => setFilters({}, false) }}
            className="m-6"
          />
        ) : showSkeleton && teams.length === 0 ? (
          <RowSkeletonList count={5} />
        ) : teams.length === 0 && query ? (
          <EmptyState
            kind="no-match"
            title="No teams match"
            description="Nothing here fits that search. The team you want may still exist."
            action={{ label: 'Clear filters', onClick: () => setFilters({ q: '' }) }}
          />
        ) : teams.length === 0 ? (
          <EmptyState
            kind="no-data"
            title="No teams yet"
            description="Teams say who owns a ticket. Create one and it becomes available on every board filter."
            action={{
              label: 'Create team',
              onClick: () => {
                setEditing(null)
                setFormOpen(true)
              },
            }}
          />
        ) : (
          <>
            <Table caption="Teams, with the date each was created">
              <thead>
                <tr>
                  <Th sortable sortDirection={sortDirection('name')} onSort={() => toggleSort('name')}>
                    Team
                  </Th>
                  <Th
                    sortable
                    sortDirection={sortDirection('createdAt')}
                    onSort={() => toggleSort('createdAt')}
                    width="10rem"
                  >
                    Created
                  </Th>
                  <Th width="4rem">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <Tr key={team.id} density={density} onOpen={() => router.push(`/teams/${team.id}`)}>
                    <Td>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <EntityMark icon={Users} color={team.color} size="sm" />
                        <Link
                          href={`/teams/${team.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-medium text-text hover:underline"
                          title={team.name}
                        >
                          {team.name}
                        </Link>
                      </span>
                    </Td>
                    <Td className="tabular text-text-muted">
                      {new Date(team.createdAt).toLocaleDateString()}
                    </Td>
                    <Td align="right">
                      <span
                        className={cn(
                          'inline-flex',
                          'can-hover:opacity-0 can-hover:group-hover:opacity-100 can-hover:group-focus-within:opacity-100',
                          'transition-opacity duration-fast',
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Menu
                          label={`Actions for ${team.name}`}
                          items={[
                            {
                              id: 'edit',
                              label: 'Edit team',
                              icon: Pencil,
                              onSelect: () => {
                                setEditing(team)
                                setFormOpen(true)
                              },
                            },
                            {
                              id: 'delete',
                              label: 'Delete team',
                              icon: Trash2,
                              destructive: true,
                              separatorBefore: true,
                              onSelect: () => startDelete(team),
                            },
                          ]}
                        >
                          {(trigger) => (
                            <Button
                              {...trigger}
                              variant="ghost"
                              size="sm"
                              iconOnly
                              icon={MoreHorizontal}
                              aria-label={`Actions for ${team.name}`}
                            />
                          )}
                        </Menu>
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>

            {pagination.hasNextPage && (
              <div className="flex justify-center p-4">
                <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
                  Load more ({teams.length} of {pagination.totalDocs})
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <TeamFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        team={editing}
        onSaved={(saved, created) => {
          setTeams((prev) => (created ? [saved, ...prev] : prev.map((t) => (t.id === saved.id ? saved : t))))
          if (created) setPagination((p) => ({ ...p, totalDocs: p.totalDocs + 1 }))
          setFormOpen(false)
          setEditing(null)
          toast({
            title: created ? `${saved.name} created` : 'Changes saved',
            tone: 'success',
            action: created ? { label: 'Open', onClick: () => router.push(`/teams/${saved.id}`) } : undefined,
          })
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete this team?"
        message={pendingDelete ? `“${pendingDelete.team.name}”` : ''}
        consequence={
          pendingDelete && pendingDelete.ticketCount > 0
            ? `${pendingDelete.ticketCount} ticket${
                pendingDelete.ticketCount === 1 ? ' becomes' : 's become'
              } unassigned. The tickets themselves are kept.`
            : 'No tickets are assigned to this team.'
        }
        confirmLabel="Delete team"
      />
    </div>
  )
}
