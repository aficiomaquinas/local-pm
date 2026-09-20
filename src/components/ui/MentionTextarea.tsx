'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { caretPoint, type CaretPoint } from '@/lib/caret'
import { applyMention, findMentionQuery, wrapSelection, type MentionQuery } from '@/lib/mentions'
import { useEntityQuery } from '@/hooks/useEntityQuery'
import { Textarea } from './Field'
import { Avatar } from './Avatar'
import type { Member } from '@/payload-types'

const MAX_SUGGESTIONS = 6

export interface MentionTextareaProps {
  id?: string
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
  disabled?: boolean
  rows?: number
  autoFocus?: boolean
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

export function MentionTextarea({
  id,
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  rows = 3,
  autoFocus,
  className,
  ...aria
}: MentionTextareaProps) {
  const listboxId = useId()
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [mention, setMention] = useState<MentionQuery | null>(null)
  const [point, setPoint] = useState<CaretPoint | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const pendingSelection = useRef<number | null>(null)

  const { docs, loading } = useEntityQuery<Member>(mention?.query ?? '', {
    collection: 'members',
    searchField: 'name',
    sort: 'name',
    where: { active: 'true' },
    pageSize: MAX_SUGGESTIONS,
    enabled: mention !== null,
  })

  const suggestions = docs.slice(0, MAX_SUGGESTIONS)
  const open = mention !== null && suggestions.length > 0

  useEffect(() => {
    setActiveIndex(0)
  }, [mention?.query])

  useLayoutEffect(() => {
    const el = ref.current
    if (el && pendingSelection.current !== null) {
      el.setSelectionRange(pendingSelection.current, pendingSelection.current)
      pendingSelection.current = null
      el.focus()
    }
  }, [value])

  const syncMention = useCallback((el: HTMLTextAreaElement) => {
    const found = findMentionQuery(el.value, el.selectionStart ?? 0)
    setMention(found)
    setPoint(found ? caretPoint(el, found.start) : null)
  }, [])

  const insert = useCallback(
    (member: Member) => {
      const el = ref.current
      if (!el || !mention) return
      const next = applyMention(el.value, mention, { id: member.id, name: member.name })
      pendingSelection.current = next.caret
      setMention(null)
      setPoint(null)
      onChange(next.text)
    },
    [mention, onChange],
  )

  const wrap = useCallback(
    (before: string, after: string, placeholderText: string) => {
      const el = ref.current
      if (!el) return
      const next = wrapSelection(
        el.value,
        el.selectionStart ?? 0,
        el.selectionEnd ?? 0,
        before,
        after,
        placeholderText,
      )
      pendingSelection.current = next.end
      onChange(next.text)
      requestAnimationFrame(() => el.setSelectionRange(next.start, next.end))
    },
    [onChange],
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = event.metaKey || event.ctrlKey

    if (open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((i) => (i + 1) % suggestions.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        insert(suggestions[activeIndex])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setMention(null)
        setPoint(null)
        return
      }
    }

    if (mod && event.key === 'Enter') {
      event.preventDefault()
      onSubmit?.()
      return
    }
    if (mod && event.key.toLowerCase() === 'b') {
      event.preventDefault()
      wrap('**', '**', 'bold text')
      return
    }
    if (mod && event.key.toLowerCase() === 'i') {
      event.preventDefault()
      wrap('_', '_', 'italic text')
      return
    }
    if (mod && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      wrap('[', '](https://)', 'link text')
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-${activeIndex}` : undefined}
        className={cn('font-normal', className)}
        onChange={(event) => {
          onChange(event.target.value)
          syncMention(event.currentTarget)
        }}
        onKeyUp={(event) => syncMention(event.currentTarget)}
        onClick={(event) => syncMention(event.currentTarget)}
        onBlur={() => {
          setMention(null)
          setPoint(null)
        }}
        onKeyDown={onKeyDown}
        {...aria}
      />

      {open && point && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="People you can mention"
          style={{ top: point.top + point.height, left: Math.min(point.left, 240) }}
          className={cn(
            'absolute z-50 max-h-64 w-[min(280px,90%)] overflow-y-auto',
            'rounded-lg border border-border-subtle bg-overlay p-1 shadow-e2',
            'animate-fade-in',
          )}
        >
          {suggestions.map((member, index) => (
            <li
              key={member.id}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                'flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-base text-text',
                index === activeIndex && 'bg-surface-hover',
              )}
              onMouseDown={(event) => {
                event.preventDefault()
                insert(member)
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <Avatar name={member.name} seed={member.id} size="md" decorative />
              <span className="min-w-0 flex-1 truncate" title={member.name}>
                {member.name}
              </span>
            </li>
          ))}
        </ul>
      )}

      <span className="sr-only" role="status">
        {mention === null
          ? ''
          : open
            ? `${suggestions.length} ${suggestions.length === 1 ? 'person' : 'people'} to mention. Use the arrow keys, then Enter to insert.`
            : loading
              ? ''
              : `No people match ${mention.query}`}
      </span>
    </div>
  )
}
