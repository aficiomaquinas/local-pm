'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Ban,
  Check,
  CheckSquare,
  GitBranch,
  Plus,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  BLOCKED_META,
  ticketPriorityOptions,
  ticketStatusMeta,
  ticketStatusOptions,
} from '@/lib/status'
import {
  TicketPriority,
  TicketStatus,
} from '@/types/enums'
import { useOptimisticPatch, saveStateLabel } from '@/hooks/useOptimisticPatch'
import { Badge, Chip } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SidePanel } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { PriorityIndicator, TicketStatusBadge } from '@/components/ui/StateIndicator'
import { TicketKey } from '@/components/ui/EntityMark'
import { RichTextDisplay, RichTextEditor } from '@/components/ui/RichTextEditor'
import { DependencyGraph } from './DependencyGraph'
import type { Project, Team, Ticket } from '@/payload-types'

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 shrink-0 text-text-muted" />}
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}

export function TicketPanel({
  ticket,
  projects,
  teams,
  allTickets,
  onClose,
  onUpdate,
  onDelete,
}: {
  ticket: Ticket
  projects: Project[]
  teams: Team[]
  allTickets: Ticket[]
  onClose: () => void
  onUpdate: (next: Ticket) => void
  onDelete: (ticket: Ticket) => void
}) {
  const apply = useCallback((next: Ticket) => onUpdate(next), [onUpdate])
  const { patch, state } = useOptimisticPatch<Ticket>({
    collection: 'tickets',
    record: ticket,
    onApply: apply,
  })

  const [editingDescription, setEditingDescription] = useState(false)
  const [draftDescription, setDraftDescription] = useState('')
  const [savingDescription, setSavingDescription] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newSubtask, setNewSubtask] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const project = typeof ticket.project === 'object' ? ticket.project : projects.find((p) => p.id === ticket.project)
  const teamId = typeof ticket.team === 'string' ? ticket.team : ticket.team?.id ?? ''
  const description = (ticket.description as unknown as string) || ''
  const subtasks = ticket.subtasks ?? []
  const labels = ticket.labels ?? []

  const blockedByIds = useMemo(
    () => (ticket.blockedBy ?? []).map((b) => (typeof b === 'string' ? b : b.id)),
    [ticket.blockedBy],
  )
  const blockers = useMemo(
    () =>
      blockedByIds
        .map((id) => allTickets.find((t) => t.id === id) ?? (ticket.blockedBy ?? []).find((b) => typeof b === 'object' && b.id === id))
        .filter((t): t is Ticket => Boolean(t) && typeof t === 'object'),
    [blockedByIds, allTickets, ticket.blockedBy],
  )
  const blocking = useMemo(
    () =>
      allTickets.filter((t) =>
        (t.blockedBy ?? []).some((b) => (typeof b === 'string' ? b : b.id) === ticket.id),
      ),
    [allTickets, ticket.id],
  )
  const available = useMemo(
    () => allTickets.filter((t) => t.id !== ticket.id && !blockedByIds.includes(t.id)),
    [allTickets, ticket.id, blockedByIds],
  )

  const savingLabel = saveStateLabel(state)

  const saveDescription = async () => {
    setSavingDescription(true)
    const ok = await patch({ description: (draftDescription || null) as Ticket['description'] }, 'the description')
    setSavingDescription(false)
    if (ok) setEditingDescription(false)
  }

  return (
    <>
      <SidePanel
        open
        onClose={onClose}

        dismissible={!editingDescription}
        onDismissBlocked={() => setEditingDescription(false)}
        title={ticket.title}
        titleContent={
          <InlineEdit
            label="Ticket title"
            value={ticket.title}
            validate={(next) => (next.length === 0 ? 'A title is required.' : null)}
            onCommit={(next) => patch({ title: next } as Partial<Ticket>, 'the title')}
          />
        }
        eyebrow={
          <>
            <TicketKey value={ticket.ticketId} color={project?.color} />
            <TicketStatusBadge status={ticket.status} />
            <PriorityIndicator priority={ticket.priority} showLabel />
            {savingLabel && (
              <span
                aria-live="polite"
                className={cn('text-xs', state === 'error' ? 'text-danger-text' : 'text-text-muted')}
              >
                {savingLabel}
              </span>
            )}
          </>
        }
        footer={
          <Button
            variant="ghost"
            icon={Trash2}
            className="mr-auto"
            onClick={() => setConfirmDelete(true)}
          >
            Delete ticket
          </Button>
        }
      >
        <div className="flex flex-col gap-7">
          <Section
            title="Description"
            action={
              editingDescription ? (
                <div className="flex gap-2">
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
                </div>
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
              )
            }
          >
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
                  placeholder="Describe the work…"
                />
                <p className="mt-2 text-xs text-text-muted">⌘/Ctrl + Enter saves.</p>
              </div>
            ) : (
              <RichTextDisplay content={description} />
            )}
          </Section>

          <Section title="Details">
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Status">
                {({ id }) => (
                  <Select
                    id={id}
                    value={ticket.status}
                    options={ticketStatusOptions()}
                    onValueChange={(next) =>
                      patch({ status: next as TicketStatus } as Partial<Ticket>, 'the status')
                    }
                  />
                )}
              </Field>

              <Field label="Priority">
                {({ id }) => (
                  <Select
                    id={id}
                    value={ticket.priority ?? TicketPriority.NO_PRIORITY}
                    options={ticketPriorityOptions()}
                    onValueChange={(next) =>
                      patch({ priority: next as TicketPriority } as Partial<Ticket>, 'the priority')
                    }
                  />
                )}
              </Field>

              <Field label="Team" optional>
                {({ id }) => (
                  <Select
                    id={id}
                    value={teamId}
                    placeholder="No team"
                    onValueChange={(next) =>
                      patch({ team: next || null } as Partial<Ticket>, 'the team')
                    }
                    options={[
                      { value: '', label: 'No team', icon: Users },
                      ...teams.map((t) => ({
                        value: t.id,
                        label: t.name,
                        icon: Users,
                        swatch: t.color,
                      })),
                    ]}
                  />
                )}
              </Field>

              <Field label="Due date" optional hint="Type YYYY-MM-DD, or pick a day.">
                {({ id, describedBy }) => (
                  <DatePicker
                    id={id}
                    aria-describedby={describedBy}
                    value={ticket.dueDate ? ticket.dueDate.slice(0, 10) : ''}
                    onChange={(next) =>
                      patch({ dueDate: next || null } as Partial<Ticket>, 'the due date')
                    }
                  />
                )}
              </Field>
            </dl>

            <p className="text-xs text-text-muted">
              Project:{' '}
              <span className="text-text">{project?.name ?? 'Unassigned'}</span>. Moving a ticket
              between projects changes its key, so it is done from the ticket&rsquo;s project page.
            </p>
          </Section>

          <Section title="Labels">
            <div className="flex flex-wrap gap-2">
              {labels.length === 0 && <p className="text-base text-text-muted">No labels.</p>}
              {labels.map((label, index) => (
                <Chip
                  key={label.id ?? index}
                  shape="tag"
                  onRemove={() =>
                    patch(
                      { labels: labels.filter((_, i) => i !== index) } as Partial<Ticket>,
                      'the labels',
                    )
                  }
                  removeLabel={`Remove label ${label.name}`}
                >
                  {label.name}
                </Chip>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const name = newLabel.trim()
                if (!name) return
                setNewLabel('')
                patch(
                  { labels: [...labels, { name }] } as Partial<Ticket>,
                  'the labels',
                )
              }}
            >
              <Field label="New label" hideLabel className="flex-1">
                {({ id }) => (
                  <Input
                    id={id}
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Add a label"
                  />
                )}
              </Field>
              <Button type="submit" icon={Plus} variant="secondary">
                Add
              </Button>
            </form>
          </Section>

          <Section
            title="Subtasks"
            icon={CheckSquare}
            action={
              subtasks.length > 0 ? (
                <span className="text-xs text-text-muted tabular">
                  {subtasks.filter((s) => s.completed).length}/{subtasks.length} done
                </span>
              ) : null
            }
          >
            <ul className="flex flex-col">
              {subtasks.map((subtask, index) => (
                <li key={subtask.id ?? index} className="group flex items-center gap-2 py-1">
                  <button
                    type="button"
                    aria-pressed={Boolean(subtask.completed)}
                    onClick={() =>
                      patch(
                        {
                          subtasks: subtasks.map((s, i) =>
                            i === index ? { ...s, completed: !s.completed } : s,
                          ),
                        } as Partial<Ticket>,
                        'the subtask',
                      )
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1 text-left hover:bg-surface-hover"
                  >
                    {subtask.completed ? (
                      <CheckSquare className="size-4 shrink-0 text-success-text" aria-hidden />
                    ) : (
                      <Square className="size-4 shrink-0 text-text-muted" aria-hidden />
                    )}
                    <span
                      className={cn(
                        'truncate text-base',
                        subtask.completed ? 'text-text-muted line-through' : 'text-text',
                      )}
                    >
                      {subtask.title}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="xs"
                    iconOnly
                    icon={X}
                    aria-label={`Remove subtask ${subtask.title}`}
                    onClick={() =>
                      patch(
                        { subtasks: subtasks.filter((_, i) => i !== index) } as Partial<Ticket>,
                        'the subtasks',
                      )
                    }
                  />
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const title = newSubtask.trim()
                if (!title) return
                setNewSubtask('')
                patch(
                  { subtasks: [...subtasks, { title, completed: false }] } as Partial<Ticket>,
                  'the subtasks',
                )
              }}
            >
              <Field label="New subtask" hideLabel className="flex-1">
                {({ id }) => (
                  <Input
                    id={id}
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    placeholder="Add a subtask"
                  />
                )}
              </Field>
              <Button type="submit" icon={Plus} variant="secondary">
                Add
              </Button>
            </form>
          </Section>

          <Section title="Blocked by" icon={Ban}>
            <ul className="flex flex-col gap-2">
              {blockers.length === 0 && <li className="text-base text-text-muted">Nothing is blocking this ticket.</li>}
              {blockers.map((blocker) => (
                <li
                  key={blocker.id}
                  className="flex items-center gap-2 rounded-sm border border-border-subtle bg-surface px-2 py-1.5"
                >
                  <TicketKey value={blocker.ticketId} />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-base',
                      blocker.status === TicketStatus.DONE ? 'text-text-muted line-through' : 'text-text',
                    )}
                    title={blocker.title}
                  >
                    {blocker.title}
                  </span>
                  {blocker.status === TicketStatus.DONE ? (
                    <Badge tone="success" icon={Check}>
                      Done
                    </Badge>
                  ) : (
                    <Badge tone={BLOCKED_META.tone} icon={BLOCKED_META.icon}>
                      Blocking
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="xs"
                    iconOnly
                    icon={X}
                    aria-label={`Stop ${blocker.ticketId} blocking this ticket`}
                    onClick={() =>
                      patch(
                        { blockedBy: blockedByIds.filter((id) => id !== blocker.id) } as Partial<Ticket>,
                        'the blockers',
                      )
                    }
                  />
                </li>
              ))}
            </ul>

            {available.length > 0 && (
              <Field label="Add a blocking ticket" optional>
                {({ id }) => (
                  <Select
                    id={id}
                    value=""
                    placeholder="Select a ticket…"
                    onValueChange={(next) => {
                      if (!next) return
                      patch(
                        { blockedBy: [...blockedByIds, next] } as Partial<Ticket>,
                        'the blockers',
                      )
                    }}
                    options={available.map((t) => ({
                      value: t.id,
                      label: t.title,
                      hint: t.ticketId ?? undefined,
                      icon: ticketStatusMeta(t.status).icon,
                      tone: ticketStatusMeta(t.status).tone,
                    }))}
                  />
                )}
              </Field>
            )}
          </Section>

          {blocking.length > 0 && (
            <Section title="Blocks" icon={Ban}>
              <ul className="flex flex-col gap-2">
                {blocking.map((t) => {
                  const meta = ticketStatusMeta(t.status)
                  return (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 rounded-sm border border-border-subtle bg-surface px-2 py-1.5"
                    >
                      <TicketKey value={t.ticketId} />
                      <span className="min-w-0 flex-1 truncate text-base text-text" title={t.title}>
                        {t.title}
                      </span>
                      <Badge tone={meta.tone} icon={meta.icon}>
                        {meta.label}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            </Section>
          )}

          {(blockers.length > 0 || blocking.length > 0) && (
            <Section title="Dependency graph" icon={GitBranch}>
              <DependencyGraph ticket={ticket} allTickets={allTickets} />
            </Section>
          )}

          <dl className="grid grid-cols-2 gap-2 border-t border-border-subtle pt-4 text-xs text-text-muted">
            <div className="flex justify-between gap-2">
              <dt>Created</dt>
              <dd className="text-text tabular">{new Date(ticket.createdAt).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Updated</dt>
              <dd className="text-text tabular">{new Date(ticket.updatedAt).toLocaleDateString()}</dd>
            </div>
          </dl>
        </div>
      </SidePanel>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          onDelete(ticket)
        }}
        title="Delete this ticket?"
        message={`${ticket.ticketId ?? 'This ticket'} — “${ticket.title}” will be removed from the board.`}
        consequence="Its subtasks, labels and dependency links go with it. This cannot be undone."
        confirmLabel="Delete ticket"
      />
    </>
  )
}
