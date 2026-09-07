import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { denyAgents, isMasterUser } from '@/access/actorPolicy'

export const Teams: CollectionConfig = {
  slug: 'teams',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'createdAt'],
    description: 'Teams group related work within a project',
  },
  access: {
    read: () => true,
    create: () => true,
    // Plain CRUD stays open pre-OIDC (ADR-002 provisions identities later).
    // Restore (which Payload runs through this `update` check) is denied by
    // the beforeOperation guard below (SPC-001 §6).
    update: () => true,
    delete: () => true,
    // SPC-001 §6: version trail reads are policy-denied to the agent identity.
    // Unauthenticated callers are also denied (deny-by-default; OIDC wiring lands in ADR-002).
    readVersions: denyAgents,
  },
  versions: {
    // SPC-001 §4.1/§5.2 D-1: native Payload versions, drafts disabled.
    maxPerDoc: 100,
  },
  hooks: {
    // SPC-001 §6: native restore (POST /api/teams/versions/:id) runs the
    // collection `update` access check; this guard hard-denies restore by the
    // agent identity and by unauthenticated callers.
    beforeOperation: [
      ({ args, operation }) => {
        if (operation !== 'restoreVersion') return
        if (!args.overrideAccess && !isMasterUser(args.req.user)) {
          throw new APIError('Restore is reserved for the master user (SPC-001 §6)', 403, null, true)
        }
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'The name of the team',
      },
    },
    {
      name: 'description',
      type: 'richText',
      admin: {
        description: 'Brief description of the team',
      },
    },
    {
      name: 'color',
      type: 'text',
      defaultValue: '#6366f1',
      admin: {
        description: 'Color for team identification',
      },
    },
  ],
  timestamps: true,
}
