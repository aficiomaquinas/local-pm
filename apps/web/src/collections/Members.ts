import type { CollectionConfig, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { authenticatedMutations } from '@/access/authenticatedAccess'
import { readExcludingDeleted, blockHardDelete, DELETED_FIELD } from '@/access/softDelete'
import { attributeActor, ACTOR_ATTRIBUTION_FIELDS } from '@/hooks/actorAttribution'

/**
 * People model (upstream #14 port): a member is a person work can be
 * assigned to — deliberately distinct from `users` (login accounts).
 *
 * Fork reconciliation: upstream ships this collection with
 * `lib/access.ts collectionAccess` (flag-gated open access) and a `user`
 * relationship for "My tickets" identity linking. This fork keeps its own
 * ACL posture instead: reads hide soft-deleted docs, every mutation
 * requires ANY authenticated actor (SPC-006 phase 1, same as
 * projects/teams/tickets), and hard delete is blocked from the request
 * path so a member purge can never destroy assignment history silently
 * (SPC-004 soft delete). Actor attribution stamps every version snapshot.
 * The `user` link field arrives with the comments wave (#19 port) when a
 * consumer ("My tickets") actually needs it.
 */
export const Members: CollectionConfig = {
  slug: 'members',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'team', 'active'],
    description: 'People that tickets can be assigned to.',
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
      async ({ data, req, originalDoc }) => {
        if (data?.user !== undefined) {
          await assertUserNotAlreadyLinked(req, data.user, originalDoc?.id ?? null)
        }
        return data
      },
    ],
    beforeOperation: [blockHardDelete],
    afterDelete: [
      async ({ req, id }) => {
        await clearAssignmentsFor(req, id)
        // Upstream #19: a deleted person keeps their comments but loses
        // authorship and mention chips (bodies are re-derived on update).
        await clearCommentTracesFor(req, id)
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'Display name — what shows on cards and in pickers',
      },
    },
    {
      name: 'email',
      type: 'email',
      admin: {
        description: 'Optional. Used to tell two people with the same name apart.',
      },
    },
    {
      name: 'team',
      type: 'relationship',
      relationTo: 'teams',
      admin: {
        description: 'The team this person belongs to',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
        description:
          'Inactive people keep their existing assignments but drop out of the assignee pickers.',
      },
    },
    // Upstream #19: the login account this person signs in with. Set it and
    // "My tickets" works for them; comment authorship and mention identity
    // resolve through this link. Uniqueness of the link is enforced by
    // upstream's assertUserNotAlreadyLinked, which arrives with the field.
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
        description:
          'The login account this person signs in with. Set it and "My tickets" works for them.',
      },
    },
    // Soft delete parity with tickets/projects/teams (SPC-004 D2).
    DELETED_FIELD,
    // SPC-005 D-1: actor attribution on every version snapshot.
    ...ACTOR_ATTRIBUTION_FIELDS,
  ],
  timestamps: true,
}

async function clearAssignmentsFor(req: PayloadRequest, id: string | number): Promise<void> {
  await req.payload.update({
    req,
    collection: 'tickets',
    where: { assignee: { equals: id } },
    data: { assignee: null },
    depth: 0,
  })
}

async function clearCommentTracesFor(req: PayloadRequest, id: string | number): Promise<void> {
  await req.payload.update({
    req,
    collection: 'comments',
    where: { author: { equals: id } },
    data: { author: null },
    depth: 0,
  })
  const mentioning = await req.payload.find({
    req,
    collection: 'comments',
    where: { mentions: { equals: id } },
    limit: 1000,
    depth: 0,
  })

  for (const doc of mentioning.docs) {
    await req.payload.update({
      req,
      collection: 'comments',
      id: doc.id,
      data: { body: doc.body },
      depth: 0,
    })
  }
}

async function assertUserNotAlreadyLinked(
  req: PayloadRequest,
  user: unknown,
  selfId: string | number | null,
): Promise<void> {
  const userId = toId(user)
  if (!userId) return

  const existing = await req.payload.find({
    req,
    collection: 'members',
    where: { user: { equals: userId } },
    limit: 1,
    depth: 0,
  })

  const clash = existing.docs.find((doc) => String(doc.id) !== String(selfId ?? ''))
  if (clash) {
    throw new APIError(
      `That account is already linked to ${clash.name}. Unlink it there first.`,
      400,
      null,
      true,
    )
  }
}

function toId(value: unknown): string | null {
  if (typeof value === 'string') return value || null
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id)
  }
  return null
}
