'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/cn'
import { renderMarkdown } from '@/lib/markdown'
import { sanitizeHtml } from '@/lib/sanitize'

export function CommentBody({ body, className }: { body: string; className?: string }) {
  const html = useMemo(() => sanitizeHtml(renderMarkdown(body)), [body])

  return (
    <div
      className={cn('rich-text-content comment-body', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
