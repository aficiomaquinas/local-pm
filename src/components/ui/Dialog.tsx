'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

const SIZE: Record<DialogSize, string> = {
  sm: 'max-w-[440px]',
  md: 'max-w-[600px]',
  lg: 'max-w-[780px]',
  xl: 'max-w-[960px]',
  full: 'max-w-none w-full h-full rounded-none',
}

const FOCUSABLE =
  'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),' +
  'button:not([disabled]),iframe,object,embed,[contenteditable],[tabindex]:not([tabindex="-1"])'

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(children, document.body)
}

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const { body } = document
    const gap = window.innerWidth - document.documentElement.clientWidth
    const prevOverflow = body.style.overflow
    const prevPad = body.style.paddingRight
    body.style.overflow = 'hidden'
    if (gap > 0) body.style.paddingRight = `${gap}px`
    return () => {
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPad
    }
  }, [active])
}

function useFocusTrap(
  active: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  initialFocus: 'first-field' | 'heading' | 'safe-action' | 'none',
) {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const root = container.closest('[data-dialog-root]')
    const siblings = (Array.from(document.body.children) as HTMLElement[]).filter(
      (el) => el !== root && !el.hasAttribute('data-live-region'),
    )
    const restoreInert = siblings.map((el) => {
      const had = el.hasAttribute('inert')
      if (!had) el.setAttribute('inert', '')
      return () => {
        if (!had) el.removeAttribute('inert')
      }
    })

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )

    const raf = requestAnimationFrame(() => {
      if (initialFocus === 'none') return
      if (initialFocus === 'heading') {
        container.querySelector<HTMLElement>('[data-dialog-title]')?.focus()
        return
      }
      if (initialFocus === 'safe-action') {
        const safe = container.querySelector<HTMLElement>('[data-safe-action]')
        if (safe) {
          safe.focus()
          return
        }
      }
      const field = container.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),select:not([disabled])',
      )
      ;(field ?? focusables()[0] ?? container).focus()
    })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const activeEl = document.activeElement as HTMLElement
      if (e.shiftKey && (activeEl === first || !container.contains(activeEl))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(raf)
      container.removeEventListener('keydown', onKeyDown)
      restoreInert.forEach((fn) => fn())

      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [active, containerRef, initialFocus])
}

export interface DialogProps {
  open: boolean
  onClose: () => void

  title: string
  description?: string
  size?: DialogSize

  alert?: boolean

  dismissible?: boolean

  onDismissBlocked?: () => void
  initialFocus?: 'first-field' | 'heading' | 'safe-action' | 'none'
  footer?: React.ReactNode

  headerActions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  alert = false,
  dismissible = true,
  onDismissBlocked,
  initialFocus = 'first-field',
  footer,
  headerActions,
  children,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  useScrollLock(open)
  useFocusTrap(open, panelRef, initialFocus)

  const attemptClose = useCallback(() => {
    if (dismissible) onClose()
    else onDismissBlocked?.()
  }, [dismissible, onClose, onDismissBlocked])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        attemptClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, attemptClose])

  if (!open) return null

  return (
    <Portal>
    <div
      data-dialog-root
      className="fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0"
    >
      <div
        className="absolute inset-0 bg-scrim backdrop-blur-[4px] animate-fade-in"
        onClick={attemptClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          'relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl',
          'border border-border-subtle bg-overlay shadow-e3',
          'animate-dialog-in',

          'max-sm:h-full max-sm:max-h-none max-sm:rounded-none',
          SIZE[size],
          className,
        )}
      >
        <header className="flex flex-none items-start gap-3 border-b border-border-subtle px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              data-dialog-title
              tabIndex={-1}
              className="text-md font-semibold text-text outline-offset-4"
            >
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-base text-text-muted">
                {description}
              </p>
            )}
          </div>
          <div className="flex flex-none items-center gap-1">
            {headerActions}
            <Button variant="ghost" size="md" iconOnly icon={X} aria-label="Close" onClick={attemptClose} />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <footer className="flex flex-none items-center justify-end gap-3 border-t border-border-subtle px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
    </Portal>
  )
}

export interface SidePanelProps {
  open: boolean
  onClose: () => void

  title: string

  titleContent?: React.ReactNode

  eyebrow?: React.ReactNode
  headerActions?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode

  dismissible?: boolean
  onDismissBlocked?: () => void
  className?: string
}

export function SidePanel({
  open,
  onClose,
  title,
  titleContent,
  eyebrow,
  headerActions,
  footer,
  children,
  dismissible = true,
  onDismissBlocked,
  className,
}: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useScrollLock(open)
  useFocusTrap(open, panelRef, 'heading')

  const attemptClose = useCallback(() => {
    if (dismissible) onClose()
    else onDismissBlocked?.()
  }, [dismissible, onClose, onDismissBlocked])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        attemptClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, attemptClose])

  if (!open) return null

  return (
    <Portal>
    <div data-dialog-root className="fixed inset-0 z-50 flex justify-end max-md:items-end">
      <div className="absolute inset-0 bg-scrim animate-fade-in" onClick={attemptClose} aria-hidden />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative flex h-full w-full flex-col overflow-hidden border-l border-border-subtle bg-overlay shadow-e3',
          'animate-panel-in md:max-w-[min(640px,50vw)] md:min-w-[480px]',

          'max-md:h-[92vh] max-md:rounded-t-xl max-md:border-l-0 max-md:border-t',
          className,
        )}
      >
        <header className="flex flex-none items-start gap-3 border-b border-border-subtle px-5 py-4">
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="mb-1.5 flex flex-wrap items-center gap-2">{eyebrow}</div>}
            <h2
              id={titleId}
              data-dialog-title
              tabIndex={-1}
              className="text-lg font-semibold text-text outline-offset-4"
            >
              {titleContent ?? title}
            </h2>
          </div>
          <div className="flex flex-none items-center gap-1">
            {headerActions}
            <Button variant="ghost" size="md" iconOnly icon={X} aria-label="Close" onClick={attemptClose} />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <footer className="flex flex-none items-center justify-end gap-3 border-t border-border-subtle px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
    </Portal>
  )
}
