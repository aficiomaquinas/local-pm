import { describe, it, expect, beforeAll, vi } from 'vitest'
// M13/M14 harness FIRST (registers the SDK class captures on import), then
// everything else.
import { getMcpHarness, type McpHarness } from './helpers/captureServer.js'
import { useJsonFetch } from './helpers/mockFetch.js'

let harness: McpHarness

beforeAll(async () => {
  harness = await getMcpHarness()
})

/**
 * M1 — Status mapping (T1 subject observed through the tool boundary):
 * Payload UPPER → MCP lowercase on outgoing queries/bodies; unknown values
 * pass through untouched (the documented fallback).
 */
describe('M1: status mapping (Payload UPPER ↔ MCP lowercase)', () => {
  it('maps lowercase statuses to Payload UPPER in list filters', async () => {
    const h1 = useJsonFetch(200, { docs: [], totalDocs: 0 })
    await harness.callTool('list_projects', { status: 'active' })
    expect(h1.calls[0].url).toContain('where[status][equals]=ACTIVE')

    const h2 = useJsonFetch(200, { docs: [], totalDocs: 0 })
    await harness.callTool('list_tickets', { status: 'in_progress' })
    expect(h2.calls[0].url).toContain('where[status][equals]=IN_PROGRESS')
  })

  it('maps priority values to Payload UPPER (no_priority → NO_PRIORITY)', async () => {
    const h1 = useJsonFetch(200, { docs: [], totalDocs: 0 })
    await harness.callTool('list_tickets', { priority: 'no_priority' })
    expect(h1.calls[0].url).toContain('where[priority][equals]=NO_PRIORITY')

    const h2 = useJsonFetch(200, { docs: [], totalDocs: 0 })
    await harness.callTool('list_tickets', { priority: 'urgent' })
    expect(h2.calls[0].url).toContain('where[priority][equals]=URGENT')
  })

  it('maps statuses in write bodies (create/move)', async () => {
    const h1 = useJsonFetch(201, { id: 'p1' })
    await harness.callTool('create_project', { name: 'N', prefix: 'nx', status: 'on_hold' })
    expect((h1.calls[0].body as Record<string, unknown>).status).toBe('ON_HOLD')

    const h2 = useJsonFetch(200, { id: 't1' })
    await harness.callTool('move_ticket', { id: 't1', status: 'done' })
    expect(h2.calls[0].body).toEqual({ status: 'DONE' })
  })

  it('falls back to passthrough for unknown status values', async () => {
    const h = useJsonFetch(200, { docs: [], totalDocs: 0 })
    await harness.callTool('list_tickets', { status: 'BLOCKED' })
    expect(h.calls[0].url).toContain('where[status][equals]=BLOCKED')
  })
})

/**
 * M2 — REST URL + query-string builders per endpoint (T1 subject through the
 * boundary): exact URL, method and query composition, including the default
 * BASE_URL from LOCAL_PM_URL.
 */
describe('M2: REST URL and query-string builders', () => {
  it('builds list_projects URL with default pagination and depth=0', async () => {
    const h = useJsonFetch(200, { docs: [], totalDocs: 0 })
    await harness.callTool('list_projects', {})
    expect(h.calls[0].url).toBe('http://localhost:3010/api/projects?limit=20&page=1&depth=0')
    expect(h.calls[0].method).toBe('GET')
  })

  it('honours limit/page and composes multiple where filters on list_tickets', async () => {
    const h = useJsonFetch(200, { docs: [], totalDocs: 0 })
    await harness.callTool('list_tickets', {
      limit: 50,
      page: 3,
      projectId: 'proj_9',
      teamId: 'team_9',
      status: 'todo',
      priority: 'low',
    })
    expect(h.calls[0].url).toBe(
      'http://localhost:3010/api/tickets?limit=50&page=3&depth=1' +
        '&where[project][equals]=proj_9&where[team][equals]=team_9' +
        '&where[status][equals]=TODO&where[priority][equals]=LOW',
    )
  })

  it('builds by-id URLs with depth=1 for get_project/get_team/get_ticket', async () => {
    let h = useJsonFetch(200, { id: 'proj_1' })
    await harness.callTool('get_project', { id: 'proj_1' })
    expect(h.calls[0].url).toBe('http://localhost:3010/api/projects/proj_1?depth=1')

    h = useJsonFetch(200, { id: 'team_1' })
    await harness.callTool('get_team', { id: 'team_1' })
    expect(h.calls[0].url).toBe('http://localhost:3010/api/teams/team_1?depth=1')

    h = useJsonFetch(200, { id: 'tick_1' })
    await harness.callTool('get_ticket', { id: 'tick_1' })
    expect(h.calls[0].url).toBe('http://localhost:3010/api/tickets/tick_1?depth=1')
  })

  it('builds the board query (?limit=1000&depth=1) with optional filters', async () => {
    let h = useJsonFetch(200, { docs: [] })
    await harness.callTool('get_board', {})
    expect(h.calls[0].url).toBe('http://localhost:3010/api/tickets?limit=1000&depth=1')

    h = useJsonFetch(200, { docs: [] })
    await harness.callTool('get_board', { projectId: 'proj_2', teamId: 'team_2' })
    expect(h.calls[0].url).toBe(
      'http://localhost:3010/api/tickets?limit=1000&depth=1' +
        '&where[project][equals]=proj_2&where[team][equals]=team_2',
    )
  })

  it('builds the nested subtask read URL without query params', async () => {
    const h = useJsonFetch(200, { id: 'tick_5', subtasks: [] })
    await harness.callTool('add_subtask', { ticketId: 'tick_5', title: 'x' })
    expect(h.calls[0].url).toBe('http://localhost:3010/api/tickets/tick_5')
    expect(h.calls[1].url).toBe('http://localhost:3010/api/tickets/tick_5')
    expect(h.calls[1].method).toBe('PATCH')
  })

  it('uses LOCAL_PM_URL when set (BASE_URL override)', async () => {
    // BASE_URL is fixed at module-import time; this suite runs in its own
    // vitest worker (pool: forks), so setting the env var here and importing
    // a dedicated isolated module graph via resetModules exercises the
    // override without contaminating the default-URL suites.
    const { vi: vitest } = await import('vitest')
    process.env.LOCAL_PM_URL = 'http://127.0.0.1:9999'
    try {
      vitest.resetModules()
      // Re-import in this (isolated) registry: the helper's mocks are
      // registered per-registry, so the capture still applies.
      const { connectServerInstance } = await import('./helpers/captureServer.js')
      await import('../src/index.js')
      const h2 = await connectServerInstance(0)
      const h = useJsonFetch(200, { docs: [], totalDocs: 0 })
      await h2.callTool('list_projects', {})
      expect(h.calls[0].url).toBe('http://127.0.0.1:9999/api/projects?limit=20&page=1&depth=0')
    } finally {
      delete process.env.LOCAL_PM_URL
      vitest.resetModules()
    }
  })
})
