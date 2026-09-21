'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import * as Popover from '@radix-ui/react-popover'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import 'react-day-picker/style.css'
import { cn } from '@/lib/cn'
import { Skeleton } from './Skeleton'
import { Button } from './Button'

const DayPicker = dynamic(() => import('react-day-picker').then((m) => m.DayPicker), {
  ssr: false,
  loading: () => <Skeleton className="h-[264px] w-[252px]" />,
})

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function toIso(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function fromIso(value: string): Date | undefined {
  if (!ISO.test(value)) return undefined
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : undefined
}

export interface DatePickerProps {
  id?: string
  label?: string
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  'aria-describedby'?: string
  'aria-label'?: string
  className?: string
}

export function DatePicker({
  id,
  label,
  value,
  onChange,
  disabled,
  invalid,
  placeholder = 'YYYY-MM-DD',
  className,
  ...aria
}: DatePickerProps) {
  const subject = label ? `the ${label.toLowerCase()}` : 'the date'
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setText(value), [value])

  const selected = fromIso(value)

  const commit = (next: string) => {
    const trimmed = next.trim()
    if (trimmed === '') {
      if (value === '') setText('')
      else onChange('')
      return
    }

    const parsed = fromIso(trimmed)
    if (!parsed) {
      setText(value)
      return
    }

    const iso = toIso(parsed)
    if (iso === value) setText(iso)
    else onChange(iso)
  }

  return (
    <div
      className={cn(
        'flex h-8 items-center gap-1 rounded-sm border border-border bg-surface pl-3 pr-1',
        'transition-colors duration-micro ease-standard',
        'focus-within:border-border-strong hover:border-border-strong',
        invalid && 'border-danger hover:border-danger',
        disabled && 'cursor-not-allowed bg-surface-hover',
        className,
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(text)
          }
        }}
        className={cn(
          'min-w-0 flex-1 bg-transparent text-base text-text outline-none tabular',
          'placeholder:text-text-muted disabled:text-text-disabled',
          'max-sm:text-md',
        )}
      />

      {value && !disabled && (
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          icon={X}
          aria-label={`Clear ${subject}`}
          onClick={() => {
            onChange('')
            inputRef.current?.focus()
          }}
        />
      )}

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            icon={CalendarDays}
            disabled={disabled}
            aria-label={`Choose ${subject} from the calendar`}
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className={cn(
              'z-60 rounded-lg border border-border-subtle bg-overlay p-3 shadow-e2',
              'animate-fade-in',
            )}
          >
            <DayPicker
              mode="single"
              autoFocus
              selected={selected}
              defaultMonth={selected}
              onSelect={(date) => {
                onChange(date ? toIso(date) : '')
                setOpen(false)
              }}
              showOutsideDays
              components={{
                PreviousMonthButton: (props) => (
                  <button {...props} className="rdp-nav-btn">
                    <ChevronLeft className="size-4" aria-hidden />
                  </button>
                ),
                NextMonthButton: (props) => (
                  <button {...props} className="rdp-nav-btn">
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                ),
              }}
            />
            <div className="mt-2 flex justify-between gap-2 border-t border-border-subtle pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange(toIso(new Date()))
                  setOpen(false)
                }}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                Clear
              </Button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
