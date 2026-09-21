'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { INITIATIVE_ICONS, InitiativeStatus, PROJECT_COLORS } from '@/types/enums'
import { initiativeStatusOptions } from '@/lib/status'
import { projectIdsOf } from '@/lib/initiative'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DatePicker } from '@/components/ui/DatePicker'
import { ErrorSummary, Field, Input } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { MemberSelect } from '@/components/ui/EntityPickers'
import { EntityMark, initiativeIcon } from '@/components/ui/EntityMark'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { useToast } from '@/components/ui/Toast'
import type { Initiative, Member } from '@/payload-types'

interface FormState {
  name: string
  description: string
  status: InitiativeStatus
  lead: string
  targetDate: string
  icon: string
  color: string
}

type FieldName = 'name'

const EMPTY: FormState = {
  name: '',
  description: '',
  status: InitiativeStatus.PLANNED,
  lead: '',
  targetDate: '',
  icon: 'target',
  color: PROJECT_COLORS[0],
}

function validateField(name: FieldName, form: FormState): string | null {
  if (name === 'name') return form.name.trim() ? null : 'Enter a name for this initiative.'
  return null
}

function leadOf(initiative: Initiative | null): Member | null {
  const lead = initiative?.lead
  return lead && typeof lead === 'object' ? (lead as Member) : null
}

