import { describe, it, expect, beforeAll } from 'vitest'
// M13/M14 harness FIRST (registers the SDK class captures on import), then
// everything else.
import { getMcpHarness, jsonOf, type McpHarness } from './helpers/captureServer.js'
import { useScriptedFetch, useJsonFetch } from './helpers/mockFetch.js'
import { makeListEnvelope, makeProject, makeTeam, makeTicket } from './helpers/payloadFixtures.js'

let harness: McpHarness

beforeAll(async () => {
  harness = await getMcpHarness()
})

/**
 * M5 — `list_projects` / `get_project` (T2): request (method/path/query)
 * asserted against the mock; canonical Payload envelope → MCP `content`
 * (the AI-friendly PaginatedResponse), through the real CallTool pipeline.
 */
describe('M5: list_projects / get_project', () => {
  it('list_projects: GET request asserted; envelope → PaginatedResponse', async () => {
    const h = useJsonFetch(
      200,
      makeListEnvelope([
        makeProject({ id: 'proj_0001', name: 'Omega PCF', prefix: 'PCF' }),
        makeProject({ id: 'proj_0002', name: 'Hermes', prefix: 'HRM' }),
      ]),
    )
    const result = await harness.callTool('list_projects', { limit: 2, page: 1 })
    expect(result.isError).toBeFalsy()

    expect(h.calls[0].method).toBe('GET')
    expect(h.calls[0].url).toBe('http://localhost:3010/api/projects?limit=2&page=1&depth=0')
    const body = jsonOf(result) as {
      items: Array<Record<string, unknown>>
      pagination: Record<string, unknown>
    }
    expect(body.items).toHaveLength(2)
    expect(body.pagination).toEqual({
      page: 1,
      limit: 2,
      totalItems: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
      nextPage: null,
      prevPage: null,
    })
  })

  it('list_projects: default field filtering (heavy description excluded)', async () => {
    useJsonFetch(200, makeListEnvelope([makeProject({ description: 'heavy' })]))
    const result = await harness.callTool('list_projects', {})
    const body = jsonOf(result) as { items: Array<Record<string, unknown>> }
    const item = body.items[0]
    expect(Object.keys(item).sort()).toEqual(['color', 'icon', 'id', 'name', 'prefix', 'status'])
    expect('description' in item).toBe(false)
  })

  it('list_projects: include=[description] adds the heavy field', async () => {
    useJsonFetch(200, makeListEnvelope([makeProject({ description: 'heavy' })]))
    const result = await harness.callTool('list_projects', { include: ['description'] })
    const body = jsonOf(result) as { items: Array<Record<string, unknown>> }
    expect(body.items[0].description).toBe('heavy')
  })

  it('list_projects: hasNextPage drives nextPage/prevPage in the pagination block', async () => {
    useJsonFetch(
      200,
      makeListEnvelope([makeProject()], {
        totalDocs: 40,
        limit: 20,
        totalPages: 2,
        hasNextPage: true,
        nextPage: 2,
      }),
    )
    const result = await harness.callTool('list_projects', {})
    const body = jsonOf(result) as {
      pagination: { hasNextPage: boolean; nextPage: number | null; totalItems: number }
    }
    expect(body.pagination.hasNextPage).toBe(true)
    expect(body.pagination.nextPage).toBe(2)
    expect(body.pagination.totalItems).toBe(40)
  })

  it('get_project: passthrough of the expanded document (depth=1)', async () => {
    const h = useJsonFetch(200, makeProject({ id: 'proj_0001', description: 'full doc' }))
    const result = await harness.callTool('get_project', { id: 'proj_0001' })
    expect(h.calls[0].url).toBe('http://localhost:3010/api/projects/proj_0001?depth=1')
    expect(jsonOf(result).name).toBe('Omega PCF')
    expect(jsonOf(result).description).toBe('full doc')
  })
})

/**
 * M6 — create/update/delete_project (T2): body mapping (fields → REST
 * payload with defaults and status mapping) on the outgoing request, plus
 * the cascade delete choreography; success + error paths.
 */
