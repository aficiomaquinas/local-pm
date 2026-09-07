import { vi } from 'vitest'

/**
 * Capture-fixture for SPC-003 M13/M14 (§7.1): the module under test
 * constructs its `Server` at import time and immediately connects it to a
 * stdio transport. This helper stubs BOTH SDK classes BEFORE the module is
 * imported — the `Server` instance the module creates is captured here, then
 * re-connected over a REAL `InMemoryTransport` linked pair (the genuine SDK
 * in-memory transport, unmocked), so every tool test drives the full MCP
 * request pipeline (SDK request validation included) with zero network and
 * zero stdio.
 *
 * NOTE: `vi.mock` here is not hoisted (helper file, not the test file) — it
 * registers when this module is imported. Every test file must import this
 * helper FIRST (static import at the top) and import the module under test
 * only afterwards (dynamically, via getMcpHarness), so the mocks are in
 * place before `src/index.js` loads.
 */

const serverInstances: unknown[] = []

vi.mock('@modelcontextprotocol/sdk/server/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modelcontextprotocol/sdk/server/index.js')>()
  class CapturingServer extends actual.Server {
    constructor(...args: ConstructorParameters<typeof actual.Server>) {
      super(...args)
      serverInstances.push(this)
    }
  }
  return { Server: CapturingServer }
})

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  // Inert Transport stand-in: main() awaits connect(transport) on this
  // instance, and the tests call server.close() (which calls
  // transport.close()) before re-connecting over InMemoryTransport — so the
  // fake needs start/close/onclose to satisfy the Protocol lifecycle.
  StdioServerTransport: class FakeStdioTransport {
    onclose: (() => void) | undefined
    onerror: ((error: Error) => void) | undefined
    onmessage: ((message: unknown) => void) | undefined
    async start(): Promise<void> {}
    async close(): Promise<void> {
      this.onclose?.()
    }
    async send(): Promise<void> {}
  },
}))

/** Shape of an MCP tool result we assert on (text content + isError flag). */
export interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

export interface McpHarness {
  /** ListTools round-trip → the raw tool list. */
  listTools(): Promise<Array<{ name: string; inputSchema: unknown; description?: string }>>
  /** CallTool round-trip → the raw MCP result. */
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>
}

async function connectClient(server: import('@modelcontextprotocol/sdk/server/index.js').Server): Promise<McpHarness> {
  // main() already connected this Server to the (fake) stdio transport at
  // import time; the SDK refuses a second connect, so detach first.
  await server.close()
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const client = new Client({ name: 'spc003-test-client', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return {
    async listTools() {
      const res = await client.listTools()
      return res.tools as Array<{ name: string; inputSchema: unknown; description?: string }>
    },
    async callTool(name: string, args: Record<string, unknown>) {
      const res = await client.callTool({ name, arguments: args })
      return res as unknown as ToolResult
    },
  }
}

/**
 * Import src/index.js, capture its Server, and connect it to a real
 * InMemoryTransport pair with a real SDK Client on the other end. Call once
 * per test file (beforeAll); the Server refuses a second connect.
 *
 * The env is pinned hermetic: LOCAL_PM_URL is removed so BASE_URL is the
 * documented default http://localhost:3010 — which never receives traffic
 * because fetch is stubbed in every test.
 */
export async function getMcpHarness(): Promise<McpHarness> {
  delete process.env.LOCAL_PM_URL
  // Module under test — this import MUST stay after the vi.mock
  // registrations above (they ran when this helper file was imported).
  await import('../../src/index.js')
  if (serverInstances.length === 0) {
    throw new Error('No Server captured from src/index.js import')
  }
  return connectClient(serverInstances[0] as import('@modelcontextprotocol/sdk/server/index.js').Server)
}

/**
 * Connect a LATER captured Server instance (after `vi.resetModules()` +
 * re-import of src/index.js) — used to test the LOCAL_PM_URL → BASE_URL
 * binding, which is fixed at module-import time.
 */
export async function connectServerInstance(index: number): Promise<McpHarness> {
  if (serverInstances.length <= index) {
    throw new Error(`No Server instance at index ${index} (captured: ${serverInstances.length})`)
  }
  return connectClient(serverInstances[index] as import('@modelcontextprotocol/sdk/server/index.js').Server)
}

/** Decode the JSON payload carried in a tool result's text content. */
export function jsonOf(result: ToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}
