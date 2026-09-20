'use client'

import { useRef } from 'react'
import { cn } from '@/lib/cn'
import type { StateIcon } from '@/lib/status'

export interface TabItem {
  id: string
  label: string
  icon?: StateIcon
  count?: number
}

export function TabList({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
  className,
}: {
  tabs: TabItem[]
  value: string
  onChange: (id: string) => void
  label: string
  idPrefix: string
  className?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)

  const focusTab = (index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[(index + tabs.length) % tabs.length]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowRight') focusTab(index + 1)
    else if (event.key === 'ArrowLeft') focusTab(index - 1)
    else if (event.key === 'Home') focusTab(0)
    else if (event.key === 'End') focusTab(tabs.length - 1)
    else return
    event.preventDefault()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cn('no-scrollbar -mb-px flex items-center gap-1 overflow-x-auto', className)}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === value
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'relative flex h-9 shrink-0 items-center gap-2 rounded-sm px-3 text-base',
              'transition-colors duration-micro ease-standard',
              active
                ? 'font-medium text-text'
                : 'text-text-muted hover:bg-surface-hover hover:text-text',

              active &&
                'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent after:content-[""]',
            )}
          >
            {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-xs px-1',
                  'text-2xs font-medium tabular',
                  active ? 'bg-accent-subtle text-accent-text' : 'bg-surface-hover text-text-muted',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({
  id,
  idPrefix,
  active,
  children,
  className,
}: {
  id: string
  idPrefix: string
  active: boolean
  children: React.ReactNode
  className?: string
}) {
  if (!active) return null
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      tabIndex={0}
      className={cn('outline-offset-4', className)}
    >
      {children}
    </div>
  )
}
