import { describe, it, expect, vi } from 'vitest'
import {
  assertNoDependencyCycle,
  generateTicketIdWithRetry,
} from '@/collections/Tickets'
import type { PayloadRequest } from 'payload'

/**
 * Ports of the upstream d7747b6 unit coverage for the two collection-level
 * correctness fixes we adopted (originally from Ars Nova Singers
 * @ArsNovaSingers, ArsNovaSingers/local-pm-Ars commit d488521):
 *
 * - assertNoDependencyCycle: `blockedBy` is a self-referential graph; a cycle
 *   makes "what is ready to work on?" unanswerable and hangs layered graph
 *   layouts (DependencyGraph). The guard must reject the closing edge at
 *   write time with a PUBLIC 400 (Payload replaces a bare Error's message
 *   with "Something went wrong." — indistinguishable from an outage).
 * - generateTicketIdWithRetry: the fallback allocator must verify the
 *   candidate ticketId is unused before claiming it and fail LOUDLY after
 *   its retry budget, never silently issue a duplicate.
 *
 * The adapter-level atomicity itself ($inc findOneAndUpdate) is the
 * database's contract and is not re-tested here; generateTicketId reaches
 * the mongoose model through req.payload.db, which these node-env tests do
 * not boot.
 */

type FindArgs = { collection: string; where?: Record<string, unknown>; limit?: number }

function mkReq(docs: Array<Record<string, unknown>>) {
  return {
    payload: {
      find: vi.fn(async ({ where }: FindArgs) => ({
        docs: docs.filter((d) => {
          const ids = (where?.id as { in?: string[] } | undefined)?.in
          return ids ? ids.includes(String(d.id)) : true
        }),
        totalDocs: 0,
      })),
    },
  } as unknown as PayloadRequest
}

describe('assertNoDependencyCycle (upstream d7747b6 port)', () => {
  it('allows an empty blockedBy without touching the database', async () => {
    const req = mkReq([])
    await expect(
      assertNoDependencyCycle(req, [], 't1'),
    ).resolves.toBeUndefined()
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('rejects a ticket blocking itself', async () => {
    const req = mkReq([])
    await expect(
      assertNoDependencyCycle(req, ['t1'], 't1'),
    ).rejects.toThrow(/cannot block itself/)
  })

  it('skips the walk for a brand-new ticket (no id yet)', async () => {
    const req = mkReq([])
    await expect(
      assertNoDependencyCycle(req, ['t1'], null),
    ).resolves.toBeUndefined()
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('rejects a direct two-ticket cycle A → B → A', async () => {
    // t1 proposes to block on t2; t2 already blocks on t1.
    const req = mkReq([{ id: 't2', blockedBy: ['t1'] }])
    await expect(
      assertNoDependencyCycle(req, ['t2'], 't1'),
    ).rejects.toThrow(/would create a cycle/)
  })

  it('rejects an indirect cycle through a third ticket', async () => {
    // t1 → t2 → t3 → t1.
    const req = mkReq([
      { id: 't2', blockedBy: ['t3'] },
      { id: 't3', blockedBy: ['t1'] },
    ])
    await expect(
      assertNoDependencyCycle(req, ['t2'], 't1'),
    ).rejects.toThrow(/would create a cycle/)
  })

  it('walks the frontier and terminates on a missing dependency', async () => {
    const req = mkReq([{ id: 't2', blockedBy: ['t3'] }])
    await expect(
      assertNoDependencyCycle(req, ['t2'], 't1'),
    ).resolves.toBeUndefined()
    // Second hop walks t3's frontier (empty — t3 does not exist) and stops.
    expect(req.payload.find).toHaveBeenCalledTimes(2)
    expect(req.payload.find).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: { in: ['t3'] } } }),
    )
  })

  it('normalizes populated relationship docs to ids (proposed edge)', async () => {
    // Proposed edge as a populated doc: { id: 't1' } blocks on itself.
    const req = mkReq([])
    await expect(
      assertNoDependencyCycle(req, [{ id: 't1' } as unknown as string], 't1'),
    ).rejects.toThrow(/cannot block itself/)
  })
})

describe('generateTicketIdWithRetry (upstream d7747b6 port)', () => {
  it('claims the next candidate when it is unused', async () => {
    const req = {
      payload: {
        findByID: vi.fn(async () => ({ prefix: 'PROJ', ticketCounter: 4 })),
        find: vi.fn(async () => ({ docs: [], totalDocs: 0 })),
        update: vi.fn(async () => ({})),
      },
    } as unknown as PayloadRequest
    await expect(generateTicketIdWithRetry(req, 'p1')).resolves.toBe('PROJ-5')
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'projects',
        id: 'p1',
        data: { ticketCounter: 5 },
      }),
    )
  })

  it('skips a clashing candidate and allocates the next free one', async () => {
    // The candidate is re-derived from the project counter each attempt, so
    // the counter must advance too (the clash means someone else created
    // PROJ-5 and bumped the real counter to 5).
    const req = {
      payload: {
        findByID: vi
          .fn()
          .mockResolvedValueOnce({ prefix: 'PROJ', ticketCounter: 4 })
          .mockResolvedValue({ prefix: 'PROJ', ticketCounter: 5 }),
        find: vi
          .fn()
          .mockResolvedValueOnce({ docs: [{ id: 'x' }], totalDocs: 1 })
          .mockResolvedValue({ docs: [], totalDocs: 0 }),
        update: vi.fn(async () => ({})),
      },
    } as unknown as PayloadRequest
    await expect(generateTicketIdWithRetry(req, 'p1')).resolves.toBe('PROJ-6')
  })

  it('fails loudly after the retry budget instead of issuing a duplicate', async () => {
    const req = {
      payload: {
        findByID: vi.fn(async () => ({ prefix: 'PROJ', ticketCounter: 4 })),
        find: vi.fn(async () => ({ docs: [{ id: 'x' }], totalDocs: 1 })),
        update: vi.fn(async () => ({})),
      },
    } as unknown as PayloadRequest
    await expect(generateTicketIdWithRetry(req, 'p1')).rejects.toThrow(
      /Could not allocate a unique ticket ID/,
    )
    expect(req.payload.update).not.toHaveBeenCalled()
  })
})
