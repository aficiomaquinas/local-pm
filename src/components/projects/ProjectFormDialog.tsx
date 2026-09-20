'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { PROJECT_COLORS, PROJECT_ICONS, ProjectStatus } from '@/types/enums'
import { projectStatusOptions } from '@/lib/status'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorSummary, Field, Input } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { EntityMark, projectIcon } from '@/components/ui/EntityMark'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import type { Project } from '@/payload-types'

interface FormState {
  name: string
  prefix: string
  description: string
  status: ProjectStatus
  icon: string
  color: string
}

type FieldName = 'name' | 'prefix'

const EMPTY: FormState = {
  name: '',
  prefix: '',
  description: '',
  status: ProjectStatus.ACTIVE,
  icon: 'folder',
  color: PROJECT_COLORS[0],
}

function validateField(name: FieldName, form: FormState): string | null {
  if (name === 'name') return form.name.trim() ? null : 'Enter a name for this project.'
  if (name === 'prefix') {
    if (!form.prefix.trim()) return 'Enter a 2–6 letter prefix, used for ticket IDs like ABC-12.'
    if (form.prefix.length < 2) return 'The prefix needs at least 2 letters.'
  }
  return null
}

export function ProjectFormDialog({
  open,
  onClose,
  project,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  project: Project | null
  onSaved: (project: Project, created: boolean) => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [initial, setInitial] = useState<FormState>(EMPTY)
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const next: FormState = project
      ? {
          name: project.name,
          prefix: project.prefix,
          description: (project.description as unknown as string) || '',
          status: project.status as ProjectStatus,
          icon: (project.icon as string) || 'folder',
          color: (project.color as string) || PROJECT_COLORS[0],
        }
      : EMPTY
    setForm(next)
    setInitial(next)
    setTouched({})
    setSubmitAttempted(false)
    setFormError(null)
  }, [open, project])

  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const errors = (['name', 'prefix'] as FieldName[])
    .map((field) => ({ field, message: validateField(field, form) }))
    .filter((e): e is { field: FieldName; message: string } => e.message !== null)

  const errorFor = (field: FieldName) =>
    touched[field] || submitAttempted ? validateField(field, form) : null

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

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
      const response = await fetch(project ? `/api/projects/${project.id}` : '/api/projects', {
        method: project ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          prefix: form.prefix.trim(),
          description: form.description || null,
          status: form.status,
          icon: form.icon,
          color: form.color,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.errors?.[0]?.message || `Saving failed (${response.status}).`)
      }
      const saved = await response.json()
      onSaved((saved.doc ?? saved) as Project, !project)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong saving this project.')
      requestAnimationFrame(() => summaryRef.current?.focus())
    } finally {
      setSubmitting(false)
    }
  }

  const Icon = projectIcon(form.icon)

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={project ? 'Edit project' : 'New project'}
        size="md"
        dismissible={!dirty && !submitting}
        onDismissBlocked={() => (dirty ? setConfirmDiscard(true) : onClose())}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => (dirty ? setConfirmDiscard(true) : onClose())}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" form="project-form" variant="primary" loading={submitting}>
              {project ? 'Save changes' : 'Create project'}
            </Button>
          </>
        }
      >
        <form id="project-form" noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
          {(submitAttempted && errors.length > 0) || formError ? (
            <ErrorSummary
              ref={summaryRef}
              errors={
                formError
                  ? [{ field: 'form', message: formError, targetId: 'project-form-name' }]
                  : errors.map((e) => ({
                      field: e.field,
                      message: e.message,
                      targetId: `project-form-${e.field}`,
                    }))
              }
            />
          ) : null}

          <div className="flex items-center gap-3">
            <EntityMark icon={Icon} color={form.color} size="lg" />
            <p className="text-base text-text-muted">
              Tickets in this project will be numbered{' '}
              <span className="text-text tabular">{form.prefix || 'ABC'}-1</span>.
            </p>
          </div>

          <div className="grid grid-cols-[1fr_9rem] gap-4 max-sm:grid-cols-1">
            <Field label="Name" required error={errorFor('name')}>
              {({ describedBy, invalid }) => (
                <Input
                  id="project-form-name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  onBlur={(e) => e.target.value.trim() && setTouched((t) => ({ ...t, name: true }))}
                  aria-invalid={invalid || undefined}
                  aria-describedby={describedBy}
                  aria-required
                />
              )}
            </Field>

            <Field
              label="Prefix"
              required
              error={errorFor('prefix')}
              hint={project ? 'Fixed once tickets exist.' : '2–6 letters.'}
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="project-form-prefix"
                  value={form.prefix}
                  disabled={Boolean(project)}
                  onChange={(e) =>
                    set('prefix', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6))
                  }
                  onBlur={(e) => e.target.value.trim() && setTouched((t) => ({ ...t, prefix: true }))}
                  aria-invalid={invalid || undefined}
                  aria-describedby={describedBy}
                  aria-required
                  className="tabular"
                />
              )}
            </Field>
          </div>

          <Field label="Status">
            {({ id }) => (
              <Select
                id={id}
                value={form.status}
                options={projectStatusOptions()}
                onValueChange={(next) => set('status', next as ProjectStatus)}
                className="w-48"
              />
            )}
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-muted">Description</span>
            <RichTextEditor
              value={form.description}
              onChange={(value) => set('description', value)}
              placeholder="Goals, scope, anything worth knowing…"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-medium text-text-muted">Icon</legend>
            <div className="flex flex-wrap gap-1">
              {PROJECT_ICONS.map((name) => {
                const Option = projectIcon(name)
                const selected = form.icon === name
                return (
                  <label
                    key={name}
                    title={name}
                    className={cn(
                      'flex size-8 cursor-pointer items-center justify-center rounded-sm border',
                      selected
                        ? 'border-accent bg-accent-subtle text-accent-text'
                        : 'border-transparent text-text-muted hover:bg-surface-hover',
                    )}
                  >
                    <input
                      type="radio"
                      name="project-icon"
                      value={name}
                      checked={selected}
                      onChange={() => set('icon', name)}
                      className="sr-only"
                    />
                    <Option className="size-4" aria-hidden />
                    <span className="sr-only">{name}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-medium text-text-muted">Colour</legend>
            <div className="flex flex-wrap gap-1.5">
              {PROJECT_COLORS.map((color) => {
                const selected = form.color === color
                return (
                  <label
                    key={color}
                    className={cn(
                      'flex size-7 cursor-pointer items-center justify-center rounded-full border-2',
                      selected ? 'border-text' : 'border-transparent',
                    )}
                  >
                    <input
                      type="radio"
                      name="project-color"
                      value={color}
                      checked={selected}
                      onChange={() => set('color', color)}
                      className="sr-only"
                    />
                    <span
                      className="flex size-5 items-center justify-center rounded-full"
                      style={{ backgroundColor: color }}
                    >

                      {selected && <Check className="size-3 text-white" aria-hidden />}
                    </span>
                    <span className="sr-only">{color}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          onClose()
        }}
        title="Discard your changes?"
        message="This project has unsaved edits. Closing now loses them."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
      />
    </>
  )
}
