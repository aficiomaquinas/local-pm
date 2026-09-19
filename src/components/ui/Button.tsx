'use client'

import { forwardRef } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-e1',
  secondary: 'bg-surface text-text border border-border hover:bg-surface-hover hover:border-border-strong',
  ghost: 'text-text-muted hover:bg-surface-hover hover:text-text',
  danger: 'bg-danger text-danger-fg hover:bg-danger-hover shadow-e1',
  link: 'text-accent-text underline-offset-2 hover:underline px-0',
}

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-6 px-1.5 text-xs gap-1 rounded-xs',
  sm: 'h-7 px-2 text-sm gap-1.5 rounded-sm',
  md: 'h-8 px-3 text-base gap-2 rounded-sm',
  lg: 'h-10 px-4 text-base gap-2 rounded-md',
}

const ICON_SIZE: Record<ButtonSize, string> = {
  xs: 'size-3.5',
  sm: 'size-4',
  md: 'size-4',
  lg: 'size-5',
}

const ICON_ONLY: Record<ButtonSize, string> = {
  xs: 'w-6 px-0',
  sm: 'w-7 px-0',
  md: 'w-8 px-0',
  lg: 'w-10 px-0',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize

  icon?: LucideIcon

  trailingIcon?: LucideIcon

  loading?: boolean

  iconOnly?: boolean

  shortcut?: string
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon: Icon,
    trailingIcon: TrailingIcon,
    loading = false,
    iconOnly = false,
    shortcut,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  const iconClass = ICON_SIZE[size]

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap',
        'transition-colors duration-micro ease-standard',
        'disabled:pointer-events-none disabled:opacity-50',

        'after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-full after:min-w-11',
        'after:-translate-x-1/2 after:-translate-y-1/2 after:content-[""]',
        'can-hover:after:hidden',
        SIZE[size],
        VARIANT[variant],
        iconOnly && ICON_ONLY[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className={cn(iconClass, 'animate-spin')} aria-hidden />
      ) : Icon ? (
        <Icon className={iconClass} aria-hidden />
      ) : null}
      {!iconOnly && children}
      {!iconOnly && TrailingIcon && !loading && <TrailingIcon className={iconClass} aria-hidden />}
      {!iconOnly && shortcut && (

        <kbd className="ml-auto pl-3 font-sans text-xs opacity-70 tabular">{shortcut}</kbd>
      )}
    </button>
  )
})
