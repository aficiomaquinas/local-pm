import { describe, it, expect } from 'vitest'
import { buildHistoryFeed } from '@/app/api/history/feed'
import { stubPayload, makeVersionRow, type StubPayload } from './helpers/payloadStub'

/**
 * T1 (SPC-005 §5.2 + options panel D-2) — the feed contract gains `actor`
 * per entry, and the soft-delete behavior (visible/silent) gates
 * `deleted: true` snapshots in/out of the feed.
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

describe('T1: soft-delete toggle feed behavior (options panel D-2)', () => {
  const feedWithDelete = () =>
    stubPayload(
      {
        tickets: [
          makeVersionRow({ id: 'vk_normal', version: { title: 'keep' } }),
          makeVersionRow({ id: 'vk_deleted', version: { title: 'gone', deleted: true } }),
        ],
      },
      { global: { softDeleteBehavior: 'visible' } },
    )

  it('visible (default): soft-delete snapshots stay in the feed', async () => {
    const res = await buildHistoryFeed(feedWithDelete(), new URLSearchParams(''))
    expect(res.docs.map((d) => d.id).sort()).toEqual(['vk_deleted', 'vk_normal'])
    expect(res.totalDocs).toBe(2)
  })

  it('silent: `deleted: true` snapshots are omitted (and do not count in totalDocs)', async () => {
    const payload = stubPayload(
      {
        tickets: [
          makeVersionRow({ id: 'vk_normal', version: { title: 'keep' } }),
          makeVersionRow({ id: 'vk_deleted', version: { title: 'gone', deleted: true } }),
        ],
      },
      { global: { softDeleteBehavior: 'silent' } },
    )
    const res = await buildHistoryFeed(payload, new URLSearchParams(''))
    expect(res.docs.map((d) => d.id)).toEqual(['vk_normal'])
    expect(res.totalDocs).toBe(1)
  })

  it('missing global row → visible (least surprising default)', async () => {
    const payload = stubPayload(
      { tickets: [makeVersionRow({ id: 'vk_deleted', version: { deleted: true } })] },
      { global: null },
    )
    const res = await buildHistoryFeed(payload, new URLSearchParams(''))
    expect(res.docs).toHaveLength(1)
  })

  it('unknown stored value → visible (normalize, never throw)', async () => {
    const payload = stubPayload(
      { tickets: [makeVersionRow({ id: 'vk_deleted', version: { deleted: true } })] },
      { global: { softDeleteBehavior: 'bogus' } },
    )
    const res = await buildHistoryFeed(payload, new URLSearchParams(''))
    expect(res.docs).toHaveLength(1)
  })
})
