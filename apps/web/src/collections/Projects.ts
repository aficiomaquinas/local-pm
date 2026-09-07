import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { denyAgents, isMasterUser } from '@/access/actorPolicy'
import { ProjectStatus, PROJECT_STATUS_OPTIONS, PROJECT_ICONS, PROJECT_COLORS } from '@/types/enums'

export const Projects: CollectionConfig = {
  slug: 'projects',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'prefix', 'status', 'createdAt'],
    description: 'Projects organize related tickets together',
  },
  access: {
    read: () => true,
    create: () => true,
    // SPC-001 §3: CRUD stays open (audit-trail surface only is policy-gated;
    // restore is denied by the readVersions ACL + beforeOperation hook).
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
    // SPC-001 §6: native restore (POST /api/projects/versions/:id) runs the
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
        description: 'The name of the project',
      },
    },
    {
      name: 'prefix',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Short prefix for ticket IDs (e.g., PROJ for PROJ-123)',
      },
      validate: (value: string | null | undefined) => {
        if (!value) return 'Prefix is required'
        if (!/^[A-Z]{2,6}$/.test(value)) {
          return 'Prefix must be 2-6 uppercase letters'
        }
        return true
      },
    },
    {
      name: 'description',
      type: 'richText',
      admin: {
        description: 'Detailed description of the project',
      },
    },
    {
      name: 'icon',
      type: 'select',
      options: PROJECT_ICONS.map((icon) => ({ label: icon, value: icon })),
      defaultValue: 'folder',
      admin: {
        description: 'Icon to represent the project',
      },
    },
    {
      name: 'color',
      type: 'select',
      options: PROJECT_COLORS.map((color) => ({ label: color, value: color })),
      defaultValue: '#6366f1',
      admin: {
        description: 'Color theme for the project',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: PROJECT_STATUS_OPTIONS,
      defaultValue: ProjectStatus.ACTIVE,
      required: true,
      admin: {
        description: 'Current status of the project',
      },
    },
    {
      name: 'ticketCounter',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Auto-incremented counter for ticket IDs',
      },
    },
  ],
  timestamps: true,
}
