import { describe, expect, it } from 'vitest'
import { escapeHtml, plainSummary, renderMarkdown } from '@/lib/markdown'

describe('escapeHtml', () => {
  it('neutralises markup', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    )
  })
})

describe('renderMarkdown', () => {
  it('returns nothing for an empty body', () => {
    expect(renderMarkdown('   ')).toBe('')
  })

  it('wraps plain text in a paragraph', () => {
    expect(renderMarkdown('hello')).toBe('<p>hello</p>')
  })

  it('escapes HTML before anything else', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    )
  })

  it('cannot have its code slots forged from user input', () => {
    expect(renderMarkdown('<<B0>> and <<I0>>')).toBe('<p>&lt;&lt;B0&gt;&gt; and &lt;&lt;I0&gt;&gt;</p>')
  })

  it('renders bold, italic, strikethrough and inline code', () => {
    expect(renderMarkdown('**bold** _italic_ ~~gone~~ `code`')).toBe(
      '<p><strong>bold</strong> <em>italic</em> <s>gone</s> <code>code</code></p>',
    )
  })

  it('leaves markdown inside inline code alone', () => {
    expect(renderMarkdown('`**not bold**`')).toBe('<p><code>**not bold**</code></p>')
  })

  it('renders a fenced code block as its own block', () => {
    expect(renderMarkdown('before\n```ts\nconst a = 1\n```\nafter')).toBe(
      '<p>before</p><pre><code>const a = 1</code></pre><p>after</p>',
    )
  })

  it('renders bullet and numbered lists', () => {
    expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>')
    expect(renderMarkdown('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>')
  })

  it('renders blockquotes after escaping the marker', () => {
    expect(renderMarkdown('> quoted')).toBe('<blockquote>quoted</blockquote>')
  })

  it('joins consecutive lines of a paragraph with a line break', () => {
    expect(renderMarkdown('one\ntwo')).toBe('<p>one<br>two</p>')
  })

  it('renders a mention as a chip carrying the member id', () => {
    expect(renderMarkdown('ping @[Alex Rivera](member:a1)')).toBe(
      '<p>ping <span class="mention" data-member="a1">@Alex Rivera</span></p>',
    )
  })

  it('renders markdown links and bare URLs', () => {
    expect(renderMarkdown('[docs](https://example.com)')).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a></p>',
    )
    expect(renderMarkdown('see https://example.com now')).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>',
    )
  })

  it('refuses a javascript: link', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a')
  })

  it('does not mistake a mention token for a markdown link', () => {
    expect(renderMarkdown('@[Bo](member:b2)')).not.toContain('<a')
  })

  it('renders an attached image', () => {
    expect(renderMarkdown('![shot.png](/api/attachments/file/shot.png)')).toBe(
      '<p><img src="/api/attachments/file/shot.png" alt="shot.png" loading="lazy" decoding="async"></p>',
    )
  })

  it('renders a non-image attachment as a link, not an image', () => {
    const html = renderMarkdown('[notes.pdf](/api/attachments/file/notes.pdf)')
    expect(html).toContain('<a href="/api/attachments/file/notes.pdf"')
    expect(html).not.toContain('<img')
  })

  it('refuses an image with an unsafe source', () => {
    expect(renderMarkdown('![x](javascript:alert(1))')).not.toContain('<img')
  })
})

describe('plainSummary', () => {
  it('flattens formatting and keeps the mention name', () => {
    expect(plainSummary('**ship it** cc @[Alex](member:a1)')).toBe('ship it cc @Alex')
  })

  it('truncates long bodies', () => {
    expect(plainSummary('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`)
  })

  it('reduces an image to its alt text', () => {
    expect(plainSummary('see ![the crash](/api/attachments/file/a.png)')).toBe('see the crash')
  })
})
