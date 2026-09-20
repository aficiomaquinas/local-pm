'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, MessageSquare, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { plainSummary } from '@/lib/markdown'
import { formatDateTimeRelative } from '@/lib/format'
import { useComments, type CommentThread } from '@/hooks/useComments'
import { useCurrentMember } from '@/hooks/useCurrentMember'
import { useCommentPermalink } from '@/hooks/useCommentPermalink'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton, useDelayedFlag } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { CommentComposer } from './CommentComposer'
import { CommentItem } from './CommentItem'
import type { Comment, Member } from '@/payload-types'

const COLLAPSE_REPLIES_ABOVE = 4

export function CommentsSection({ ticketId }: { ticketId: string }) {
  const { toast } = useToast()
  const { member } = useCurrentMember()
  const { threads, loading, error, retry, add, edit, remove, setResolved } = useComments(ticketId)

  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ comment: Comment; replies: number } | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)

  const showSkeleton = useDelayedFlag(loading)
  const permalink = useCommentPermalink(!loading && threads.length > 0)

  const count = threads.reduce((sum, thread) => sum + 1 + thread.replies.length, 0)
  const resolvedCount = threads.filter((thread) => Boolean(thread.comment.resolved)).length

  const post = async () => {
    setPosting(true)
    setPostError(null)
    try {
      await add(draft, null, member)
      setDraft('')
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'The comment was not posted.')
    } finally {
      setPosting(false)
    }
  }

  const copyLink = async (comment: Comment) => {
    const url = `${window.location.origin}/tickets/${ticketId}#comment-${comment.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast({ tone: 'success', title: 'Link copied', description: 'It opens on this comment.' })
    } catch {
      toast({ tone: 'error', title: "Couldn't copy the link", description: url })
    }
  }

  const editComment = async (id: string, body: string) => {
    try {
      return await edit(id, body)
    } catch (err) {
      toast({
        tone: 'error',
        title: "Couldn't save that edit",
        description: err instanceof Error ? err.message : undefined,
      })
      return false
    }
  }

  const toggleResolved = async (comment: Comment) => {
    const next = !comment.resolved
    try {
      await setResolved(comment.id, next)
    } catch (err) {
      toast({
        tone: 'error',
        title: next ? "Couldn't resolve that thread" : "Couldn't reopen that thread",
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await remove(pendingDelete.comment.id)
      setPendingDelete(null)
    } catch (err) {
      toast({
        tone: 'error',
        title: "Couldn't delete that comment",
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby="comments-heading">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <MessageSquare className="size-4 shrink-0 text-text-muted" aria-hidden />
        <h3
          id="comments-heading"
          className="text-xs font-medium uppercase tracking-wide text-text-muted"
        >
          Comments
        </h3>
        {count > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-surface-hover px-1 text-2xs font-medium tabular text-text-muted">
            {count}
          </span>
        )}
        {resolvedCount > 0 && (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-text-muted">
            <CheckCircle2 className="size-3.5 shrink-0 text-success-text" aria-hidden />
            {resolvedCount} resolved
          </span>
        )}
      </div>

      {permalink.target && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent-border bg-accent-subtle px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-accent-text">
            Jumped to the comment this link points at.
          </p>
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            className="text-accent-text"
            onClick={permalink.clear}
          >
            Clear highlight
          </Button>
        </div>
      )}

      {loading || showSkeleton ? (
        <div className={cn('flex flex-col gap-4', !showSkeleton && 'invisible')} aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3 rounded-lg border border-border-subtle p-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-danger-border bg-danger-subtle p-3">
          <AlertCircle className="size-4 shrink-0 text-danger-text" aria-hidden />
          <p className="min-w-0 flex-1 text-base text-danger-text">
            Couldn&rsquo;t load the comments. {error}
          </p>
          <Button variant="secondary" size="sm" onClick={retry}>
            Retry
          </Button>
        </div>
      ) : threads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-subtle px-4 py-6 text-center">
          <MessageSquare className="mx-auto size-6 text-text-muted" aria-hidden />
          <p className="mt-2 text-base font-medium text-text">No comments yet.</p>
          <p className="mt-1 text-base text-text-muted">
            Ask a question, or leave a note for whoever picks this up.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {threads.map((thread) => (
            <li key={thread.comment.id} className="min-w-0">
              <Thread
                thread={thread}
                author={member}
                highlightId={permalink.target}
                onReplySubmit={(body) => add(body, thread.comment.id, member)}
                onEdit={editComment}
                onDelete={(comment, replies) => setPendingDelete({ comment, replies })}
                onToggleResolved={() => toggleResolved(thread.comment)}
                onCopyLink={copyLink}
              />
            </li>
          ))}
        </ol>
      )}

      <div className="border-t border-border-subtle pt-4">
        <CommentComposer
          value={draft}
          onChange={setDraft}
          onSubmit={post}
          author={member}
          submitting={posting}
          error={postError}
        />
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete this comment?"
        message={plainSummary(pendingDelete?.comment.body ?? '', 120)}
        consequence={
          pendingDelete && pendingDelete.replies > 0
            ? `Its ${pendingDelete.replies} ${pendingDelete.replies === 1 ? 'reply goes' : 'replies go'} with it. This cannot be undone.`
            : 'This cannot be undone.'
        }
        confirmLabel="Delete comment"
      />
    </section>
  )
}

function Thread({
  thread,
  author,
  highlightId,
  onReplySubmit,
  onEdit,
  onDelete,
  onToggleResolved,
  onCopyLink,
}: {
  thread: CommentThread
  author: Member | null
  highlightId: string | null
  onReplySubmit: (body: string) => Promise<boolean>
  onEdit: (id: string, body: string) => Promise<boolean>
  onDelete: (comment: Comment, replies: number) => void
  onToggleResolved: () => void
  onCopyLink: (comment: Comment) => void
}) {
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [showAllReplies, setShowAllReplies] = useState(false)

  const resolved = Boolean(thread.comment.resolved)
  const replyCount = thread.replies.length
  const holdsTarget =
    highlightId !== null &&
    (thread.comment.id === highlightId ||
      thread.replies.some((reply) => reply.id === highlightId))

  useEffect(() => {
    if (!holdsTarget) return
    setExpanded(true)
    setShowAllReplies(true)
  }, [holdsTarget])

  const collapsed = resolved && !expanded
  const rootMember =
    typeof thread.comment.author === 'object' && thread.comment.author
      ? thread.comment.author
      : null
  const rootAuthor = rootMember?.name ?? null
  const rootAuthorId = rootMember?.id
  const hidden = showAllReplies ? 0 : Math.max(0, replyCount - COLLAPSE_REPLIES_ABOVE)
  const visibleReplies = hidden > 0 ? thread.replies.slice(hidden) : thread.replies

  const sendReply = async () => {
    setSending(true)
    setReplyError(null)
    try {
      await onReplySubmit(draft)
      setDraft('')
      setReplying(false)
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'The reply was not posted.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border',
        resolved ? 'border-success-border/70 bg-success-subtle/30' : 'border-border-subtle bg-surface',
      )}
    >
      {resolved && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 bg-success-subtle px-3 py-1.5',
            !collapsed && 'border-b border-success-border/50',
          )}
        >
          <CheckCircle2 className="size-4 shrink-0 text-success-text" aria-hidden />
          <span className="min-w-0 text-xs font-medium text-text">
            Resolved
            {thread.comment.resolvedAt
              ? ` · ${formatDateTimeRelative(thread.comment.resolvedAt)}`
              : ''}
          </span>
          {collapsed && rootAuthor && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
              <span aria-hidden>·</span>
              <Avatar name={rootAuthor} seed={rootAuthorId} size="sm" decorative />
              <span className="truncate">Opened by {rootAuthor}</span>
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-text"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded
              ? 'Hide'
              : `Show ${replyCount + 1} ${replyCount === 0 ? 'comment' : 'comments'}`}
          </Button>
        </div>
      )}

      {!collapsed && (
        <div className="flex min-w-0 flex-col gap-3 p-3">
          <CommentItem
            comment={thread.comment}
            isThreadRoot
            resolved={resolved}
            highlighted={highlightId === thread.comment.id}
            onReply={() => setReplying(true)}
            onToggleResolved={onToggleResolved}
            onEdit={(body) => onEdit(thread.comment.id, body)}
            onDelete={() => onDelete(thread.comment, replyCount)}
            onCopyLink={() => onCopyLink(thread.comment)}
          />

          {(replyCount > 0 || replying) && (
            <div className="relative min-w-0 pl-8">
              <span
                className="absolute bottom-0 left-4 top-0 w-px bg-border-subtle"
                aria-hidden
              />

              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllReplies(true)}
                  className={cn(
                    'mb-3 flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium',
                    'text-text-muted transition-colors duration-micro ease-standard',
                    'hover:bg-surface-hover hover:text-text',
                  )}
                >
                  <ChevronDown className="size-3.5 shrink-0" aria-hidden />
                  Show {hidden} earlier {hidden === 1 ? 'reply' : 'replies'}
                </button>
              )}

              {visibleReplies.length > 0 && (
                <ol className="flex flex-col gap-4">
                  {visibleReplies.map((reply) => (
                    <li key={reply.id} className="min-w-0">
                      <CommentItem
                        comment={reply}
                        isThreadRoot={false}
                        highlighted={highlightId === reply.id}
                        onEdit={(body) => onEdit(reply.id, body)}
                        onDelete={() => onDelete(reply, 0)}
                        onCopyLink={() => onCopyLink(reply)}
                      />
                    </li>
                  ))}
                </ol>
              )}

              {replying && (
                <div className={cn(visibleReplies.length > 0 && 'mt-4')}>
                  <CommentComposer
                    value={draft}
                    onChange={setDraft}
                    onSubmit={sendReply}
                    onCancel={() => {
                      setReplying(false)
                      setReplyError(null)
                    }}
                    submitting={sending}
                    submitLabel="Reply"
                    placeholder="Write a reply…"
                    error={replyError}
                    autoFocus
                    compact
                  />
                </div>
              )}
            </div>
          )}

          {!replying && (
            <button
              type="button"
              onClick={() => setReplying(true)}
              className={cn(
                'ml-8 flex min-w-0 items-center gap-2 rounded-sm border border-border-subtle',
                'bg-bg-subtle px-3 py-1.5 text-left text-base text-text-muted',
                'transition-colors duration-micro ease-standard',
                'hover:border-border hover:bg-surface-hover hover:text-text',
              )}
            >
              <Avatar name={author?.name ?? null} seed={author?.id} size="md" decorative />
              <span className="truncate">
                {replyCount > 0 ? 'Reply to this thread…' : 'Reply…'}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
