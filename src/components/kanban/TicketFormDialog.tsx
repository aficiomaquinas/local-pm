'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Users, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { TicketPriority, TicketStatus } from '@/types/enums'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorSummary, Field, Input } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import { projectIcon } from '@/components/ui/EntityMark'
import { ticketPriorityOptions, ticketStatusMeta, ticketStatusOptions } from '@/lib/status'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import type { Project, Team, Ticket } from '@/payload-types'

interface Label {
  name: string
}
interface Subtask {
  title: string
  completed: boolean
}

interface FormState {
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  projectId: string
  teamId: string
  dueDate: string
  labels: Label[]
  subtasks: Subtask[]
  blockedByIds: string[]
}

type FieldName = 'title' | 'projectId'

function emptyForm(defaultProjectId?: string | null): FormState {
  return {
    title: '',
    description: '',
    status: TicketStatus.TODO,
    priority: TicketPriority.NO_PRIORITY,
    projectId: defaultProjectId ?? '',
    teamId: '',
    dueDate: '',
    labels: [],
    subtasks: [],
    blockedByIds: [],
  }
}

function fromTicket(ticket: Ticket): FormState {
  return {
    title: ticket.title,
    description: (ticket.description as unknown as string) || '',
    status: ticket.status as TicketStatus,
    priority: (ticket.priority as TicketPriority) ?? TicketPriority.NO_PRIORITY,
    projectId: typeof ticket.project === 'string' ? ticket.project : ticket.project?.id ?? '',
    teamId: typeof ticket.team === 'string' ? ticket.team : ticket.team?.id ?? '',
    dueDate: ticket.dueDate ? ticket.dueDate.slice(0, 10) : '',
    labels: (ticket.labels ?? []).map((l) => ({ name: l.name })),
    subtasks: (ticket.subtasks ?? []).map((s) => ({ title: s.title, completed: Boolean(s.completed) })),
    blockedByIds: (ticket.blockedBy ?? []).map((b) => (typeof b === 'string' ? b : b.id)),
  }
}

const MESSAGES: Record<FieldName, string> = {
  title: 'Enter a title for this ticket.',
  projectId: 'Choose the project this ticket belongs to.',
}

function validateField(name: FieldName, form: FormState): string | null {
  if (name === 'title') return form.title.trim() ? null : MESSAGES.title
  if (name === 'projectId') return form.projectId ? null : MESSAGES.projectId
  return null
}

