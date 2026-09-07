import { describe, it, expect } from 'vitest'
import {
  TicketStatus,
  TicketPriority,
  ProjectStatus,
  TICKET_STATUS_OPTIONS,
  TICKET_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PRIORITY_COLORS,
  STATUS_COLORS,
  PROJECT_ICONS,
  PROJECT_COLORS,
} from '@/types/enums'

/**
 * W1 — Pure utilities in src/ (T1): the enums/options tables are the web
 * app's canonical pure data layer — every option list, color map and icon
 * catalog used by forms and the board. Input→output tables + completeness
 * edge cases.
 */
describe('W1: status/option tables (pure data utilities)', () => {
  it('ticket status enum values are the Payload-stored UPPER strings', () => {
    expect(TicketStatus.TODO).toBe('TODO')
    expect(TicketStatus.IN_PROGRESS).toBe('IN_PROGRESS')
    expect(TicketStatus.DONE).toBe('DONE')
  })

  it('every option list entry carries a label and a valid enum value', () => {
    for (const opt of TICKET_STATUS_OPTIONS) {
      expect(opt.label).toBeTruthy()
      expect(Object.values(TicketStatus)).toContain(opt.value)
    }
    for (const opt of TICKET_PRIORITY_OPTIONS) {
      expect(opt.label).toBeTruthy()
      expect(Object.values(TicketPriority)).toContain(opt.value)
    }
    for (const opt of PROJECT_STATUS_OPTIONS) {
      expect(opt.label).toBeTruthy()
      expect(Object.values(ProjectStatus)).toContain(opt.value)
    }
  })

  it('option lists cover their enums completely (no dead enum values)', () => {
    expect(TICKET_STATUS_OPTIONS.map((o) => o.value)).toEqual(Object.values(TicketStatus))
    expect(TICKET_PRIORITY_OPTIONS.map((o) => o.value)).toEqual(Object.values(TicketPriority))
    expect(PROJECT_STATUS_OPTIONS.map((o) => o.value)).toEqual(Object.values(ProjectStatus))
  })

  it('color/icon catalogs are well-formed hex/name lists', () => {
    expect(PROJECT_COLORS.every((c) => /^#[0-9a-fA-F]{6}$/.test(c))).toBe(true)
    expect(PROJECT_ICONS.length).toBeGreaterThanOrEqual(12)
    expect(new Set(PROJECT_ICONS).size).toBe(PROJECT_ICONS.length) // no duplicates
  })
})

/**
 * W2 — Status/color maps used by board rendering (T1): every collection
 * status has a rendering; KanbanColumn reads STATUS_COLORS[id] and falls
 * back to '#6366f1'.
 */
describe('W2: board status/priority color maps', () => {
  it('every ticket status has a color entry', () => {
    for (const status of Object.values(TicketStatus)) {
      expect(STATUS_COLORS[status]).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('every ticket priority has a color entry', () => {
    for (const priority of Object.values(TicketPriority)) {
      expect(PRIORITY_COLORS[priority]).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('maps match the documented column colors (TODO gray, IN_PROGRESS blue, DONE green)', () => {
    expect(STATUS_COLORS[TicketStatus.TODO]).toBe('#6b7280')
    expect(STATUS_COLORS[TicketStatus.IN_PROGRESS]).toBe('#3b82f6')
    expect(STATUS_COLORS[TicketStatus.DONE]).toBe('#22c55e')
  })
})
