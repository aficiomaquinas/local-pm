import type { CollectionConfig, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { denyAgents, isMasterUser } from '@/access/actorPolicy'
import { readExcludingDeleted, blockHardDelete, DELETED_FIELD } from '@/access/softDelete'
import { attributeActor, ACTOR_ATTRIBUTION_FIELDS } from '@/hooks/actorAttribution'
import { TicketStatus, TicketPriority, TICKET_STATUS_OPTIONS, TICKET_PRIORITY_OPTIONS } from '@/types/enums'

export const Tickets: CollectionConfig = {
  slug: 'tickets',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['ticketId', 'title', 'status', 'priority', 'project', 'team'],
    description: 'Individual work items within projects',
  },
  access: {
    // Soft delete (SPC-004 D2): deleted docs leave every read path (board
    // server render, client refetch, list APIs) via this query constraint,
    // while the version trail survives untouched for the audit history.
    read: readExcludingDeleted,
    create: () => true,
    // SPC-001 §3 in-scope item 4 + actorPolicy.ts decision: collection CRUD stays
    // OPEN (the kanban and local tooling depend on it); only the audit trail
    // surface (readVersions + restore) is policy-gated. Restore for native
    // `POST /api/tickets/versions/:id` runs this same `update` check, and the
    // beforeOperation hook below denies restore for agent/anonymous explicitly.
    update: ({ req }) => {
      // master user → allowed; agent → denied; anonymous → allowed only for
      // non-restore operations. Payload's `req` carries the operation context
      // for version restores via beforeOperation, so here we keep update open
      // to keep CRUD parity with `create` (spec decision documented above).
      return true
    },
    delete: () => true,
    // SPC-001 §6: version trail reads are policy-denied to the agent identity.
    // Unauthenticated callers are also denied (deny-by-default; OIDC wiring lands in ADR-002).
    readVersions: denyAgents,
  },
  versions: {
    // SPC-001 §4.1/§5.2 D-1: native Payload versions, drafts disabled.
    // SPC-005 §4 (retention Option B, operator decision 2026-09-08): 100 →
    // 1000 — removes the realistic audit-eviction scenario (agent loops).
    // Enforced at write time by Payload's enforceMaxVersions (application
    // level, not a Mongo capped collection): applies to new writes
    // immediately, no collMod needed.
    maxPerDoc: 1000,
  },
  hooks: {
    beforeChange: [
      // SPC-005 D-2: stamp actorType/actorId/actorLabel from req.user on
      // every write (anonymous when there is no user); versions snapshot the
      // whole doc, so every version is attributed.
      attributeActor,
      async ({ data, req, operation }) => {
        if (operation === 'create' && data?.project) {
          const ticketId = await generateTicketId(req, data.project as string)
          data.ticketId = ticketId
        }
        return data
      },
    ],
    // SPC-001 §6: native restore (POST /api/tickets/versions/:id) runs the
    // collection `update` access check. The policy hook below hard-denies
    // restore by the agent identity and by unauthenticated callers.
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
      name: 'ticketId',
      type: 'text',
      unique: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Auto-generated ticket ID (e.g., PROJ-123)',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: 'Brief title of the ticket',
      },
    },
    {
      name: 'description',
      type: 'richText',
      admin: {
        description: 'Detailed description of the work',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: TICKET_STATUS_OPTIONS,
      defaultValue: TicketStatus.TODO,
      required: true,
      admin: {
        description: 'Current status of the ticket',
      },
    },
    {
      name: 'priority',
      type: 'select',
      options: TICKET_PRIORITY_OPTIONS,
      defaultValue: TicketPriority.NO_PRIORITY,
      admin: {
        description: 'Priority level of the ticket',
      },
    },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      required: true,
      admin: {
        description: 'The project this ticket belongs to',
      },
    },
    {
      name: 'team',
      type: 'relationship',
      relationTo: 'teams',
      admin: {
        description: 'The team responsible for this ticket',
      },
    },
    {
      name: 'blockedBy',
      type: 'relationship',
      relationTo: 'tickets',
      hasMany: true,
      admin: {
        description: 'Tickets that must be completed before this ticket can be worked on',
      },
    },
    {
      name: 'labels',
      type: 'array',
      admin: {
        description: 'Labels for categorization',
      },
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
        },
        {
          name: 'color',
          type: 'text',
          defaultValue: '#6366f1',
        },
      ],
    },
    {
      name: 'dueDate',
      type: 'date',
      admin: {
        description: 'When this ticket should be completed',
        date: {
          pickerAppearance: 'dayOnly',
        },
      },
    },
    {
      name: 'subtasks',
      type: 'array',
      admin: {
        description: 'Subtasks for this ticket',
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'completed',
          type: 'checkbox',
          defaultValue: false,
        },
      ],
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'Order within the column',
      },
    },
    // Soft delete (SPC-004 D2): `deleted: true` hides the ticket from the
    // board while its version trail survives (audit history is never
    // destroyed by the action it records).
    DELETED_FIELD,
    // SPC-005 D-1: actor attribution on every version snapshot.
    ...ACTOR_ATTRIBUTION_FIELDS,
  ],
  timestamps: true,
}

async function generateTicketId(req: PayloadRequest, projectId: string): Promise<string> {
  const project = await req.payload.findByID({
    collection: 'projects',
    id: projectId,
  })

  if (!project) {
    throw new Error('Project not found')
  }

  const newCounter = (project.ticketCounter || 0) + 1

  await req.payload.update({
    collection: 'projects',
    id: projectId,
    data: {
      ticketCounter: newCounter,
    },
  })

  return `${project.prefix}-${newCounter}`
}
