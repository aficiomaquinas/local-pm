'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { TicketPriority, TicketStatus } from '@/types/enums'
import { ticketPriorityOptions, statusOptions } from '@/lib/status'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DatePicker } from '@/components/ui/DatePicker'
import { ErrorSummary, Field, Input } from '@/components/ui/Field'
import { MemberSelect, ProjectSelect, TeamSelect, TicketSelect } from '@/components/ui/EntityPickers'
import { Select } from '@/components/ui/Select'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { TicketKey } from '@/components/ui/EntityMark'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import type { Member, Project, Team, Ticket } from '@/payload-types'
import { useWorkflow } from '@/components/shell/WorkflowProvider'
import { statusIdOf } from '@/lib/workflow'

interface BlockerRef {
  id: string
  key: string
  title: string
}

interface FormState {
  title: string
  description: string
  status: string
  priority: TicketPriority
  projectId: string
  teamId: string
  assigneeId: string
  dueDate: string
  labels: { name: string }[]
  subtasks: { title: string; completed: boolean }[]
  blockers: BlockerRef[]
}

type FieldName = 'title' | 'projectId'

const MESSAGES: Record<FieldName, string> = {
  title: 'Enter a title for this ticket.',
  projectId: 'Choose the project this ticket belongs to.',
}

function emptyForm(projectId: string, status: string): FormState {
  return {
    title: '',
    description: '',
    status,
    priority: TicketPriority.NO_PRIORITY,
    projectId,
    teamId: '',
    assigneeId: '',
    dueDate: '',
    labels: [],
    subtasks: [],
    blockers: [],
  }
}

function fromTicket(ticket: Ticket): FormState {
  return {
    title: ticket.title,
    description: (ticket.description as unknown as string) || '',
    status: statusIdOf(ticket) ?? '',
    priority: (ticket.priority as TicketPriority) ?? TicketPriority.NO_PRIORITY,
    projectId: typeof ticket.project === 'string' ? ticket.project : (ticket.project?.id ?? ''),
    teamId: typeof ticket.team === 'string' ? ticket.team : (ticket.team?.id ?? ''),
    assigneeId:
      typeof ticket.assignee === 'string' ? ticket.assignee : (ticket.assignee?.id ?? ''),
    dueDate: ticket.dueDate ? ticket.dueDate.slice(0, 10) : '',
    labels: (ticket.labels ?? []).map((l) => ({ name: l.name })),
    subtasks: (ticket.subtasks ?? []).map((s) => ({
      title: s.title,
      completed: Boolean(s.completed),
    })),
    blockers: (ticket.blockedBy ?? [])
      .filter((b): b is Ticket => typeof b === 'object' && b !== null)
      .map((b) => ({ id: b.id, key: b.ticketId ?? b.id, title: b.title })),
  }
}

function validateField(name: FieldName, form: FormState): string | null {
  if (name === 'title') return form.title.trim() ? null : MESSAGES.title
  if (name === 'projectId') return form.projectId ? null : MESSAGES.projectId
  return null
}