describe('M6: create_project / update_project / delete_project', () => {
  it('create_project: POST body has defaults + UPPER status + uppercase prefix', async () => {
    const h = useJsonFetch(201, makeProject({ name: 'New' }))
    const result = await harness.callTool('create_project', { name: 'New', prefix: 'nx' })
    expect(result.isError).toBeFalsy()

    expect(h.calls[0].method).toBe('POST')
    expect(h.calls[0].url).toBe('http://localhost:3010/api/projects')
    expect(h.calls[0].body).toEqual({
      name: 'New',
      prefix: 'NX',
      description: null,
      status: 'ACTIVE',
      icon: 'folder',
      color: '#6366f1',
    })
  })

  it('create_project: explicit icon/color/status are honoured', async () => {
    const h = useJsonFetch(201, makeProject())
    await harness.callTool('create_project', {
      name: 'X',
      prefix: 'X',
      description: '<p>hello</p>',
      status: 'completed',
      icon: 'rocket',
      color: '#ff0000',
    })
    expect(h.calls[0].body).toMatchObject({
      description: '<p>hello</p>',
      status: 'COMPLETED',
      icon: 'rocket',
      color: '#ff0000',
    })
  })

  it('update_project: PATCH body carries only provided fields (status mapped)', async () => {
    const h = useJsonFetch(200, makeProject())
    const result = await harness.callTool('update_project', {
      id: 'proj_1',
      status: 'cancelled',
      color: '#000000',
    })
    expect(result.isError).toBeFalsy()
    expect(h.calls[0].method).toBe('PATCH')
    expect(h.calls[0].url).toBe('http://localhost:3010/api/projects/proj_1')
    expect(h.calls[0].body).toEqual({ status: 'CANCELLED', color: '#000000' })
  })

  it('update_project: description can be cleared with null', async () => {
    const h = useJsonFetch(200, makeProject())
    await harness.callTool('update_project', { id: 'proj_1', description: null })
    expect(h.calls[0].body).toEqual({ description: null })
  })

  it('delete_project default: fetches tickets then deletes each and the project', async () => {
    const h = useScriptedFetch(
      {
        status: 200,
        body: JSON.stringify(makeListEnvelope([makeTicket({ id: 't1' }), makeTicket({ id: 't2' })])),
      },
      { status: 200, body: '{}' },
      { status: 200, body: '{}' },
      { status: 200, body: '{}' },
    )
    const result = await harness.callTool('delete_project', { id: 'proj_1' })
    expect(result.isError).toBeFalsy()

    expect(h.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET http://localhost:3010/api/tickets?where[project][equals]=proj_1&limit=1000',
      'DELETE http://localhost:3010/api/tickets/t1',
      'DELETE http://localhost:3010/api/tickets/t2',
      'DELETE http://localhost:3010/api/projects/proj_1',
    ])
    expect(jsonOf(result)).toEqual({})
  })

  it('delete_project deleteTickets=false: single DELETE, no cascade', async () => {
    const h = useScriptedFetch({ status: 200, body: '{}' })
    await harness.callTool('delete_project', { id: 'proj_1', deleteTickets: false })
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0].method).toBe('DELETE')
    expect(h.calls[0].url).toBe('http://localhost:3010/api/projects/proj_1')
  })

  it('delete_project: upstream 403 surfaces as isError (error path)', async () => {
    useScriptedFetch({ status: 403, body: '{"errors":[{"message":"Forbidden"}]}' })
    const result = await harness.callTool('delete_project', { id: 'proj_1' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('API request failed: 403')
  })
})

/**
 * M7 — list/get/create/update/delete_team (T2): the five team tools, same
 * request/response contract assertions.
 */
