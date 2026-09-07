import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest'
// M13/M14 harness FIRST (registers the SDK class captures on import), then
// everything else.
import {
  getMcpHarness,
  connectServerInstance,
  jsonOf,
  type McpHarness,
} from './helpers/captureServer.js'
import { useJsonFetch } from './helpers/mockFetch.js'

let harness: McpHarness

beforeAll(async () => {
  harness = await getMcpHarness()
})

afterAll(async () => {
  vi.restoreAllMocks()
})

// The M1 (status mapping) and M2 (URL builders) T1 subjects live in
// tests/m1-m2.mapping-urls.test.ts.
describe('M13: ListTools protocol round-trip (19 tools, well-formed schemas)', () => {
  it('returns exactly the 19 documented tool names', async () => {
    const tools = await harness.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'add_subtask',
        'create_project',
        'create_team',
        'create_ticket',
        'delete_project',
        'delete_team',
        'delete_ticket',
        'get_board',
        'get_project',
        'get_team',
        'get_ticket',
        'list_projects',
        'list_teams',
        'list_tickets',
        'move_ticket',
        'toggle_subtask',
        'update_project',
        'update_team',
        'update_ticket',
      ].sort(),
    )
    expect(tools).toHaveLength(19)
  })

  it('every tool has a non-empty description and an object inputSchema', async () => {
    const tools = await harness.listTools()
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy()
      const schema = tool.inputSchema as { type?: string; properties?: Record<string, unknown> }
      expect(schema.type, tool.name).toBe('object')
      expect(schema.properties, tool.name).toBeTypeOf('object')
    }
  })

  it('required-argument tools declare their required fields', async () => {
    const tools = await harness.listTools()
    const byName = new Map(tools.map((t) => [t.name, t]))
    const schema = byName.get('create_project')!.inputSchema as { required?: string[] }
    expect(schema.required).toEqual(['name', 'prefix'])
    const ticketSchema = byName.get('create_ticket')!.inputSchema as { required?: string[] }
    expect(ticketSchema.required).toEqual(['title', 'project'])
    const moveSchema = byName.get('move_ticket')!.inputSchema as { required?: string[] }
    expect(moveSchema.required).toEqual(['id', 'status'])
  })

  it('status/priority enums match the documented value sets', async () => {
    const tools = await harness.listTools()
    const byName = new Map(tools.map((t) => [t.name, t]))
    const status = byName.get('list_tickets')!.inputSchema as {
      properties: { status: { enum?: string[] }; priority: { enum?: string[] } }
    }
    expect(status.properties.status.enum).toEqual(['todo', 'in_progress', 'done'])
    expect(status.properties.priority.enum).toEqual(['no_priority', 'urgent', 'high', 'medium', 'low'])
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * M14 — Protocol round-trip: CallToolRequest dispatch. Known tools reach
 * their handlers (with HTTP mocked); unknown names come back as MCP isError
 * results produced by the server's own error wrapper (the handler's default
 * branch throws, the CallTool handler converts it), and the inputSchema is
 * NOT runtime-enforced by the SDK — both documented contract facts.
 */
describe('M14: CallTool dispatch (known → handler, unknown → isError)', () => {
  it('dispatches a known tool through the pipeline (HTTP mocked)', async () => {
    const h = useJsonFetch(200, { id: 'proj_x', name: 'Dispatched' })
    const result = await harness.callTool('get_project', { id: 'proj_x' })
    expect(result.isError).toBeFalsy()
    expect(h.calls[0].url).toBe('http://localhost:3010/api/projects/proj_x?depth=1')
    expect(jsonOf(result).name).toBe('Dispatched')
  })

  it('unknown tool name → isError result carrying "Unknown tool" (no silent success)', async () => {
    const result = await harness.callTool('nonexistent_tool', {})
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Unknown tool: nonexistent_tool')
  })

  it('inputSchema is not runtime-enforced: missing required id reaches REST as undefined', async () => {
    // Documented boundary fact: the SDK validates the JSON-RPC request shape,
    // not tool arguments; `inputSchema` is descriptive for clients. The
    // handler's outcome is an upstream request for /projects/undefined —
    // which the mocked fetch absorbs (contract: no crash, isError path).
    useJsonFetch(404, { errors: [{ message: 'Not Found' }] })
    const result = await harness.callTool('get_project', {})
    expect(result.isError).toBe(true)
  })
})
