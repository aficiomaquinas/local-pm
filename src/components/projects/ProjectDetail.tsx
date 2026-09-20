'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ProjectStatus, TicketStatus } from '@/types/enums'
import { projectStatusOptions } from '@/lib/status'
import { useOptimisticPatch, saveStateLabel } from '@/hooks/useOptimisticPatch'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { EntityMark, TicketKey, projectIcon } from '@/components/ui/EntityMark'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { PriorityIndicator, TicketStatusBadge } from '@/components/ui/StateIndicator'
import { Table, Td, Th, Tr, useDensity } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import { RichTextDisplay, RichTextEditor } from '@/components/ui/RichTextEditor'
import type { Project, Team, Ticket } from '@/payload-types'

export function ProjectDetail({
  project: initialProject,
  tickets,
  teams,
}: {
  project: Project
  tickets: Ticket[]
  teams: Team[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [density] = useDensity()
  const [project, setProject] = useState(initialProject)
  const apply = useCallback((next: Project) => setProject(next), [])
  const { patch, state } = useOptimisticPatch<Project>({
    collection: 'projects',
    record: project,
    onApply: apply,
  })

  const [editingDescription, setEditingDescription] = useState(false)
  const [draftDescription, setDraftDescription] = useState('')
  const [savingDescription, setSavingDescription] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const description = (project.description as unknown as string) || ''
  const savingLabel = saveStateLabel(state)

  const stats = useMemo(() => {
    const total = tickets.length
    const done = tickets.filter((t) => t.status === TicketStatus.DONE).length
    return {
      total,
      todo: tickets.filter((t) => t.status === TicketStatus.TODO).length,
      inProgress: tickets.filter((t) => t.status === TicketStatus.IN_PROGRESS).length,
      done,
      percent: total ? Math.round((done / total) * 100) : 0,
    }
  }, [tickets])

  const saveDescription = async () => {
    setSavingDescription(true)
    const ok = await patch(
      { description: (draftDescription || null) as Project['description'] },
      'the description',
    )
    setSavingDescription(false)
    if (ok) {
      setEditingDescription(false)
      router.refresh()
    }
  }

  const deleteProject = async () => {
    setDeleting(true)
    try {
      await Promise.all(
        tickets.map((t) => fetch(`/api/tickets/${t.id}`, { method: 'DELETE' })),
      )
      const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      toast({ title: `${project.name} deleted`, tone: 'info' })
      router.push('/projects')
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't delete that project",
        description: error instanceof Error ? error.message : undefined,
      })
      setDeleting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-20 border-b border-border-subtle bg-bg">
        <div className="mx-auto flex max-w-[1140px] flex-col gap-3 px-6 py-4 max-md:px-4">
          <nav aria-label="Breadcrumb">
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 rounded-sm text-xs text-text-muted hover:text-text"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Projects
            </Link>
          </nav>

          <div className="flex flex-wrap items-center gap-3">
            <EntityMark icon={projectIcon(project.icon)} color={project.color} size="lg" />

            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold text-text">
                <InlineEdit
                  label="Project name"
                  value={project.name}
                  validate={(next) => (next ? null : 'A name is required.')}
                  onCommit={(next) => patch({ name: next }, 'the name')}
                />
              </h1>
              <p className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                <span className="tabular">{project.prefix}</span>
                <span aria-hidden>·</span>
                <span className="tabular">
                  {stats.total} {stats.total === 1 ? 'ticket' : 'tickets'}
                </span>
                {savingLabel && (
                  <>
                    <span aria-hidden>·</span>
                    <span
                      aria-live="polite"
                      className={state === 'error' ? 'text-danger-text' : undefined}
                    >
                      {savingLabel}
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                trailingIcon={ExternalLink}
                onClick={() => router.push(`/board?project=${project.id}`)}
              >
                Open board
              </Button>
              <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1140px] grid-cols-[1fr_280px] gap-8 px-6 py-6 max-lg:grid-cols-1 max-md:px-4">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Description
              </h2>
              <div className="ml-auto flex gap-2">
                {editingDescription ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingDescription(false)}
                      disabled={savingDescription}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" loading={savingDescription} onClick={saveDescription}>
                      Save
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraftDescription(description)
                      setEditingDescription(true)
                    }}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {editingDescription ? (
              <div
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    saveDescription()
                  }
                }}
              >
                <RichTextEditor
                  value={draftDescription}
                  onChange={setDraftDescription}
                  placeholder="Goals, scope, anything worth knowing…"
                />
                <p className="mt-2 text-xs text-text-muted">⌘/Ctrl + Enter saves.</p>
              </div>
            ) : (
              <RichTextDisplay content={description} />
            )}
          </section>

          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">Tickets</h2>
              <Link
                href={`/board?project=${project.id}`}
                className="ml-auto rounded-sm text-xs text-accent-text hover:underline"
              >
                View on the board
              </Link>
            </div>

            {tickets.length === 0 ? (
              <EmptyState
                kind="no-data"
                compact
                title="No tickets in this project"
                description="Tickets created on the board with this project selected will appear here."
                action={{ label: 'Open board', onClick: () => router.push(`/board?project=${project.id}`) }}
              />
            ) : (
              <div className="rounded-md border border-border-subtle">
                <Table caption={`Tickets in ${project.name}`}>
                  <thead>
                    <tr>
                      <Th width="6rem">Key</Th>
                      <Th>Title</Th>
                      <Th width="3rem">
                        <span className="sr-only">Priority</span>
                      </Th>
                      <Th width="9rem">Status</Th>
                      <Th width="9rem">Team</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => {
                      const team =
                        typeof ticket.team === 'object'
                          ? ticket.team
                          : teams.find((t) => t.id === ticket.team)
                      return (
                        <Tr
                          key={ticket.id}
                          density={density}
                          onOpen={() => router.push(`/board?project=${project.id}&ticket=${ticket.id}`)}
                        >
                          <Td>
                            <TicketKey value={ticket.ticketId} color={project.color} />
                          </Td>
                          <Td>
                            <span className="block truncate text-text" title={ticket.title}>
                              {ticket.title}
                            </span>
                          </Td>
                          <Td>
                            <PriorityIndicator priority={ticket.priority} />
                          </Td>
                          <Td>
                            <TicketStatusBadge status={ticket.status} />
                          </Td>
                          <Td className="truncate text-text-muted">{team?.name ?? '—'}</Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <Field label="Status">
            {({ id }) => (
              <Select
                id={id}
                value={project.status}
                options={projectStatusOptions()}
                onValueChange={(next) => patch({ status: next as ProjectStatus }, 'the status')}
              />
            )}
          </Field>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">Progress</h2>

            <div>
              <div
                role="progressbar"
                aria-valuenow={stats.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Tickets complete"
                className="h-2 overflow-hidden rounded-full bg-surface-hover"
              >
                <div
                  className="h-full rounded-full bg-success transition-[width] duration-standard"
                  style={{ width: `${stats.percent}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-text-muted tabular">
                {stats.percent}% complete · {stats.done} of {stats.total} done
              </p>
            </div>

            <dl className="flex flex-col">
              {(
                [
                  ['Todo', stats.todo, TicketStatus.TODO],
                  ['In progress', stats.inProgress, TicketStatus.IN_PROGRESS],
                  ['Done', stats.done, TicketStatus.DONE],
                ] as const
              ).map(([label, value, status]) => (
                <div
                  key={label}
                  className="flex h-8 items-center justify-between gap-2 border-b border-border-subtle last:border-b-0"
                >
                  <dt className="flex items-center gap-2 text-base text-text-muted">
                    <TicketStatusBadge status={status} />
                  </dt>
                  <dd className={cn('text-base text-text tabular')}>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <dl className="flex flex-col gap-2 border-t border-border-subtle pt-4 text-xs text-text-muted">
            <div className="flex justify-between gap-2">
              <dt>Created</dt>
              <dd className="text-text tabular">{new Date(project.createdAt).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Updated</dt>
              <dd className="text-text tabular">{new Date(project.updatedAt).toLocaleDateString()}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteProject}
        loading={deleting}
        title="Delete this project?"
        message={`“${project.name}” (${project.prefix})`}
        consequence={
          stats.total > 0
            ? `Permanently deletes ${stats.total} ticket${stats.total === 1 ? '' : 's'} and their history. This cannot be undone.`
            : 'This project has no tickets. This cannot be undone.'
        }
        confirmPhrase={stats.total > 0 ? project.name : undefined}
        confirmLabel="Delete project"
      />
    </div>
  )
}