describe('M7: team tools', () => {
  it('list_teams: default-field filtering (id, name, color only)', async () => {
    const h = useJsonFetch(200, makeListEnvelope([makeTeam({ description: 'd' })]))
    const result = await harness.callTool('list_teams', {})
    expect(h.calls[0].url).toBe('http://localhost:3010/api/teams?limit=20&page=1&depth=0')
    const body = jsonOf(result) as { items: Array<Record<string, unknown>> }
    expect(Object.keys(body.items[0]).sort()).toEqual(['color', 'id', 'name'])
  })

  it('get_team: passthrough with depth=1', async () => {
    const h = useJsonFetch(200, makeTeam({ id: 'team_1', description: 'd' }))
    const result = await harness.callTool('get_team', { id: 'team_1' })
    expect(h.calls[0].url).toBe('http://localhost:3010/api/teams/team_1?depth=1')
    expect(jsonOf(result).name).toBe('Core')
  })

  it('create_team: POST body with defaults', async () => {
    const h = useJsonFetch(201, makeTeam())
    const result = await harness.callTool('create_team', { name: 'Platform' })
    expect(result.isError).toBeFalsy()
    expect(h.calls[0].method).toBe('POST')
    expect(h.calls[0].url).toBe('http://localhost:3010/api/teams')
    expect(h.calls[0].body).toEqual({
      name: 'Platform',
      description: null,
      color: '#6366f1',
    })
  })

  it('update_team: PATCH body carries id-less updates (excluding the id key)', async () => {
    const h = useJsonFetch(200, makeTeam())
    await harness.callTool('update_team', { id: 'team_1', name: 'Renamed', color: '#abcdef' })
    expect(h.calls[0].method).toBe('PATCH')
    expect(h.calls[0].url).toBe('http://localhost:3010/api/teams/team_1')
    expect(h.calls[0].body).toEqual({ name: 'Renamed', color: '#abcdef' })
  })

  it('update_team: forwards unexpected keys verbatim (documented spread behavior)', async () => {
    const h = useJsonFetch(200, makeTeam())
    await harness.callTool('update_team', { id: 'team_1', customField: 'x' })
    expect(h.calls[0].body).toEqual({ customField: 'x' })
  })

  it('delete_team: DELETE /teams/:id', async () => {
    const h = useJsonFetch(200, {})
    const result = await harness.callTool('delete_team', { id: 'team_1' })
    expect(result.isError).toBeFalsy()
    expect(h.calls[0].method).toBe('DELETE')
    expect(h.calls[0].url).toBe('http://localhost:3010/api/teams/team_1')
    expect(jsonOf(result)).toEqual({})
  })

  it('create_team: validation error surfaces as isError', async () => {
    useScriptedFetch({ status: 400, body: '{"errors":[{"message":"invalid"}]}' })
    const result = await harness.callTool('create_team', { name: '' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('API request failed: 400')
  })
})

/**
 * M8 — list_tickets with filter composition (T2): where-clause composition
 * for status/team/project/priority + pagination + relationship slimming.
 */
describe('M8: list_tickets where-composition and slimming', () => {
  it('composes project+team filters and depth=1', async () => {
    const h = useJsonFetch(200, makeListEnvelope([]))
    await harness.callTool('list_tickets', { projectId: 'proj_7', teamId: 'team_7' })
    expect(h.calls[0].url).toBe(
      'http://localhost:3010/api/tickets?limit=20&page=1&depth=1' +
        '&where[project][equals]=proj_7&where[team][equals]=team_7',
    )
  })

  it('status/priority filters map to UPPER', async () => {
    const h = useJsonFetch(200, makeListEnvelope([]))
    await harness.callTool('list_tickets', { status: 'done', priority: 'medium' })
    expect(h.calls[0].url).toContain('where[status][equals]=DONE')
    expect(h.calls[0].url).toContain('where[priority][equals]=MEDIUM')
  })

  it('no filters → bare pagination query', async () => {
    const h = useJsonFetch(200, makeListEnvelope([]))
    await harness.callTool('list_tickets', {})
    expect(h.calls[0].url).toBe('http://localhost:3010/api/tickets?limit=20&page=1&depth=1')
  })

  it('slims relationships: project → {id,prefix}, team → {id,name}, blockedBy → ids', async () => {
    useJsonFetch(
      200,
      makeListEnvelope([
        makeTicket({
          project: { id: 'proj_0001', prefix: 'PCF' },
          team: { id: 'team_0001', name: 'Core' },
          blockedBy: [{ id: 'tick_0002' }, 'tick_0003'],
        }),
      ]),
    )
    const result = await harness.callTool('list_tickets', {
      include: ['team', 'priority', 'blockedBy'],
    })
    const body = jsonOf(result) as { items: Array<Record<string, unknown>> }
    expect(body.items[0].project).toEqual({ id: 'proj_0001', prefix: 'PCF' })
    expect(body.items[0].team).toEqual({ id: 'team_0001', name: 'Core' })
    expect(body.items[0].blockedBy).toEqual(['tick_0002', 'tick_0003'])
  })

  it('defaults to basic fields; include adds requested optional fields', async () => {
    useJsonFetch(
      200,
      makeListEnvelope([makeTicket({ description: 'd', subtasks: [{ title: 's', completed: false }] })]),
    )
    const result = await harness.callTool('list_tickets', {})
    const body = jsonOf(result) as { items: Array<Record<string, unknown>> }
    expect(Object.keys(body.items[0]).sort()).toEqual(['id', 'project', 'status', 'title'])

    useJsonFetch(
      200,
      makeListEnvelope([makeTicket({ subtasks: [{ title: 's', completed: false }] })]),
    )
    const withSubs = await harness.callTool('list_tickets', { include: ['subtasks'] })
    const body2 = jsonOf(withSubs) as { items: Array<Record<string, unknown>> }
    expect(body2.items[0].subtasks).toEqual([{ title: 's', completed: false }])
  })
})

/**
 * M9 — get/create/update/delete_ticket (T2): ticket fields (incl. subtasks
 * array semantics) on the outgoing bodies.
 */
describe('M9: ticket CRUD tools', () => {
  it('get_ticket: passthrough with depth=1', async () => {
    const h = useJsonFetch(200, makeTicket({ id: 'tick_1', title: 'Full ticket' }))
    const result = await harness.callTool('get_ticket', { id: 'tick_1' })
    expect(h.calls[0].url).toBe('http://localhost:3010/api/tickets/tick_1?depth=1')
    expect(jsonOf(result).title).toBe('Full ticket')
  })

  it('create_ticket: POST body with defaults + UPPER status/priority', async () => {
    const h = useJsonFetch(201, makeTicket())
    const result = await harness.callTool('create_ticket', { title: 'T', project: 'proj_1' })
    expect(result.isError).toBeFalsy()
    expect(h.calls[0].method).toBe('POST')
    expect(h.calls[0].url).toBe('http://localhost:3010/api/tickets')
    expect(h.calls[0].body).toEqual({
      title: 'T',
      description: null,
      project: 'proj_1',
      team: null,
      status: 'TODO',
      priority: 'NO_PRIORITY',
      dueDate: null,
      labels: [],
      subtasks: [],
      blockedBy: [],
    })
  })

  it('create_ticket: full payload (labels, subtasks, blockedBy, team, dueDate) passes through', async () => {
    const h = useJsonFetch(201, makeTicket())
    await harness.callTool('create_ticket', {
      title: 'T',
      project: 'proj_1',
      team: 'team_2',
      status: 'in_progress',
      priority: 'urgent',
      dueDate: '2026-10-01',
      labels: [{ name: 'infra', color: '#3b82f6' }],
      subtasks: [{ title: 'step 1' }],
      blockedBy: ['tick_0009'],
    })
    expect(h.calls[0].body).toEqual({
      title: 'T',
      description: null,
      project: 'proj_1',
      team: 'team_2',
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      dueDate: '2026-10-01',
      labels: [{ name: 'infra', color: '#3b82f6' }],
      subtasks: [{ title: 'step 1' }],
      blockedBy: ['tick_0009'],
    })
  })

  it('update_ticket: PATCH body carries only provided fields (status/priority mapped)', async () => {
    const h = useJsonFetch(200, makeTicket())
    await harness.callTool('update_ticket', { id: 'tick_1', status: 'done', priority: 'low' })
    expect(h.calls[0].method).toBe('PATCH')
    expect(h.calls[0].body).toEqual({ status: 'DONE', priority: 'LOW' })
  })

  it('update_ticket: null semantics preserved (unassign team, clear dueDate, clear blockedBy)', async () => {
    const h = useJsonFetch(200, makeTicket())
    await harness.callTool('update_ticket', {
      id: 'tick_1',
      team: null,
      dueDate: null,
      blockedBy: [],
    })
    expect(h.calls[0].body).toEqual({ team: null, dueDate: null, blockedBy: [] })
  })

  it('update_ticket: subtasks array replaces existing', async () => {
    const h = useJsonFetch(200, makeTicket())
    const subtasks = [
      { title: 'a', completed: true },
      { title: 'b', completed: false },
    ]
    await harness.callTool('update_ticket', { id: 'tick_1', subtasks })
    expect(h.calls[0].body).toEqual({ subtasks })
  })

  it('delete_ticket: DELETE /tickets/:id', async () => {
    const h = useJsonFetch(200, {})
    const result = await harness.callTool('delete_ticket', { id: 'tick_1' })
    expect(result.isError).toBeFalsy()
    expect(h.calls[0].method).toBe('DELETE')
    expect(h.calls[0].url).toBe('http://localhost:3010/api/tickets/tick_1')
    expect(jsonOf(result)).toEqual({})
  })

  it('create_ticket: upstream error surfaces as isError', async () => {
    useScriptedFetch({ status: 400, body: '{"errors":[{"message":"invalid"}]}' })
    const result = await harness.callTool('create_ticket', { title: 'T', project: 'nope' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('API request failed: 400')
  })
})
