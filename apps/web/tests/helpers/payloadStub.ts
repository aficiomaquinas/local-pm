import { vi } from 'vitest'
import type { Payload } from 'payload'

/**
 * Minimal inline `Payload` stub for the pure history-feed helpers (W6, T1):
 * buildHistoryFeed only uses findVersions. Return-canned-documents stubs —
 * no MongoDB, no runtime (SPC-003 §4.1). The cast keeps the test honest
 * about which members the code under test may touch.
 */
export interface FindVersionsCall {
  collection: string
  where?: Record<string, unknown>
  sort?: string
  limit?: number
  page?: number
  depth?: number
}

export interface StubPayload extends Payload {
  __calls: FindVersionsCall[]
}

export function stubPayload(
  findVersionsByCollection: Partial<Record<string, Array<Record<string, unknown>>>>,
  options: { global?: Record<string, unknown> | null } = {},
): StubPayload {
  const calls: FindVersionsCall[] = []
  const payload = {
    findVersions: async (args: FindVersionsCall) => {
      calls.push(args)
      const docs = findVersionsByCollection[args.collection] ?? []
      return {
        docs,
        totalDocs: docs.length,
        limit: args.limit ?? docs.length,
        totalPages: 1,
        page: args.page ?? 1,
        pagingCounter: 1,
        hasPrevPage: false,
        hasNextPage: false,
        prevPage: null,
        nextPage: null,
      }
    },
    // find() is used by parentLabels resolution; empty by default.
    find: async () => ({ docs: [] }),
    // findGlobal() is used by the SPC-005 soft-delete behavior resolution.
    findGlobal: async (args: { slug: string }) =>
      (options.global ?? {}) as Record<string, unknown>,
  }
  const result = payload as unknown as StubPayload
  result.__calls = calls
  return result
}

/** A real-shaped Payload version row (what findVersions returns). */
export function makeVersionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ver_0001',
    parent: 'tick_0001',
    autosave: false,
    createdAt: '2026-09-07T05:00:00.000Z',
    updatedAt: '2026-09-07T06:00:00.000Z',
    version: {
      title: 'Ship SPC-003',
      ticketId: 'PCF-1',
      status: 'IN_PROGRESS',
    },
    ...overrides,
  }
}
