'use client'

import { useState } from 'react'
import { CheckCircle2, CircleDot, Link2, MoreHorizontal, Pencil, Reply, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDateTimeRelative } from '@/lib/format'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Menu, type MenuItem } from '@/components/ui/Menu'
import { MentionTextarea } from '@/components/ui/MentionTextarea'
import { CommentBody } from './CommentBody'
import type { Comment, Member } from '@/payload-types'

function authorOf(comment: Comment): Member | null {
  return typeof comment.author === 'object' && comment.author ? comment.author : null
}

export interface CommentItemProps {
  comment: Comment
  isThreadRoot: boolean
  resolved?: boolean
  onReply?: () => void
  onToggleResolved?: () => void
  onEdit: (body: string) => Promise<boolean>
  onDelete: () => void
  onCopyLink: () => void
}

export function CommentItem({
  comment,
  isThreadRoot,
  resolved,
  onReply,
  onToggleResolved,
  onEdit,
  onDelete,
  onCopyLink,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const author = authorOf(comment)
  const pending = comment.id.startsWith('pending-')

  const save = async () => {
    if (!draft.trim()) return
    setSaving(true)
    const ok = await onEdit(draft).catch(() => false)
    setSaving(false)
    if (ok) setEditing(false)
  }

  const items: MenuItem[] = [
    {
      id: 'edit',
      label: 'Edit',
      icon: Pencil,
      onSelect: () => {
        setDraft(comment.body)
        setEditing(true)
      },
    },
    { id: 'copy', label: 'Copy link to comment', icon: Link2, onSelect: onCopyLink },
  ]

  if (isThreadRoot && onToggleResolved) {
    items.push({
      id: 'resolve',
      label: resolved ? 'Reopen thread' : 'Resolve thread',
      icon: resolved ? CircleDot : CheckCircle2,
      onSelect: onToggleResolved,
    })
  }

  items.push({
    id: 'delete',
    label: isThreadRoot ? 'Delete comment and replies' : 'Delete comment',
    icon: Trash2,
    destructive: true,
    separatorBefore: true,
    onSelect: onDelete,
  })

  return (
    <article
      id={`comment-${comment.id}`}
      className={cn('flex min-w-0 gap-2 scroll-mt-24', pending && 'opacity-60')}
    >
      <Avatar
        name={author?.name ?? null}
        seed={author?.id}
        size="lg"
        decorative
        className="mt-0.5"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-base font-medium text-text" title={author?.name ?? 'Unknown'}>
            {author?.name ?? 'Unknown'}
          </span>
          <time className="shrink-0 text-xs text-text-muted" dateTime={comment.createdAt}>
            {formatDateTimeRelative(comment.createdAt)}
          </time>
          {comment.editedAt && (
            <span className="shrink-0 text-xs text-text-muted" title={formatDateTimeRelative(comment.editedAt)}>
              (edited)
            </span>
          )}
          {pending && <span className="shrink-0 text-xs text-text-muted">Posting…</span>}

          {!pending && (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {onReply && (
                <Button variant="ghost" size="sm" icon={Reply} onClick={onReply}>
                  Reply
                </Button>
              )}
              <Menu
                label="Comment actions"
                items={items}
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={MoreHorizontal}
                    aria-label={`Actions for the comment by ${author?.name ?? 'an unknown person'}`}
                  />
                }
              />
            </div>
          )}
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <MentionTextarea
              value={draft}
              onChange={setDraft}
              onSubmit={save}
              aria-label="Edit comment"
              autoFocus
              rows={3}
            />
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" loading={saving} onClick={save}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <CommentBody body={comment.body} />
        )}
      </div>
    </article>
  )
}
