export interface Edit {
  text: string
  start: number
  end: number
}

export function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string = before,
  placeholder = '',
): Edit {
  const selected = text.slice(start, end)
  const head = text.slice(0, start)
  const tail = text.slice(end)

  if (selected.length === 0) {
    const next = `${head}${before}${placeholder}${after}${tail}`
    return {
      text: next,
      start: start + before.length,
      end: start + before.length + placeholder.length,
    }
  }

  const alreadyWrapped =
    head.endsWith(before) && tail.startsWith(after) && before.length > 0 && after.length > 0
  if (alreadyWrapped) {
    const next = head.slice(0, head.length - before.length) + selected + tail.slice(after.length)
    return { text: next, start: start - before.length, end: end - before.length }
  }

  const next = `${head}${before}${selected}${after}${tail}`
  return { text: next, start: start + before.length, end: end + before.length }
}

export function prefixLines(
  text: string,
  start: number,
  end: number,
  prefix: string,
  ordered = false,
): Edit {
  const from = text.lastIndexOf('\n', start - 1) + 1
  const lineEnd = text.indexOf('\n', end)
  const to = lineEnd === -1 ? text.length : lineEnd

  const block = text.slice(from, to)
  const lines = block.split('\n')
  const matcher = ordered ? /^\d{1,3}[.)]\s+/ : new RegExp(`^${escapeRegExp(prefix)}`)
  const allPrefixed = lines.every((line) => line.trim() === '' || matcher.test(line))

  const next = lines
    .map((line, index) => {
      if (line.trim() === '') return line
      if (allPrefixed) return line.replace(matcher, '')
      return ordered ? `${index + 1}. ${line}` : `${prefix}${line}`
    })
    .join('\n')

  const body = text.slice(0, from) + next + text.slice(to)
  if (start === end) {
    const caret = from + next.length
    return { text: body, start: caret, end: caret }
  }
  return { text: body, start: from, end: from + next.length }
}

export function insertBlock(text: string, start: number, end: number, block: string): Edit {
  const head = text.slice(0, start)
  const tail = text.slice(end)
  const lead = head === '' || head.endsWith('\n') ? '' : head.endsWith('\n\n') ? '' : '\n'
  const trail = tail === '' || tail.startsWith('\n') ? '\n' : '\n\n'
  const next = `${head}${lead}${block}${trail}${tail}`
  const caret = head.length + lead.length + block.length + trail.length
  return { text: next, start: caret, end: caret }
}

export function replaceRange(text: string, start: number, end: number, value: string): Edit {
  const next = text.slice(0, start) + value + text.slice(end)
  const caret = start + value.length
  return { text: next, start: caret, end: caret }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
