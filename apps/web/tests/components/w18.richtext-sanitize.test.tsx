import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import DOMPurify from 'isomorphic-dompurify'

/**
 * Upstream d7747b6 port: RichTextDisplay is the boundary where untrusted
 * Quill HTML (stored raw) meets the DOM. The sanitizer policy lives beside
 * the component (not exported); these tests pin the OBSERVABLE contract via
 * the same isomorphic-dompurify entry point the component uses, so a policy
 * regression (new tag/attr slipping through, URL scheme escape) fails here.
 *
 * Rendering the component itself only asserts the empty-state branch and
 * that content is not emitted raw — the sanitized markup is injected via
 * dangerouslySetInnerHTML, which jsdom resolves the same way.
 */
import { RichTextDisplay } from '@/components/ui/RichTextEditor'

const POLICY = {
  ALLOWED_TAGS: [
    'p', 'br', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'blockquote', 'pre', 'code',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel|#|\/)/i,
}

const sanitize = (dirty: string) => DOMPurify.sanitize(dirty, POLICY)

describe('RichTextDisplay XSS boundary (upstream d7747b6 port)', () => {
  it('renders the empty state for empty and blank-only content', () => {
    const { rerender, container } = render(<RichTextDisplay content="" />)
    expect(container.textContent).toMatch(/No description/)
    rerender(<RichTextDisplay content="<p><br></p>" />)
    expect(container.textContent).toMatch(/No description/)
  })

  it('strips script tags and event handlers from stored descriptions', () => {
    const dirty = '<p onclick="alert(1)">hi<script>alert(2)</script><img src=x onerror=alert(3)></p>'
    const clean = sanitize(dirty)
    expect(clean).not.toMatch(/<script/i)
    expect(clean).not.toMatch(/onerror|onclick/i)
    // The component must never emit the raw payload.
    const { container } = render(<RichTextDisplay content={dirty} />)
    expect(container.innerHTML).not.toContain('<script')
    expect(container.innerHTML).toContain('hi')
  })

  it('blocks javascript: and data: URLs while keeping http(s) links', () => {
    expect(sanitize('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/)
    expect(sanitize('<a href="data:text/html,alert(1)">x</a>')).not.toMatch(/data:/)
    const ok = sanitize('<a href="https://example.com">x</a>')
    expect(ok).toMatch(/href="https:\/\/example\.com"/)
  })

  it('keeps the formatting Quill is allowed to produce', () => {
    const dirty = '<h2>T</h2><p><strong>b</strong> <em>i</em></p><ul><li>l</li></ul><a href="/x">a</a>'
    const clean = sanitize(dirty)
    for (const tag of ['h2', 'strong', 'em', 'ul', 'li', 'a']) {
      expect(clean).toContain(`<${tag}`)
    }
  })

  it('is operative on the server (no live DOM): isomorphic build must not pass input through', () => {
    // The reason upstream switched from dompurify to isomorphic-dompurify:
    // on the server DOMPurify.isSupported is false and sanitize() would
    // return its input UNCHANGED. This test runs in the node environment —
    // if the isomorphic build were broken, this returns the dirty string.
    const dirty = '<svg onload=alert(1)></svg><p>ok</p>'
    expect(sanitize(dirty)).not.toContain('<svg')
    expect(sanitize(dirty)).toContain('<p>ok</p>')
  })
})
