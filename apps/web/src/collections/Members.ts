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
    beforeChange: [attributeActor],
    beforeOperation: [blockHardDelete],
    afterDelete: [
      async ({ req, id }) => {
        await clearAssignmentsFor(req, id)
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
