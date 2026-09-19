'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/shortcuts'
import { PROJECT_STATUS_OPTIONS, ProjectStatus } from '@/types/enums'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Field'
import { EntityMark, projectIcon } from '@/components/ui/EntityMark'
import { Menu } from '@/components/ui/Menu'
import { RowSkeletonList, useDelayedFlag } from '@/components/ui/Skeleton'
import { ProjectStatusBadge } from '@/components/ui/StateIndicator'
import { DensityControl, Table, Td, Th, Tr, useDensity } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import { ProjectFormDialog } from './ProjectFormDialog'
import type { Project } from '@/payload-types'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300
const MIN_SEARCH = 3

type SortKey = 'name' | '-name' | 'createdAt' | '-createdAt' | 'prefix' | '-prefix'

interface Pagination {
  page: number
  totalPages: number
  hasNextPage: boolean
  totalDocs: number
}

export function ProjectsList({
  initialProjects,
  initialPagination,
}: {
  initialProjects: Project[]
  initialPagination?: Pagination
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [density, setDensity] = useDensity()

  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [pagination, setPagination] = useState<Pagination>(
    initialPagination ?? { page: 1, totalPages: 1, hasNextPage: false, totalDocs: initialProjects.length },
  )

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<ProjectStatus | ''>('')
  const [sort, setSort] = useState<SortKey>('-createdAt')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ project: Project; ticketCount: number } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  const fetchedFor = useRef<string | null>(null)
  const showSkeleton = useDelayedFlag(loading)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setQuery(params.get('q') ?? '')
    const urlStatus = params.get('status')
    if (urlStatus && PROJECT_STATUS_OPTIONS.some((o) => o.value === urlStatus)) {
      setStatus(urlStatus as ProjectStatus)
    }
    const urlSort = params.get('sort')
    if (urlSort) setSort(urlSort as SortKey)
  }, [])

  const syncUrl = useCallback((next: { q: string; status: string; sort: SortKey }, push: boolean) => {
    const params = new URLSearchParams()
    if (next.q) params.set('q', next.q)
    if (next.status) params.set('status', next.status)
    if (next.sort !== '-createdAt') params.set('sort', next.sort)
    const qs = params.toString()
    const url = qs ? `?${qs}` : window.location.pathname
    if (push) window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  }, [])

  const buildParams = useCallback(
    (page: number) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sort,
      })
      if (status) params.set('where[status][equals]', status)
      if (query.trim().length >= MIN_SEARCH) params.set('where[name][like]', query.trim())
      return params
    },
    [sort, status, query],
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
        const response = await fetch(`/api/projects?${buildParams(1)}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
        const data = await response.json()
        setProjects(data.docs ?? [])
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
    id: 'projects.search',
    keys: 'slash',
    description: 'Focus the project search',
    group: 'Projects',
    scope: 'list',
    run: () => searchRef.current?.focus(),
  })
  useShortcut({
    id: 'projects.create',
    keys: 'c',
    description: 'Create a project',
    group: 'Projects',
    scope: 'list',
    run: () => {
      setEditing(null)
      setFormOpen(true)
    },
  })

  const hasFilters = Boolean(query || status)
  const activeSortLabel = useMemo(
    () =>
      ({
        name: 'Name A–Z',
        '-name': 'Name Z–A',
        createdAt: 'Oldest first',
        '-createdAt': 'Newest first',
        prefix: 'Prefix A–Z',
        '-prefix': 'Prefix Z–A',
      })[sort],
    [sort],
  )

  const setFilters = (next: Partial<{ q: string; status: ProjectStatus | ''; sort: SortKey }>, push = true) => {
    const merged = {
      q: next.q ?? query,
      status: next.status ?? status,
      sort: next.sort ?? sort,
    }
    if (next.q !== undefined) setQuery(next.q)
    if (next.status !== undefined) setStatus(next.status)
    if (next.sort !== undefined) setSort(next.sort)
    syncUrl({ q: merged.q, status: merged.status, sort: merged.sort }, push)
  }

  const toggleSort = (key: 'name' | 'prefix' | 'createdAt') => {
    const next: SortKey = sort === key ? (`-${key}` as SortKey) : (key as SortKey)
    setFilters({ sort: next })
  }

  const sortDirection = (key: string): 'asc' | 'desc' | null =>
    sort === key ? 'asc' : sort === `-${key}` ? 'desc' : null

  const loadMore = async () => {
    if (!pagination.hasNextPage || loadingMore) return
    setLoadingMore(true)
    try {
      const response = await fetch(`/api/projects?${buildParams(pagination.page + 1)}`)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const data = await response.json()
      setProjects((prev) => [...prev, ...(data.docs ?? [])])
      setPagination({
        page: data.page,
        totalPages: data.totalPages,
        hasNextPage: data.hasNextPage,
        totalDocs: data.totalDocs,
      })
    } catch (err) {
      toast({
        tone: 'error',
        title: "Couldn't load more projects",
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setLoadingMore(false)
    }
  }

  const startDelete = async (project: Project) => {
    try {
      const response = await fetch(`/api/tickets?where[project][equals]=${project.id}&limit=0`)
      const data = await response.json()
      setPendingDelete({ project, ticketCount: data.totalDocs ?? 0 })
    } catch {
      setPendingDelete({ project, ticketCount: -1 })
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const { project, ticketCount } = pendingDelete
    setDeleting(true)
    try {
      if (ticketCount !== 0) {
        const ticketsResponse = await fetch(
          `/api/tickets?where[project][equals]=${project.id}&limit=1000&depth=0`,
        )
        const ticketsData = await ticketsResponse.json()
        await Promise.all(
          (ticketsData.docs ?? []).map((t: { id: string }) =>
            fetch(`/api/tickets/${t.id}`, { method: 'DELETE' }),
          ),
        )
      }
      const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)

      setProjects((prev) => prev.filter((p) => p.id !== project.id))
      setPagination((p) => ({ ...p, totalDocs: Math.max(0, p.totalDocs - 1) }))
      setPendingDelete(null)
      toast({ title: `${project.name} deleted`, tone: 'info' })
    } catch (err) {
      toast({
        tone: 'error',
        title: "Couldn't delete that project",
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setDeleting(false)
    }
  }

  const deleteConsequence = () => {
    if (!pendingDelete) return undefined
    const { ticketCount } = pendingDelete
    if (ticketCount < 0) return 'Any tickets in this project will be permanently deleted too.'
    if (ticketCount === 0) return 'This project has no tickets. This cannot be undone.'
    return `Permanently deletes ${ticketCount} ticket${ticketCount === 1 ? '' : 's'} and their history. This cannot be undone.`
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none flex-col gap-3 border-b border-border-subtle px-6 py-3 max-md:px-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-text">Projects</h1>

          <label className="relative flex h-8 min-w-48 flex-1 items-center gap-2 rounded-sm border border-border bg-surface px-2.5 md:max-w-80">
            <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
            <span className="sr-only">Search projects by name</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setFilters({ q: e.target.value }, false)}
              placeholder="Search projects"
              className="min-w-0 flex-1 bg-transparent text-base text-text outline-none max-sm:text-md"
            />
            <kbd className="hidden shrink-0 font-sans text-xs text-text-muted can-hover:inline">/</kbd>
          </label>

          <label className="sr-only" htmlFor="projects-status-filter">
            Filter by status
          </label>
          <Select
            id="projects-status-filter"
            value={status}
            onChange={(e) => setFilters({ status: e.target.value as ProjectStatus | '' })}
            className="w-40"
          >
            <option value="">All statuses</option>
            {PROJECT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

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
            New project
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted tabular" aria-live="polite">
            {pagination.totalDocs} {pagination.totalDocs === 1 ? 'project' : 'projects'} ·{' '}
            {activeSortLabel}
          </span>

          {status && (
            <Chip tone="accent" onRemove={() => setFilters({ status: '' })} removeLabel="Remove status filter">
              Status: {PROJECT_STATUS_OPTIONS.find((o) => o.value === status)?.label}
            </Chip>
          )}
          {query && (
            <Chip tone="accent" onRemove={() => setFilters({ q: '' })} removeLabel="Clear the search">
              Search: {query}
            </Chip>
          )}
          {hasFilters && (
            <Button variant="ghost" size="sm" icon={X} onClick={() => setFilters({ q: '', status: '' })}>
              Clear all
            </Button>
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
            title="Couldn't load projects"
            description={error}
            action={{ label: 'Retry', onClick: () => setFilters({}, false) }}
            className="m-6"
          />
        ) : showSkeleton && projects.length === 0 ? (
          <RowSkeletonList count={5} />
        ) : projects.length === 0 && hasFilters ? (
          <EmptyState
            kind="no-match"
            title="No projects match"
            description="Nothing here fits the current search and status. The project you want may still exist."
            action={{ label: 'Clear filters', onClick: () => setFilters({ q: '', status: '' }) }}
          />
        ) : projects.length === 0 ? (
          <EmptyState
            kind="no-data"
            title="No projects yet"
            description="A project groups tickets and gives them their key, like ABC-12. Create the first one to get started."
            action={{
              label: 'Create project',
              onClick: () => {
                setEditing(null)
                setFormOpen(true)
              },
            }}
          />
        ) : (
          <>
            <Table caption="Projects, with their prefix, status and ticket count">
              <thead>
                <tr>
                  <Th
                    sortable
                    sortDirection={sortDirection('name')}
                    onSort={() => toggleSort('name')}
                  >
                    Project
                  </Th>
                  <Th
                    sortable
                    sortDirection={sortDirection('prefix')}
                    onSort={() => toggleSort('prefix')}
                    width="8rem"
                  >
                    Prefix
                  </Th>
                  <Th width="10rem">Status</Th>
                  <Th align="right" width="8rem">
                    Tickets
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
                {projects.map((project) => (
                  <Tr
                    key={project.id}
                    density={density}
                    onOpen={() => router.push(`/projects/${project.id}`)}
                  >
                    <Td>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <EntityMark icon={projectIcon(project.icon)} color={project.color} size="sm" />
                        <Link
                          href={`/projects/${project.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-medium text-text hover:underline"
                          title={project.name}
                        >
                          {project.name}
                        </Link>
                      </span>
                    </Td>
                    <Td className="tabular text-text-muted">{project.prefix}</Td>
                    <Td>
                      <ProjectStatusBadge status={project.status} />
                    </Td>
                    <Td numeric className="text-text-muted">
                      {project.ticketCounter ?? 0}
                    </Td>
                    <Td className="tabular text-text-muted">
                      {new Date(project.createdAt).toLocaleDateString()}
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
                          label={`Actions for ${project.name}`}
                          items={[
                            {
                              id: 'edit',
                              label: 'Edit project',
                              icon: Pencil,
                              onSelect: () => {
                                setEditing(project)
                                setFormOpen(true)
                              },
                            },
                            {
                              id: 'delete',
                              label: 'Delete project',
                              icon: Trash2,
                              destructive: true,
                              separatorBefore: true,
                              onSelect: () => startDelete(project),
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
                              aria-label={`Actions for ${project.name}`}
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
                  Load more ({projects.length} of {pagination.totalDocs})
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <ProjectFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        project={editing}
        onSaved={(saved, created) => {
          setProjects((prev) =>
            created ? [saved, ...prev] : prev.map((p) => (p.id === saved.id ? saved : p)),
          )
          if (created) setPagination((p) => ({ ...p, totalDocs: p.totalDocs + 1 }))
          setFormOpen(false)
          setEditing(null)
          toast({
            title: created ? `${saved.name} created` : 'Changes saved',
            tone: 'success',
            action: created
              ? { label: 'Open', onClick: () => router.push(`/projects/${saved.id}`) }
              : undefined,
          })
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete this project?"
        message={pendingDelete ? `“${pendingDelete.project.name}” (${pendingDelete.project.prefix})` : ''}
        consequence={deleteConsequence()}

        confirmPhrase={pendingDelete && pendingDelete.ticketCount > 0 ? pendingDelete.project.name : undefined}
        confirmLabel="Delete project"
      />
    </div>
  )
}
