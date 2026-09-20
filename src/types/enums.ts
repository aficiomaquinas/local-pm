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
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
]
