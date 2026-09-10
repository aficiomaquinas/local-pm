import { describe, it, expect } from 'vitest'
import { buildHistoryFeed } from '@/app/api/history/feed'
import { stubPayload, makeVersionRow, type StubPayload } from './helpers/payloadStub'

/**
 * T1 (SPC-005 §5.2) — the feed contract carries `actor` per entry.
 *
 * Amendment (2026-09-10): the soft-delete visible/silent settings toggle was
 * REMOVED by operator decision. The feed is audit-first: every
 * snapshot, including `deleted: true` soft-delete entries, is ALWAYS shown.
 * The regression below pins that invariant — no silent filtering may return.
 */

describe('T1: /api/history actor resolution (SPC-005 D-4)', () => {
  it('carries actor {type,label} from the version snapshot', async () => {
    const payload = stubPayload({
      tickets: [
        makeVersionRow({
          id: 'vk1',
          version: { title: 'x', actorType: 'user', actorLabel: 'user:master@local-pm.local' },
        }),
        makeVersionRow({
          id: 'vk2',
          version: { title: 'y', actorType: 'agent', actorLabel: 'agent' },
        }),
      ],
    })
    const res = await buildHistoryFeed(payload, new URLSearchParams(''))
    const vk1 = res.docs.find((d) => d.id === 'vk1')!
    const vk2 = res.docs.find((d) => d.id === 'vk2')!
    expect(vk1.actor).toEqual({ type: 'user', label: 'user:master@local-pm.local' })
    expect(vk2.actor).toEqual({ type: 'agent', label: 'agent' })
  })

  it('snapshot without attribution (pre-SPC-005 data) → anonymous fallback', async () => {
    const payload = stubPayload({ tickets: [makeVersionRow({ id: 'vk0' })] })
    const res = await buildHistoryFeed(payload, new URLSearchParams(''))
    expect(res.docs[0].actor).toEqual({ type: 'anonymous', label: 'anonymous' })
  })

  it('snapshot with a type but no label synthesizes the label from the type', async () => {
    const payload = stubPayload({
      tickets: [makeVersionRow({ id: 'vk1', version: { actorType: 'agent' } })],
    })
    const res = await buildHistoryFeed(payload, new URLSearchParams(''))
    expect(res.docs[0].actor).toEqual({ type: 'agent', label: 'agent' })
  })
})

describe('T1: audit-first feed (2026-09-10 amendment — soft-delete toggle removed)', () => {
  it('soft-delete (`deleted: true`) snapshots are ALWAYS shown — no silent filtering', async () => {
    const payload = stubPayload({
      tickets: [
        makeVersionRow({ id: 'vk_normal', version: { title: 'keep' } }),
        makeVersionRow({ id: 'vk_deleted', version: { title: 'gone', deleted: true } }),
      ],
    })
    const res = await buildHistoryFeed(payload, new URLSearchParams(''))
    expect(res.docs.map((d) => d.id).sort()).toEqual(['vk_deleted', 'vk_normal'])
    expect(res.totalDocs).toBe(2)
  })
})