export function TicketFormDialog({
  open,
  onClose,
  ticket,
  projects,
  teams,
  allTickets,
  defaultProjectId,
  defaultStatus,
  onSaved,
}: {
  open: boolean
  onClose: () => void

  ticket: Ticket | null
  projects: Project[]
  teams: Team[]
  allTickets: Ticket[]
  defaultProjectId?: string | null
  defaultStatus?: TicketStatus
  onSaved: (ticket: Ticket, created: boolean) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultProjectId))
  const [initial, setInitial] = useState<FormState>(() => emptyForm(defaultProjectId))
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newSubtask, setNewSubtask] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const next = ticket
      ? fromTicket(ticket)
      : { ...emptyForm(defaultProjectId), status: defaultStatus ?? TicketStatus.TODO }
    setForm(next)
    setInitial(next)
    setTouched({})
    setSubmitAttempted(false)
    setFormError(null)
    setShowMore(false)
    setNewLabel('')
    setNewSubtask('')
  }, [open, ticket, defaultProjectId, defaultStatus])

  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  const errorFor = (name: FieldName): string | null => {
    if (!touched[name] && !submitAttempted) return null
    return validateField(name, form)
  }

  const errors = (['title', 'projectId'] as FieldName[])
    .map((name) => ({ field: name, message: validateField(name, form) }))
    .filter((e): e is { field: FieldName; message: string } => e.message !== null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const attemptClose = () => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitAttempted(true)

    if (errors.length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus())
      return
    }

    setSubmitting(true)
    setFormError(null)
    try {
      const body = {
        title: form.title.trim(),
        description: form.description || null,
        status: form.status,
        priority: form.priority,
        project: form.projectId,
        team: form.teamId || null,
        labels: form.labels,
        subtasks: form.subtasks,
        blockedBy: form.blockedByIds,
        dueDate: form.dueDate || null,
      }

      const response = await fetch(ticket ? `/api/tickets/${ticket.id}` : '/api/tickets', {
        method: ticket ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.errors?.[0]?.message || `Saving failed (${response.status}).`)
      }

      const saved = await response.json()
      onSaved((saved.doc ?? saved) as Ticket, !ticket)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong saving this ticket.')
      requestAnimationFrame(() => summaryRef.current?.focus())
    } finally {
      setSubmitting(false)
    }
  }

  const available = allTickets.filter(
    (t) => t.id !== ticket?.id && !form.blockedByIds.includes(t.id),
  )

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={ticket ? 'Edit ticket' : 'New ticket'}
        size="md"
        dismissible={!dirty && !submitting}
        onDismissBlocked={attemptClose}
        footer={
          <>
            <Button variant="ghost" onClick={attemptClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="ticket-form" variant="primary" loading={submitting}>
              {ticket ? 'Save changes' : 'Create ticket'}
            </Button>
          </>
        }
      >
        <form id="ticket-form" noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
          {(submitAttempted && errors.length > 0) || formError ? (
            <ErrorSummary
              ref={summaryRef}
              errors={
                formError
                  ? [{ field: 'form', message: formError, targetId: 'ticket-form-title' }]
                  : errors.map((e) => ({
                      field: e.field,
                      message: e.message,
                      targetId: e.field === 'title' ? 'ticket-form-title' : 'ticket-form-project',
                    }))
              }
            />
          ) : null}

          <Field label="Title" required error={errorFor('title')} hint="Keep it under 80 characters.">
            {({ describedBy, invalid }) => (
              <Input
                id="ticket-form-title"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                onBlur={(e) => e.target.value.trim() && setTouched((t) => ({ ...t, title: true }))}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                aria-required
                autoComplete="off"
              />
            )}
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-muted">Description</span>
            <div
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  ;(e.currentTarget.closest('form') as HTMLFormElement | null)?.requestSubmit()
                }
              }}
            >
              <RichTextEditor
                value={form.description}
                onChange={(value) => set('description', value)}
                placeholder="What needs to happen?"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <Field label="Project" required error={errorFor('projectId')}>
              {({ describedBy, invalid }) => (
                <Select
                  id="ticket-form-project"
                  value={form.projectId}
                  placeholder="Select a project"
                  onValueChange={(next) => {
                    set('projectId', next)
                    setTouched((t) => ({ ...t, projectId: true }))
                  }}
                  invalid={invalid}
                  aria-describedby={describedBy}
                  required
                  options={projects.map((p) => ({
                    value: p.id,
                    label: p.name,
                    icon: projectIcon(p.icon),
                    swatch: p.color,
                    hint: p.prefix,
                  }))}
                />
              )}
            </Field>

            <Field label="Team" optional>
              {({ id }) => (
                <Select
                  id={id}
                  value={form.teamId}
                  placeholder="No team"
                  onValueChange={(next) => set('teamId', next)}
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

            <Field label="Status">
              {({ id }) => (
                <Select
                  id={id}
                  value={form.status}
                  options={ticketStatusOptions()}
                  onValueChange={(next) => set('status', next as TicketStatus)}
                />
              )}
            </Field>

            <Field label="Priority">
              {({ id }) => (
                <Select
                  id={id}
                  value={form.priority}
                  options={ticketPriorityOptions()}
                  onValueChange={(next) => set('priority', next as TicketPriority)}
                />
              )}
            </Field>
          </div>

          <div className="border-t border-border-subtle pt-4">
            <Button
              variant="ghost"
              size="sm"
              trailingIcon={showMore ? ChevronUp : ChevronDown}
              aria-expanded={showMore}
              onClick={() => setShowMore((s) => !s)}
            >
              {showMore ? 'Fewer options' : 'Due date, labels, subtasks and blockers'}
            </Button>
          </div>

          {showMore && (
            <div className="flex flex-col gap-5">
              <Field label="Due date" optional hint="Type YYYY-MM-DD, or pick a day.">
                {({ id, describedBy }) => (
                  <DatePicker
                    id={id}
                    aria-describedby={describedBy}
                    value={form.dueDate}
                    onChange={(next) => set('dueDate', next)}
                    className="w-56"
                  />
                )}
              </Field>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-text-muted">Labels</span>
                <div className={cn('flex flex-wrap gap-2', form.labels.length === 0 && 'hidden')}>
                  {form.labels.map((label, index) => (
                    <Chip
                      key={`${label.name}-${index}`}
                      shape="tag"
                      onRemove={() =>
                        set('labels', form.labels.filter((_, i) => i !== index))
                      }
                      removeLabel={`Remove label ${label.name}`}
                    >
                      {label.name}
                    </Chip>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Field label="Add a label" hideLabel className="flex-1">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ',') return
                          e.preventDefault()
                          const name = newLabel.trim()
                          if (!name) return
                          set('labels', [...form.labels, { name }])
                          setNewLabel('')
                        }}
                        placeholder="Type and press Enter"
                      />
                    )}
                  </Field>
                  <Button
                    icon={Plus}
                    onClick={() => {
                      const name = newLabel.trim()
                      if (!name) return
                      set('labels', [...form.labels, { name }])
                      setNewLabel('')
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-text-muted">Subtasks</span>
                <ul className={cn('flex flex-col gap-1', form.subtasks.length === 0 && 'hidden')}>
                  {form.subtasks.map((subtask, index) => (
                    <li key={`${subtask.title}-${index}`} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-base text-text">{subtask.title}</span>
                      <Button
                        variant="ghost"
                        size="xs"
                        iconOnly
                        icon={X}
                        aria-label={`Remove subtask ${subtask.title}`}
                        onClick={() => set('subtasks', form.subtasks.filter((_, i) => i !== index))}
                      />
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Field label="Add a subtask" hideLabel className="flex-1">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={newSubtask}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return
                          e.preventDefault()
                          const title = newSubtask.trim()
                          if (!title) return
                          set('subtasks', [...form.subtasks, { title, completed: false }])
                          setNewSubtask('')
                        }}
                        placeholder="Type and press Enter"
                      />
                    )}
                  </Field>
                  <Button
                    icon={Plus}
                    onClick={() => {
                      const title = newSubtask.trim()
                      if (!title) return
                      set('subtasks', [...form.subtasks, { title, completed: false }])
                      setNewSubtask('')
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-text-muted">Blocked by</span>
                <div className={cn('flex flex-wrap gap-2', form.blockedByIds.length === 0 && 'hidden')}>
                  {form.blockedByIds.map((id) => {
                    const blocker = allTickets.find((t) => t.id === id)
                    return (
                      <Chip
                        key={id}
                        shape="tag"
                        onRemove={() =>
                          set('blockedByIds', form.blockedByIds.filter((b) => b !== id))
                        }
                        removeLabel={`Remove blocker ${blocker?.ticketId ?? id}`}
                      >
                        {blocker?.ticketId ?? id}
                      </Chip>
                    )
                  })}
                </div>
                {available.length > 0 && (
                  <Field label="Add a blocking ticket" hideLabel>
                    {({ id }) => (
                      <Select
                        id={id}
                        value=""
                        placeholder="Add a blocking ticket…"
                        onValueChange={(next) => {
                          if (!next) return
                          set('blockedByIds', [...form.blockedByIds, next])
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
              </div>
            </div>
          )}
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          onClose()
          toast({ title: 'Draft discarded', tone: 'info' })
        }}
        title="Discard your changes?"
        message="This ticket has unsaved edits. Closing now loses them."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
      />
    </>
  )
}
