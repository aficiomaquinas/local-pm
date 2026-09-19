'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, Trash2, Users } from 'lucide-react'
import { TicketStatus } from '@/types/enums'
import { useOptimisticPatch, saveStateLabel } from '@/hooks/useOptimisticPatch'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { EntityMark, TicketKey } from '@/components/ui/EntityMark'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { PriorityIndicator, TicketStatusBadge } from '@/components/ui/StateIndicator'
import { Table, Td, Th, Tr, useDensity } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import { RichTextDisplay, RichTextEditor } from '@/components/ui/RichTextEditor'
import type { Project, Team, Ticket } from '@/payload-types'

export function TeamDetail({
  team: initialTeam,
  tickets,
  projects,
}: {
  team: Team
  tickets: Ticket[]
  projects: Project[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [density] = useDensity()
  const [team, setTeam] = useState(initialTeam)
  const apply = useCallback((next: Team) => setTeam(next), [])
  const { patch, state } = useOptimisticPatch<Team>({
    collection: 'teams',
    record: team,
    onApply: apply,
  })

  const [editingDescription, setEditingDescription] = useState(false)
  const [draftDescription, setDraftDescription] = useState('')
  const [savingDescription, setSavingDescription] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const description = (team.description as unknown as string) || ''
  const savingLabel = saveStateLabel(state)

  const stats = useMemo(
    () => ({
      total: tickets.length,
      todo: tickets.filter((t) => t.status === TicketStatus.TODO).length,
      inProgress: tickets.filter((t) => t.status === TicketStatus.IN_PROGRESS).length,
      done: tickets.filter((t) => t.status === TicketStatus.DONE).length,
    }),
    [tickets],
  )

  const saveDescription = async () => {
    setSavingDescription(true)
    const ok = await patch(
      { description: (draftDescription || null) as Team['description'] },
      'the description',
    )
    setSavingDescription(false)
    if (ok) {
      setEditingDescription(false)
      router.refresh()
    }
  }

  const deleteTeam = async () => {
    setDeleting(true)
    try {
      const response = await fetch(`/api/teams/${team.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      toast({ title: `${team.name} deleted`, tone: 'info' })
      router.push('/teams')
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't delete that team",
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
              href="/teams"
              className="inline-flex items-center gap-1.5 rounded-sm text-xs text-text-muted hover:text-text"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Teams
            </Link>
          </nav>

          <div className="flex flex-wrap items-center gap-3">
            <EntityMark icon={Users} color={team.color} size="lg" />

            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold text-text">
                <InlineEdit
                  label="Team name"
                  value={team.name}
                  validate={(next) => (next ? null : 'A name is required.')}
                  onCommit={(next) => patch({ name: next }, 'the name')}
                />
              </h1>
              <p className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                <span className="tabular">
                  {stats.total} assigned {stats.total === 1 ? 'ticket' : 'tickets'}
                </span>
                {savingLabel && (
                  <>
                    <span aria-hidden>·</span>
                    <span aria-live="polite" className={state === 'error' ? 'text-danger-text' : undefined}>
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
                onClick={() => router.push(`/board?team=${team.id}`)}
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
                  placeholder="Responsibilities, areas of ownership…"
                />
                <p className="mt-2 text-xs text-text-muted">⌘/Ctrl + Enter saves.</p>
              </div>
            ) : (
              <RichTextDisplay content={description} />
            )}
          </section>

          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Assigned tickets
              </h2>
              <Link
                href={`/board?team=${team.id}`}
                className="ml-auto rounded-sm text-xs text-accent-text hover:underline"
              >
                View on the board
              </Link>
            </div>

            {tickets.length === 0 ? (
              <EmptyState
                kind="no-data"
                compact
                title="No tickets assigned"
                description="Assign this team on a ticket and it will show up here."
                action={{ label: 'Open board', onClick: () => router.push('/board') }}
              />
            ) : (
              <div className="rounded-md border border-border-subtle">
                <Table caption={`Tickets assigned to ${team.name}`}>
                  <thead>
                    <tr>
                      <Th width="6rem">Key</Th>
                      <Th>Title</Th>
                      <Th width="3rem">
                        <span className="sr-only">Priority</span>
                      </Th>
                      <Th width="9rem">Status</Th>
                      <Th width="10rem">Project</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => {
                      const project =
                        typeof ticket.project === 'object'
                          ? ticket.project
                          : projects.find((p) => p.id === ticket.project)
                      return (
                        <Tr
                          key={ticket.id}
                          density={density}
                          onOpen={() => router.push(`/board?team=${team.id}&ticket=${ticket.id}`)}
                        >
                          <Td>
                            <TicketKey value={ticket.ticketId} color={project?.color} />
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
                          <Td className="truncate text-text-muted">{project?.name ?? '—'}</Td>
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
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">Workload</h2>
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
                  <dt>
                    <TicketStatusBadge status={status} />
                  </dt>
                  <dd className="text-base text-text tabular">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <dl className="flex flex-col gap-2 border-t border-border-subtle pt-4 text-xs text-text-muted">
            <div className="flex justify-between gap-2">
              <dt>Created</dt>
              <dd className="text-text tabular">{new Date(team.createdAt).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Updated</dt>
              <dd className="text-text tabular">{new Date(team.updatedAt).toLocaleDateString()}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteTeam}
        loading={deleting}
        title="Delete this team?"
        message={`“${team.name}”`}
        consequence={
          stats.total > 0
            ? `${stats.total} ticket${stats.total === 1 ? ' becomes' : 's become'} unassigned. The tickets themselves are kept.`
            : 'No tickets are assigned to this team.'
        }
        confirmLabel="Delete team"
      />
    </div>
  )
}
