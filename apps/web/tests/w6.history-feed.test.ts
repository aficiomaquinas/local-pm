import { describe, it, expect } from 'vitest'
import { buildHistoryFeed } from '@/app/api/history/feed'
import { stubPayload, makeVersionRow, type StubPayload } from './helpers/payloadStub'

/**
 * W6 — /api/history feed assembly, T1 (no new extraction): SPC-001 already
 * factors the route handler into `buildHistoryFeed(payload, params)`, a pure
 * function of (Payload, URLSearchParams) whose only Payload usage is
 * findVersions — stubbed here. This is the SPC-003 §7.2 W6 alternative:
 * "a thin pure merge/sort helper can be extracted and tested as T1 now" —
 * it exists, so it is tested now. The HTTP layer (auth, NextResponse) stays
 * out: that is the T3 boundary.
 */
describe('W6: buildHistoryFeed (merge/sort/pagination over version streams)', () => {
  it('merges three collection streams into one chronological feed (desc)', async () => {
    const payload = stubPayload({
      projects: [
        makeVersionRow({ id: 'vp1', parent: 'proj_1', updatedAt: '2026-09-07T05:00:00.000Z' }),
      ],
      teams: [
        makeVersionRow({ id: 'vt1', parent: 'team_1', updatedAt: '2026-09-07T07:00:00.000Z' }),
      ],
      tickets: [
        makeVersionRow({ id: 'vk2', parent: 'tick_1', updatedAt: '2026-09-07T06:00:00.000Z' }),
        makeVersionRow({ id: 'vk1', parent: 'tick_1', updatedAt: '2026-09-07T08:00:00.000Z' }),
      ],
    })

    const res = await buildHistoryFeed(payload, new URLSearchParams(''))

    expect(res.docs.map((d) => d.id)).toEqual(['vk1', 'vt1', 'vk2', 'vp1'])
    expect(res.totalDocs).toBe(4)
    expect(res.page).toBe(1)
    // The version snapshot is internal; the response contract carries none.
    expect(res.docs[0]).not.toHaveProperty('version')
    const calls = (payload as StubPayload).__calls
    expect(calls.map((c) => c.collection).sort()).toEqual(['projects', 'teams', 'tickets'])
    for (const c of calls) {
      expect(c.sort).toBe('-updatedAt')
      expect(c.limit).toBe(100)
    }
  })

  it('paginates the combined stream (page/limit math, default 20 cap 100)', async () => {
    const tickets = Array.from({ length: 25 }, (_, i) =>
      makeVersionRow({
        id: `vk${i}`,
        updatedAt: new Date(Date.UTC(2026, 8, 7, 0, i)).toISOString(),
      }),
    )
    const payload = stubPayload({ tickets })

    const page1 = await buildHistoryFeed(payload, new URLSearchParams('limit=10'))
    expect(page1.docs).toHaveLength(10)
    expect(page1.docs[0].id).toBe('vk24') // newest first
    expect(page1.totalDocs).toBe(25)

    const page3 = await buildHistoryFeed(payload, new URLSearchParams('limit=10&page=3'))
    expect(page3.docs).toHaveLength(5)

    // cap: limit=1000 → 100
    const capped = await buildHistoryFeed(payload, new URLSearchParams('limit=1000'))
    expect(capped.limit).toBe(100)
    // floor: limit=0 → default 20
    const floored = await buildHistoryFeed(payload, new URLSearchParams('limit=0'))
    expect(floored.limit).toBe(20)
  })

  it('filters by collection', async () => {
    const payload = stubPayload({
      tickets: [makeVersionRow({ id: 'vk1' })],
    })
    const res = await buildHistoryFeed(payload, new URLSearchParams('collection=tickets'))
    expect(res.docs.map((d) => d.collection)).toEqual(['tickets'])
    const calls = (payload as StubPayload).__calls
    expect(calls.map((c) => c.collection)).toEqual(['tickets'])
  })

  it('throws on an invalid collection filter (route maps it to 400)', async () => {
    const payload = stubPayload({})
    await expect(
      buildHistoryFeed(payload, new URLSearchParams('collection=bogus')),
    ).rejects.toThrow('Invalid collection filter: bogus')
  })

  it('free-text q matches title/name/ticketId in the snapshot', async () => {
    const payload = stubPayload({
      tickets: [
        makeVersionRow({ id: 'vk1', version: { title: 'Ship SPC-003', ticketId: 'PCF-1' } }),
        makeVersionRow({ id: 'vk2', version: { title: 'Other ticket', ticketId: 'HRM-9' } }),
      ],
      projects: [makeVersionRow({ id: 'vp1', version: { name: 'Omega PCF' } })],
    })
    const res = await buildHistoryFeed(payload, new URLSearchParams('q=pcf'))
    // matches ticketId PCF-1 (case-insensitive) and the project name
    expect(res.docs.map((d) => d.id).sort()).toEqual(['vk1', 'vp1'])
    expect(res.totalDocs).toBe(2)
  })

  it('date range (from/to) reaches the where clauses', async () => {
    const payload = stubPayload({ tickets: [makeVersionRow()] })
    await buildHistoryFeed(payload, new URLSearchParams('from=2026-09-01&to=2026-09-30'))
    const calls = (payload as StubPayload).__calls
    expect(calls[0].where).toEqual({
      and: [
        { updatedAt: { greater_than_equal: '2026-09-01' } },
        { updatedAt: { less_than_equal: '2026-09-30' } },
      ],
    })
  })

  it('parent filter reaches the where clause', async () => {
    const payload = stubPayload({ tickets: [makeVersionRow()] })
    await buildHistoryFeed(payload, new URLSearchParams('parent=tick_0001'))
    const calls = (payload as StubPayload).__calls
    expect(calls[0].where).toEqual({ parent: { equals: 'tick_0001' } })
  })

  it('withDiff=1 produces a diff per entry (creation diffs against {})', async () => {
    const rows = [
      makeVersionRow({ id: 'vk1', parent: 'tick_1', updatedAt: '2026-09-07T06:00:00.000Z' }),
      makeVersionRow({ id: 'vk0', parent: 'tick_1', updatedAt: '2026-09-07T05:00:00.000Z' }),
    ]
    const payload = stubPayload({ tickets: rows })
    const res = await buildHistoryFeed(payload, new URLSearchParams('withDiff=1'))
    expect(res.docs).toHaveLength(2)
    for (const doc of res.docs) {
      expect('diff' in doc).toBe(true)
    }
  })

  it('autosave flag is carried through to the contract docs', async () => {
    const payload = stubPayload({
      tickets: [makeVersionRow({ autosave: true })],
    })
    const res = await buildHistoryFeed(payload, new URLSearchParams(''))
    expect(res.docs[0].autosave).toBe(true)
  })

  it('parentLabel falls back to the truncated id when resolution misses', async () => {
    const payload = stubPayload({
      tickets: [makeVersionRow({ parent: 'tick_deadbeef' })],
    })
    const res = await buildHistoryFeed(payload, new URLSearchParams(''))
    expect(res.docs[0].parentLabel).toMatch(/tick_dea/)
  })
})