export function InitiativeForm({
  initiative,
  returnTo,
}: {
  initiative: Initiative | null
  returnTo?: string
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [selectedLead, setSelectedLead] = useState<Member | null>(leadOf(initiative))

  const initialState: FormState = initiative
    ? {
        name: initiative.name,
        description: (initiative.description as unknown as string) || '',
        status: initiative.status as InitiativeStatus,
        lead: leadOf(initiative)?.id ?? (typeof initiative.lead === 'string' ? initiative.lead : ''),
        targetDate: initiative.targetDate ?? '',
        icon: (initiative.icon as string) || 'target',
        color: (initiative.color as string) || PROJECT_COLORS[0],
      }
    : EMPTY

  const [form, setForm] = useState<FormState>(initialState)
  const [initial] = useState<FormState>(initialState)
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const summaryRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const dirty = !submitting && JSON.stringify(form) !== JSON.stringify(initial)
  useUnsavedChangesGuard(dirty)

  useEffect(() => {
    if (!initiative) nameRef.current?.focus()
  }, [initiative])

  const errors = (['name'] as FieldName[])
    .map((field) => ({ field, message: validateField(field, form) }))
    .filter((e): e is { field: FieldName; message: string } => e.message !== null)

  const errorFor = (field: FieldName) =>
    touched[field] || submitAttempted ? validateField(field, form) : null

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const cancelHref = returnTo ?? (initiative ? `/initiatives/${initiative.id}` : '/initiatives')

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
      const response = await fetch(
        initiative ? `/api/initiatives/${initiative.id}` : '/api/initiatives',
        {
          method: initiative ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description || null,
            status: form.status,
            lead: form.lead || null,
            targetDate: form.targetDate || null,
            icon: form.icon,
            color: form.color,
            ...(initiative ? {} : { projects: [] }),
          }),
        },
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.errors?.[0]?.message || `Saving failed (${response.status}).`)
      }
      const saved = ((await response.json()).doc ?? {}) as Initiative
      toast({
        tone: 'success',
        title: initiative ? 'Changes saved' : `${saved.name ?? 'Initiative'} created`,
      })
      leave(returnTo ?? `/initiatives/${saved.id ?? initiative?.id}`)
    } catch (error) {
      setSubmitting(false)
      setFormError(
        error instanceof Error ? error.message : 'Something went wrong saving this initiative.',
      )
      requestAnimationFrame(() => summaryRef.current?.focus())
    }
  }

  const Icon = initiativeIcon(form.icon)
  const projectCount = initiative ? projectIdsOf(initiative).length : 0

  return (
    <div className="h-full overflow-y-auto">
      <form
        id="initiative-form"
        noValidate
        onSubmit={handleSubmit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            event.currentTarget.requestSubmit()
          }
        }}
      >
        <header className="sticky top-0 z-20 border-b border-border-subtle bg-bg">
          <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-3 px-6 py-4 max-md:px-4">
            <div className="min-w-0 flex-1">
              <nav aria-label="Breadcrumb">
                <Link
                  href={cancelHref}
                  onClick={(event) => {
                    if (dirty) {
                      event.preventDefault()
                      setConfirmDiscard(true)
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-sm text-xs text-text-muted transition-colors duration-micro hover:text-text"
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                  {initiative ? initiative.name : 'Initiatives'}
                </Link>
              </nav>
              <h1 className="mt-1 text-xl font-semibold text-text">
                {initiative ? 'Edit initiative' : 'New initiative'}
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
              <Button type="submit" form="initiative-form" variant="primary" loading={submitting}>
                {initiative ? 'Save changes' : 'Create initiative'}
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
                  ? [{ field: 'form', message: formError, targetId: 'initiative-form-name' }]
                  : errors.map((e) => ({
                      field: e.field,
                      message: e.message,
                      targetId: `initiative-form-${e.field}`,
                    }))
              }
            />
          ) : null}

          <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface px-4 py-3">
            <EntityMark icon={Icon} color={form.color} size="lg" />
            <p className="text-base text-text-muted">
              {initiative
                ? `Rolling up ${projectCount} ${projectCount === 1 ? 'project' : 'projects'}. Add or remove them on the initiative page.`
                : 'Create it first, then add the projects it rolls up.'}
            </p>
          </div>

          <Field id="initiative-form-name" label="Name" required error={errorFor('name')}>
            {({ describedBy, invalid }) => (
              <Input
                ref={nameRef}
                id="initiative-form-name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                onBlur={(e) => e.target.value.trim() && setTouched((t) => ({ ...t, name: true }))}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                aria-required
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <Field label="Status">
              {({ id }) => (
                <Select
                  id={id}
                  value={form.status}
                  options={initiativeStatusOptions()}
                  onValueChange={(next) => set('status', next as InitiativeStatus)}
                />
              )}
            </Field>

            <Field label="Target date" optional>
              {({ id }) => (
                <DatePicker
                  id={id}
                  value={form.targetDate}
                  onChange={(next) => set('targetDate', next)}
                />
              )}
            </Field>
          </div>

          <Field label="Lead" optional hint="The person accountable for this initiative.">
            {({ id, describedBy }) => (
              <MemberSelect
                id={id}
                value={form.lead}
                selected={selectedLead}
                allLabel="No lead"
                aria-describedby={describedBy}
                className="w-full max-w-96"
                onChange={(value, member) => {
                  setSelectedLead(member)
                  set('lead', value)
                }}
              />
            )}
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-muted">Description</span>
            <RichTextEditor
              value={form.description}
              onChange={(value) => set('description', value)}
              placeholder="The objective, its scope, how success is judged…"
            />
          </div>

          <fieldset className="flex flex-col gap-2 border-t border-border-subtle pt-5">
            <legend className="text-xs font-medium text-text-muted">Icon</legend>
            <div className="flex flex-wrap gap-1">
              {INITIATIVE_ICONS.map((name) => {
                const Option = initiativeIcon(name)
                const selected = form.icon === name
                return (
                  <label
                    key={name}
                    title={name}
                    className={cn(
                      'flex size-9 cursor-pointer items-center justify-center rounded-sm border',
                      'transition-colors duration-micro ease-standard',
                      selected
                        ? 'border-accent bg-accent-subtle text-accent-text'
                        : 'border-transparent text-text-muted hover:bg-surface-hover hover:text-text',
                    )}
                  >
                    <input
                      type="radio"
                      name="initiative-icon"
                      value={name}
                      checked={selected}
                      onChange={() => set('icon', name)}
                      className="sr-only"
                    />
                    <Option className="size-4.5" aria-hidden />
                    <span className="sr-only">{name}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2 border-t border-border-subtle pt-5">
            <legend className="text-xs font-medium text-text-muted">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((color) => {
                const selected = form.color === color
                return (
                  <label
                    key={color}
                    className={cn(
                      'flex size-8 cursor-pointer items-center justify-center rounded-full border-2',
                      'transition-colors duration-micro ease-standard',
                      selected ? 'border-text' : 'border-transparent hover:border-border-strong',
                    )}
                  >
                    <input
                      type="radio"
                      name="initiative-color"
                      value={color}
                      checked={selected}
                      onChange={() => set('color', color)}
                      className="sr-only"
                    />
                    <span
                      className="flex size-6 items-center justify-center rounded-full"
                      style={{ backgroundColor: color }}
                    >
                      {selected && <Check className="size-3.5 text-white" aria-hidden />}
                    </span>
                    <span className="sr-only">{color}</span>
                  </label>
                )
              })}
            </div>
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
        message="This initiative has unsaved edits. Leaving now loses them."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
      />
    </div>
  )
}
