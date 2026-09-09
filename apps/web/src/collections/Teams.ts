import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { denyAgents, isMasterUser } from '@/access/actorPolicy'
import { readExcludingDeleted, blockHardDelete, DELETED_FIELD } from '@/access/softDelete'
import { attributeActor, ACTOR_ATTRIBUTION_FIELDS } from '@/hooks/actorAttribution'

export const Teams: CollectionConfig = {
  slug: 'teams',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'createdAt'],
    description: 'Teams group related work within a project',
  },
  access: {
    // Soft delete (SPC-004 D2): deleted teams leave every read path while
    // their version trail survives for the audit history.
    read: readExcludingDeleted,
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
    // SPC-005 §4 (retention Option B): 1000 — see Tickets.ts rationale.
    maxPerDoc: 1000,
  },
  hooks: {
    beforeChange: [
      // SPC-005 D-2: actor attribution on every write (see hooks/actorAttribution.ts).
      attributeActor,
    ],
    // SPC-001 §6: native restore (POST /api/teams/versions/:id) runs the
    // collection `update` access check; this guard hard-denies restore by the
    // agent identity and by unauthenticated callers.
    beforeOperation: [
      // Soft delete (SPC-004 D2): hard delete is disabled from every request
      // path — the real purge is the operator's terminal-only script.
      blockHardDelete,
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
    // Soft delete (SPC-004 D2): `deleted: true` hides the team while its
    // version trail survives.
    DELETED_FIELD,
    // SPC-005 D-1: actor attribution on every version snapshot.
    ...ACTOR_ATTRIBUTION_FIELDS,
  ],
  timestamps: true,
}
