'use client'

import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import 'react-quill-new/dist/quill.snow.css'

const ReactQuill = dynamic(() => import('react-quill-new'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[150px] bg-secondary/30 border border-border/50 rounded-md animate-pulse" />
  ),
})

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  readOnly?: boolean
}

const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ indent: '-1' }, { indent: '+1' }],
    ['link'],
    ['clean'],
  ],
}

const formats = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'list',
  'indent',
  'link',
]

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write something...',
  readOnly = false,
}: RichTextEditorProps) {
  const editorModules = useMemo(() => (readOnly ? { toolbar: false } : modules), [readOnly])

  return (
    <div className="rich-text-editor">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={editorModules}
        formats={formats}
        placeholder={placeholder}
        readOnly={readOnly}
      />
    </div>
  )
}

/**
 * Tags and attributes a ticket/project description may contain. Kept in step
 * with the `formats` array the editor above allows, plus the wrappers Quill
 * emits for lists and indentation.
 */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'blockquote', 'pre', 'code',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  // Block javascript:/data: URLs in links.
  ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel|#|\/)/i,
}

/**
 * Display rich text content (read-only).
 *
 * The XSS fix originates with Brian Tafoya (@btafoya) in btafoya/local-pm,
 * commit 9de82f2. See CREDITS.md.
 *
 * Changed here from `dompurify` to `isomorphic-dompurify`: plain DOMPurify
 * needs a live DOM, and on the server `DOMPurify.isSupported` is false, in
 * which case `sanitize()` returns its input UNCHANGED. Since this is rendered
 * during SSR, the upstream fix still shipped unsanitized markup in the server
 * HTML — the payload fires before React hydrates and the client-side sanitizer
 * ever runs. The isomorphic build carries a jsdom window on the server, so the
 * same policy applies in both passes.
 *
 * Descriptions are stored as raw HTML from the Quill editor, so this is the
 * boundary where untrusted markup meets the DOM.
 */
export function RichTextDisplay({ content }: { content: string }) {
  const sanitized = useMemo(
    () => (content ? DOMPurify.sanitize(content, SANITIZE_CONFIG) : ''),
    [content],
  )

  if (!content || content === '<p><br></p>' || !sanitized.trim()) {
    return <p className="text-sm text-muted-foreground italic">No description</p>
  }

  return (
    <div
      className="rich-text-content"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  )
}
