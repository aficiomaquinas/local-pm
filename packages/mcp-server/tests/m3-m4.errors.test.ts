import { describe, it, expect, beforeAll } from 'vitest'
// M13/M14 harness FIRST (registers the SDK class captures on import), then
// everything else.
import { getMcpHarness, jsonOf, type McpHarness } from './helpers/captureServer.js'
import { useScriptedFetch, useJsonFetch } from './helpers/mockFetch.js'
import {
  payloadNotFoundBody,
  payloadValidationErrorBody,
  makeListEnvelope,
  makeProject,
} from './helpers/payloadFixtures.js'

let harness: McpHarness

beforeAll(async () => {
  harness = await getMcpHarness()
})

/** The MCP error text of a failed tool result. */
function errorText(result: { content: Array<{ type: string; text: string }>; isError?: boolean }): string {
  expect(result.isError).toBe(true)
  return result.content[0].text
}

/**
 * M3 — HTTP error mapping (T2): `fetch` → `!response.ok` branch with real
 * Payload error bodies (401/404/500). Contract: the condition surfaces as an
 * MCP `isError` result whose text carries the HTTP status AND the upstream
 * body (no silent swallow, no throw-escape past the protocol boundary).
 */
describe('M3: HTTP error mapping (!response.ok branch)', () => {
  it.each([401, 404, 500])(
    'HTTP %i → isError result carrying the status and the Payload body',
    async (status) => {
      const body = status === 404 ? payloadNotFoundBody() : payloadValidationErrorBody()
      useScriptedFetch({ status, body })
      const result = await harness.callTool('list_projects', {})
      expect(errorText(result)).toBe(`Error: API request failed: ${status} - ${body}`)
    },
  )

  it('propagates the 404 Not Found body on a by-id read', async () => {
    useScriptedFetch({ status: 404, body: payloadNotFoundBody() })
    const result = await harness.callTool('get_project', { id: 'nope' })
    expect(errorText(result)).toContain('API request failed: 404')
    expect(errorText(result)).toContain('Not Found')
  })

  it('maps Payload field-validation errors with their status code', async () => {
    useScriptedFetch({ status: 400, body: payloadValidationErrorBody() })
    const result = await harness.callTool('create_project', { name: 'N', prefix: 'PC' })
    expect(errorText(result)).toContain('API request failed: 400')
    expect(errorText(result)).toContain('The following fields are invalid')
  })

  it('never throws past the protocol boundary (isError result, not a crash)', async () => {
    useScriptedFetch({ status: 500, body: '{"errors":[{"message":"boom"}]}' })
    const result = await harness.callTool('list_teams', {})
    expect(result.isError).toBe(true)
    expect(result.content[0].type).toBe('text')
  })
})

/**
 * M4 — Malformed response handling (T2): non-JSON body and envelope without
 * `docs`. Graceful = an MCP isError result (no crash, no hang, no success).
 */
describe('M4: malformed response handling', () => {
  it('surfaces a clear error when the body is not JSON', async () => {
    useScriptedFetch({ status: 200, body: '<html>gateway error</html>' })
    const result = await harness.callTool('list_projects', {})
    expect(result.isError).toBe(true)
    expect(errorText(result)).toContain('Error:')
  })

  it('surfaces an error when the envelope is missing `docs`', async () => {
    useJsonFetch(200, { totalDocs: 0 }) // no docs array → response.docs.map throws
    const result = await harness.callTool('list_projects', {})
    expect(result.isError).toBe(true)
  })

  it('tolerates a null docs array on get_board (docs || [] path)', async () => {
    const h = useJsonFetch(200, { docs: null })
    const result = await harness.callTool('get_board', {})
    expect(result.isError).toBeFalsy()
    expect(h.calls[0].method).toBe('GET')
    const board = jsonOf(result) as { summary: { total: number }; todo: unknown[] }
    expect(board.summary.total).toBe(0)
    expect(board.todo).toEqual([])
  })

  it('treats a scalar JSON body as a malformed list envelope', async () => {
    useJsonFetch(200, 42)
    const result = await harness.callTool('list_teams', {})
    expect(result.isError).toBe(true)
  })

  it('bad-gateway body on a delete surfaces as isError with the status', async () => {
    useScriptedFetch({ status: 502, body: 'Bad Gateway' })
    const result = await harness.callTool('delete_team', { id: 'team_1' })
    expect(errorText(result)).toContain('API request failed: 502')
  })

  it('documents the success-envelope baseline for contrast', () => {
    const envelope = makeListEnvelope([makeProject()])
    expect(envelope.docs).toHaveLength(1)
    expect(envelope.totalDocs).toBe(1)
  })
})
