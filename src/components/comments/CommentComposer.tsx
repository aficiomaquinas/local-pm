'use client'

import { useId, useState } from 'react'
import { AtSign, Send } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { MentionTextarea } from '@/components/ui/MentionTextarea'
import { TabList, TabPanel, type TabItem } from '@/components/ui/Tabs'
import { CommentBody } from './CommentBody'
import type { Member } from '@/payload-types'

const MODES: TabItem[] = [
  { id: 'write', label: 'Write' },
  { id: 'preview', label: 'Preview' },
]

export interface CommentComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel?: () => void
  author?: Member | null
  submitting?: boolean
  submitLabel?: string
  placeholder?: string
  autoFocus?: boolean
  compact?: boolean
  error?: string | null
}

export function CommentComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  author,
  submitting,
  submitLabel = 'Comment',
  placeholder = 'Leave a comment…',
  autoFocus,
  compact,
  error,
}: CommentComposerProps) {
  const fieldId = useId()
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`
  const [preview, setPreview] = useState(false)
  const [emptyError, setEmptyError] = useState<string | null>(null)

  const empty = value.trim().length === 0
  const shown = error ?? emptyError

  const submit = () => {
    if (empty) {
      setEmptyError('Write something before posting.')
      return
    }
    setEmptyError(null)
    setPreview(false)
    onSubmit()
  }

  return (
    <div className="flex min-w-0 gap-2">
      {!compact && (
        <Avatar
          name={author?.name ?? null}
          seed={author?.id}
          size="lg"
          decorative
          className="mt-1"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <TabList
          label="Comment editor mode"
          idPrefix={`${fieldId}-mode`}
          tabs={MODES}
          value={preview ? 'preview' : 'write'}
          onChange={(next) => setPreview(next === 'preview')}
          className="border-b border-border-subtle"
        />

        <label htmlFor={fieldId} className="sr-only">
          {submitLabel === 'Reply' ? 'Write a reply' : 'Write a comment'}
        </label>

        <TabPanel id="write" idPrefix={`${fieldId}-mode`} active={!preview}>
          <MentionTextarea
            id={fieldId}
            value={value}
            onChange={(next) => {
              if (emptyError) setEmptyError(null)
              onChange(next)
            }}
            onSubmit={submit}
            placeholder={placeholder}
            disabled={submitting}
            autoFocus={autoFocus}
            rows={compact ? 2 : 3}
            aria-describedby={shown ? errorId : hintId}
          />
        </TabPanel>

        <TabPanel id="preview" idPrefix={`${fieldId}-mode`} active={preview}>
          <div className="min-h-20 rounded-sm border border-border bg-surface px-3 py-2">
            {empty ? (
              <p className="text-base text-text-muted">Nothing to preview yet.</p>
            ) : (
              <CommentBody body={value} />
            )}
          </div>
        </TabPanel>

        <p id={errorId} role="alert" className={cn('text-xs text-danger-text', !shown && 'hidden')}>
          {shown}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <p id={hintId} className="mr-auto flex items-center gap-1 text-xs text-text-muted">
            <AtSign className="size-3.5 shrink-0" aria-hidden />
            Type @ to mention someone. Markdown works. ⌘/Ctrl + Enter posts.
          </p>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button variant="primary" size="sm" icon={Send} loading={submitting} onClick={submit}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
