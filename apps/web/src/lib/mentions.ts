export const MENTION_PATTERN = /@\[([^\]\n]{1,80})\]\(member:([A-Za-z0-9_-]{1,64})\)/g

export interface MentionTarget {
  id: string
  name: string
}

export interface MentionQuery {
  query: string
  start: number
  end: number
}

export function mentionToken(member: MentionTarget): string {
  return `@[${member.name.replace(/[[\]()\n]/g, ' ').trim()}](member:${member.id})`
}

export function extractMentionIds(body: string): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const id = match[2]
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export function mentionNames(body: string): MentionTarget[] {
  const out: MentionTarget[] = []
  const seen = new Set<string>()
  for (const match of body.matchAll(MENTION_PATTERN)) {
    if (seen.has(match[2])) continue
    seen.add(match[2])
    out.push({ id: match[2], name: match[1] })
  }
  return out
}

const MAX_QUERY = 40

export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  if (caret < 1 || caret > text.length) return null

  for (let i = caret - 1; i >= 0 && caret - i <= MAX_QUERY + 1; i -= 1) {
    const char = text[i]
    if (char === '@') {
      const before = i > 0 ? text[i - 1] : ''
      if (before && !/[\s(]/.test(before)) return null
      const query = text.slice(i + 1, caret)
      if (/[\s[\]()]/.test(query)) return null
      return { query, start: i, end: caret }
    }
    if (/[\s[\]()]/.test(char)) return null
  }

  return null
}

export function applyMention(
  text: string,
  range: { start: number; end: number },
  member: MentionTarget,
): { text: string; caret: number } {
  const token = `${mentionToken(member)} `
  const next = text.slice(0, range.start) + token + text.slice(range.end)
  return { text: next, caret: range.start + token.length }
}
