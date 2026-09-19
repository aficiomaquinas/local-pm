import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  Minus,
  PauseCircle,
  Timer,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { ProjectStatus, TicketPriority, TicketStatus } from '@/types/enums'

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'

export interface StateMeta {
  value: string
  label: string
  icon: LucideIcon
  tone: Tone
}

export const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-neutral-subtle text-neutral-text border-neutral-border/60',
  info: 'bg-info-subtle text-info-text border-info-border/60',
  success: 'bg-success-subtle text-success-text border-success-border/60',
  warning: 'bg-warning-subtle text-warning-text border-warning-border/60',
  danger: 'bg-danger-subtle text-danger-text border-danger-border/60',
  accent: 'bg-accent-subtle text-accent-text border-accent-border/60',
}

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-text-muted',
  info: 'text-info-text',
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  accent: 'text-accent-text',
}

export const TICKET_STATUS_META: Record<TicketStatus, StateMeta> = {
  [TicketStatus.TODO]: {
    value: TicketStatus.TODO,
    label: 'Todo',
    icon: Circle,
    tone: 'neutral',
  },
  [TicketStatus.IN_PROGRESS]: {
    value: TicketStatus.IN_PROGRESS,
    label: 'In Progress',
    icon: Timer,
    tone: 'info',
  },
  [TicketStatus.DONE]: {
    value: TicketStatus.DONE,
    label: 'Done',
    icon: CheckCircle2,
    tone: 'success',
  },
}

export function ticketStatusMeta(status: string | null | undefined): StateMeta {
  return TICKET_STATUS_META[status as TicketStatus] ?? TICKET_STATUS_META[TicketStatus.TODO]
}

export interface PriorityMeta extends StateMeta {
  glyph: string

  rank: number
}

export const TICKET_PRIORITY_META: Record<TicketPriority, PriorityMeta> = {
  [TicketPriority.URGENT]: {
    value: TicketPriority.URGENT,
    label: 'Urgent',
    glyph: '▲▲▲',
    rank: 4,
    icon: AlertTriangle,
    tone: 'danger',
  },
  [TicketPriority.HIGH]: {
    value: TicketPriority.HIGH,
    label: 'High',
    glyph: '▲▲',
    rank: 3,
    icon: AlertTriangle,
    tone: 'warning',
  },
  [TicketPriority.MEDIUM]: {
    value: TicketPriority.MEDIUM,
    label: 'Medium',
    glyph: '▲',
    rank: 2,
    icon: CircleDot,
    tone: 'info',
  },
  [TicketPriority.LOW]: {
    value: TicketPriority.LOW,
    label: 'Low',
    glyph: '–',
    rank: 1,
    icon: Minus,
    tone: 'neutral',
  },
  [TicketPriority.NO_PRIORITY]: {
    value: TicketPriority.NO_PRIORITY,
    label: 'No Priority',
    glyph: '·',
    rank: 0,
    icon: CircleDashed,
    tone: 'neutral',
  },
}

export function ticketPriorityMeta(priority: string | null | undefined): PriorityMeta {
  return (
    TICKET_PRIORITY_META[priority as TicketPriority] ??
    TICKET_PRIORITY_META[TicketPriority.NO_PRIORITY]
  )
}

export const PROJECT_STATUS_META: Record<ProjectStatus, StateMeta> = {
  [ProjectStatus.ACTIVE]: {
    value: ProjectStatus.ACTIVE,
    label: 'Active',
    icon: CircleDot,
    tone: 'success',
  },
  [ProjectStatus.ON_HOLD]: {
    value: ProjectStatus.ON_HOLD,
    label: 'On Hold',
    icon: PauseCircle,
    tone: 'warning',
  },
  [ProjectStatus.COMPLETED]: {
    value: ProjectStatus.COMPLETED,
    label: 'Completed',
    icon: Check,
    tone: 'info',
  },
  [ProjectStatus.CANCELLED]: {
    value: ProjectStatus.CANCELLED,
    label: 'Cancelled',
    icon: XCircle,
    tone: 'neutral',
  },
}

export function projectStatusMeta(status: string | null | undefined): StateMeta {
  return PROJECT_STATUS_META[status as ProjectStatus] ?? PROJECT_STATUS_META[ProjectStatus.ACTIVE]
}

export const BLOCKED_META: StateMeta = {
  value: 'BLOCKED',
  label: 'Blocked',
  icon: Ban,
  tone: 'warning',
}
