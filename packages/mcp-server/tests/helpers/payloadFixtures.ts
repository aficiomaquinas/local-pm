/**
 * SPC-003 §5.1: canned test doubles for the Payload REST API (T2's "recorded
 * contract"). Shapes are taken from the REAL payloads the app produces —
 * see docs/specs/2026-09-06_SPC-003_testing-strategy.md §2 ("Payload
 * envelope") and src/index.ts, the consumer being tested.
 *
 * Success envelope: a real list response, captured 2026-09-07 from a live
 * dev server:
 *   {"docs":[…],"totalDocs":1,"limit":1,"totalPages":1,"page":1,
 *    "pagingCounter":1,"hasPrevPage":false,"hasNextPage":false,
 *    "prevPage":null,"nextPage":null}
 */
export interface ListEnvelope<T = Record<string, unknown>> {
  docs: T[]
  totalDocs: number
  limit: number
  totalPages: number
  page: number
  pagingCounter: number
  hasPrevPage: boolean
  hasNextPage: boolean
  prevPage: number | null
  nextPage: number | null
}

/** Build a canonical Payload paginated list envelope. */
export function makeListEnvelope(
  docs: Array<Record<string, unknown>>,
  overrides: Partial<ListEnvelope> = {},
): ListEnvelope {
  return {
    docs,
    totalDocs: docs.length,
    limit: docs.length || 20,
    totalPages: 1,
    page: 1,
    pagingCounter: 1,
    hasPrevPage: false,
    hasNextPage: false,
    prevPage: null,
    nextPage: null,
    ...overrides,
  }
}

/** A real-shaped project document (fields per Projects collection). */
export function makeProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'proj_0001',
    name: 'Omega PCF',
    prefix: 'PCF',
    description: null,
    status: 'ACTIVE',
    icon: 'folder',
    color: '#3b82f6',
    ticketCounter: 1,
    createdAt: '2026-09-07T05:54:41.747Z',
    updatedAt: '2026-09-07T05:54:41.777Z',
    ...overrides,
  }
}

/** A real-shaped team document. */
export function makeTeam(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'team_0001',
    name: 'Core',
    description: null,
    color: '#6366f1',
    createdAt: '2026-09-07T05:54:41.747Z',
    updatedAt: '2026-09-07T05:54:41.777Z',
    ...overrides,
  }
}

/** A real-shaped ticket document (relationships as stored: IDs). */
export function makeTicket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tick_0001',
    ticketId: 'PCF-1',
    title: 'Ship SPC-003',
    description: null,
    project: 'proj_0001',
    team: 'team_0001',
    status: 'TODO',
    priority: 'HIGH',
    dueDate: null,
    labels: [{ name: 'infra', color: '#3b82f6' }],
    subtasks: [{ title: 'write tests', completed: false }],
    blockedBy: [],
    sortOrder: 0,
    ticketCounter: 1,
    createdAt: '2026-09-07T05:54:41.747Z',
    updatedAt: '2026-09-07T05:54:41.777Z',
    ...overrides,
  }
}

/**
 * Payload's 404 shape (real body captured from a live dev server,
 * GET /api/projects/<nonexistent-id>):
 *   {"errors":[{"message":"Not Found"}]}
 * Payload returns 404 + this JSON body (Content-Type application/json) for
 * unknown collection-document paths. Used by M3's 404 case.
 */
export function payloadNotFoundBody(): string {
  return JSON.stringify({ errors: [{ message: 'Not Found' }] })
}

/**
 * Payload's field-validation error body (real shape captured from a live dev
 * server, POST /api/projects with missing required fields):
 *   {"errors":[{"name":"ValidationError","data":{"collection":"projects",
 *     "errors":[{"label":"Name","message":"This field is required.",
 *     "path":"name"}]},
 *     "message":"The following fields are invalid: Name, Prefix"}]}
 */
export function payloadValidationErrorBody(): string {
  return JSON.stringify({
    errors: [
      {
        name: 'ValidationError',
        data: {
          collection: 'projects',
          errors: [
            { label: 'Name', message: 'This field is required.', path: 'name' },
            { label: 'Prefix', message: 'Prefix is required', path: 'prefix' },
          ],
        },
        message: 'The following fields are invalid: Name, Prefix',
      },
    ],
  })
}

/** Build a mock `fetch` `Response` for a given status/body. */
export function makeResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
