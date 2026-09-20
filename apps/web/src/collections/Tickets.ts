import type { CollectionConfig, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { authenticatedMutations } from '@/access/authenticatedAccess'
import { denyAgents, isMasterUser } from '@/access/actorPolicy'
import { readExcludingDeleted, blockHardDelete, DELETED_FIELD } from '@/access/softDelete'
import { attributeActor, ACTOR_ATTRIBUTION_FIELDS } from '@/hooks/actorAttribution'
import { TicketStatus, TicketPriority, TICKET_STATUS_OPTIONS, TICKET_PRIORITY_OPTIONS } from '@/types/enums'

export const Tickets: CollectionConfig = {
  slug: 'tickets',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['ticketId', 'title', 'status', 'priority', 'project', 'assignee'],
    description: 'Individual work items within projects',
  },
  access: {
    // Soft delete (SPC-004 D2): deleted docs leave every read path (board
    // server render, client refetch, list APIs) via this query constraint,
    // while the version trail survives untouched for the audit history.
    read: readExcludingDeleted,
    // SPC-006 / ADR-002 phase 1 (OD-7): mutations require ANY authenticated
    // actor (local session or OIDC bearer — humans and agents alike; the
    // MCP agent mutating tickets IS the product, REQ-002/AC-5). Anonymous
    // → 401 (AC-2).
    create: authenticatedMutations,
    // SPC-001 §3 in-scope item 4 + actorPolicy.ts decision: collection CRUD stays
    // OPEN (the kanban and local tooling depend on it); only the audit trail
    // surface (readVersions + restore) is policy-gated. Restore for native
    // `POST /api/tickets/versions/:id` runs this same `update` check, and the
    // beforeOperation hook below denies restore for agent/anonymous explicitly.
    update: authenticatedMutations,
    delete: authenticatedMutations,
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
      async ({ data, req, operation, originalDoc }) => {
        // Upstream d7747b6 port (Ars Nova, d488521): reject a blockedBy edge
        // that would close a dependency cycle at write time — a cycle makes
        // "what is ready to work on?" unanswerable and hangs layered graph
        // layouts (DependencyGraph).
        await assertNoDependencyCycle(req, data?.blockedBy, originalDoc?.id ?? null)
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
      name: 'assignee',
      type: 'relationship',
      relationTo: 'members',
      admin: {
        description: 'The person responsible for this ticket',
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

/* ------------------------------------------------------------- dependencies -- */

/**
 * A rejected dependency edge is USER error, not server error.
 *
 * Payload treats a bare `Error` thrown from a hook as internal and replaces the
 * message with "Something went wrong." — so the caller cannot tell a cycle from
 * an outage. `APIError` with `isPublic` keeps the explanation and returns 400
 * rather than 500.
 */
class CycleError extends APIError {
  constructor(message: string) {
    super(message, 400, null, true)
  }
}

/**
 * `blockedBy` is a self-referential graph with nothing stopping A → B → A.
 *
 * Upstream d7747b6 port (originally from Ars Nova Singers
 * @ArsNovaSingers, ArsNovaSingers/local-pm-Ars commit d488521). Exported for
 * tests.
 */
export async function assertNoDependencyCycle(
  req: PayloadRequest,
  blockedBy: unknown,
  selfId: string | number | null,
): Promise<void> {
  const proposed = toIdArray(blockedBy)
  if (!proposed.length) return

  if (selfId !== null && proposed.includes(String(selfId))) {
    throw new CycleError('A ticket cannot block itself.')
  }
  // A brand-new ticket has no id yet, so nothing can already depend on it.
  if (selfId === null) return

  const target = String(selfId)
  const seen = new Set<string>(proposed)
  let frontier = [...proposed]
  let hops = 0

  // Bounded walk: a pathological graph must not spin here.
  while (frontier.length && hops < 64) {
    hops += 1
    const docs = await req.payload.find({
      collection: 'tickets',
      where: { id: { in: frontier } },
      limit: 500,
      depth: 0,
    })

    const next: string[] = []
    for (const doc of docs.docs) {
      for (const id of toIdArray((doc as { blockedBy?: unknown }).blockedBy)) {
        if (id === target) {
          throw new CycleError(
            'That dependency would create a cycle: the ticket you are blocking on already depends on this one, directly or through other tickets.',
          )
        }
        if (!seen.has(id)) {
          seen.add(id)
          next.push(id)
        }
      }
    }
    frontier = next
  }
}

/** Normalize a relationship value (ids, numbers or populated docs) to string ids. */
function toIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (entry === null || entry === undefined) return null
      if (typeof entry === 'string' || typeof entry === 'number') return String(entry)
      if (typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) {
        return String((entry as { id: unknown }).id)
      }
      return null
    })
    .filter((v): v is string => Boolean(v))
}

/* ---------------------------------------------------------------- ticket ids -- */

/**
 * Allocate the next ticket number ATOMICALLY.
 *
 * Upstream d7747b6 port (originally from Ars Nova Singers
 * @ArsNovaSingers, ArsNovaSingers/local-pm-Ars commit d488521).
 *
 * The read-then-write allocator handed concurrent creates the same number, and
 * `ticketId` is declared unique: two tickets racing a bulk import (or an MCP
 * agent creating a batch) both computed `PROJ-6` and one failed on a
 * duplicate-key error. `findOneAndUpdate` with `$inc` performs the read and
 * the increment as one document operation, so concurrent callers are handed
 * distinct numbers by the database itself.
 */
async function generateTicketId(req: PayloadRequest, projectId: string): Promise<string> {
  const model = getMongooseModel(req, 'projects')

  if (model) {
    const updated = await model.findOneAndUpdate(
      { _id: projectId },
      { $inc: { ticketCounter: 1 } },
      { new: true, returnDocument: 'after' },
    )
    if (!updated) throw new Error('Project not found')
    return `${updated.prefix}-${updated.ticketCounter}`
  }

  return generateTicketIdWithRetry(req, projectId)
}

type MinimalModel = {
  findOneAndUpdate: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Promise<{ prefix: string; ticketCounter: number } | null>
}

/** Reach the underlying mongoose model, when the configured adapter exposes one. */
function getMongooseModel(req: PayloadRequest, slug: string): MinimalModel | null {
  const collections = (req.payload.db as unknown as { collections?: Record<string, MinimalModel> })
    .collections
  const model = collections?.[slug]
  return model && typeof model.findOneAndUpdate === 'function' ? model : null
}

/**
 * Fallback for a database adapter exposing no atomic primitive. Still not a
 * true compare-and-set, so it verifies the ID is unused before claiming it and
 * retries on collision — failing loudly rather than silently issuing a
 * duplicate. Exported for tests.
 */
export async function generateTicketIdWithRetry(req: PayloadRequest, projectId: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const project = await req.payload.findByID({ collection: 'projects', id: projectId })
    if (!project) throw new Error('Project not found')

    const candidateCounter = (project.ticketCounter || 0) + 1
    const candidate = `${project.prefix}-${candidateCounter}`

    const clash = await req.payload.find({
      collection: 'tickets',
      where: { ticketId: { equals: candidate } },
      limit: 1,
      depth: 0,
    })

    if (clash.totalDocs === 0) {
      await req.payload.update({
        collection: 'projects',
        id: projectId,
        data: { ticketCounter: candidateCounter },
      })
      return candidate
    }
  }
  throw new Error(
    'Could not allocate a unique ticket ID after 8 attempts — check the project ticketCounter.',
  )
}
