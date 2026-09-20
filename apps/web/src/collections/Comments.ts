import type { CollectionConfig, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { authenticatedMutations } from '@/access/authenticatedAccess'
import { readExcludingDeleted, blockHardDelete, DELETED_FIELD } from '@/access/softDelete'
import { attributeActor, ACTOR_ATTRIBUTION_FIELDS } from '@/hooks/actorAttribution'
import { extractMentionIds } from '@/lib/mentions'

export const MAX_COMMENT_LENGTH = 10_000

/**
 * Discussion on tickets (upstream #19 port): a reply points at the comment
 * that opened the thread; threading is one level deep.
 *
 * Fork reconciliation: upstream ships `lib/access.ts collectionAccess`
 * (flag-gated open access). This fork keeps its own posture — reads hide
 * soft-deleted docs, mutations require ANY authenticated actor (the MCP
 * agent commenting on tickets IS the product, SPC-006 §1.3/AC-5), hard
 * delete is blocked from the request path, and actor attribution stamps
 * every version snapshot. The request-path delete ban means the reply
 * cascade below only ever runs for the operator's terminal purge.
 */
export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: {
    useAsTitle: 'body',
    defaultColumns: ['body', 'ticket', 'author', 'resolved'],
    description: 'Discussion on tickets. A reply points at the comment that opened the thread.',
  },
  access: {
    read: readExcludingDeleted,
    create: authenticatedMutations,
    update: authenticatedMutations,
    delete: authenticatedMutations,
  },
  versions: {
    maxPerDoc: 1000,
  },
  hooks: {
    beforeChange: [
      attributeActor,
      async ({ data, req, operation, originalDoc }) => {
        if (data?.body !== undefined) {
          const body = typeof data.body === 'string' ? data.body : ''
          if (!body.trim()) throw new APIError('A comment cannot be empty.', 400, null, true)
          if (body.length > MAX_COMMENT_LENGTH) {
            throw new APIError(
              `A comment can be at most ${MAX_COMMENT_LENGTH} characters.`,
              400,
              null,
              true,
            )
          }
          data.mentions = await resolveMentions(req, body)
          if (operation === 'update' && originalDoc && body !== originalDoc.body) {
            data.editedAt = new Date().toISOString()
          }
        }

        const parent = data?.parent ?? originalDoc?.parent
        if (data?.parent !== undefined && data.parent) {
          await assertRepliableParent(req, data.parent, data.ticket ?? originalDoc?.ticket)
        }

        if (data?.resolved && parent) {
          throw new APIError(
            'Only the comment that opened a thread can be resolved.',
            400,
            null,
            true,
          )
        }

        if (data?.resolved !== undefined && data.resolved !== originalDoc?.resolved) {
          data.resolvedAt = data.resolved ? new Date().toISOString() : null
          if (!data.resolved) data.resolvedBy = null
          else if (!data.resolvedBy) data.resolvedBy = await memberForRequest(req)
        }

        if (operation === 'create' && !data?.author) {
          data.author = await memberForRequest(req)
        }

        return data
      },
    ],
    afterDelete: [
      async ({ req, id }) => {
        await req.payload.delete({
          req,
          collection: 'comments',
          where: { parent: { equals: id } },
          depth: 0,
        })
      },
    ],
    beforeOperation: [blockHardDelete],
  },
  fields: [
    {
      name: 'ticket',
      type: 'relationship',
      relationTo: 'tickets',
      required: true,
      index: true,
      admin: {
        description: 'The ticket this comment belongs to',
      },
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'comments',
      index: true,
      admin: {
        description:
          'The comment that opened this thread. Empty for a top-level comment. Threads are one level deep.',
      },
    },
    {
      name: 'body',
      type: 'textarea',
      required: true,
      admin: {
        description:
          'Markdown. Mentions are stored as @[Name](member:ID) and render as a chip.',
      },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'members',
      admin: {
        description:
          'Who wrote this. Filled from the signed-in account when the caller does not set it.',
      },
    },
    {
      name: 'mentions',
      type: 'relationship',
      relationTo: 'members',
      hasMany: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Derived from the body on every save. Do not edit by hand.',
      },
    },
    {
      name: 'resolved',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'A resolved thread collapses. Only the first comment in a thread carries it.',
      },
    },
    {
      name: 'resolvedAt',
      type: 'date',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'resolvedBy',
      type: 'relationship',
      relationTo: 'members',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'editedAt',
      type: 'date',
      admin: { position: 'sidebar', readOnly: true },
    },
    // Soft delete parity (SPC-004 D2): hides deleted comments from every
    // read path while the version trail survives.
    DELETED_FIELD,
    // SPC-005 D-1: actor attribution on every version snapshot.
    ...ACTOR_ATTRIBUTION_FIELDS,
  ],
  timestamps: true,
}

async function assertRepliableParent(
  req: PayloadRequest,
  parent: unknown,
  ticket: unknown,
): Promise<void> {
  const parentId = toId(parent)
  if (!parentId) return

  let doc: { parent?: unknown; ticket?: unknown } | null = null
  try {
    doc = (await req.payload.findByID({
      req,
      collection: 'comments',
      id: parentId,
      depth: 0,
    })) as { parent?: unknown; ticket?: unknown }
  } catch {
    doc = null
  }

  if (!doc) throw new APIError('That comment no longer exists.', 400, null, true)

  if (toId(doc.parent)) {
    throw new APIError(
      'Replies go on the comment that opened the thread, not on another reply.',
      400,
      null,
      true,
    )
  }

  const ticketId = toId(ticket)
  if (ticketId && toId(doc.ticket) !== ticketId) {
    throw new APIError('A reply must sit on the same ticket as the comment it answers.', 400, null, true)
  }
}

async function resolveMentions(req: PayloadRequest, body: string): Promise<string[]> {
  const ids = extractMentionIds(body)
  if (ids.length === 0) return []

  const found = await req.payload.find({
    req,
    collection: 'members',
    where: { id: { in: ids } },
    limit: ids.length,
    depth: 0,
  })

  const live = new Set(found.docs.map((doc) => String(doc.id)))
  return ids.filter((id) => live.has(id))
}

async function memberForRequest(req: PayloadRequest): Promise<string | null> {
  const userId = req.user?.id
  if (!userId) return null

  const found = await req.payload.find({
    req,
    collection: 'members',
    where: { user: { equals: userId } },
    limit: 1,
    depth: 0,
  })
  const member = found.docs[0]
  return member ? String(member.id) : null
}

function toId(value: unknown): string | null {
  if (typeof value === 'string') return value || null
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id)
  }
  return null
}
