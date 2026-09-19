'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderKanban, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'

export const SIDEBAR_DEFAULT = 256
export const SIDEBAR_MIN = 200
export const SIDEBAR_MAX = 480
export const SIDEBAR_RAIL = 48

const WIDTH_KEY = 'local-pm:sidebar-width'

export const NAV_ITEMS = [
  { href: '/board', label: 'Board', icon: LayoutDashboard, chord: 'g v' },
  { href: '/projects', label: 'Projects', icon: FolderKanban, chord: 'g p' },
  { href: '/teams', label: 'Teams', icon: Users, chord: 'g t' },
]

function clampWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(value)))
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const pathname = usePathname()
  const [width, setWidth] = useState(SIDEBAR_DEFAULT)
  const [dragging, setDragging] = useState(false)
  const navRef = useRef<HTMLUListElement>(null)
  const [focusIndex, setFocusIndex] = useState(0)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(WIDTH_KEY)
      if (stored) setWidth(clampWidth(Number(stored)))
    } catch {
    }
  }, [])

  const persist = useCallback((next: number) => {
    setWidth(next)
    try {
      localStorage.setItem(WIDTH_KEY, String(next))
    } catch {
    }
  }, [])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => setWidth(clampWidth(e.clientX))
    const onUp = () => {
      setDragging(false)
      setWidth((w) => {
        try {
          localStorage.setItem(WIDTH_KEY, String(w))
        } catch {
        }
        return w
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging])

  const onHandleKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 32 : 8
    if (e.key === 'ArrowLeft') persist(clampWidth(width - step))
    else if (e.key === 'ArrowRight') persist(clampWidth(width + step))
    else if (e.key === 'Home') persist(SIDEBAR_MIN)
    else if (e.key === 'End') persist(SIDEBAR_MAX)
    else return
    e.preventDefault()
  }

  const onNavKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const next =
      e.key === 'ArrowDown'
        ? (focusIndex + 1) % NAV_ITEMS.length
        : (focusIndex - 1 + NAV_ITEMS.length) % NAV_ITEMS.length
    setFocusIndex(next)
    navRef.current?.querySelectorAll<HTMLElement>('a')[next]?.focus()
  }

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-r border-border-subtle bg-bg-subtle"
      style={{ width: collapsed ? SIDEBAR_RAIL : width }}
    >
      <div
        className={cn(
          'flex h-12 flex-none items-center border-b border-border-subtle',
          collapsed ? 'justify-center px-1' : 'gap-2 px-3',
        )}
      >
        <Link
          href="/board"
          className="flex min-w-0 items-center gap-2 rounded-sm"
          aria-label="local-pm, go to board"
        >
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-xs bg-accent text-2xs font-semibold text-accent-fg"
          >
            PM
          </span>
          {!collapsed && <span className="truncate text-base font-semibold text-text">local-pm</span>}
        </Link>
        {!collapsed && (
          <Tooltip content="Collapse sidebar  ⌘\">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={PanelLeftClose}
              aria-label="Collapse sidebar"
              onClick={onToggleCollapsed}
              className="ml-auto"
            />
          </Tooltip>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center py-2">
          <Tooltip content="Expand sidebar  ⌘\">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={PanelLeftOpen}
              aria-label="Expand sidebar"
              onClick={onToggleCollapsed}
            />
          </Tooltip>
        </div>
      )}

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto p-2">
        <ul ref={navRef} className="flex flex-col gap-0.5" onKeyDown={onNavKeyDown}>
          {NAV_ITEMS.map((item, index) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
            const Icon = item.icon
            const link = (
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                tabIndex={index === focusIndex ? 0 : -1}
                onFocus={() => setFocusIndex(index)}
                className={cn(
                  'relative flex h-8 items-center rounded-sm text-base',
                  'transition-colors duration-micro ease-standard',
                  collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
                  active
                    ? 'bg-accent-subtle font-medium text-text'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text',

                  active &&
                    'before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-accent before:content-[""]',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && (
                  <kbd className="ml-auto font-sans text-2xs uppercase text-text-muted">{item.chord}</kbd>
                )}
              </Link>
            )

            return (
              <li key={item.href}>
                {collapsed ? <Tooltip content={item.label}>{link}</Tooltip> : link}
              </li>
            )
          })}
        </ul>
      </nav>

      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuenow={width}
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDoubleClick={() => persist(SIDEBAR_DEFAULT)}
          onKeyDown={onHandleKeyDown}
          className={cn(
            'absolute right-0 top-0 h-full w-1 cursor-col-resize',
            'transition-colors duration-micro hover:bg-accent',
            dragging && 'bg-accent',
          )}
        />
      )}
    </div>
  )
}