export function TicketForm({
  ticket,
  project,
  team,
  assignee,
  defaultProjectId,
  defaultStatus,
  returnTo,
}: {
  ticket: Ticket | null
  project?: Project | null
  team?: Team | null
  assignee?: Member | null
  defaultProjectId?: string | null
  defaultStatus?: string
  returnTo?: string
}) {
  const { statusesForProject } = useWorkflow()
  const workflow = statusesForProject(
    defaultProjectId ?? (typeof ticket?.project === 'string' ? ticket.project : ticket?.project?.id),
  )
  const fallbackStatusId = workflow[0]?.id ?? ''

  const router = useRouter()
  const { toast } = useToast()

  const initialState = ticket
    ? fromTicket(ticket)
    : emptyForm(defaultProjectId ?? '', defaultStatus ?? fallbackStatusId)

  const [form, setForm] = useState<FormState>(initialState)
  const [initial] = useState<FormState>(initialState)
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newSubtask, setNewSubtask] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const [selectedProject, setSelectedProject] = useState<Project | null>(project ?? null)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(team ?? null)
  const [selectedAssignee, setSelectedAssignee] = useState<Member | null>(assignee ?? null)

  const summaryRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const dirty = !submitting && JSON.stringify(form) !== JSON.stringify(initial)
  useUnsavedChangesGuard(dirty)

  useEffect(() => {
    if (!ticket) titleRef.current?.focus()
  }, [ticket])

  const errors = (['title', 'projectId'] as FieldName[])
    .map((field) => ({ field, message: validateField(field, form) }))
    .filter((e): e is { field: FieldName; message: string } => e.message !== null)

  const errorFor = (field: FieldName) =>
    touched[field] || submitAttempted ? validateField(field, form) : null

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const cancelHref = returnTo ?? (ticket ? `/tickets/${ticket.id}` : '/board')

  const leave = (href: string) => {
    router.push(href)
    router.refresh()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
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
        assignee: form.assigneeId || null,
        labels: form.labels,
        subtasks: form.subtasks,
        blockedBy: form.blockers.map((b) => b.id),
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

      const saved = ((await response.json()).doc ?? {}) as Ticket
      toast({
        tone: 'success',
        title: ticket ? 'Changes saved' : `${saved.ticketId ?? 'Ticket'} created`,
      })
      leave(returnTo ?? `/tickets/${saved.id ?? ticket?.id}`)
    } catch (error) {
      setSubmitting(false)
      setFormError(
        error instanceof Error ? error.message : 'Something went wrong saving this ticket.',
      )
      requestAnimationFrame(() => summaryRef.current?.focus())
    }
  }

  const addLabel = () => {
    const name = newLabel.trim()
    if (!name) return
    set('labels', [...form.labels, { name }])
    setNewLabel('')
  }

  const addSubtask = () => {
    const title = newSubtask.trim()
    if (!title) return
    set('subtasks', [...form.subtasks, { title, completed: false }])
    setNewSubtask('')
  }

  return (
    <div className="h-full overflow-y-auto">
      <form id="ticket-form" noValidate onSubmit={handleSubmit}>
        <header className="sticky top-0 z-20 border-b border-border-subtle bg-bg">
          <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-3 px-6 py-4 max-md:px-4">
            <div className="min-w-0 flex-1">
              <nav aria-label="Breadcrumb">
                <Link
                  href={cancelHref}
                  className="inline-flex items-center gap-1.5 rounded-sm text-xs text-text-muted transition-colors duration-micro hover:text-text"
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                  {ticket ? (ticket.ticketId ?? 'Back') : 'Back'}
                </Link>
              </nav>
              <h1 className="mt-1 text-xl font-semibold text-text">
                {ticket ? 'Edit ticket' : 'New ticket'}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                disabled={submitting}
                onClick={() => (dirty ? setConfirmDiscard(true) : leave(cancelHref))}
              >
                Cancel
              </Button>
              <Button type="submit" form="ticket-form" variant="primary" loading={submitting}>
                {ticket ? 'Save changes' : 'Create ticket'}
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-[960px] flex-col gap-6 px-6 py-6 max-md:px-4">
          {(submitAttempted && errors.length > 0) || formError ? (
            <ErrorSummary
              ref={summaryRef}
              errors={
                formError
                  ? [{ field: 'form', message: formError, targetId: 'ticket-form-title' }]
                  : errors.map((e) => ({
                      field: e.field,
                      message: e.message,
                      targetId:
                        e.field === 'title' ? 'ticket-form-title' : 'ticket-form-project',
                    }))
              }
            />
          ) : null}

          <Field label="Title" required error={errorFor('title')} hint="Keep it under 80 characters.">
            {({ describedBy, invalid }) => (
              <Input
                ref={titleRef}
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
            <p className="text-xs text-text-muted">⌘/Ctrl + Enter saves.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <Field label="Project" required error={errorFor('projectId')}>
              {({ describedBy, invalid }) => (
                <ProjectSelect
                  id="ticket-form-project"
                  value={form.projectId}
                  selected={selectedProject}
                  invalid={invalid}
                  required
                  aria-label="Project"
                  aria-describedby={describedBy}
                  onChange={(next, doc) => {
                    set('projectId', next)
                    setSelectedProject(doc)
                    setTouched((t) => ({ ...t, projectId: true }))
                  }}
                />
              )}
            </Field>

            <Field label="Team" optional>
              {({ id }) => (
                <TeamSelect
                  id={id}
                  value={form.teamId}
                  selected={selectedTeam}
                  allLabel="No team"
                  aria-label="Team"
                  onChange={(next, doc) => {
                    set('teamId', next)
                    setSelectedTeam(doc)
                  }}
                />
              )}
            </Field>

            <Field label="Assignee" optional>
              {({ id }) => (
                <MemberSelect
                  id={id}
                  value={form.assigneeId}
                  selected={selectedAssignee}
                  aria-label="Assignee"
                  onChange={(next, doc) => {
                    set('assigneeId', next)
                    setSelectedAssignee(doc)
                  }}
                />
              )}
            </Field>

            <Field label="Status">
              {({ id }) => (
                <Select
                  id={id}
                  value={form.status}
                  options={statusOptions(workflow)}
                  onValueChange={(next) => set('status', next)}
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

            <Field label="Due date" optional hint="Type YYYY-MM-DD, or pick a day.">
              {({ id, describedBy }) => (
                <DatePicker
                  id={id}
                  aria-describedby={describedBy}
                  value={form.dueDate}
                  onChange={(next) => set('dueDate', next)}
                />
              )}
            </Field>
          </div>

          <fieldset className="flex flex-col gap-2 border-t border-border-subtle pt-5">
            <legend className="text-xs font-medium text-text-muted">Labels</legend>
            <div className={cn('flex flex-wrap gap-2', form.labels.length === 0 && 'hidden')}>
              {form.labels.map((label, index) => (
                <Chip
                  key={`${label.name}-${index}`}
                  shape="tag"
                  onRemove={() => set('labels', form.labels.filter((_, i) => i !== index))}
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
                      addLabel()
                    }}
                    placeholder="Type and press Enter"
                    autoComplete="off"
                  />
                )}
              </Field>
              <Button icon={Plus} onClick={addLabel}>
                Add
              </Button>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2 border-t border-border-subtle pt-5">
            <legend className="text-xs font-medium text-text-muted">Subtasks</legend>
            <ul className={cn('flex flex-col gap-1', form.subtasks.length === 0 && 'hidden')}>
              {form.subtasks.map((subtask, index) => (
                <li
                  key={`${subtask.title}-${index}`}
                  className="flex items-center gap-2 rounded-sm px-1 py-0.5 can-hover:hover:bg-surface-hover"
                >
                  <span className="min-w-0 flex-1 truncate text-base text-text">
                    {subtask.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={Trash2}
                    aria-label={`Remove subtask ${subtask.title}`}
                    onClick={() => set('subtasks', form.subtasks.filter((_, i) => i !== index))}
                    className="hover:text-danger-text"
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
                      addSubtask()
                    }}
                    placeholder="Type and press Enter"
                    autoComplete="off"
                  />
                )}
              </Field>
              <Button icon={Plus} onClick={addSubtask}>
                Add
              </Button>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2 border-t border-border-subtle pt-5">
            <legend className="text-xs font-medium text-text-muted">Blocked by</legend>
            <ul className={cn('flex flex-col gap-1.5', form.blockers.length === 0 && 'hidden')}>
              {form.blockers.map((blocker) => (
                <li
                  key={blocker.id}
                  className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface px-2 py-1.5"
                >
                  <TicketKey value={blocker.key} />
                  <span className="min-w-0 flex-1 truncate text-base text-text" title={blocker.title}>
                    {blocker.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={X}
                    aria-label={`Remove blocker ${blocker.key}`}
                    onClick={() =>
                      set('blockers', form.blockers.filter((b) => b.id !== blocker.id))
                    }
                  />
                </li>
              ))}
            </ul>

            <TicketSelect
              value=""
              selected={null}
              aria-label="Add a blocking ticket"
              placeholder="Search for a ticket…"
              onChange={(next, doc) => {
                if (!next || !doc) return
                if (next === ticket?.id || form.blockers.some((b) => b.id === next)) return
                set('blockers', [
                  ...form.blockers,
                  { id: doc.id, key: doc.ticketId ?? doc.id, title: doc.title },
                ])
              }}
            />
          </fieldset>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          leave(cancelHref)
        }}
        title="Discard your changes?"
        message="This ticket has unsaved edits. Leaving now loses them."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
      />
    </div>
  )
}
