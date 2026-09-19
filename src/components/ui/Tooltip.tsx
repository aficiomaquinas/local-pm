'use client'

import { cloneElement, useId, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

const HOVER_DELAY = 400

export function Tooltip({
  content,
  children,
  side = 'bottom',
}: {
  content: string

  children: ReactElement<any>
  side?: 'top' | 'bottom'
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()

  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setCoords({
      top: side === 'bottom' ? r.bottom + 6 : r.top - 6,
      left: r.left + r.width / 2,
    })
  }

  const show = (el: HTMLElement, immediate: boolean) => {
    place(el)
    if (immediate) {
      setOpen(true)
      return
    }
    timer.current = setTimeout(() => setOpen(true), HOVER_DELAY)
  }

  const hide = () => {
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
  }

  const child = cloneElement(children, {
    'aria-describedby': open ? id : undefined,
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') show(e.currentTarget, false)
      children.props["onPointerEnter"]?.(e)
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      hide()
      children.props["onPointerLeave"]?.(e)
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      show(e.currentTarget, true)
      children.props["onFocus"]?.(e)
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      hide()
      children.props["onBlur"]?.(e)
    },
  })

  return (
    <>
      {child}
      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{
              top: coords.top,
              left: coords.left,
              transform: side === 'bottom' ? 'translateX(-50%)' : 'translate(-50%, -100%)',
            }}
            className={cn(
              'pointer-events-none fixed z-70 max-w-[280px] rounded-sm',
              'border border-border-subtle bg-overlay px-2 py-1 shadow-e2',
              'text-xs text-text animate-fade-in',
            )}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  )
}
