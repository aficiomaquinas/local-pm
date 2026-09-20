import DOMPurify from 'isomorphic-dompurify'

const CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'blockquote', 'pre', 'code',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-member'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel|#|\/)/i,
}

export function sanitizeHtml(html: string): string {
  return html ? DOMPurify.sanitize(html, CONFIG) : ''
}
