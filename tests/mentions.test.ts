import { describe, expect, it } from 'vitest'
import {
  applyMention,
  extractMentionIds,
  findMentionQuery,
  mentionNames,
  mentionToken,
  wrapSelection,
} from '@/lib/mentions'

describe('mentionToken', () => {
  it('encodes a member as a token', () => {
    expect(mentionToken({ id: 'abc123', name: 'Alex Rivera' })).toBe(
      '@[Alex Rivera](member:abc123)',
    )
  })

  it('strips bracket characters that would break parsing', () => {
    expect(mentionToken({ id: 'x1', name: 'Sam [Ops] (PM)' })).toBe('@[Sam  Ops   PM](member:x1)')
  })
})

describe('extractMentionIds', () => {
  it('finds every mentioned id once, in order', () => {
    const body = 'cc @[Alex](member:a1) and @[Bo](member:b2) then @[Alex](member:a1) again'
    expect(extractMentionIds(body)).toEqual(['a1', 'b2'])
  })

  it('ignores a bare at-sign and a malformed token', () => {
    expect(extractMentionIds('email me @alex or @[Bo](user:b2)')).toEqual([])
  })

  it('returns names alongside ids', () => {
    expect(mentionNames('hi @[Alex Rivera](member:a1)')).toEqual([
      { id: 'a1', name: 'Alex Rivera' },
    ])
  })
})

describe('findMentionQuery', () => {
  it('detects a query at the caret', () => {
    const text = 'ping @ale'
    expect(findMentionQuery(text, text.length)).toEqual({ query: 'ale', start: 5, end: 9 })
  })

  it('detects an empty query right after the trigger', () => {
    expect(findMentionQuery('ping @', 6)).toEqual({ query: '', start: 5, end: 6 })
  })

  it('triggers at the very start of the field', () => {
    expect(findMentionQuery('@bo', 3)).toEqual({ query: 'bo', start: 0, end: 3 })
  })

  it('does not trigger mid-word, so email addresses are safe', () => {
    expect(findMentionQuery('alex@example.com', 16)).toBeNull()
  })

  it('stops at whitespace, so a finished mention does not reopen', () => {
    expect(findMentionQuery('ping @alex and then', 19)).toBeNull()
  })

  it('does not treat an inserted token as an open query', () => {
    const text = '@[Alex](member:a1) '
    expect(findMentionQuery(text, text.length)).toBeNull()
  })
})

describe('applyMention', () => {
  it('replaces the query with a token and a trailing space', () => {
    const text = 'ping @ale'
    const result = applyMention(text, { start: 5, end: 9 }, { id: 'a1', name: 'Alex' })
    expect(result.text).toBe('ping @[Alex](member:a1) ')
    expect(result.caret).toBe(result.text.length)
  })

  it('keeps the text that follows the caret', () => {
    const text = 'ping @ale now'
    const result = applyMention(text, { start: 5, end: 9 }, { id: 'a1', name: 'Alex' })
    expect(result.text).toBe('ping @[Alex](member:a1)  now')
  })
})

describe('wrapSelection', () => {
  it('wraps a selection', () => {
    expect(wrapSelection('make this bold', 10, 14, '**')).toEqual({
      text: 'make this **bold**',
      start: 12,
      end: 16,
    })
  })

  it('inserts a placeholder when nothing is selected', () => {
    const result = wrapSelection('', 0, 0, '**', '**', 'bold text')
    expect(result.text).toBe('**bold text**')
    expect(result.text.slice(result.start, result.end)).toBe('bold text')
  })

  it('unwraps an already wrapped selection', () => {
    expect(wrapSelection('a **b** c', 4, 5, '**')).toEqual({ text: 'a b c', start: 2, end: 3 })
  })

  it('supports asymmetric markers for links', () => {
    const result = wrapSelection('see docs', 4, 8, '[', '](https://)')
    expect(result.text).toBe('see [docs](https://)')
  })
})
