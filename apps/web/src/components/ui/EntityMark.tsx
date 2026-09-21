'use client'

import {
  Box,
  Briefcase,
  Cloud,
  Code,
  Database,
  Flag,
  Folder,
  Heart,
  Layers,
  Megaphone,
  Rocket,
  Star,
  Target,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'

export const PROJECT_ICON_MAP: Record<string, LucideIcon> = {
  folder: Folder,
  rocket: Rocket,
  zap: Zap,
  star: Star,
  heart: Heart,
  flag: Flag,
  target: Target,
  briefcase: Briefcase,
  code: Code,
  box: Box,
  layers: Layers,
  database: Database,
  megaphone: Megaphone,
  cloud: Cloud,
  users: Users,
}

export function projectIcon(name: string | null | undefined): LucideIcon {
  return PROJECT_ICON_MAP[name ?? 'folder'] ?? Folder
}

const SIZE = {
  sm: { box: 'size-6 rounded-sm', icon: 'size-3.5' },
  md: { box: 'size-8 rounded-md', icon: 'size-4' },
  lg: { box: 'size-10 rounded-lg', icon: 'size-5' },
} as const

export function EntityMark({
  icon,
  color,
  size = 'md',
  className,
}: {
  icon: LucideIcon

  color?: string | null
  size?: keyof typeof SIZE
  className?: string
}) {
  const Icon = icon
  const spec = SIZE[size]

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-border-subtle',
        spec.box,
        className,
      )}
      style={
        color
          ? { backgroundColor: `${color}1f`, color, borderColor: `${color}33` }
          : undefined
      }
    >
      <Icon className={cn(spec.icon, !color && 'text-accent-text')} />
    </span>
  )
}

export function TicketKey({
  value,
  color,
  className,
}: {
  value: string | null | undefined
  color?: string | null
  className?: string
}) {
  if (!value) return null
  return (
    <span
      title={value}
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-sm bg-surface-hover px-1.5',
        'text-2xs font-semibold whitespace-nowrap text-text-muted tabular',
        className,
      )}
      style={color ? { backgroundColor: `${color}1f`, color } : undefined}
    >
      {value}
    </span>
  )
}
