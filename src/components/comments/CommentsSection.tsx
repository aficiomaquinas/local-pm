'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/cn'
import { plainSummary } from '@/lib/markdown'
import { formatDateTimeRelative } from '@/lib/format'
import { useComments, type CommentThread } from '@/hooks/useComments'
import { useCurrentMember } from '@/hooks/useCurrentMember'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton, useDelayedFlag } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { CommentComposer } from './CommentComposer'
import { CommentItem } from './CommentItem'
import type { Comment } from '@/payload-types'

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

  const count = threads.reduce((sum, thread) => sum + 1 + thread.replies.length, 0)

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
      toast({ tone: 'success', title: 'Link copied' })
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
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 shrink-0 text-text-muted" aria-hidden />
        <h3
          id="comments-heading"
          className="text-xs font-medium uppercase tracking-wide text-text-muted"
        >
          Comments
        </h3>
        {count > 0 && <span className="text-xs text-text-muted tabular">{count}</span>}
      </div>

      {loading || showSkeleton ? (
        <div className={cn('flex flex-col gap-4', !showSkeleton && 'invisible')} aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-full" />
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
        <p className="text-base text-text-muted">
          No comments yet. Ask a question, or leave a note for whoever picks this up.
        </p>
      ) : (
        <ol className="flex flex-col gap-5">
          {threads.map((thread) => (
            <li key={thread.comment.id} className="min-w-0">
              <Thread
                thread={thread}
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
  onReplySubmit,
  onEdit,
  onDelete,
  onToggleResolved,
  onCopyLink,
}: {
  thread: CommentThread
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

  const resolved = Boolean(thread.comment.resolved)
  const collapsed = resolved && !expanded
  const replyCount = thread.replies.length

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
        'flex min-w-0 flex-col gap-3 rounded-md border p-3',
        resolved ? 'border-success-border/60 bg-success-subtle/40' : 'border-border-subtle bg-surface',
      )}
    >
      {resolved && (
        <div className="flex flex-wrap items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-success-text" aria-hidden />
          <span className="text-xs font-medium text-success-text">
            Resolved
            {thread.comment.resolvedAt
              ? ` · ${formatDateTimeRelative(thread.comment.resolvedAt)}`
              : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? 'Hide' : `Show ${replyCount + 1} ${replyCount === 0 ? 'comment' : 'comments'}`}
          </Button>
        </div>
      )}

      {!collapsed && (
        <>
          <CommentItem
            comment={thread.comment}
            isThreadRoot
            resolved={resolved}
            onReply={() => setReplying(true)}
            onToggleResolved={onToggleResolved}
            onEdit={(body) => onEdit(thread.comment.id, body)}
            onDelete={() => onDelete(thread.comment, replyCount)}
            onCopyLink={() => onCopyLink(thread.comment)}
          />

          {replyCount > 0 && (
            <ol className="flex flex-col gap-4 border-l border-border-subtle pl-4">
              {thread.replies.map((reply) => (
                <li key={reply.id} className="min-w-0">
                  <CommentItem
                    comment={reply}
                    isThreadRoot={false}
                    onEdit={(body) => onEdit(reply.id, body)}
                    onDelete={() => onDelete(reply, 0)}
                    onCopyLink={() => onCopyLink(reply)}
                  />
                </li>
              ))}
            </ol>
          )}

          {replying ? (
            <div className="border-l border-border-subtle pl-4">
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
          ) : (
            replyCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setReplying(true)}
              >
                Reply to this thread
              </Button>
            )
          )}
        </>
      )}
    </div>
  )
}
