const MENTION = /@\[([^\]\n]{1,80})\]\(member:([A-Za-z0-9_-]{1,64})\)/g
const IMAGE = /!\[([^\]\n]{0,200})\]\(([^()\s]{1,500})\)/g
const LINK = /\[([^\]\n]{1,200})\]\(([^()\s]{1,500})\)/g
const AUTOLINK = /(^|[\s(])((?:https?:\/\/|www\.)[^\s<>()]{2,500})/g
const BOLD = /(\*\*|__)(?=\S)([\s\S]*?\S)\1/g
const ITALIC = /(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*/g
const ITALIC_UNDERSCORE = /(^|[^_\w])_(?=\S)([^_\n]*?\S)_/g
const STRIKE = /~~(?=\S)([\s\S]*?\S)~~/g
const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|\/|#)/i

const BLOCK_SLOT = /^<<B(\d+)>>$/
const INLINE_SLOT = /<<I(\d+)>>/g
const BLOCK_SLOT_ALL = /<<B(\d+)>>/g

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderMarkdown(source: string): string {
  if (!source || !source.trim()) return ''

  const blockSlots: string[] = []
  const inlineSlots: string[] = []

  let text = escapeHtml(source.replace(/\r\n?/g, '\n'))

  text = text.replace(/```[a-zA-Z0-9+#-]*\n([\s\S]*?)```/g, (_m, code: string) => {
    blockSlots.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`)
    return `\n<<B${blockSlots.length - 1}>>\n`
  })

  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    inlineSlots.push(`<code>${code}</code>`)
    return `<<I${inlineSlots.length - 1}>>`
  })

  return blocks(text.split('\n'), blockSlots)
    .replace(INLINE_SLOT, (_m, i: string) => inlineSlots[Number(i)] ?? '')
    .replace(BLOCK_SLOT_ALL, (_m, i: string) => blockSlots[Number(i)] ?? '')
}

function blocks(lines: string[], blockSlots: string[]): string {
  const out: string[] = []
  let buffer: string[] = []
  let mode: 'p' | 'ul' | 'ol' | 'quote' | null = null

  const flush = () => {
    if (mode && buffer.length > 0) {
      if (mode === 'p') {
        out.push(`<p>${buffer.map(inline).join('<br>')}</p>`)
      } else if (mode === 'quote') {
        out.push(`<blockquote>${buffer.map(inline).join('<br>')}</blockquote>`)
      } else {
        const items = buffer.map((item) => `<li>${inline(item)}</li>`).join('')
        out.push(mode === 'ul' ? `<ul>${items}</ul>` : `<ol>${items}</ol>`)
      }
    }
    buffer = []
    mode = null
  }

  for (const line of lines) {
    const slot = BLOCK_SLOT.exec(line.trim())
    if (slot) {
      flush()
      out.push(blockSlots[Number(slot[1])] ?? '')
      continue
    }

    if (!line.trim()) {
      flush()
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }

    const bullet = /^\s{0,3}[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      if (mode !== 'ul') flush()
      mode = 'ul'
      buffer.push(bullet[1])
      continue
    }

    const numbered = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/.exec(line)
    if (numbered) {
      if (mode !== 'ol') flush()
      mode = 'ol'
      buffer.push(numbered[1])
      continue
    }

    const quote = /^\s{0,3}&gt;\s?(.*)$/.exec(line)
    if (quote) {
      if (mode !== 'quote') flush()
      mode = 'quote'
      buffer.push(quote[1])
      continue
    }

    if (mode !== 'p') flush()
    mode = 'p'
    buffer.push(line.trim())
  }

  flush()
  return out.join('')
}

function inline(text: string): string {
  let out = text.replace(
    MENTION,
    (_m, name: string, id: string) => `<span class="mention" data-member="${id}">@${name}</span>`,
  )

  out = out.replace(IMAGE, (match, alt: string, src: string) =>
    SAFE_HREF.test(src)
      ? `<img src="${src}" alt="${alt}" loading="lazy" decoding="async">`
      : match,
  )

  out = out.replace(LINK, (match, label: string, href: string) =>
    SAFE_HREF.test(href)
      ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : match,
  )

  out = out.replace(AUTOLINK, (_m, lead: string, url: string) => {
    const href = url.startsWith('www.') ? `https://${url}` : url
    return `${lead}<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`
  })

  out = out.replace(BOLD, (_m, _fence: string, content: string) => `<strong>${content}</strong>`)
  out = out.replace(STRIKE, (_m, content: string) => `<s>${content}</s>`)
  out = out.replace(ITALIC, (_m, lead: string, content: string) => `${lead}<em>${content}</em>`)
  out = out.replace(
    ITALIC_UNDERSCORE,
    (_m, lead: string, content: string) => `${lead}<em>${content}</em>`,
  )

  return out
}

export function plainSummary(source: string, max = 140): string {
  const flat = source
    .replace(MENTION, (_m, name: string) => `@${name}`)
    .replace(IMAGE, (_m, alt: string) => alt || 'image')
    .replace(/```[\s\S]*?```/g, ' code ')
    .replace(/[`*_~#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}
