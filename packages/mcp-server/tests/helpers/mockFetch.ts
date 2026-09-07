import { vi } from 'vitest'

/**
 * T2's HTTP boundary: replace global `fetch` with a Vitest stub that records
 * every call and replays a scripted queue of responses. No network — the
 * recorded calls ARE the asserted outgoing REST request (SPC-003 §4.2).
 */
export interface RecordedRequest {
  url: string
  method: string
  body: unknown
}

/**
 * Scripted-fetch harness. Each call to the returned stub shifts one response
 * off `responses` (extras repeat the last one). `calls` records {url, method,
 * body} per fetch, decoded from JSON for body assertions.
 */
export function useScriptedFetch(...responses: Array<{ status: number; body: string }>) {
  const calls: RecordedRequest[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    let body: unknown = undefined
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    calls.push({
      url: String(input),
      method,
      body,
    })
    const next = (responses.length > 1 ? responses.shift() : responses[0])!
    return new Response(next.body, {
      status: next.status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

/** Convenience: one 200 JSON response. */
export function useJsonFetch(status: number, payload: unknown) {
  return useScriptedFetch({ status, body: JSON.stringify(payload) })
}
