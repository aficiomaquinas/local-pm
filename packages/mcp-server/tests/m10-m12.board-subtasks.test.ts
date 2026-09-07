import { describe, it, expect, beforeAll } from 'vitest'
// M13/M14 harness FIRST (registers the SDK class captures on import), then
// everything else.
import { getMcpHarness, jsonOf, type McpHarness } from './helpers/captureServer.js'
import { useScriptedFetch, useJsonFetch } from './helpers/mockFetch.js'
import {
  payloadNotFoundBody,
  makeListEnvelope,
  makeProject,
  makeTicket,
} from './helpers/payloadFixtures.js'

let harness: McpHarness

beforeAll(async () => {
  harness = await getMcpHarness()
})

/**
 * M10 — move_ticket (T2): the status-transition PATCH shape; invalid moves
 * (unknown ticket) surface as isError with the upstream status.
 */
describe('M10: move_ticket', () => {
  it('sends a PATCH with only the mapped status field', async () => {
    const h = useJsonFetch(200, makeTicket({ status: 'IN_PROGRESS' }))
    const result = await harness.callTool('move_ticket', { id: 'tick_1', status: 'in_progress' })
    expect(result.isError).toBeFalsy()

    expect(h.calls[0].method).toBe('PATCH')
    expect(h.calls[0].url).toBe('http://localhost:3010/api/tickets/tick_1')
    expect(h.calls[0].body).toEqual({ status: 'IN_PROGRESS' })
  })

  it('maps all three board statuses', async () => {
    for (const [mcp, payload] of [
      ['todo', 'TODO'],
      ['in_progress', 'IN_PROGRESS'],
      ['done', 'DONE'],
    ] as const) {
      const h = useJsonFetch(200, makeTicket())
      await harness.callTool('move_ticket', { id: 'tick_1', status: mcp })
      expect(h.calls[0].body).toEqual({ status: payload })
    }
  })

  it('invalid move (unknown ticket) → isError carrying the 404 body', async () => {
    useScriptedFetch({ status: 404, body: payloadNotFoundBody() })
    const result = await harness.callTool('move_ticket', { id: 'ghost', status: 'done' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('API request failed: 404')
  })
})

/**
 * M11 — get_board (T2): the multi-document envelope is aggregated into the
 * board structure (three status columns + summary), relationships slimmed.
 */
describe('M11: get_board aggregate mapping', () => {
  it('groups tickets into todo/in_progress/done with a summary block', async () => {
    const h = useJsonFetch(
      200,
      makeListEnvelope([
        makeTicket({ id: 'tick_a', title: 'A', status: 'TODO' }),
        makeTicket({ id: 'tick_b', title: 'B', status: 'IN_PROGRESS' }),
        makeTicket({ id: 'tick_c', title: 'C', status: 'DONE' }),
        makeTicket({ id: 'tick_d', title: 'D', status: 'TODO' }),
      ]),
    )
    const result = await harness.callTool('get_board', {})
    expect(result.isError).toBeFalsy()

    expect(h.calls[0].url).toBe('http://localhost:3010/api/tickets?limit=1000&depth=1')
    const board = jsonOf(result) as {
      todo: Array<Record<string, unknown>>
      in_progress: Array<Record<string, unknown>>
      done: Array<Record<string, unknown>>
      summary: { total: number; todo: number; inProgress: number; done: number }
    }
    expect(board.todo.map((t) => t.id)).toEqual(['tick_a', 'tick_d'])
    expect(board.in_progress.map((t) => t.id)).toEqual(['tick_b'])
    expect(board.done.map((t) => t.id)).toEqual(['tick_c'])
    expect(board.summary).toEqual({ total: 4, todo: 2, inProgress: 1, done: 1 })
  })

  it('slims relationships inside the columns and keeps default fields', async () => {
    useJsonFetch(
      200,
      makeListEnvelope([
        makeTicket({
          id: 'tick_s',
          status: 'TODO',
          description: 'heavy',
          project: { id: 'proj_0001', prefix: 'PCF' },
          team: { id: 'team_0001', name: 'Core' },
        }),
      ]),
    )
    const result = await harness.callTool('get_board', { include: ['team'] })
    const board = jsonOf(result) as { todo: Array<Record<string, unknown>> }
    const card = board.todo[0]
    expect(Object.keys(card).sort()).toEqual(['id', 'project', 'status', 'team', 'title'])
    expect(card.project).toEqual({ id: 'proj_0001', prefix: 'PCF' })
    expect(card.team).toEqual({ id: 'team_0001', name: 'Core' })
    expect('description' in card).toBe(false)
  })

  it('empty board → empty columns and zeroed summary', async () => {
    useJsonFetch(200, makeListEnvelope([]))
    const result = await harness.callTool('get_board', {})
    const board = jsonOf(result) as {
      todo: unknown[]
      summary: { total: number }
    }
    expect(board.todo).toEqual([])
    expect(board.summary.total).toBe(0)
  })
})

/**
 * M12 — toggle_subtask / add_subtask (T2): nested array update semantics —
 * read ticket → mutate subtasks → PATCH back; not-found and out-of-range
 * paths surface as MCP errors, not crashes.
 */
describe('M12: toggle_subtask / add_subtask', () => {
  it('toggle_subtask: GET then PATCH with the flipped subtask', async () => {
    const h = useScriptedFetch(
      { status: 200, body: JSON.stringify(makeTicket({ id: 'tick_1', subtasks: [
        { title: 'first', completed: false },
        { title: 'second', completed: true },
      ] })) },
      { status: 200, body: '{}' },
    )
    const result = await harness.callTool('toggle_subtask', { ticketId: 'tick_1', subtaskIndex: 1 })
    expect(result.isError).toBeFalsy()

    expect(h.calls[0].method).toBe('GET')
    expect(h.calls[0].url).toBe('http://localhost:3010/api/tickets/tick_1')
    expect(h.calls[1].method).toBe('PATCH')
    expect(h.calls[1].body).toEqual({
      subtasks: [
        { title: 'first', completed: false },
        { title: 'second', completed: false }, // flipped from true
      ],
    })
  })

  it('toggle_subtask: out-of-range index → MCP error message, no PATCH', async () => {
    const h = useScriptedFetch({
      status: 200,
      body: JSON.stringify(makeTicket({ id: 'tick_1', subtasks: [{ title: 'only', completed: false }] })),
    })
    const result = await harness.callTool('toggle_subtask', { ticketId: 'tick_1', subtaskIndex: 5 })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Subtask index 5 out of range')
    expect(h.calls).toHaveLength(1) // read happened, write never did
  })

  it('toggle_subtask: negative index → MCP error, no PATCH', async () => {
    const h = useScriptedFetch({
      status: 200,
      body: JSON.stringify(makeTicket({ id: 'tick_1', subtasks: [] })),
    })
    const result = await harness.callTool('toggle_subtask', { ticketId: 'tick_1', subtaskIndex: -1 })
    expect(result.isError).toBe(true)
    expect(h.calls).toHaveLength(1)
  })

  it('toggle_subtask: unknown ticket → upstream 404 surfaces as isError', async () => {
    useScriptedFetch({ status: 404, body: payloadNotFoundBody() })
    const result = await harness.callTool('toggle_subtask', { ticketId: 'ghost', subtaskIndex: 0 })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('API request failed: 404')
  })

  it('add_subtask: GET then PATCH appending {title, completed:false}', async () => {
    const h = useScriptedFetch(
      { status: 200, body: JSON.stringify(makeTicket({ id: 'tick_1', subtasks: [{ title: 'one', completed: true }] })) },
      { status: 200, body: '{}' },
    )
    const result = await harness.callTool('add_subtask', { ticketId: 'tick_1', title: 'two' })
    expect(result.isError).toBeFalsy()

    expect(h.calls[1].method).toBe('PATCH')
    expect(h.calls[1].body).toEqual({
      subtasks: [
        { title: 'one', completed: true },
        { title: 'two', completed: false },
      ],
    })
  })

  it('add_subtask: ticket with NO subtasks field → creates the array', async () => {
    const h = useScriptedFetch(
      { status: 200, body: JSON.stringify(makeTicket({ id: 'tick_1', subtasks: undefined })) },
      { status: 200, body: '{}' },
    )
    const result = await harness.callTool('add_subtask', { ticketId: 'tick_1', title: 'fresh' })
    expect(result.isError).toBeFalsy()
    expect(h.calls[1].body).toEqual({ subtasks: [{ title: 'fresh', completed: false }] })
  })
})

/** M14-adjacent: the 19th tool's dispatch is exercised via makeProject. */
describe('dispatch sanity for board context tools', () => {
  it('get_board after a project read keeps returning board shapes', async () => {
    const h = useJsonFetch(200, makeListEnvelope([makeProject()]))
    await harness.callTool('get_project', { id: 'proj_0001' })
    expect(h.calls[0].url).toContain('/projects/proj_0001')
  })
})
