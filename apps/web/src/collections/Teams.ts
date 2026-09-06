import type { CollectionConfig } from 'payload'
import { denyAgents, enforceMasterOnlyPolicy } from '@/access/actorPolicy'

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
    update: enforceMasterOnlyPolicy('team restore (SPC-001 §6)'),
    delete: () => true,
    // SPC-001 §6: version trail reads are policy-denied to the agent identity.
    // Unauthenticated callers are also denied (deny-by-default; OIDC wiring lands in ADR-002).
    readVersions: denyAgents,
  },
  versions: {
    // SPC-001 §4.1/§5.2 D-1: native Payload versions, drafts disabled.
    maxPerDoc: 100,
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
