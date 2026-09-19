'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface MenuItem {
  id: string
  label: string
  icon?: LucideIcon
  shortcut?: string
  destructive?: boolean
  disabled?: boolean

  separatorBefore?: boolean
  groupLabel?: string
  onSelect: () => void
}

export interface MenuProps {
  items: MenuItem[]

  children: (props: {
    ref: React.Ref<HTMLButtonElement>
    'aria-haspopup': 'menu'
    'aria-expanded': boolean
    'aria-controls': string | undefined
    onClick: () => void
    onKeyDown: (e: React.KeyboardEvent) => void
  }) => React.ReactNode
  align?: 'start' | 'end'

  label: string
}

export function Menu({ items, children, align = 'end', label }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typeAhead = useRef({ query: '', at: 0 })
  const menuId = useId()

  const enabled = items.filter((i) => !i.disabled)

  const close = useCallback(
    (restoreFocus = true) => {
      setOpen(false)
      if (restoreFocus) triggerRef.current?.focus()
    },
    [],
  )

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect) setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[activeIndex]?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [open, activeIndex])

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'Tab') {
      close(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % enabled.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + enabled.length) % enabled.length)
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      setActiveIndex(enabled.length - 1)
      return
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now()
      typeAhead.current.query = now - typeAhead.current.at > 800 ? e.key : typeAhead.current.query + e.key
      typeAhead.current.at = now
      const match = enabled.findIndex((i) =>
        i.label.toLowerCase().startsWith(typeAhead.current.query.toLowerCase()),
      )
      if (match >= 0) setActiveIndex(match)
    }
  }

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setActiveIndex(0)
      setOpen(true)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(Math.max(0, enabled.length - 1))
      setOpen(true)
    }
  }

  return (
    <>
      {children({
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => {
          setActiveIndex(0)
          setOpen((o) => !o)
        },
        onKeyDown: onTriggerKeyDown,
      })}

      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={listRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onListKeyDown}
            style={{
              top: coords.top,
              ...(align === 'end'
                ? { left: coords.left + coords.width, transform: 'translateX(-100%)' }
                : { left: coords.left }),
            }}
            className={cn(
              'fixed z-60 min-w-[180px] max-w-[320px] overflow-hidden rounded-lg',
              'border border-border-subtle bg-overlay py-1 shadow-e2',
              'animate-fade-in',
            )}
          >
            {items.map((item, index) => {
              const Icon = item.icon
              const enabledIndex = enabled.indexOf(item)
              return (
                <div key={item.id}>
                  {item.separatorBefore && index > 0 && (
                    <div className="my-1 h-px bg-border-subtle" role="separator" />
                  )}
                  {item.groupLabel && (
                    <div className="px-3 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-text-muted">
                      {item.groupLabel}
                    </div>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={enabledIndex === activeIndex ? 0 : -1}
                    disabled={item.disabled}
                    onClick={() => {
                      close()
                      item.onSelect()
                    }}
                    onMouseEnter={() => enabledIndex >= 0 && setActiveIndex(enabledIndex)}
                    className={cn(
                      'flex h-8 w-full items-center gap-2 px-3 text-left text-base',
                      'transition-colors duration-micro',
                      'hover:bg-surface-hover focus-visible:bg-surface-hover',
                      'disabled:cursor-not-allowed disabled:text-text-disabled',
                      item.destructive ? 'text-danger-text' : 'text-text',
                    )}
                  >
                    {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="shrink-0 font-sans text-xs text-text-muted tabular">{item.shortcut}</kbd>
                    )}
                  </button>
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
