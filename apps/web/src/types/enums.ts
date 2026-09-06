export enum TicketStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export enum TicketPriority {
  NO_PRIORITY = 'NO_PRIORITY',
  URGENT = 'URGENT',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const TICKET_STATUS_OPTIONS = [
  { label: 'Todo', value: TicketStatus.TODO },
  { label: 'In Progress', value: TicketStatus.IN_PROGRESS },
  { label: 'Done', value: TicketStatus.DONE },
]

export const TICKET_PRIORITY_OPTIONS = [
  { label: 'No Priority', value: TicketPriority.NO_PRIORITY },
  { label: 'Urgent', value: TicketPriority.URGENT },
  { label: 'High', value: TicketPriority.HIGH },
  { label: 'Medium', value: TicketPriority.MEDIUM },
  { label: 'Low', value: TicketPriority.LOW },
]

export const PROJECT_STATUS_OPTIONS = [
  { label: 'Active', value: ProjectStatus.ACTIVE },
  { label: 'On Hold', value: ProjectStatus.ON_HOLD },
  { label: 'Completed', value: ProjectStatus.COMPLETED },
  { label: 'Cancelled', value: ProjectStatus.CANCELLED },
]

export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  [TicketPriority.NO_PRIORITY]: '#6b7280',
  [TicketPriority.URGENT]: '#ef4444',
  [TicketPriority.HIGH]: '#f97316',
  [TicketPriority.MEDIUM]: '#eab308',
  [TicketPriority.LOW]: '#22c55e',
}

export const STATUS_COLORS: Record<TicketStatus, string> = {
  [TicketStatus.TODO]: '#6b7280',
  [TicketStatus.IN_PROGRESS]: '#3b82f6',
  [TicketStatus.DONE]: '#22c55e',
}

export const PROJECT_ICONS = [
  'folder',
  'rocket',
  'zap',
  'star',
  'heart',
  'flag',
  'target',
  'briefcase',
  'code',
  'box',
  'layers',
  'database',
  'megaphone',
  'cloud',
  'users',
]

export const PROJECT_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#a855f7', // Purple
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber/Yellow
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
]
