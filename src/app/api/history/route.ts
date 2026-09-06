import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Payload, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { enforceMasterOnlyPolicy } from '@/access/actorPolicy'
import { buildHistoryFeed, resolveCollectionFilter } from '@/app/api/history/feed'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const payload: Payload = await getPayload({ config })

  const requestWithUser = req as NextRequest & { user?: PayloadRequest['user'] }
  if (!requestWithUser.user) {
    try {
      const { headers } = await import('next/headers')
      const hdrs = await headers()
      const { createLocalReq } = await import('payload')
      const localReq = await createLocalReq(
        { req: { headers: hdrs } as unknown as PayloadRequest },
        payload,
      )
      requestWithUser.user = localReq.user
    } catch {
      requestWithUser.user = null
    }
  }

  // SPC-001 §6: the audit trail is master-user exclusive
  // (agent + anonymous denied, per the documented decision in src/access/actorPolicy.ts).
  try {
    enforceMasterOnlyPolicy('the audit history endpoint')({
      req: requestWithUser as unknown as PayloadRequest,
    })
  } catch (err) {
    if (err instanceof APIError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }

  try {
    const response = await buildHistoryFeed(payload, req.nextUrl.searchParams)
    return NextResponse.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to query versions'
    const status = message.startsWith('Invalid collection filter') ? 400 : 500
    if (status === 500) console.error('[api/history] feed failed', err)
    return NextResponse.json({ error: message }, { status })
  }
}
